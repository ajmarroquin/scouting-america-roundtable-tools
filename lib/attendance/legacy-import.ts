import "server-only";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import type { CurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { affiliation, attendance, contact, meeting, unit } from "@/lib/db/schema";
import { checkInPeople } from "./queries";
import { meetingDateLabel } from "./year";

// Loads an old attendance sheet after a person has reviewed it: which columns
// are meetings (and their real dates), and who each row is. Safe to run twice:
// meetings are found by date, check-ins are one per person per meeting, and a
// second run matches the people the first run added.

/** The position given to someone added from an old sheet, for each unit the sheet names. */
export const LEGACY_POSITION = "Adult member";

const id = z.uuid();

export const legacyImportSchema = z.object({
  fileName: z.string().trim().max(200).nullable(),
  meetings: z
    .array(z.object({ key: z.number().int().min(0), date: z.iso.date(), status: z.enum(["held", "cancelled"]) }))
    .min(1, "Pick at least one meeting to load.")
    .max(60),
  people: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(160),
        contact: z.discriminatedUnion("kind", [
          z.object({ kind: z.literal("existing"), id }),
          z.object({
            kind: z.literal("new"),
            firstName: z.string().trim().min(1, "Every new person needs a first name.").max(80),
            lastName: z.string().trim().max(80),
            notes: z.string().trim().max(2000),
          }),
        ]),
        /** Units the sheet's unit column names without doubt. */
        unitIds: z.array(id).max(10),
        /** Keys of the meetings this person attended. */
        attended: z.array(z.number().int().min(0)).max(60),
      }),
    )
    .max(2000),
});

export type LegacyImportInput = z.input<typeof legacyImportSchema>;

