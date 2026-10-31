import { parseUnitMentions } from "./unit-mentions";

// Reads an old attendance sheet: one row per person, a Name column, maybe a Unit
// column, and one column per meeting headed by a month ("Nov 25", "June 26") or
// a date ("11/19/2025"). Any mark in a meeting column counts as attended.

export type MeetingAction = "held" | "cancelled" | "skip";

export type SheetMeeting = {
  column: number;
  header: string;
  /** YYYY-MM-DD. For a month-only header, the 1st of that month until someone picks the real date. */
  date: string;
  monthOnly: boolean;
  attendees: number;
  /** Held when anyone attended; otherwise cancelled if it's in the past, or skipped if it hasn't happened yet. */
  suggested: MeetingAction;
};

export type SheetPerson = {
  /** 1-based row number in the sheet, for showing the volunteer where it came from. */
  row: number;
  name: string;
  unitText: string;
  /** Other filled-in columns, as "Header: value". */
  notes: string[];
  /** Units named in those other columns ("troop 662B, pack 662"), for a new contact's positions. */
  otherUnitText: string;
  /** Columns of the meetings they attended. */
  attended: number[];
};

export type LegacySheet = {
  meetings: SheetMeeting[];
  people: SheetPerson[];
  /** Rows dropped because they had no name or were a total. */
  skippedRows: number;
};

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

const pad = (n: number) => String(n).padStart(2, "0");

/** The meeting date a column header names, or null if it isn't a meeting column. */
export function headerDate(header: string): { date: string; monthOnly: boolean } | null {
  const h = header.trim().toLowerCase();
  const month = /^([a-z]{3,9})\.?[\s'’/-]*(\d{2}|\d{4})$/.exec(h);
  if (month) {
    // "Nov", "Sept", "June": any start of a month's name, three letters or more.
    const m = MONTHS.findIndex((name) => name.startsWith(month[1]));
    if (m < 0) return null;
    const year = month[2].length === 2 ? 2000 + Number(month[2]) : Number(month[2]);
    return { date: `${year}-${pad(m + 1)}-01`, monthOnly: true };
  }
  const us = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/.exec(h);
  if (us) {
    const [mo, d] = [Number(us[1]), Number(us[2])];
    const year = us[3].length === 2 ? 2000 + Number(us[3]) : Number(us[3]);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return { date: `${year}-${pad(mo)}-${pad(d)}`, monthOnly: false };
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(h);
  if (iso) return { date: h, monthOnly: false };
  return null;
}

const NOT_ATTENDED = /^(no|n|0|false|absent|-|–|—)$/i;
const TOTAL_ROW = /^(totals?|headcount|count|sum|attendance)\b/i;

export function attendedMark(value: string | undefined): boolean {
  const v = (value ?? "").trim();
  return v !== "" && !NOT_ATTENDED.test(v);
}

function clean(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

/**
 * `rows` is the sheet as parsed, header row first. `today` (YYYY-MM-DD) decides
 * whether an empty meeting column is a past cancellation or a future meeting.
 */
export function parseLegacySheet(rows: string[][], today: string): LegacySheet | { error: string } {
  const headerAt = rows.findIndex((r) => r.some((cell) => clean(cell) !== ""));
  if (headerAt < 0) return { error: "The sheet is empty." };
  const headers = rows[headerAt].map(clean);
  const find = (re: RegExp) => headers.findIndex((h) => re.test(h));

  const nameCol = find(/^(full\s*)?name$|^attendee|^participant|^member$/i);
  const firstCol = find(/^first\s*name$/i);
  const lastCol = find(/^last\s*name$/i);
  if (nameCol < 0 && firstCol < 0) return { error: 'Couldn\'t find a "Name" column.' };
  const unitCol = find(/unit/i);

  const meetingCols = headers.flatMap((header, column) => {
    const parsed = headerDate(header);
    return parsed ? [{ column, header, ...parsed }] : [];
  });
  if (!meetingCols.length) return { error: 'Couldn\'t find any meeting columns. Head them with a month like "Nov 25" or a date.' };

  const used = new Set([nameCol, firstCol, lastCol, unitCol, ...meetingCols.map((m) => m.column)]);
  const noteCols = headers.map((header, column) => ({ header, column })).filter((c) => !used.has(c.column));

  const byName = new Map<string, SheetPerson>();
  let skippedRows = 0;
  rows.slice(headerAt + 1).forEach((r, i) => {
    if (!r.some((cell) => clean(cell) !== "")) return;
    const name = nameCol >= 0 ? clean(r[nameCol]) : `${clean(r[firstCol])} ${clean(r[lastCol])}`.trim();
    if (!name || TOTAL_ROW.test(name) || /^\d+$/.test(name)) {
      skippedRows++;
      return;
    }
    const attended = meetingCols.filter((m) => attendedMark(r[m.column])).map((m) => m.column);
    const filled = noteCols.map((c) => [c.header, clean(r[c.column])] as const).filter(([, v]) => v !== "");
    const notes = filled.map(([h, v]) => (h ? `${h}: ${v}` : v));
    // A note like "pack 777, troop 777" lists more units; "unit commissioner" doesn't.
    const otherUnitText = filled
      .map(([, v]) => v)
      .filter((v) => parseUnitMentions(v).some((m) => m.type))
      .join("; ");
    const key = name.toLowerCase();
    const existing = byName.get(key);
    if (existing) {
      // The same name twice: one person.
      existing.attended = [...new Set([...existing.attended, ...attended])].sort((a, b) => a - b);
      existing.notes = [...new Set([...existing.notes, ...notes])];
      existing.unitText ||= unitCol >= 0 ? clean(r[unitCol]) : "";
      existing.otherUnitText = [existing.otherUnitText, otherUnitText].filter(Boolean).join("; ");
      return;
    }
    byName.set(key, {
      row: headerAt + i + 2,
      name,
      unitText: unitCol >= 0 ? clean(r[unitCol]) : "",
      notes,
      otherUnitText,
      attended,
    });
  });

  const people = [...byName.values()];
  const thisMonth = today.slice(0, 7);
  const meetings: SheetMeeting[] = meetingCols.map((m) => {
    const attendees = people.filter((p) => p.attended.includes(m.column)).length;
    const past = m.monthOnly ? m.date.slice(0, 7) < thisMonth : m.date < today;
    return { ...m, attendees, suggested: attendees > 0 ? "held" : past ? "cancelled" : "skip" };
  });
  return { meetings, people, skippedRows };
}

/** Splits "Mary Ann de la Cruz" into a first and last name for a new contact. */
export function splitName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  // Keep particles with the last name: "Antonio Del Rosario", "Ana de la Cruz".
  let i = parts.length - 1;
  while (i > 1 && /^(de|del|della|la|le|van|von|der|da|dos|du|st\.?|mac|mc|bin|al)$/i.test(parts[i - 1])) i--;
  return { firstName: parts.slice(0, i).join(" "), lastName: parts.slice(i).join(" ") };
}
