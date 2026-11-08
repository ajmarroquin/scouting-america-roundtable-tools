// Reminders for a meeting: when they go, and the drafts to start from. Pure.
import { fillMeeting, meetingPreview } from "@/lib/announcements/meeting-fill";
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

/** A week-before reminder whose day has passed still goes if the meeting is at least this many days off. */
export const LATE_MIN_DAYS = 2;

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Whether the daily job should send a reminder now: approved, for a meeting
 * still on, its day has come, the meeting hasn't passed, and it's 9 am or later.
 * A week-before approved after its day goes at the next run while the meeting is
 * still two or more days off; closer than that, the day-of reminder covers it.
 */
export function isDue(
  r: { kind: ReminderKind; status: string },
  m: { date: string; status: string },
  today: string,
  localHour: number,
): boolean {
  if (r.status !== "approved" || m.status !== "held" || localHour < REMINDER_HOUR) return false;
  const day = sendDay(m.date, r.kind);
  if (day > today || m.date < today) return false;
  return day === today || m.date >= addDays(today, LATE_MIN_DAYS);
}

/**
 * What to tell an admin about when a reminder would go, if it isn't simply on
 * its day: late (it goes at the next 9 am run) or too late (it won't send).
 */
export function reminderTiming(
  kind: ReminderKind,
  m: { date: string; status: string },
  today: string,
  localHour: number,
): { note: string; tooLate: boolean } | null {
  const day = sendDay(m.date, kind);
  const next = localHour < REMINDER_HOUR ? today : addDays(today, 1);
  if (day >= next) return null;
  if (isDue({ kind, status: "approved" }, m, next, REMINDER_HOUR)) {
    return { note: `Its day has passed, so it goes at the next 9 am run, ${next === today ? "today" : "tomorrow"}.`, tooLate: false };
  }
  if (m.status !== "held") return { note: "The meeting isn't on, so it won't send.", tooLate: true };
  return {
    note:
      kind === "week_before"
        ? "Too late to send: the meeting is less than two days away. The day-of reminder covers it."
        : "Too late to send: the 9 am run on the meeting day has passed.",
    tooLate: true,
  };
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
      previewText: meetingPreview(m),
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
