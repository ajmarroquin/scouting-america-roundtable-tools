"use server";

import { refresh } from "next/cache";
import { NotAllowedError, requireRole } from "@/lib/auth/session";
import * as groups from "@/lib/groups/store";

type Result = { ok: boolean; message: string; id?: string };

// Editors and admins manage groups, the same people who edit contacts.
async function asEditor(run: (actor: Awaited<ReturnType<typeof requireRole>>) => Promise<Result>): Promise<Result> {
  try {
    const result = await run(await requireRole("editor"));
    if (result.ok) refresh();
    return result;
  } catch (error) {
    if (error instanceof NotAllowedError) return { ok: false, message: error.message };
    throw error;
  }
}

const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

export async function createGroupAction(input: { name: string; description?: string }, contactIds?: string[]): Promise<Result> {
  return asEditor((actor) => groups.createGroup(actor, input, list(contactIds)));
}

export async function updateGroupAction(groupId: string, input: { name: string; description?: string }): Promise<Result> {
  return asEditor((actor) => groups.updateGroup(actor, String(groupId), input));
}

export async function deleteGroupAction(groupId: string): Promise<Result> {
  return asEditor((actor) => groups.deleteGroup(actor, String(groupId)));
}

export async function addToGroupAction(groupId: string, contactIds: string[]): Promise<Result> {
  return asEditor((actor) => groups.addToGroup(actor, String(groupId), list(contactIds)));
}

export async function removeFromGroupAction(groupId: string, contactIds: string[]): Promise<Result> {
  return asEditor((actor) => groups.removeFromGroup(actor, String(groupId), list(contactIds)));
}
