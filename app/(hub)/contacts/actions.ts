"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { Role } from "@/lib/auth/roles";
import type { AffiliationInput } from "@/lib/contacts/affiliation-input";
import { NotAllowedError, requireRole } from "@/lib/auth/session";
import * as contacts from "@/lib/contacts/mutations";
import { commitImport, previewImport, type ImportPreview } from "@/lib/import/apply";

type Result = contacts.Result;

async function withRole<T extends Result>(min: Role, run: (actor: Awaited<ReturnType<typeof requireRole>>) => Promise<T>) {
  try {
    const result = await run(await requireRole(min));
    if (result.ok) refresh();
    return result;
  } catch (error) {
    if (error instanceof NotAllowedError) return { ok: false, message: error.message } as T;
    throw error;
  }
}

const id = z.uuid();

export async function createContactAction(input: contacts.NewContactInput): Promise<Result> {
  return withRole("editor", (actor) => contacts.createContact(actor, input));
}

export async function updateContactAction(contactId: string, input: contacts.UpdateContactInput): Promise<Result> {
  if (!id.safeParse(contactId).success) return { ok: false, message: "Unknown contact." };
  return withRole("editor", (actor) => contacts.updateContact(actor, contactId, input));
}

export async function setArchivedAction(contactId: string, archived: boolean): Promise<Result> {
  if (!id.safeParse(contactId).success) return { ok: false, message: "Unknown contact." };
  return withRole("editor", (actor) => contacts.setArchived(actor, contactId, archived === true));
}

export async function addAffiliationAction(contactId: string, input: AffiliationInput): Promise<Result> {
  if (!id.safeParse(contactId).success) return { ok: false, message: "Unknown contact." };
  return withRole("editor", (actor) => contacts.addAffiliation(actor, contactId, input));
}

export async function deleteContactAction(contactId: string): Promise<Result> {
  if (!id.safeParse(contactId).success) return { ok: false, message: "Unknown contact." };
  return withRole("editor", (actor) => contacts.deleteContact(actor, contactId));
}

export async function removeAffiliationAction(affiliationId: string): Promise<Result> {
  if (!id.safeParse(affiliationId).success) return { ok: false, message: "Unknown position." };
  return withRole("editor", (actor) => contacts.removeAffiliation(actor, affiliationId));
}

type PreviewResult = { ok: true; preview: ImportPreview } | { ok: false; message: string };

export async function previewImportAction(payload: unknown): Promise<PreviewResult> {
  try {
    await requireRole("admin");
  } catch (error) {
    if (error instanceof NotAllowedError) return { ok: false, message: error.message };
    throw error;
  }
  try {
    return { ok: true, preview: await previewImport(payload) };
  } catch (error) {
    if (error instanceof z.ZodError) return { ok: false, message: "The file's data didn't pass validation. Nothing was saved." };
    throw error;
  }
}

export async function commitImportAction(payload: unknown): Promise<Result & { counts?: Record<string, number> }> {
  return withRole("admin", async (actor) => {
    try {
      const { counts } = await commitImport(actor, payload);
      return { ok: true, message: `Imported ${counts.people} people.`, counts };
    } catch (error) {
      if (error instanceof z.ZodError) return { ok: false, message: "The file's data didn't pass validation. Nothing was saved." };
      throw error;
    }
  });
}
