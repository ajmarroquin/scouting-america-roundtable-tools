import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import type { CurrentUser } from "@/lib/auth/session";
import { db, type Tx } from "@/lib/db";
import { affiliation, contact, setting, unit } from "@/lib/db/schema";
import { cleanEmail, formatPhone } from "@/lib/import/normalize";
import { type AffiliationInput, affiliationInputSchema } from "./affiliation-input";
import { contactName } from "./format";

export type Result = { ok: boolean; message: string; id?: string };

const name = z.string().trim().min(1, "Required").max(80);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v));
const optionalEmail = z
  .string()
  .trim()
  .transform((v, ctx) => {
    if (v === "") return null;
    const e = cleanEmail(v);
    if (!e) ctx.addIssue({ code: "custom", message: "Enter a valid email address" });
    return e;
  });

const newContactSchema = z
  .object({
    firstName: name,
    lastName: z.string().trim().max(80),
    email: optionalEmail,
    phone: optionalText(40),
    isYouth: z.boolean(),
    guardianEmail: optionalEmail,
    affiliations: z.array(affiliationInputSchema).max(10),
    source: z.enum(["manual", "walk_in"]),
  })
  .refine((v) => !v.isYouth || v.guardianEmail, {
    message: "Youth need a parent or guardian email so nothing goes to them one-on-one",
    path: ["guardianEmail"],
  });

export type NewContactInput = z.input<typeof newContactSchema>;

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check the form and try again.";
}

type ParsedAffiliation = z.output<typeof affiliationInputSchema>;

class UnitMissingError extends Error {}

/**
 * The unit id for a picker choice: null for a district position, the id of an
 * existing unit, or a unit created by hand. A new unit that matches one already
 * in the database (same type, number, and designation) reuses it.
 */
async function resolveUnit(tx: Tx, ref: ParsedAffiliation["unit"]): Promise<string | null> {
  if (ref.kind === "district") return null;
  if (ref.kind === "existing") {
    const [u] = await tx.select({ id: unit.id }).from(unit).where(eq(unit.id, ref.id));
    if (!u) throw new UnitMissingError();
    return u.id;
  }
  const sameUnit = and(
    eq(unit.type, ref.type),
    eq(unit.number, ref.number),
    ref.genderAccepted ? eq(unit.genderAccepted, ref.genderAccepted) : isNull(unit.genderAccepted),
  );
  const [existing] = await tx.select({ id: unit.id }).from(unit).where(sameUnit).orderBy(unit.bsaUnitId);
  if (existing) return existing.id;
  const [district] = await tx.select({ value: setting.value }).from(setting).where(eq(setting.key, "import.district"));
  const [created] = await tx
    .insert(unit)
    .values({
      type: ref.type,
      number: ref.number,
      genderAccepted: ref.genderAccepted,
      district: typeof district?.value === "string" ? district.value : null,
    })
    .returning({ id: unit.id });
  return created.id;
}

async function insertAffiliations(tx: Tx, actor: CurrentUser, contactId: string, list: ParsedAffiliation[]) {
  const added: { unitId: string | null; position: string }[] = [];
  for (const a of list) {
    const unitId = await resolveUnit(tx, a.unit);
    const [row] = await tx
      .insert(affiliation)
      .values({ contactId, unitId, position: a.position, source: "manual" })
      .onConflictDoNothing()
      .returning({ id: affiliation.id });
    if (row) added.push({ unitId, position: a.position });
  }
  if (added.length) await writeAudit(actor, "affiliation.add", { type: "contact", id: contactId }, { added }, tx);
  return added.length;
}

export async function createContact(actor: CurrentUser, raw: NewContactInput): Promise<Result> {
  const parsed = newContactSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const input = parsed.data;

  if (input.email) {
    const [dupe] = await db
      .select({ id: contact.id })
      .from(contact)
      .where(and(eq(contact.email, input.email), sql`lower(${contact.firstName}) = lower(${input.firstName})`));
    if (dupe) return { ok: false, message: `${input.firstName} with ${input.email} is already a contact.`, id: dupe.id };
  }

  try {
    const id = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(contact)
        .values({
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
          phone: formatPhone(input.phone),
          isYouth: input.isYouth,
          guardianEmail: input.isYouth ? input.guardianEmail : null,
          source: input.source,
        })
        .returning({ id: contact.id });
      await writeAudit(actor, "contact.add", { type: "contact", id: row.id }, { youth: input.isYouth, source: input.source }, tx);
      await insertAffiliations(tx, actor, row.id, input.affiliations);
      return row.id;
    });
    return { ok: true, message: `Added ${contactName(input)}.`, id };
  } catch (error) {
    if (error instanceof UnitMissingError) return { ok: false, message: "One of those units no longer exists. Pick it again." };
    throw error;
  }
}

