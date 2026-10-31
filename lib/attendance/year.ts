/** The scouting year starts in September unless a setting says otherwise. */
export const DEFAULT_YEAR_START_MONTH = 9;

/** "2026-27" for any date from Sept 1, 2026 through Aug 31, 2027. Dates are YYYY-MM-DD. */
export function scoutingYearOf(date: string, startMonth = DEFAULT_YEAR_START_MONTH): string {
  const [y, m] = date.split("-").map(Number);
  const first = m >= startMonth ? y : y - 1;
  return `${first}-${String((first + 1) % 100).padStart(2, "0")}`;
}

export function yearRange(label: string, startMonth = DEFAULT_YEAR_START_MONTH): { start: string; end: string } {
  const first = Number(label.slice(0, 4));
  const pad = (n: number) => String(n).padStart(2, "0");
  const start = `${first}-${pad(startMonth)}-01`;
  const endMonth = startMonth === 1 ? 12 : startMonth - 1;
  const endYear = startMonth === 1 ? first : first + 1;
  const lastDay = new Date(Date.UTC(endYear, endMonth, 0)).getUTCDate();
  return { start, end: `${endYear}-${pad(endMonth)}-${pad(lastDay)}` };
}

/** Today's date as YYYY-MM-DD in the app's time zone, so "today's meeting" means local today. */
export function todayIn(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** "Thu, Nov 19, 2026" */
export function meetingDateLabel(date: string, style: "long" | "short" = "long"): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: style === "long" ? "short" : undefined,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}
