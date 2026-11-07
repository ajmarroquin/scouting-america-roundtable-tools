import "server-only";
import { count, desc, eq, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import type { CurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { announcement, contact, setting } from "@/lib/db/schema";
import { emailFailureReason } from "@/lib/email/errors";
import { senderAddress } from "@/lib/email/sender";
import { audienceInfo, audienceMembers, isAudienceKey } from "./audiences";
import { type BroadcastMailer, getMailer } from "./mailer";
import { brandFrom } from "./brand";
import { getBrand } from "./brand-store";
import { renderAnnouncement } from "./render";

const SEGMENTS_SETTING = "announcements.segments";

const draftSchema = z.object({
  audience: z.string().refine(isAudienceKey, "Pick who it goes to."),
  subject: z.string().trim().min(1, "Write a subject.").max(150, "Keep the subject under 150 characters."),
  body: z.string().trim().min(1, "Write the message.").max(20000, "That message is too long."),
  previewText: z.string().trim().max(150, "Keep the preview text under 150 characters.").optional(),
});

export type AnnouncementDraft = z.input<typeof draftSchema>;

/** Checks a draft the way sending would, for saving or approving one ahead of time. */
export function checkDraft(raw: unknown): { ok: true; data: z.output<typeof draftSchema> } | { ok: false; message: string } {
  const parsed = draftSchema.safeParse(raw);
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false, message: parsed.error.issues[0]?.message ?? "Check the message." };
}
export type Result = { ok: boolean; message: string };

function footerFrom(actor: CurrentUser): string {
  return `Sent by ${actor.name || actor.email} for the roundtable team`;
}

/** The From header: the brand's name with the verified sending address. */
function fromAddress(brand: Awaited<ReturnType<typeof getBrand>>): string {
  const from = brandFrom(brand, senderAddress(process.env));
  if (!from) throw new Error("Set EMAIL_FROM, or connect Resend so RESEND_EMAIL_DOMAIN is set");
  return from;
}

/** Marks contacts who unsubscribed in Resend. Returns how many were new. */
export async function refreshUnsubscribes(mailer: BroadcastMailer = getMailer()): Promise<number> {
  const emails = [...new Set((await mailer.unsubscribedEmails()).map((e) => e.toLowerCase()))];
  if (!emails.length) return 0;
  const updated = await db
    .update(contact)
    .set({ unsubscribedAt: new Date() })
    .where(sql`lower(${contact.email}) in (${sql.join(emails.map((e) => sql`${e}`), sql`, `)}) and ${contact.unsubscribedAt} is null`)
    .returning({ id: contact.id });
  return updated.length;
}

export async function sendTestAnnouncement(actor: CurrentUser, raw: Omit<AnnouncementDraft, "audience">, mailer: BroadcastMailer = getMailer()): Promise<Result> {
  const parsed = draftSchema.omit({ audience: true }).safeParse(raw);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the message." };
  try {
    const brand = await getBrand();
    const { html, text } = renderAnnouncement({
      body: parsed.data.body,
      brand,
      previewText: parsed.data.previewText,
      footerFrom: footerFrom(actor),
      firstName: (actor.name || "there").split(/\s+/)[0],
      unsubscribeUrl: "#unsubscribe-link-goes-here",
    });
    await mailer.sendTest({ to: actor.email, from: fromAddress(brand), replyTo: actor.email, subject: `[Test] ${parsed.data.subject}`, html, text });
    return { ok: true, message: `Sent a test to ${actor.email}.` };
  } catch (error) {
    return { ok: false, message: `The test didn't send: ${emailFailureReason(error)}.` };
  }
}

/**
 * Sends an announcement: picks up new unsubscribes, makes the audience's Resend
 * segment match who's in it now, and sends a broadcast to that segment.
 */
export async function sendAnnouncement(actor: CurrentUser, raw: AnnouncementDraft, mailer: BroadcastMailer = getMailer()): Promise<Result> {
  const parsed = draftSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the message." };
  const { subject, body } = parsed.data;
  const key = parsed.data.audience;
  const audience = await audienceInfo(key);
  if (!audience) return { ok: false, message: "That group doesn't exist anymore. Pick another." };
  let recipients = 0;

  const record = async (status: "sent" | "failed", extra: { error?: string; broadcastId?: string }) => {
    const [row] = await db
      .insert(announcement)
      .values({
        subject,
        body,
        audience: key,
        audienceLabel: audience.label,
        recipients,
        status,
        error: extra.error ?? null,
        resendBroadcastId: extra.broadcastId ?? null,
        sentBy: actor.id,
        sentByEmail: actor.email,
      })
      .returning({ id: announcement.id });
    await writeAudit(actor, `announcement.${status}`, { type: "announcement", id: row.id }, { audience: key, recipients, error: extra.error });
  };

  try {
    await refreshUnsubscribes(mailer);
    const members = await audienceMembers(key);
    recipients = members.length;
    if (!recipients) return { ok: false, message: `Nobody in "${audience.label}" has an email to send to.` };

    const [saved] = await db.select({ value: setting.value }).from(setting).where(eq(setting.key, SEGMENTS_SETTING));
    const segments = (saved?.value as Record<string, string> | undefined) ?? {};
    const segmentId = await mailer.syncSegment(`Roundtable Tools: ${audience.label}`, segments[key] ?? null, members);
    if (segments[key] !== segmentId) {
      const value = { ...segments, [key]: segmentId };
      await db.insert(setting).values({ key: SEGMENTS_SETTING, value }).onConflictDoUpdate({ target: setting.key, set: { value } });
    }

    const brand = await getBrand();
    const { html, text } = renderAnnouncement({ body, brand, previewText: parsed.data.previewText, footerFrom: footerFrom(actor) });
    const broadcastId = await mailer.sendBroadcast({
      segmentId,
      name: `${new Date().toISOString().slice(0, 10)} ${subject}`.slice(0, 200),
      from: fromAddress(brand),
      replyTo: actor.email,
      subject,
      html,
      text,
    });
    await record("sent", { broadcastId });
    return { ok: true, message: `Sent "${subject}" to ${recipients} ${recipients === 1 ? "person" : "people"}. Replies come to you.` };
  } catch (error) {
    const reason = emailFailureReason(error);
    console.error(`[announcement] didn't send: ${reason}`);
    await record("failed", { error: reason });
    return { ok: false, message: `The announcement didn't send: ${reason}.` };
  }
}

export async function listAnnouncements(limit = 25) {
  return db.select().from(announcement).orderBy(desc(announcement.createdAt)).limit(limit);
}

export async function unsubscribedCount(): Promise<number> {
  const [{ n }] = await db.select({ n: count() }).from(contact).where(isNotNull(contact.unsubscribedAt));
  return n;
}
