import "server-only";
import { and, asc, desc, eq, gte, inArray, isNotNull, lte, ne } from "drizzle-orm";
import { compareUnits, contactName, unitLabel } from "@/lib/contacts/format";
import { db } from "@/lib/db";
import { affiliation, attendance, contact, meeting, unit } from "@/lib/db/schema";
import type { ExportAttendance, ExportMeeting } from "./export";
import { rolesFor } from "@/lib/contacts/roles";
import { confirmedUnits } from "./confirmed";
import { savedDetails } from "./schedule";
import { appTimeZone, appToday } from "./today";
import { personRecord } from "./trends";
import { unitsRepresented } from "./units";
import { scoutingYearOf, todayIn, yearRange } from "./year";

export type UnitRef = { id: string; label: string };

export type MeetingRow = {
  id: string;
  date: string;
  title: string | null;
  format: string;
  status: string;
  startTime: string | null;
  endTime: string | null;
  place: string | null;
  joinUrl: string | null;
  publicToken: string | null;
  notes: string | null;
  attendees: number;
  units: number;
};

export type Attendee = {
  attendanceId: string;
  contactId: string;
  name: string;
  email: string | null;
  isYouth: boolean;
  units: UnitRef[];
  roles: string;
  representedUnitId: string | null;
  /** Set when they said at self check-in which units they represent (approved ones). */
  confirmedUnitIds: string[] | null;
  /** Those units' labels, including ones not on their record yet. */
  confirmedLabels: string[];
  /** Added themselves at self check-in and waiting for an editor. */
  pendingReview: boolean;
  method: string;
  checkedInAt: string;
};

export type CheckInPerson = {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  email: string | null;
  units: string[];
  /** Their roles, to tell people with similar names apart: "Cubmaster, Pack 662". */
  roles: string;
  status: string;
};

/** Unit affiliations (not district positions) per contact, sorted Pack, Troop, Crew... */
async function unitsByContact(contactIds: string[]): Promise<Map<string, UnitRef[]>> {
  const map = new Map<string, UnitRef[]>();
  if (!contactIds.length) return map;
  const rows = await db
    .selectDistinct({
      contactId: affiliation.contactId,
      id: unit.id,
      type: unit.type,
      number: unit.number,
      genderAccepted: unit.genderAccepted,
    })
    .from(affiliation)
    .innerJoin(unit, eq(affiliation.unitId, unit.id))
    .where(inArray(affiliation.contactId, contactIds));
  rows.sort(compareUnits);
  for (const r of rows) {
    const list = map.get(r.contactId) ?? [];
    list.push({ id: r.id, label: unitLabel(r) });
    map.set(r.contactId, list);
  }
  return map;
}

export async function listMeetings(): Promise<MeetingRow[]> {
  const [meetings, rows] = await Promise.all([
    db.select().from(meeting).orderBy(desc(meeting.date)),
    db
      .select({
        id: attendance.id,
        meetingId: attendance.meetingId,
        contactId: attendance.contactId,
        unitId: attendance.unitId,
        unitsConfirmed: attendance.unitsConfirmed,
      })
      .from(attendance),
  ]);
  const [units, confirmed] = await Promise.all([unitsByContact([...new Set(rows.map((r) => r.contactId))]), confirmedUnits(rows)]);
  return meetings.map((m) => {
    const here = rows.filter((r) => r.meetingId === m.id);
    const represented = unitsRepresented(
      here.map((r) => ({
        representedUnitId: r.unitId,
        unitIds: (units.get(r.contactId) ?? []).map((u) => u.id),
        confirmedUnitIds: confirmed.get(r.id) ?? null,
      })),
    );
    return { ...m, attendees: here.length, units: represented.size };
  });
}

export async function getMeeting(id: string) {
  const [m] = await db.select().from(meeting).where(eq(meeting.id, id));
  if (!m) return null;
  const rows = await db
    .select({ a: attendance, c: contact })
    .from(attendance)
    .innerJoin(contact, eq(attendance.contactId, contact.id))
    .where(eq(attendance.meetingId, id))
    .orderBy(asc(contact.lastName), asc(contact.firstName));
  const [units, confirmed, roles] = await Promise.all([
    unitsByContact(rows.map((r) => r.c.id)),
    confirmedUnits(rows.map((r) => r.a)),
    rolesFor(rows.map((r) => r.c.id)),
  ]);
  const attendees: Attendee[] = rows.map(({ a, c }) => ({
    attendanceId: a.id,
    contactId: c.id,
    name: contactName(c),
    email: c.email,
    isYouth: c.isYouth,
    units: units.get(c.id) ?? [],
    roles: roles.get(c.id) ?? "",
    representedUnitId: a.unitId,
    confirmedUnitIds: confirmed.get(a.id) ?? null,
    confirmedLabels: [],
    pendingReview: c.pendingReview,
    method: a.method,
    checkedInAt: a.checkedInAt.toISOString(),
  }));
  const represented = unitsRepresented(
    attendees.map((a) => ({ representedUnitId: a.representedUnitId, unitIds: a.units.map((u) => u.id), confirmedUnitIds: a.confirmedUnitIds })),
  );
  const allUnits = represented.size ? await db.select().from(unit).where(inArray(unit.id, [...represented])) : [];
  const labelOf = new Map(allUnits.sort(compareUnits).map((u) => [u.id, unitLabel(u)]));
  for (const a of attendees) a.confirmedLabels = [...labelOf].filter(([id]) => a.confirmedUnitIds?.includes(id)).map(([, label]) => label);
  return {
    meeting: m,
    attendees,
    unitsRepresented: allUnits.sort(compareUnits).map((u) => ({ id: u.id, label: unitLabel(u) })),
  };
}

