"use server";

import { refresh } from "next/cache";
import { NotAllowedError, requireRole } from "@/lib/auth/session";
import { addFromList, type AddFromListResult } from "@/lib/contacts/list-compare";

export async function addFromListAction(input: unknown): Promise<AddFromListResult> {
  try {
    const actor = await requireRole("editor");
    const result = await addFromList(actor, input);
    if (result.ok) refresh();
    return result;
  } catch (error) {
    if (error instanceof NotAllowedError) return { ok: false, message: error.message };
    throw error;
  }
}
