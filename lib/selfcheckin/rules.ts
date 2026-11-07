// The rules behind the public meeting page: when check-in is open, and who
// counts as a match. Pure, so they're easy to test.

export const OPENS_BEFORE_MINUTES = 30;
export const CLOSES_AFTER_MINUTES = 30;
/** When a meeting has a start but no end. */
export const DEFAULT_LENGTH_MINUTES = 120;

export const SELF_REPORTED_ROLE = "Unit volunteer (self-reported)";

/** Minutes the zone is ahead of UTC at a moment (negative west of Greenwich). */
function offsetMinutes(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - at.getTime()) / 60000);
}

/** A local date and clock time in a zone, as an instant. Handles the daylight-saving switch. */
export function zonedToUtc(date: string, time: string, timeZone: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const wall = Date.UTC(y, m - 1, d, h, mi);
  let t = wall - offsetMinutes(new Date(wall), timeZone) * 60000;
  t = wall - offsetMinutes(new Date(t), timeZone) * 60000;
  return new Date(t);
}

export type WindowState =
  | { state: "cancelled" }
  | { state: "no_time" }
  | { state: "before"; opensAt: Date; closesAt: Date }
  | { state: "open"; opensAt: Date; closesAt: Date }
  | { state: "after"; opensAt: Date; closesAt: Date };

/** Self check-in runs from 30 minutes before the start to 30 minutes after the end. */
export function checkInWindow(
  m: { date: string; startTime: string | null; endTime: string | null; status: string },
  now: Date,
  timeZone: string,
): WindowState {
  if (m.status !== "held") return { state: "cancelled" };
  if (!m.startTime) return { state: "no_time" };
  const start = zonedToUtc(m.date, m.startTime, timeZone);
  const end = m.endTime ? zonedToUtc(m.date, m.endTime, timeZone) : new Date(start.getTime() + DEFAULT_LENGTH_MINUTES * 60000);
  const opensAt = new Date(start.getTime() - OPENS_BEFORE_MINUTES * 60000);
  const closesAt = new Date(end.getTime() + CLOSES_AFTER_MINUTES * 60000);
  const state = now < opensAt ? "before" : now > closesAt ? "after" : "open";
  return { state, opensAt, closesAt };
}

/** "6:30 pm" in the district's zone. */
export function clockIn(at: Date, timeZone: string): string {
  return at.toLocaleTimeString("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).replace("AM", "am").replace("PM", "pm");
}

export const normalizeEmail = (s: string) => s.trim().toLowerCase();

/** Letters only, no accents or case: "O'Brien-Núñez" and "obriennunez" match. */
export function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}]/gu, "");
}

export type MatchCandidate = {
  id: string;
  firstName: string;
  preferredName: string | null;
  lastName: string;
  email: string | null;
  altEmail: string | null;
  isYouth: boolean;
  status: string;
};

/**
 * Who someone could be from their email and last name. Youth and archived
 * contacts are never matched; both the email (or second email) and last name must match.
 */
export function matchPeople<T extends MatchCandidate>(candidates: T[], email: string, lastName: string): T[] {
  const e = normalizeEmail(email);
  const last = normalizeName(lastName);
  if (!e || !last) return [];
  return candidates.filter(
    (c) =>
      !c.isYouth &&
      c.status !== "archived" &&
      (normalizeEmail(c.email ?? "") === e || normalizeEmail(c.altEmail ?? "") === e) &&
      normalizeName(c.lastName) === last,
  );
}

export const looksLikeEmail = (s: string) => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(s.trim());