export async function meetingOn(date: string) {
  const [m] = await db.select().from(meeting).where(eq(meeting.date, date));
  return m ?? null;
}

/**
 * Everyone who can be checked in: all contacts except archived ones, unless
 * `includeArchived` (an old sheet can name someone archived since). Searched in the browser.
 */
export async function checkInPeople(opts: { includeArchived?: boolean } = {}): Promise<CheckInPerson[]> {
  const rows = await db
    .select()
    .from(contact)
    .where(opts.includeArchived ? undefined : ne(contact.status, "archived"))
    .orderBy(asc(contact.lastName), asc(contact.firstName));
  const [units, roles] = await Promise.all([unitsByContact(rows.map((r) => r.id)), rolesFor(rows.map((r) => r.id))]);
  return rows.map((c) => ({
    id: c.id,
    name: contactName(c),
    firstName: c.firstName,
    lastName: c.lastName,
    preferredName: c.preferredName,
    email: c.email,
    units: (units.get(c.id) ?? []).map((u) => u.label),
    roles: roles.get(c.id) ?? "",
    status: c.status,
  }));
}

export async function attendanceForExport(range?: { start: string; end: string }): Promise<{
  meetings: ExportMeeting[];
  rows: ExportAttendance[];
}> {
  // Upcoming meetings have nobody to export yet.
  const inRange = and(lte(meeting.date, appToday()), range ? and(gte(meeting.date, range.start), lte(meeting.date, range.end)) : undefined);
  const meetings = await db
    .select({ id: meeting.id, date: meeting.date, title: meeting.title, status: meeting.status })
    .from(meeting)
    .where(inRange);
  if (!meetings.length) return { meetings, rows: [] };
  const rows = await db
    .select({ a: attendance, c: contact, representing: unit })
    .from(attendance)
    .innerJoin(contact, eq(attendance.contactId, contact.id))
    .leftJoin(unit, and(eq(attendance.unitId, unit.id), isNotNull(attendance.unitId)))
    .where(inArray(attendance.meetingId, meetings.map((m) => m.id)));
  const units = await unitsByContact([...new Set(rows.map((r) => r.c.id))]);
  return {
    meetings,
    rows: rows.map(({ a, c, representing }) => ({
      meetingId: a.meetingId,
      contactId: c.id,
      name: contactName(c),
      email: c.email,
      units: (units.get(c.id) ?? []).map((u) => u.label),
      representing: representing ? unitLabel(representing) : null,
      method: a.method,
    })),
  };
}

export { appTimeZone } from "./today";

/** One person's roundtables: this year's count, the last one, the current streak, and the list. */
export async function contactRecord(contactId: string) {
  const [held, mine] = await Promise.all([
    db
      .select({ id: meeting.id, date: meeting.date, title: meeting.title })
      .from(meeting)
      .where(and(eq(meeting.status, "held"), lte(meeting.date, appToday())))
      .orderBy(asc(meeting.date)),
    db
      .select({ meetingId: attendance.meetingId, method: attendance.method })
      .from(attendance)
      .where(eq(attendance.contactId, contactId)),
  ]);
  const year = scoutingYearOf(todayIn(appTimeZone()));
  const attended = new Set(mine.map((m) => m.meetingId));
  const method = new Map(mine.map((m) => [m.meetingId, m.method]));
  return {
    year,
    record: personRecord(held, attended, yearRange(year)),
    meetings: held
      .filter((m) => attended.has(m.id))
      .reverse()
      .map((m) => ({ ...m, method: method.get(m.id) ?? "check_in" })),
  };
}

export type UpcomingMeeting = {
  id: string;
  date: string;
  startTime: string | null;
  format: string;
  place: string | null;
  title: string | null;
  publicToken: string | null;
};

/** Held meetings from today on, soonest first, for "For meeting" in announcements. */
export async function upcomingMeetings(limit = 12): Promise<UpcomingMeeting[]> {
  return db
    .select({
      id: meeting.id,
      date: meeting.date,
      startTime: meeting.startTime,
      format: meeting.format,
      place: meeting.place,
      title: meeting.title,
      publicToken: meeting.publicToken,
    })
    .from(meeting)
    .where(and(eq(meeting.status, "held"), gte(meeting.date, appToday())))
    .orderBy(asc(meeting.date))
    .limit(limit);
}

/** Places and join links used before, newest first, to pick again in the meeting form. */
export async function savedMeetingDetails(): Promise<{ places: string[]; joinUrls: string[] }> {
  const rows = await db.select({ date: meeting.date, place: meeting.place, joinUrl: meeting.joinUrl }).from(meeting);
  return savedDetails(rows);
}
