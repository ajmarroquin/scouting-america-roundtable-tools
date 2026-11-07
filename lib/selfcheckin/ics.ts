// An "Add to calendar" file for one meeting, built in the browser after an RSVP.

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
// Text values escape backslashes, commas, semicolons, and line breaks (RFC 5545).
const text = (s: string) => s.replace(/\\/g, "\\\\").replace(/[,;]/g, (c) => `\\${c}`).replace(/\r?\n/g, "\\n");

export function meetingIcs(m: {
  id: string;
  start: Date;
  end: Date;
  title: string;
  place?: string | null;
  url?: string | null;
  description?: string | null;
}): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Roundtable Tools//Meeting//EN",
    "BEGIN:VEVENT",
    `UID:${m.id}@roundtable-tools`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(m.start)}`,
    `DTEND:${stamp(m.end)}`,
    `SUMMARY:${text(m.title)}`,
    ...(m.place ? [`LOCATION:${text(m.place)}`] : []),
    ...(m.description ? [`DESCRIPTION:${text(m.description)}`] : []),
    ...(m.url ? [`URL:${m.url}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}
