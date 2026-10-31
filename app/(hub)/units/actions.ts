"use server";

import { refresh } from "next/cache";
import { NotAllowedError, requireRole } from "@/lib/auth/session";
import { loadUnitList, previewUnitList, type UnitListPayload } from "@/lib/units/apply";
import { addUnit } from "@/lib/units/mutations";

async function guard<T extends { ok: boolean; message?: string }>(
  min: "editor" | "admin",
  run: (actor: Awaited<ReturnType<typeof requireRole>>) => Promise<T>,
  refreshAfter = true,
): Promise<T | { ok: false; message: string }> {
  try {
    const result = await run(await requireRole(min));
    if (result.ok && refreshAfter) refresh();
    return result;
  } catch (error) {
    if (error instanceof NotAllowedError) return { ok: false, message: error.message };
    throw error;
  }
}

export async function addUnitAction(input: { type: string; number: string; genderAccepted: "B" | "G" | "F" | null }) {
  return guard("editor", (actor) => addUnit(actor, input));
}

/** Admins only: what loading this unit list would change. Writes nothing. */
export async function previewUnitListAction(input: UnitListPayload) {
  return guard("admin", () => previewUnitList(input), false);
}

export async function loadUnitListAction(input: UnitListPayload) {
  return guard("admin", (actor) => loadUnitList(actor, input));
}
