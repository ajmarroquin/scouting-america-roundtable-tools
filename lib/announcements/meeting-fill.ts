// "For meeting" in the announcement editor: fills a template's blanks from a
// scheduled meeting, in the text itself, so the sender can still edit them.
import { timeLabel } from "@/lib/attendance/schedule";

export type MeetingFill = {
  date: string;
  startTime: string | null;
  format: string;
  place: string | null;
  title: string | null;
  /** The meeting's public page, for a button with no address yet. */
  link: string | null;
};

const label = (date: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...opts }).format(new Date(`${date}T12:00:00Z`));

/** Where it is, read after "at": "the library", "the library or online", or just "online". */
function where(m: MeetingFill): { atPlace: string; place: string } {
  const place = m.place?.trim() || "";
  if (m.format === "virtual") return { atPlace: " online", place: "online" };
  if (m.format === "hybrid") return { atPlace: place ? ` at ${place} or online` : " online", place: place ? `${place} or online` : "online" };
  return { atPlace: place ? ` at ${place}` : " at [place]", place: place || "[place]" };
}

export function fillMeeting(body: string, m: MeetingFill): string {
  const day = label(m.date, { weekday: "long", month: "short", day: "numeric" });
  const short = label(m.date, { month: "short", day: "numeric" });
  const w = where(m);
  let out = body
    .replace(/\[day, date\]/gi, day)
    .replace(/\[date\]/gi, short)
    .replace(/ at \[place\]/gi, w.atPlace)
    .replace(/\[place\]/gi, w.place);
  if (m.startTime) out = out.replace(/\[time\]/gi, timeLabel(m.startTime));
  if (m.title) out = out.replace(/\[topic\]/gi, m.title);
  // A button still waiting for an address gets the meeting's page.
  if (m.link) out = out.replace(/(\[button:[^\]\n]*\])\(\s*(?:https?:\/\/)?\s*\)/gi, `$1(${m.link})`);
  return out;
}
