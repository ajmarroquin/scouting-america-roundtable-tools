import "server-only";
import { and, asc, eq, gte, lt } from "drizzle-orm";
import { audienceInfo } from "@/lib/announcements/audiences";
import type { BroadcastMailer } from "@/lib/announcements/mailer";
import { checkDraft, sendAnnouncement } from "@/lib/announcements/send";
import { appTimeZone, appToday } from "@/lib/attendance/today";
import { todayIn } from "@/lib/attendance/year";
import { writeAudit } from "@/lib/audit";
import { hasRole, isRole } from "@/lib/auth/roles";
import type { CurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { meeting, publicRateLimit, reminder, user } from "@/lib/db/schema";
import { ensureToken } from "@/lib/selfcheckin/service";
import { isDue, type ReminderKind, reminderDraft, reminderTiming, sendDay } from "./rules";

type Result = { ok: boolean; message: string };

export type ReminderRow = {
  id: string;
  meetingId: string;
  meetingDate: string;
  meetingTitle: string | null;
  meetingStatus: string;
  kind: ReminderKind;
  sendOn: string;
  audience: string;
  subject: string;
  previewText: string | null;
  body: string;
  status: "draft" | "approved" | "sent" | "failed";
  approvedByName: string | null;
  sentAt: Date | null;
  error: string | null;
};

function select() {
  return db
    .select({ r: reminder, m: { id: meeting.id, date: meeting.date, title: meeting.title, status: meeting.status }, approver: { name: user.name, email: user.email } })
    .from(reminder)
    .innerJoin(meeting, eq(meeting.id, reminder.meetingId))
    .leftJoin(user, eq(user.id, reminder.approvedBy));
}

type Joined = Awaited<ReturnType<ReturnType<typeof select>["execute"]>>[number];
const row = ({ r, m, approver }: Joined): ReminderRow => ({
  id: r.id,
  meetingId: m.id,
  meetingDate: m.date,
  meetingTitle: m.title,
  meetingStatus: m.status,
  kind: r.kind as ReminderKind,
  sendOn: sendDay(m.date, r.kind as ReminderKind),
  audience: r.audience,
  subject: r.subject,
  previewText: r.previewText,
  body: r.body,
  status: r.status as ReminderRow["status"],
  approvedByName: approver?.name || approver?.email || null,
  sentAt: r.sentAt,
  error: r.error,
});

const order = (a: ReminderRow, b: ReminderRow) => a.sendOn.localeCompare(b.sendOn) || a.kind.localeCompare(b.kind);

export async function remindersFor(meetingId: string): Promise<ReminderRow[]> {
  return (await select().where(eq(reminder.meetingId, meetingId))).map(row).sort(order);
}

/** Reminders for meetings from today on, soonest first. */
export async function upcomingReminders(): Promise<ReminderRow[]> {
  return (await select().where(gte(meeting.date, appToday())).orderBy(asc(meeting.date))).map(row).sort(order);
}

export async function getReminder(id: string): Promise<ReminderRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [r] = await select().where(eq(reminder.id, id));
  return r ? row(r) : null;
}

/** Writes the week-before and day-of drafts for a meeting, filled in from it. Nothing is approved. */
export async function draftUsual(actor: CurrentUser, meetingId: string, origin: string): Promise<Result> {
  const [m] = await db.select().from(meeting).where(eq(meeting.id, meetingId));
  if (!m) return { ok: false, message: "That meeting no longer exists." };
  if (m.status !== "held" || m.date < appToday()) return { ok: false, message: "Reminders are for meetings still to come." };
  const token = await ensureToken(actor, meetingId);
  if (!token.ok) return token;
  const info = { ...m, link: `${origin}/m/${token.token}` };
  const kinds: ReminderKind[] = ["week_before", "day_of"];
  const made = await db
    .insert(reminder)
    .values(kinds.map((kind) => ({ meetingId, kind, ...reminderDraft(kind, info), createdBy: actor.id })))
    .onConflictDoNothing()
    .returning({ id: reminder.id });
  await writeAudit(actor, "reminder.draft", { type: "meeting", id: meetingId }, { made: made.length });
  return { ok: true, message: made.length ? "Drafted both reminders. Review each one and approve it to send." : "Both reminders are already drafted." };
}