const updateSchema = z.object({
  preferredName: optionalText(80),
  notes: optionalText(4000),
  firstName: name.optional(),
  lastName: z.string().trim().max(80).optional(),
  email: optionalEmail.optional(),
  phone: optionalText(40).optional(),
  guardianEmail: optionalEmail.optional(),
});

export type UpdateContactInput = z.input<typeof updateSchema>;

export async function updateContact(actor: CurrentUser, id: string, raw: UpdateContactInput): Promise<Result> {
  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const input = parsed.data;
  const [existing] = await db.select().from(contact).where(eq(contact.id, id));
  if (!existing) return { ok: false, message: "That contact no longer exists." };

  const changes: Partial<typeof contact.$inferInsert> = { preferredName: input.preferredName, notes: input.notes };
  // Roster fields come back with every import, so only hand-added contacts can change them here.
  if (existing.source !== "import") {
    if (input.firstName !== undefined) changes.firstName = input.firstName;
    if (input.lastName !== undefined) changes.lastName = input.lastName;
    if (input.email !== undefined) changes.email = input.email;
    if (input.phone !== undefined) changes.phone = formatPhone(input.phone);
  }
  if (existing.isYouth && input.guardianEmail !== undefined) {
    if (!input.guardianEmail) return { ok: false, message: "Youth need a parent or guardian email." };
    changes.guardianEmail = input.guardianEmail;
  }

  await db.update(contact).set(changes).where(eq(contact.id, id));
  const changed = Object.keys(changes).filter(
    (k) => (changes as Record<string, unknown>)[k] !== (existing as Record<string, unknown>)[k],
  );
  // Field names only: the audit log never stores notes or contact details.
  await writeAudit(actor, "contact.update", { type: "contact", id }, { fields: changed });
  return { ok: true, message: "Saved." };
}

export async function setArchived(actor: CurrentUser, id: string, archived: boolean): Promise<Result> {
  const [existing] = await db.select().from(contact).where(eq(contact.id, id));
  if (!existing) return { ok: false, message: "That contact no longer exists." };
  await db
    .update(contact)
    .set({ status: archived ? "archived" : "active" })
    .where(eq(contact.id, id));
  await writeAudit(actor, archived ? "contact.archive" : "contact.unarchive", { type: "contact", id });
  return { ok: true, message: archived ? `Archived ${contactName(existing)}.` : `Restored ${contactName(existing)}.` };
}

export async function addAffiliation(actor: CurrentUser, contactId: string, raw: AffiliationInput): Promise<Result> {
  const parsed = affiliationInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const [existing] = await db.select({ id: contact.id }).from(contact).where(eq(contact.id, contactId));
  if (!existing) return { ok: false, message: "That contact no longer exists." };
  try {
    const added = await db.transaction((tx) => insertAffiliations(tx, actor, contactId, [parsed.data]));
    return added ? { ok: true, message: "Added." } : { ok: false, message: "They already have that position." };
  } catch (error) {
    if (error instanceof UnitMissingError) return { ok: false, message: "That unit no longer exists. Pick it again." };
    throw error;
  }
}

/** Hand-added contacts only: imported ones would come back with the next import, so they're archived instead. */
export async function deleteContact(actor: CurrentUser, id: string): Promise<Result> {
  const [existing] = await db.select().from(contact).where(eq(contact.id, id));
  if (!existing) return { ok: false, message: "Already deleted." };
  if (existing.source === "import") {
    return { ok: false, message: "Contacts from the roster can't be deleted, since the next import would add them back. Archive them instead." };
  }
  await db.transaction(async (tx) => {
    await tx.delete(contact).where(eq(contact.id, id));
    await writeAudit(actor, "contact.delete", { type: "contact", id }, { source: existing.source, youth: existing.isYouth }, tx);
  });
  return { ok: true, message: `Deleted ${contactName(existing)}.` };
}

export async function removeAffiliation(actor: CurrentUser, affiliationId: string): Promise<Result> {
  const [row] = await db.select().from(affiliation).where(eq(affiliation.id, affiliationId));
  if (!row) return { ok: false, message: "Already removed." };
  if (row.source === "import") return { ok: false, message: "Positions from the roster change only through an import." };
  await db.delete(affiliation).where(eq(affiliation.id, affiliationId));
  await writeAudit(actor, "affiliation.remove", { type: "contact", id: row.contactId }, { position: row.position });
  return { ok: true, message: "Removed." };
}
