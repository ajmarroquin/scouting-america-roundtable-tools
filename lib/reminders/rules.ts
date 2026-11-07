// Reminders for a meeting: when they go, and the drafts to start from. Pure.
import { fillMeeting } from "@/lib/announcements/meeting-fill";
import { TEMPLATES } from "@/lib/announcements/editor";
import { timeLabel } from "@/lib/attendance/schedule";

/** Reminders go out at 9 am in the district's time zone. */
export const REMINDER_HOUR = 9;

export type ReminderKind = "week_before" | "day_of";
export const KIND_LABELS: Record<ReminderKind, string> = { week_before: "A week before", day_of: "The day of" };

/** The day a reminder goes: a week before the meeting, or the meeting day itself. */
export function sendDay(meetingDate: string, kind: ReminderKind): string {
  if (kind === "day_of") return meetingDate;
  const d = new Date(`${meetingDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 7);
  return d.toISOString().slice(0, 10);
}

/**
 * Whether the daily job should send a reminder now: approved, for a meeting
 * still on, its day has come, the meeting hasn't passed, and it's 9 am or later.
 * A reminder approved after its day (a week-before drafted late) goes at the next run.
 */
export function isDue(
  r: { kind: ReminderKind; status: string },
  m: { date: string; status: string },
  today: string,
  localHour: number,
): boolean {
  return r.status === "approved" && m.status === "held" && sendDay(m.date, r.kind) <= today && m.date >= today && localHour >= REMINDER_HOUR;
}

export type ReminderMeeting = {
  id: string;
  date: string;
  startTime: string | null;
  format: string;
  place: string | null;
  title: string | null;
  joinUrl: string | null;
  /** The meeting's public page (RSVP, then check-in). */
  link: string;
};

const label = (date: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...opts }).format(new Date(`${date}T12:00:00Z`));

/** The draft each reminder starts from, filled in from the meeting. Editable before approval. */
export function reminderDraft(kind: ReminderKind, m: ReminderMeeting): { audience: string; subject: string; previewText: string; body: string } {
  const fill = (body: string) => fillMeeting(body, { ...m, link: m.link });
  if (kind === "week_before") {
    const t = TEMPLATES.find((x) => x.key === "reminder")!;
    return {
      audience: "unit-leaders",
      subject: `Roundtable is next ${label(m.date, { weekday: "long" })}, ${label(m.date, { month: "short", day: "numeric" })}`,
      previewText: t.previewText,
      body: fill(t.body),
    };
  }
  const online = m.format !== "in_person" && m.joinUrl;
  return {
    audience: `rsvp-yes:${m.id}`,
    subject: m.startTime ? `Roundtable is tonight at ${timeLabel(m.startTime)}` : "Roundtable is today",
    previewText: m.format === "virtual" ? "The join link is inside." : "Check in on your phone when you arrive.",
    body: fill(
      [
        "Hi {first name},",
        "",
        `See you ${m.startTime ? "tonight" : "today"}! Roundtable starts at **[time]** at [place].`,
        "",
        ...(m.format !== "virtual" ? ["[button: Check in when you arrive](https://)", ""] : []),
        ...(online ? [`[button: Join online](${m.joinUrl})`, ""] : []),
        m.format !== "virtual" ? "Check-in opens 30 minutes before we start. Questions? Just reply to this email." : "Questions? Just reply to this email.",
      ].join("\n"),
    ),
  };
}
