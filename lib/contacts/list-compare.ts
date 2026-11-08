import "server-only";
import { z } from "zod";
import { checkInPeople, type CheckInPerson } from "@/lib/attendance/queries";
import type { CurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { contact } from "@/lib/db/schema";
import { addToGroup, createGroup } from "@/lib/groups/store";
import type { CompareCandidate } from "./compare";
import { contactName } from "./format";
import { createContact } from "./mutations";

export type ComparePerson = CheckInPerson & CompareCandidate;

/** Everyone in contacts (archived too) with what a list can be matched on: name, both emails, phone. */
export async function compareData(): Promise<ComparePerson[]> {
  const [people, extra] = await Promise.all([
    checkInPeople({ includeArchived: true }),
    db.select({ id: contact.id, altEmail: contact.altEmail, phone: contact.phone }).from(contact),
  ]);
  const byId = new Map(extra.map((e) => [e.id, e]));
  return people.map((p) => ({ ...p, altEmail: byId.get(p.id)?.altEmail ?? null, phone: byId.get(p.id)?.phone ?? null }));
}

const addInput = z.object({
  add: z
    .array(
      z.object({
        firstName: z.string().trim().min(1).max(80),
        lastName: z.string().trim().max(80),
        email: z.string().trim().max(254),
        phone: z.string().trim().max(40),
      }),
    )
    .max(500, "Add up to 500 at a time."),
  existingIds: z.array(z.uuid()).max(3000),
  groupName: z.string().trim().max(60).optional(),
});

export type AddFromListInput = z.input<typeof addInput>;
export type AddFromListResult = { ok: boolean; message: string; groupId?: string; failed?: string[] };

/**
 * Adds the people a list has that contacts don't (as adults with no unit yet, so
 * they're easy to find and fill in), and optionally puts everyone on the list,
 * old and new, in a new group.
 */
export async function addFromList(actor: CurrentUser, raw: unknown): Promise<AddFromListResult> {
  const parsed = addInput.safeParse(raw);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the list." };
  const { add, existingIds, groupName } = parsed.data;
  if (!add.length && !groupName) return { ok: false, message: "Nothing to add." };

  // Make the group first, so a name that's taken stops everything before anyone is added.
  let groupId: string | undefined;
  if (groupName) {
    const group = await createGroup(actor, { name: groupName }, existingIds);
    if (!group.ok || !group.id) return { ok: false, message: group.message };
    groupId = group.id;
  }

  const added: string[] = [];
  const already: string[] = [];
  const failed: string[] = [];
  for (const p of add) {
    // An email that doesn't look like one is left off rather than losing the person.
    const email = z.email().safeParse(p.email).success ? p.email : "";
    const result = await createContact(actor, { ...p, email, isYouth: false, guardianEmail: "", affiliations: [], source: "manual" });
    if (result.ok && result.id) added.push(result.id);
    else if (result.id) already.push(result.id);
    else failed.push(`${contactName(p)}: ${result.message}`);
  }
  if (groupId && (added.length || already.length)) await addToGroup(actor, groupId, [...added, ...already]);

  const inGroup = new Set([...existingIds, ...added, ...already]).size;
  const parts = [
    add.length ? `Added ${added.length} ${added.length === 1 ? "contact" : "contacts"}` : null,
    already.length ? `${already.length} ${already.length === 1 ? "was" : "were"} already in contacts` : null,
    groupName ? `put ${inGroup} in "${groupName}"` : null,
  ].filter(Boolean);
  const message = `${parts.join(", ")}.`.replace(/^./, (c) => c.toUpperCase());
  return { ok: failed.length < add.length || !add.length, message, groupId, failed };
}
