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

// Hybrid meetings lead with the room: in person is better, online is for anyone who can't make it.
const ONLINE_TOO = "and online for anyone who can't make it in person";

/** Where it is, read after "at". A hybrid meeting with no place keeps the blank so it gets filled in. */
function where(m: MeetingFill): { atPlace: string; place: string } {
  const place = m.place?.trim() || "[place]";
  if (m.format === "virtual") return { atPlace: " online", place: "online" };
  if (m.format === "hybrid") return { atPlace: ` at ${place}, ${ONLINE_TOO}`, place: `${place}, ${ONLINE_TOO}` };
  return { atPlace: ` at ${place}`, place };
}

/** A subject line for the meeting: "Roundtable: Monday, Nov 9 at 6:30 pm". */
export function meetingSubject(m: Pick<MeetingFill, "date" | "startTime">): string {
  const day = label(m.date, { weekday: "long", month: "short", day: "numeric" });
  return `Roundtable: ${day}${m.startTime ? ` at ${timeLabel(m.startTime)}` : ""}`;
}

/** The inbox preview line, nudging people to come in person when it's hybrid. */
export function meetingPreview(m: Pick<MeetingFill, "format" | "place" | "title">): string {
  const topic = m.title ? `${m.title}. ` : "";
  if (m.format === "virtual") return `${topic}Online this month. The link is inside.`;
  if (m.format === "hybrid") return `${topic}Join us${m.place ? ` at ${m.place}` : " in person"}, or online if you can't make it.`;
  return `${topic}District news, program ideas, and time with other leaders${m.place ? ` at ${m.place}` : ""}.`;
}

export function fillMeeting(body: string, m: MeetingFill): string {
  const day = label(m.date, { weekday: "long", month: "short", day: "numeric" });
  const short = label(m.date, { month: "short", day: "numeric" });
  const w = where(m);
  let out = body
    .replace(/\[day, date\]/gi, day)
    .replace(/\[date\]/gi, short)
    // One pass, so a blank left in place (no place set yet) isn't filled twice.
    .replace(/( at )?\[place\]/gi, (_m, at: string | undefined) => (at ? w.atPlace : w.place));
  if (m.startTime) out = out.replace(/\[time\]/gi, timeLabel(m.startTime));
  if (m.title) out = out.replace(/\[topic\]/gi, m.title);
  // A button still waiting for an address gets the meeting's page.
  if (m.link) out = out.replace(/(\[button:[^\]\n]*\])\(\s*(?:https?:\/\/)?\s*\)/gi, `$1(${m.link})`);
  return out;
}
