// Meeting times and what counts as upcoming. Pure, for the server and the browser.

/** Used for a new meeting until one has times of its own. */
export const DEFAULT_TIMES = { start: "19:00", end: "20:30" } as const;

/** "19:00:00" or "19:00" → "19:00". */
export function hhmm(t: string | null | undefined): string {
  return t ? t.slice(0, 5) : "";
}

/** "19:00" → "7:00 pm". */
export function timeLabel(t: string): string {
  const [h, m] = hhmm(t).split(":").map(Number);
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

/** "7:00 to 8:30 pm", "11:30 am to 1:00 pm", or just "7:00 pm" without an end. */
export function timeRange(start: string | null | undefined, end: string | null | undefined): string {
  if (!start) return "";
  if (!end) return timeLabel(start);
  const a = timeLabel(start);
  const b = timeLabel(end);
  const sameHalf = a.slice(-2) === b.slice(-2);
  return `${sameHalf ? a.slice(0, -3) : a} to ${b}`;
}

/** A meeting after today hasn't happened yet, so it's left out of what was held. */
export function isUpcoming(date: string, today: string): boolean {
  return date > today;
}

/** The times to start a new meeting with: the latest meeting's, or the default. */
export function suggestedTimes(meetings: { date: string; startTime: string | null; endTime: string | null }[]): { start: string; end: string } {
  const latest = [...meetings].filter((m) => m.startTime).sort((a, b) => b.date.localeCompare(a.date))[0];
  return latest ? { start: hhmm(latest.startTime), end: hhmm(latest.endTime) || DEFAULT_TIMES.end } : { ...DEFAULT_TIMES };
}

/** Places and join links already used, most recent first, so they can be picked again instead of typed. */
export function savedDetails(meetings: { date: string; place: string | null; joinUrl: string | null }[]): { places: string[]; joinUrls: string[] } {
  const recent = [...meetings].sort((a, b) => b.date.localeCompare(a.date));
  const distinct = (values: (string | null)[]) => [...new Set(values.map((v) => v?.trim()).filter((v): v is string => !!v))].slice(0, 8);
  return { places: distinct(recent.map((m) => m.place)), joinUrls: distinct(recent.map((m) => m.joinUrl)) };
}
