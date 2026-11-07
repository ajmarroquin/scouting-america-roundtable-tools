"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { NotAllowedError, requireRole } from "@/lib/auth/session";
import { type AnnouncementDraft, refreshUnsubscribes, sendAnnouncement, sendTestAnnouncement } from "@/lib/announcements/send";
import { audienceRoster, isAudienceKey, type RosterPerson } from "@/lib/announcements/audiences";
import { saveBrand } from "@/lib/announcements/brand-store";
import type { Reach } from "@/lib/announcements/reach";
import { emailFailureReason } from "@/lib/email/errors";
import * as reminders from "@/lib/reminders/service";
import { ensureToken } from "@/lib/selfcheckin/service";

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

export async function saveBrandAction(input: unknown): Promise<Result> {
  return asAdmin(async (actor) => {
    const result = await saveBrand(actor, input);
    if (result.ok) refresh();
    return result;
  });
}

/** Who an audience reaches and who's left out, for the "who's in it" list. */
export async function audienceRosterAction(key: string): Promise<{ ok: true; roster: Reach<RosterPerson> } | { ok: false; message: string }> {
  try {
    await requireRole("admin");
  } catch (error) {
    if (error instanceof NotAllowedError) return { ok: false, message: error.message };
    throw error;
  }
  if (typeof key !== "string" || !isAudienceKey(key)) return { ok: false, message: "Pick who it goes to." };
  return { ok: true, roster: await audienceRoster(key) };
}

/** The meeting's public page token, for a button that links to it. */
export async function meetingLinkAction(meetingId: string): Promise<{ ok: true; token: string } | { ok: false; message: string }> {
  try {
    const actor = await requireRole("admin");
    return await ensureToken(actor, String(meetingId));
  } catch (error) {
    if (error instanceof NotAllowedError) return { ok: false, message: error.message };
    throw error;
  }
}

// Reminders: drafted ahead, sent at 9 am on their day only once approved.

async function siteOrigin(): Promise<string> {
  const configured = process.env.BETTER_AUTH_URL?.replace(/\/$/, "");
  if (configured) return configured;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${h.get("x-forwarded-proto") ?? "https"}://${host}`;
}

export async function draftUsualRemindersAction(meetingId: string): Promise<Result> {
  return asAdmin(async (actor) => {
    const r = await reminders.draftUsual(actor, String(meetingId), await siteOrigin());
    if (r.ok) refresh();
    return r;
  });
}

export async function saveReminderAction(id: string, draft: unknown): Promise<Result> {
  return asAdmin(async (actor) => {
    const r = await reminders.saveReminder(actor, String(id), draft);
    if (r.ok) refresh();
    return r;
  });
}

export async function approveReminderAction(id: string, draft: unknown): Promise<Result> {
  return asAdmin(async (actor) => {
    // Save what's on screen first, so what's approved is exactly what was reviewed.
    const saved = await reminders.saveReminder(actor, String(id), draft);
    if (!saved.ok) return saved;
    const r = await reminders.approveReminder(actor, String(id));
    refresh();
    return r;
  });
}

export async function unapproveReminderAction(id: string): Promise<Result> {
  return asAdmin(async (actor) => {
    const r = await reminders.unapproveReminder(actor, String(id));
    if (r.ok) refresh();
    return r;
  });
}

export async function deleteReminderAction(id: string): Promise<Result> {
  return asAdmin(async (actor) => {
    const r = await reminders.deleteReminder(actor, String(id));
    if (r.ok) refresh();
    return r;
  });
}
