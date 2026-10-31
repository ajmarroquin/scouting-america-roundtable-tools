import "server-only";
import { and, asc, eq, gte, inArray, isNotNull, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { affiliation, attendance, meeting } from "@/lib/db/schema";
import { unitsRepresented } from "./units";
import { scoutingYearOf } from "./year";

// Who represented which unit at each held meeting in a date range. The units
// page and the coverage metrics both read this, so they always agree.

export type HeldMeeting = { id: string; date: string; title: string | null };
export type CheckInRow = { meetingId: string; contactId: string; unitId: string | null };

export type Representation = {
  meetings: HeldMeeting[];
  checkIns: CheckInRow[];
  /** Every unit each attendee is affiliated with. */
  unitsOf: Map<string, string[]>;
  /** Units represented at each meeting, by meeting id. */
  byMeeting: Map<string, Set<string>>;
};

export async function representation(range: { start: string; end: string }): Promise<Representation> {
  const meetings = await db
    .select({ id: meeting.id, date: meeting.date, title: meeting.title })
    .from(meeting)
    .where(and(eq(meeting.status, "held"), gte(meeting.date, range.start), lte(meeting.date, range.end)))
    .orderBy(asc(meeting.date));
  const checkIns: CheckInRow[] = meetings.length
    ? await db
        .select({ meetingId: attendance.meetingId, contactId: attendance.contactId, unitId: attendance.unitId })
        .from(attendance)
        .where(inArray(attendance.meetingId, meetings.map((m) => m.id)))
    : [];
  const contactIds = [...new Set(checkIns.map((c) => c.contactId))];
  const unitsOf = new Map<string, string[]>();
  if (contactIds.length) {
    const rows = await db
      .selectDistinct({ contactId: affiliation.contactId, unitId: affiliation.unitId })
      .from(affiliation)
      .where(and(inArray(affiliation.contactId, contactIds), isNotNull(affiliation.unitId)));
    for (const r of rows) unitsOf.set(r.contactId, [...(unitsOf.get(r.contactId) ?? []), r.unitId!]);
  }
  const byMeeting = new Map<string, Set<string>>();
  for (const m of meetings) {
    const here = checkIns.filter((c) => c.meetingId === m.id);
    byMeeting.set(m.id, unitsRepresented(here.map((c) => ({ representedUnitId: c.unitId, unitIds: unitsOf.get(c.contactId) ?? [] }))));
  }
  return { meetings, checkIns, unitsOf, byMeeting };
}

/** Units represented at any meeting in the range. */
export function representedAtAll(r: Representation): Set<string> {
  const all = new Set<string>();
  for (const set of r.byMeeting.values()) for (const id of set) all.add(id);
  return all;
}

/** Scouting years that have meetings, plus the current one, newest first. */
export async function scoutingYears(current: string): Promise<string[]> {
  const rows = await db.selectDistinct({ date: meeting.date }).from(meeting);
  return [...new Set([current, ...rows.map((r) => scoutingYearOf(r.date))])].sort().reverse();
}