export type LegacyImportResult =
  | {
      ok: true;
      message: string;
      counts: {
        meetingsAdded: number;
        meetingsFound: number;
        contactsAdded: number;
        checkIns: number;
        alreadyIn: number;
        skippedCancelled: number;
      };
    }
  | { ok: false; message: string };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export async function importLegacySheet(actor: CurrentUser, raw: LegacyImportInput): Promise<LegacyImportResult> {
  const parsed = legacyImportSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the sheet and try again." };
  const input = parsed.data;

  const dates = input.meetings.map((m) => m.date);
  const twice = dates.find((d, i) => dates.indexOf(d) !== i);
  if (twice) return { ok: false, message: `Two columns are set to ${meetingDateLabel(twice)}. Give each meeting its own date.` };

  return db.transaction(async (tx) => {
    // One import at a time, shared with roster imports.
    await tx.execute(sql`select pg_advisory_xact_lock(662030)`);

    // Meetings: reuse one already on that date, and keep its status.
    const existing = await tx.select().from(meeting).where(inArray(meeting.date, dates));
    const byDate = new Map(existing.map((m) => [m.date, m]));
    const source = input.fileName ? `Loaded from ${input.fileName}.` : "Loaded from an old attendance sheet.";
    const meetingByKey = new Map<number, { id: string; held: boolean }>();
    let meetingsAdded = 0;
    for (const m of input.meetings) {
      let row = byDate.get(m.date);
      if (!row) {
        [row] = await tx.insert(meeting).values({ date: m.date, status: m.status, notes: source }).returning();
        meetingsAdded++;
      }
      meetingByKey.set(m.key, { id: row.id, held: row.status === "held" });
    }

    // Matched people must still exist.
    const matchedIds = [
      ...new Set(input.people.flatMap((p) => (p.contact.kind === "existing" ? [p.contact.id] : []))),
    ];
    const found = matchedIds.length
      ? await tx.select({ id: contact.id }).from(contact).where(inArray(contact.id, matchedIds))
      : [];
    if (found.length !== matchedIds.length) {
      throw new LegacyImportError("Someone you matched was deleted in the meantime. Reload the page and review again.");
    }

    // Units the sheet named, limited to ones that still exist.
    const namedUnitIds = [...new Set(input.people.flatMap((p) => p.unitIds))];
    const liveUnits = new Set(
      namedUnitIds.length
        ? (await tx.select({ id: unit.id }).from(unit).where(inArray(unit.id, namedUnitIds))).map((u) => u.id)
        : [],
    );

    // New people. The same name twice in one sheet is one person.
    const contactIdFor = new Map<number, string>();
    const created = new Map<string, string>();
    let contactsAdded = 0;
    for (const [i, p] of input.people.entries()) {
      if (p.contact.kind === "existing") {
        contactIdFor.set(i, p.contact.id);
        continue;
      }
      const key = `${p.contact.firstName} ${p.contact.lastName}`.toLowerCase();
      let contactId = created.get(key);
      if (!contactId) {
        const [row] = await tx
          .insert(contact)
          .values({
            firstName: p.contact.firstName,
            lastName: p.contact.lastName,
            notes: p.contact.notes || null,
            source: "walk_in",
          })
          .returning({ id: contact.id });
        contactId = row.id;
        created.set(key, contactId);
        contactsAdded++;
        const units = p.unitIds.filter((u) => liveUnits.has(u));
        if (units.length) {
          await tx
            .insert(affiliation)
            .values(units.map((unitId) => ({ contactId: contactId!, unitId, position: LEGACY_POSITION, source: "manual" })))
            .onConflictDoNothing();
        }
      }
      contactIdFor.set(i, contactId);
    }

    // Each person's units, to pick the one they represented when the sheet names exactly one of them.
    const allIds = [...new Set(contactIdFor.values())];
    const theirUnits = new Map<string, Set<string>>();
    if (allIds.length) {
      const rows = await tx
        .select({ contactId: affiliation.contactId, unitId: affiliation.unitId })
        .from(affiliation)
        .where(and(inArray(affiliation.contactId, allIds), isNotNull(affiliation.unitId)));
      for (const r of rows) {
        const set = theirUnits.get(r.contactId) ?? new Set<string>();
        set.add(r.unitId!);
        theirUnits.set(r.contactId, set);
      }
    }

    const rows: (typeof attendance.$inferInsert)[] = [];
    const seen = new Set<string>();
    let skippedCancelled = 0;
    for (const [i, p] of input.people.entries()) {
      const contactId = contactIdFor.get(i)!;
      const mine = theirUnits.get(contactId) ?? new Set<string>();
      const named = p.unitIds.filter((u) => mine.has(u));
      for (const key of new Set(p.attended)) {
        const m = meetingByKey.get(key);
        if (!m) continue; // a column the reviewer skipped
        if (!m.held) {
          skippedCancelled++;
          continue;
        }
        const pair = `${m.id}|${contactId}`;
        if (seen.has(pair)) continue;
        seen.add(pair);
        rows.push({
          meetingId: m.id,
          contactId,
          method: "legacy_import",
          checkedInBy: actor.id,
          unitId: named.length === 1 ? named[0] : null,
        });
      }
    }
    const inserted = rows.length
      ? await tx.insert(attendance).values(rows).onConflictDoNothing().returning({ id: attendance.id })
      : [];

    const counts = {
      meetingsAdded,
      meetingsFound: input.meetings.length - meetingsAdded,
      contactsAdded,
      checkIns: inserted.length,
      alreadyIn: rows.length - inserted.length,
      skippedCancelled,
    };
    await writeAudit(actor, "attendance.legacy_import", { type: "meeting" }, { fileName: input.fileName, ...counts }, tx);

    const parts = [
      `Loaded ${plural(counts.checkIns, "check-in")} across ${plural(input.meetings.length, "meeting")}`,
      counts.meetingsAdded ? `added ${plural(counts.meetingsAdded, "meeting")}` : null,
      counts.contactsAdded ? `added ${plural(counts.contactsAdded, "new contact")}` : null,
      counts.alreadyIn ? `${plural(counts.alreadyIn, "check-in")} ${counts.alreadyIn === 1 ? "was" : "were"} already there` : null,
      counts.skippedCancelled
        ? `skipped ${plural(counts.skippedCancelled, "check-in")} for meetings marked cancelled`
        : null,
    ].filter(Boolean);
    return { ok: true as const, message: `${parts.join(", ")}.`, counts };
  }).catch((error: unknown) => {
    if (error instanceof LegacyImportError) return { ok: false as const, message: error.message };
    throw error;
  });
}

class LegacyImportError extends Error {}

/** What the review screen needs: people to match (archived included), known units, and meetings already in the app. */
export async function legacyMatchData() {
  const [people, units, meetings] = await Promise.all([
    checkInPeople({ includeArchived: true }),
    db.select({ id: unit.id, type: unit.type, number: unit.number, genderAccepted: unit.genderAccepted }).from(unit),
    db
      .select({ date: meeting.date, status: meeting.status, checkIns: sql<number>`count(${attendance.id})::int` })
      .from(meeting)
      .leftJoin(attendance, eq(attendance.meetingId, meeting.id))
      .groupBy(meeting.id),
  ]);
  return { people, units, meetings };
}

export type LegacyMatchData = Awaited<ReturnType<typeof legacyMatchData>>;
