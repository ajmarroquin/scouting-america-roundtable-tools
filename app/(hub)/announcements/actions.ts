"use server";

import { refresh } from "next/cache";
import { NotAllowedError, requireRole } from "@/lib/auth/session";
import { type AnnouncementDraft, refreshUnsubscribes, sendAnnouncement, sendTestAnnouncement } from "@/lib/announcements/send";
import { emailFailureReason } from "@/lib/email/errors";

type Result = { ok: boolean; message: string };

async function asAdmin(run: (actor: Awaited<ReturnType<typeof requireRole>>) => Promise<Result>): Promise<Result> {
  try {
    return await run(await requireRole("admin"));
  } catch (error) {
    if (error instanceof NotAllowedError) return { ok: false, message: error.message };
    throw error;
  }
}

export async function sendTestAction(draft: Omit<AnnouncementDraft, "audience">): Promise<Result> {
  return asAdmin((actor) => sendTestAnnouncement(actor, draft));
}

export async function sendAnnouncementAction(draft: AnnouncementDraft): Promise<Result> {
  return asAdmin(async (actor) => {
    const result = await sendAnnouncement(actor, draft);
    refresh();
    return result;
  });
}

export async function refreshUnsubscribesAction(): Promise<Result> {
  return asAdmin(async () => {
    try {
      const added = await refreshUnsubscribes();
      refresh();
      return { ok: true, message: added ? `${added} more ${added === 1 ? "person has" : "people have"} unsubscribed.` : "No new unsubscribes." };
    } catch (error) {
      return { ok: false, message: `Couldn't check Resend: ${emailFailureReason(error)}.` };
    }
  });
}
