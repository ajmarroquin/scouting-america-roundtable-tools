import "server-only";
import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import type { CurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { contact, contactGroup, contactGroupMember, user } from "@/lib/db/schema";

// Groups editors build by hand. Membership is just a list of contacts; who an
// announcement reaches is still decided by the rules in lib/announcements.

export type GroupSummary = {
  id: string;
  name: string;
  description: string | null;
  count: number;
  createdByName: string | null;
  updatedAt: Date;
};

type Result = { ok: true; message: string; id?: string } | { ok: false; message: string };

export const groupInput = z.object({
  name: z.string().trim().min(1, "Name the group.").max(60, "Keep the name under 60 characters."),
  description: z
    .string()
    .trim()
    .max(200, "Keep the description under 200 characters.")
    .optional()
    .transform((v) => v || null),
});

const ids = z.array(z.uuid()).min(1, "Pick at least one person.").max(5000);
const groupId = z.uuid();

export async function listGroups(): Promise<GroupSummary[]> {
  const counts = db
    .select({ groupId: contactGroupMember.groupId, n: count().as("n") })
    .from(contactGroupMember)
    .groupBy(contactGroupMember.groupId)
    .as("counts");
  const rows = await db
    .select({
      id: contactGroup.id,
      name: contactGroup.name,
      description: contactGroup.description,
      n: counts.n,
      createdByName: user.name,
      updatedAt: contactGroup.updatedAt,
    })
    .from(contactGroup)
    .leftJoin(counts, eq(counts.groupId, contactGroup.id))
    .leftJoin(user, eq(user.id, contactGroup.createdBy))
    .orderBy(asc(sql`lower(${contactGroup.name})`));
  return rows.map((r) => ({ ...r, count: Number(r.n ?? 0), createdByName: r.createdByName || null }));
}

export async function getGroup(id: string): Promise<{ id: string; name: string; description: string | null } | null> {
  if (!groupId.safeParse(id).success) return null;
  const [row] = await db
    .select({ id: contactGroup.id, name: contactGroup.name, description: contactGroup.description })
    .from(contactGroup)
    .where(eq(contactGroup.id, id));
  return row ?? null;
}

export async function groupMemberIds(id: string): Promise<string[]> {
  if (!groupId.safeParse(id).success) return [];
  return (await db.select({ id: contactGroupMember.contactId }).from(contactGroupMember).where(eq(contactGroupMember.groupId, id))).map(
    (r) => r.id,
  );
}

/** Every custom group each contact is in, for the contacts list. */
export async function groupMembership(): Promise<Map<string, string[]>> {
  const rows = await db.select({ groupId: contactGroupMember.groupId, contactId: contactGroupMember.contactId }).from(contactGroupMember);
  const map = new Map<string, string[]>();
  for (const r of rows) map.set(r.contactId, [...(map.get(r.contactId) ?? []), r.groupId]);
  return map;
}

export async function groupsOf(contactId: string): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: contactGroup.id, name: contactGroup.name })
    .from(contactGroupMember)
    .innerJoin(contactGroup, eq(contactGroup.id, contactGroupMember.groupId))
    .where(eq(contactGroupMember.contactId, contactId))
    .orderBy(asc(sql`lower(${contactGroup.name})`));
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  return (error as { code?: string }).code === "23505" || isUniqueViolation((error as { cause?: unknown }).cause);
}

export async function createGroup(actor: CurrentUser, raw: unknown, contactIds: string[] = []): Promise<Result> {
  const parsed = groupInput.safeParse(raw);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the group." };
  const members = contactIds.length ? ids.safeParse(contactIds) : null;
  if (members && !members.success) return { ok: false, message: members.error.issues[0]?.message ?? "Check who to add." };
  try {
    const id = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(contactGroup)
        .values({ name: parsed.data.name, description: parsed.data.description, createdBy: actor.id })
        .returning({ id: contactGroup.id });
      if (members?.success) {
        const found = await tx.select({ id: contact.id }).from(contact).where(inArray(contact.id, members.data));
        if (found.length) await tx.insert(contactGroupMember).values(found.map((c) => ({ groupId: row.id, contactId: c.id })));
      }
      await writeAudit(actor, "group.create", { type: "contact_group", id: row.id }, { name: parsed.data.name, added: contactIds.length }, tx);
      return row.id;
    });
    const added = contactIds.length ? ` with ${contactIds.length} ${contactIds.length === 1 ? "person" : "people"}` : "";
    return { ok: true, message: `Made the group "${parsed.data.name}"${added}.`, id };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, message: `There's already a group called "${parsed.data.name}".` };
    throw error;
  }
}

export async function updateGroup(actor: CurrentUser, id: string, raw: unknown): Promise<Result> {
  const parsed = groupInput.safeParse(raw);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the group." };
  if (!(await getGroup(id))) return { ok: false, message: "That group doesn't exist anymore." };
  try {
    await db.update(contactGroup).set({ name: parsed.data.name, description: parsed.data.description }).where(eq(contactGroup.id, id));
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, message: `There's already a group called "${parsed.data.name}".` };
    throw error;
  }
  await writeAudit(actor, "group.update", { type: "contact_group", id }, { name: parsed.data.name });
  return { ok: true, message: "Saved." };
}

export async function deleteGroup(actor: CurrentUser, id: string): Promise<Result> {
  const group = await getGroup(id);
  if (!group) return { ok: false, message: "That group doesn't exist anymore." };
  await db.delete(contactGroup).where(eq(contactGroup.id, id));
  await writeAudit(actor, "group.delete", { type: "contact_group", id }, { name: group.name });
  return { ok: true, message: `Deleted "${group.name}". The people in it are still in contacts.` };
}

export async function addToGroup(actor: CurrentUser, id: string, contactIds: string[]): Promise<Result> {
  const group = await getGroup(id);
  if (!group) return { ok: false, message: "That group doesn't exist anymore." };
  const parsed = ids.safeParse(contactIds);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check who to add." };
  const found = await db.select({ id: contact.id }).from(contact).where(inArray(contact.id, parsed.data));
  const added = found.length
    ? await db
        .insert(contactGroupMember)
        .values(found.map((c) => ({ groupId: id, contactId: c.id })))
        .onConflictDoNothing()
        .returning({ id: contactGroupMember.contactId })
    : [];
  await db.update(contactGroup).set({ updatedAt: new Date() }).where(eq(contactGroup.id, id));
  await writeAudit(actor, "group.add", { type: "contact_group", id }, { added: added.length });
  const already = found.length - added.length;
  return {
    ok: true,
    message: `Added ${added.length} to "${group.name}".${already ? ` ${already} ${already === 1 ? "was" : "were"} already in it.` : ""}`,
  };
}

export async function removeFromGroup(actor: CurrentUser, id: string, contactIds: string[]): Promise<Result> {
  const group = await getGroup(id);
  if (!group) return { ok: false, message: "That group doesn't exist anymore." };
  const parsed = ids.safeParse(contactIds);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check who to remove." };
  const removed = await db
    .delete(contactGroupMember)
    .where(and(eq(contactGroupMember.groupId, id), inArray(contactGroupMember.contactId, parsed.data)))
    .returning({ id: contactGroupMember.contactId });
  await db.update(contactGroup).set({ updatedAt: new Date() }).where(eq(contactGroup.id, id));
  await writeAudit(actor, "group.remove", { type: "contact_group", id }, { removed: removed.length });
  return { ok: true, message: `Took ${removed.length} out of "${group.name}".` };
}
