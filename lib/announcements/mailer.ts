import "server-only";
import { Resend } from "resend";

// The part of Resend announcements need, behind an interface so tests use a
// fake and local development logs instead of sending.

export type Member = { email: string; firstName: string; lastName: string };

export interface BroadcastMailer {
  /** Every address that unsubscribed in Resend. */
  unsubscribedEmails(): Promise<string[]>;
  /**
   * Deletes the segments this app made (names starting with the prefix) that
   * are older than the cutoff. Resend's plan caps how many segments exist, so
   * each send makes its own and the old ones go once their broadcast is out.
   * Contacts and their unsubscribes stay; only the grouping goes.
   */
  clearSegments(prefix: string, olderThan: Date): Promise<number>;
  /** Makes a new segment holding exactly these people. Returns its id. */
  createSegment(name: string, members: Member[]): Promise<string>;
  /** Creates and sends a broadcast to a segment. Returns the broadcast id. */
  sendBroadcast(opts: { segmentId: string; name: string; from: string; replyTo: string; subject: string; html: string; text: string }): Promise<string>;
  /** One email to one person, for a test. */
  sendTest(opts: { to: string; from: string; replyTo: string; subject: string; html: string; text: string }): Promise<void>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function unwrap<T>(result: { data: T | null; error: { name?: string; message: string } | null }): T {
  if (result.error || !result.data) throw new Error(`Resend: ${result.error?.name ?? "error"}: ${result.error?.message ?? "no data"}`);
  return result.data;
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export class ResendMailer implements BroadcastMailer {
  constructor(private readonly resend: Resend) {}

  async unsubscribedEmails(): Promise<string[]> {
    const out: string[] = [];
    let after: string | undefined;
    for (let page = 0; page < 100; page++) {
      const data = unwrap(await this.resend.contacts.list(after ? { limit: 100, after } : { limit: 100 }));
      for (const c of data.data) if (c.unsubscribed) out.push(c.email);
      if (!data.has_more || !data.data.length) break;
      after = data.data.at(-1)!.id;
    }
    return out;
  }

  async clearSegments(prefix: string, olderThan: Date): Promise<number> {
    const old: string[] = [];
    let after: string | undefined;
    for (let page = 0; page < 20; page++) {
      const data = unwrap(await this.resend.segments.list(after ? { limit: 100, after } : { limit: 100 }));
      for (const seg of data.data) if (seg.name.startsWith(prefix) && new Date(seg.created_at) < olderThan) old.push(seg.id);
      if (!data.has_more || !data.data.length) break;
      after = data.data.at(-1)!.id;
    }
    // One that won't delete is left for next time rather than stopping the send.
    let cleared = 0;
    for (const id of old) if (!(await this.resend.segments.remove(id)).error) cleared++;
    return cleared;
  }

  async createSegment(name: string, members: Member[]): Promise<string> {
    const id = unwrap(await this.resend.segments.create({ name })).id;
    // Everyone in one import. Upsert updates names; leaving out the
    // "unsubscribed" column keeps whatever each person chose.
    const csv = ["email,first_name,last_name", ...members.map((m) => [m.email, m.firstName, m.lastName].map(csvCell).join(","))].join("\n");
    const started = unwrap(
      await this.resend.contacts.imports.create({
        file: new Blob([csv], { type: "text/csv" }),
        columnMap: { email: "email", firstName: "first_name", lastName: "last_name" },
        onConflict: "upsert",
        segments: [{ id }],
      }),
    );
    for (let i = 0; ; i++) {
      const status = unwrap(await this.resend.contacts.imports.get(started.id));
      if (status.status === "completed") break;
      if (status.status === "failed") throw new Error("Resend: import_failed: The contact import failed.");
      if (i > 40) throw new Error("Resend: import_timeout: The contact import is taking too long. Try again in a minute.");
      await sleep(1000);
    }
    return id;
  }

  async sendBroadcast(opts: { segmentId: string; name: string; from: string; replyTo: string; subject: string; html: string; text: string }) {
    return unwrap(
      await this.resend.broadcasts.create({
        segmentId: opts.segmentId,
        name: opts.name,
        from: opts.from,
        replyTo: opts.replyTo,
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
        send: true,
      }),
    ).id;
  }

  async sendTest(opts: { to: string; from: string; replyTo: string; subject: string; html: string; text: string }) {
    unwrap(await this.resend.emails.send(opts));
  }
}

/** Local development without a Resend key: log what would go out. */
export class DevMailer implements BroadcastMailer {
  async unsubscribedEmails() {
    return (process.env.DEV_UNSUBSCRIBED ?? "").split(",").map((e) => e.trim()).filter(Boolean);
  }
  async clearSegments() {
    return 0;
  }
  async createSegment(name: string, members: Member[]) {
    console.info(`[broadcast:dev] segment "${name}" has ${members.length} people`);
    return `dev-segment-${Date.now()}`;
  }
  async sendBroadcast(opts: { segmentId: string; subject: string; replyTo: string }) {
    console.info(`[broadcast:dev] sent "${opts.subject}" to ${opts.segmentId} reply-to=${opts.replyTo}`);
    return `dev-broadcast-${Date.now()}`;
  }
  async sendTest(opts: { to: string; subject: string; text: string }) {
    console.info(`[broadcast:dev] test to=${opts.to} subject="${opts.subject}"\n${opts.text}`);
  }
}

/**
 * Broadcasts need a full-access key; the Marketplace key may only send. Use
 * RESEND_BROADCAST_API_KEY when set, else RESEND_API_KEY.
 */
export function getMailer(): BroadcastMailer {
  const key = process.env.RESEND_BROADCAST_API_KEY || process.env.RESEND_API_KEY;
  if (key) return new ResendMailer(new Resend(key));
  if (process.env.VERCEL) throw new Error("RESEND_API_KEY is not set");
  return new DevMailer();
}