/** Saves edits. An approved reminder goes back to a draft: what was approved is what sends. */
export async function saveReminder(actor: CurrentUser, id: string, raw: unknown): Promise<Result> {
  const r = await getReminder(id);
  if (!r) return { ok: false, message: "That reminder no longer exists." };
  if (r.status === "sent") return { ok: false, message: "That reminder has already gone out." };
  const checked = checkDraft(raw);
  if (!checked.ok) return checked;
  const { audience, subject, body, previewText } = checked.data;
  const changed = audience !== r.audience || subject !== r.subject || body.trim() !== r.body.trim() || (previewText ?? "") !== (r.previewText ?? "");
  if (!changed) return { ok: true, message: "No changes." };
  await db
    .update(reminder)
    .set({ audience, subject, body, previewText: previewText || null, status: "draft", approvedBy: null, approvedAt: null, error: null })
    .where(eq(reminder.id, id));
  await writeAudit(actor, "reminder.edit", { type: "reminder", id }, { wasApproved: r.status === "approved" });
  return { ok: true, message: r.status === "approved" ? "Saved. It needs approving again before it sends." : "Saved." };
}

export async function approveReminder(actor: CurrentUser, id: string): Promise<Result> {
  const r = await getReminder(id);
  if (!r) return { ok: false, message: "That reminder no longer exists." };
  if (r.status === "sent") return { ok: false, message: "That reminder has already gone out." };
  const checked = checkDraft(r);
  if (!checked.ok) return checked;
  if (!(await audienceInfo(r.audience))) return { ok: false, message: "Its audience no longer exists. Pick another and save." };
  if (r.meetingDate < appToday()) return { ok: false, message: "That meeting has passed." };
  const timing = timingFor(r);
  if (timing?.tooLate) return { ok: false, message: timing.note };
  await db.update(reminder).set({ status: "approved", approvedBy: actor.id, approvedAt: new Date(), error: null }).where(eq(reminder.id, id));
  await writeAudit(actor, "reminder.approve", { type: "reminder", id }, { sendOn: r.sendOn, audience: r.audience });
  return { ok: true, message: timing ? `Approved. ${timing.note}` : "Approved. It goes out at 9 am on its day." };
}

export async function unapproveReminder(actor: CurrentUser, id: string): Promise<Result> {
  const r = await getReminder(id);
  if (!r || r.status !== "approved") return { ok: false, message: "That reminder isn't approved." };
  await db.update(reminder).set({ status: "draft", approvedBy: null, approvedAt: null }).where(eq(reminder.id, id));
  await writeAudit(actor, "reminder.unapprove", { type: "reminder", id });
  return { ok: true, message: "Back to a draft. It won't send unless approved again." };
}

export async function deleteReminder(actor: CurrentUser, id: string): Promise<Result> {
  const r = await getReminder(id);
  if (!r) return { ok: false, message: "That reminder no longer exists." };
  if (r.status === "sent") return { ok: false, message: "That reminder has already gone out." };
  await db.delete(reminder).where(eq(reminder.id, id));
  await writeAudit(actor, "reminder.delete", { type: "reminder", id }, { meetingId: r.meetingId, kind: r.kind });
  return { ok: true, message: "Deleted the reminder." };
}

/**
 * Sends a reminder that didn't go, right now, as the admin who asks, so
 * replies come to them. Only a failed one, and only before its meeting.
 * Claimed first, so a double click can't send it twice.
 */
