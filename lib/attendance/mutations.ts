import "server-only";
import { and, count, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import type { CurrentUser } from "@/lib/auth/session";
import { createContact, type NewContactInput } from "@/lib/contacts/mutations";
import { db } from "@/lib/db";
import { attendance, contact, MEETING_FORMATS, MEETING_STATUSES, meeting, unit } from "@/lib/db/schema";
import { meetingDateLabel } from "./year";

export type Result = { ok: boolean; message: string; id?: string };

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v));

const meetingSchema = z.object({
  date: z.iso.date("Pick a date"),
  title: optionalText(120),
  format: z.enum(MEETING_FORMATS),
  status: z.enum(MEETING_STATUSES),
  notes: optionalText(2000),
});

export type MeetingInput = z.input<typeof meetingSchema>;

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check the form and try again.";
}

export async function createMeeting(actor: CurrentUser, raw: MeetingInput): Promise<Result> {
  const parsed = meetingSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const [row] = await db.insert(meeting).values(parsed.data).onConflictDoNothing({ target: meeting.date }).returning({ id: meeting.id });
  if (!row) {
    const [existing] = await db.select({ id: meeting.id }).from(meeting).where(eq(meeting.date, parsed.data.date));
    return { ok: false, message: `There's already a meeting on ${meetingDateLabel(parsed.data.date)}.`, id: existing?.id };
  }
  await writeAudit(actor, "meeting.add", { type: "meeting", id: row.id }, { date: parsed.data.date });
  return { ok: true, message: `Added the ${meetingDateLabel(parsed.data.date)} meeting.`, id: row.id };
}

export async function updateMeeting(actor: CurrentUser, id: string, raw: MeetingInput): Promise<Result> {
  const parsed = meetingSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const [clash] = await db
    .select({ id: meeting.id })
    .from(meeting)
    .where(and(eq(meeting.date, parsed.data.date), ne(meeting.id, id)));
  if (clash) return { ok: false, message: `There's already a meeting on ${meetingDateLabel(parsed.data.date)}.` };
  const updated = await db.update(meeting).set(parsed.data).where(eq(meeting.id, id)).returning({ id: meeting.id });
  if (!updated.length) return { ok: false, message: "That meeting no longer exists." };
  await writeAudit(actor, "meeting.update", { type: "meeting", id }, { date: parsed.data.date, status: parsed.data.status });
  return { ok: true, message: "Saved." };
}

export async function deleteMeeting(actor: CurrentUser, id: string): Promise<Result> {
  const [m] = await db.select().from(meeting).where(eq(meeting.id, id));
  if (!m) return { ok: false, message: "Already deleted." };
  const [{ n }] = await db.select({ n: count() }).from(attendance).where(eq(attendance.meetingId, id));
  await db.transaction(async (tx) => {
    await tx.delete(meeting).where(eq(meeting.id, id));
    await writeAudit(actor, "meeting.delete", { type: "meeting", id }, { date: m.date, checkIns: n }, tx);
  });
  return { ok: true, message: `Deleted the ${meetingDateLabel(m.date)} meeting and its ${n} check-in${n === 1 ? "" : "s"}.` };
}

type Method = (typeof attendance.$inferInsert)["method"];

export async function checkIn(
  actor: CurrentUser,
  meetingId: string,
  contactId: string,
  method: Method = "check_in",
): Promise<Result & { alreadyIn?: boolean }> {
  const [m] = await db.select({ status: meeting.status }).from(meeting).where(eq(meeting.id, meetingId));
  if (!m) return { ok: false, message: "That meeting no longer exists." };
  if (m.status !== "held") return { ok: false, message: "That meeting is marked cancelled. Change it to held first." };
  const [c] = await db.select({ id: contact.id }).from(contact).where(eq(contact.id, contactId));
  if (!c) return { ok: false, message: "That contact no longer exists." };
  const [row] = await db
    .insert(attendance)
    .values({ meetingId, contactId, method, checkedInBy: actor.id })
    .onConflictDoNothing()
    .returning({ id: attendance.id });
  return row ? { ok: true, message: "Checked in.", id: row.id } : { ok: true, message: "Already checked in.", alreadyIn: true };
}

export async function undoCheckIn(_actor: CurrentUser, meetingId: string, contactId: string): Promise<Result> {
  await db.delete(attendance).where(and(eq(attendance.meetingId, meetingId), eq(attendance.contactId, contactId)));
  return { ok: true, message: "Removed." };
}

export async function setRepresentedUnit(_actor: CurrentUser, attendanceId: string, unitId: string | null): Promise<Result> {
  if (unitId) {
    const [u] = await db.select({ id: unit.id }).from(unit).where(eq(unit.id, unitId));
    if (!u) return { ok: false, message: "That unit no longer exists." };
  }
  const updated = await db.update(attendance).set({ unitId }).where(eq(attendance.id, attendanceId)).returning({ id: attendance.id });
  return updated.length ? { ok: true, message: "Saved." } : { ok: false, message: "That check-in no longer exists." };
}

/** Adds someone new as a walk-in and checks them in. If they're already a contact, just checks them in. */
export async function addWalkIn(
  actor: CurrentUser,
  meetingId: string,
  input: Omit<NewContactInput, "source">,
): Promise<Result> {
  const created = await createContact(actor, { ...input, source: "walk_in" });
  if (!created.id) return created;
  const result = await checkIn(actor, meetingId, created.id, created.ok ? "walk_in" : "check_in");
  if (!result.ok) return result;
  return created.ok
    ? { ok: true, message: `${created.message.replace(/\.$/, "")} and checked them in.`, id: created.id }
    : { ok: true, message: "They were already a contact, so they're checked in.", id: created.id };
}