export async function sendReminderNow(actor: CurrentUser, id: string, mailer?: BroadcastMailer): Promise<Result> {
  const r = await getReminder(id);
  if (!r) return { ok: false, message: "That reminder no longer exists." };
  if (r.status !== "failed") return { ok: false, message: r.status === "sent" ? "That reminder has already gone out." : "Only a reminder that didn't send can be sent now." };
  if (r.meetingStatus !== "held" || r.meetingDate < appToday()) return { ok: false, message: "That meeting has passed, so there's nothing to remind people about." };
  const checked = checkDraft(r);
  if (!checked.ok) return checked;
  if (!(await audienceInfo(r.audience))) return { ok: false, message: "Its audience no longer exists. Pick another and save." };
  const claimed = await db
    .update(reminder)
    .set({ status: "sent", sentAt: new Date(), approvedBy: actor.id, approvedAt: new Date(), error: null })
    .where(and(eq(reminder.id, id), eq(reminder.status, "failed")))
    .returning({ id: reminder.id });
  if (!claimed.length) return { ok: false, message: "That reminder is already being sent." };
  const result = await sendAnnouncement(actor, { audience: r.audience, subject: r.subject, body: r.body, previewText: r.previewText ?? undefined }, mailer);
  if (!result.ok) {
    await db.update(reminder).set({ status: "failed", sentAt: null, error: result.message }).where(eq(reminder.id, id));
    return result;
  }
  await writeAudit(actor, "reminder.send_now", { type: "reminder", id }, { meetingId: r.meetingId, kind: r.kind, audience: r.audience });
  return result;
}

/** The hour of the day in the district's zone. */
function localHour(now: Date): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: appTimeZone(), hour: "numeric", hourCycle: "h23" }).format(now));
}

/** A note when a reminder isn't simply going on its day: late (next 9 am run) or too late. */
export function timingFor(r: Pick<ReminderRow, "kind" | "meetingDate" | "meetingStatus">, now = new Date()) {
  return reminderTiming(r.kind, { date: r.meetingDate, status: r.meetingStatus }, todayIn(appTimeZone(), now), localHour(now));
}

/**
 * The daily job: sends every approved reminder that's due, as the person who
 * approved it, so replies go to them. Also clears old rate-limit counters.
 */
export async function sendDueReminders(now = new Date(), mailer?: BroadcastMailer): Promise<{ sent: number; failed: number; skipped: number }> {
  const today = todayIn(appTimeZone(), now);
  const hour = localHour(now);
  await db.delete(publicRateLimit).where(lt(publicRateLimit.windowStart, new Date(now.getTime() - 24 * 3600 * 1000)));
  const approved = await db
    .select({ r: reminder, m: meeting, approver: user })
    .from(reminder)
    .innerJoin(meeting, eq(meeting.id, reminder.meetingId))
    .leftJoin(user, eq(user.id, reminder.approvedBy))
    .where(and(eq(reminder.status, "approved")));
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  for (const { r, m, approver } of approved) {
    if (!isDue({ kind: r.kind as ReminderKind, status: r.status }, m, today, hour)) {
      skipped++;
      continue;
    }
    // Claim it first, so a second run at the same time can't send it twice.
    const claimed = await db
      .update(reminder)
      .set({ status: "sent", sentAt: now })
      .where(and(eq(reminder.id, r.id), eq(reminder.status, "approved")))
      .returning({ id: reminder.id });
    if (!claimed.length) continue;
    // Sending is for admins; the approval only counts while they still are one.
    if (!approver || !isRole(approver.role) || !hasRole(approver.role, "admin")) {
      await db
        .update(reminder)
        .set({ status: "failed", sentAt: null, error: "The person who approved it isn't an admin anymore. Approve it again." })
        .where(eq(reminder.id, r.id));
      failed++;
      continue;
    }
    const actor: CurrentUser = { id: approver.id, name: approver.name, email: approver.email, role: approver.role };
    const result = await sendAnnouncement(actor, { audience: r.audience, subject: r.subject, body: r.body, previewText: r.previewText ?? undefined }, mailer);
    if (result.ok) sent++;
    else {
      failed++;
      await db.update(reminder).set({ status: "failed", sentAt: null, error: result.message }).where(eq(reminder.id, r.id));
    }
  }
  return { sent, failed, skipped };
}
