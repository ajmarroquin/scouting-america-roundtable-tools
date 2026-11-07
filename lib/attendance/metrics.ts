import "server-only";
import { and, eq, inArray, lt, ne } from "drizzle-orm";
import { compareUnits, contactName, unitLabel } from "@/lib/contacts/format";
import { OUTREACH_POSITIONS } from "@/lib/contacts/positions";
import { db } from "@/lib/db";
import { affiliation, attendance, contact, meeting, unit } from "@/lib/db/schema";
import { countedUnitIds } from "@/lib/units/apply";
import { representation } from "./coverage";
import { computeCoverage, type MeetingCoverage } from "./coverage-math";
import { coverageByProgram, peopleTrend, sameMonthLastYear } from "./trends";
import { scoutingYearOf, yearRange } from "./year";

export type UnitInfo = { id: string; label: string; type: string; subdistrict: string | null };

async function unitInfo(ids: string[]): Promise<Map<string, UnitInfo>> {
  if (!ids.length) return new Map();
  const rows = await db.select().from(unit).where(inArray(unit.id, ids));
  return new Map(
    rows.sort(compareUnits).map((u) => [u.id, { id: u.id, label: unitLabel(u), type: u.type, subdistrict: u.subdistrict }]),
  );
}

/** "2025-26" for "2026-27". */
export function previousYear(year: string): string {
  const first = Number(year.slice(0, 4)) - 1;
  return `${first}-${String((first + 1) % 100).padStart(2, "0")}`;
}

/** Everyone who came to a held roundtable before a date. */
async function attendedBefore(date: string): Promise<Set<string>> {
  const rows = await db
    .selectDistinct({ contactId: attendance.contactId })
    .from(attendance)
    .innerJoin(meeting, eq(attendance.meetingId, meeting.id))
    .where(and(eq(meeting.status, "held"), lt(meeting.date, date)));
  return new Set(rows.map((r) => r.contactId));
}

/** Coverage for one scouting year, measured against the units on the latest unit list. */
export async function coverageForYear(year: string) {
  const range = yearRange(year);
  const lastYear = previousYear(year);
  const [counted, rep, prev, everBefore] = await Promise.all([
    countedUnitIds(),
    representation(range),
    representation(yearRange(lastYear)),
    attendedBefore(range.start),
  ]);
  const countedSet = new Set(counted.ids);
  const result = computeCoverage({ meetings: rep.meetings, byMeeting: rep.byMeeting, checkIns: rep.checkIns, counted: countedSet });
  const allIds = [...new Set([...counted.ids, ...result.perUnit.keys()])];
  const info = await unitInfo(allIds);
  const units = [...info.values()].map((u) => ({
    ...u,
    counted: countedSet.has(u.id),
    meetings: result.perUnit.get(u.id)?.meetings ?? 0,
    last: result.perUnit.get(u.id)?.last ?? null,
  }));
  const headcount = (meetingId: string, checkIns: { meetingId: string; contactId: string }[]) =>
    new Set(checkIns.filter((c) => c.meetingId === meetingId).map((c) => c.contactId)).size;
  const trends = {
    lastYear,
    people: peopleTrend({ thisYear: rep.checkIns, lastYear: prev.checkIns, everBefore }),
    sameMonth: Object.fromEntries(
      sameMonthLastYear(
        rep.meetings,
        prev.meetings.map((m) => ({ ...m, headcount: headcount(m.id, prev.checkIns) })),
      ),
    ) as Record<string, number | null>,
    programs: coverageByProgram(units, result.represented),
  };
  return {
    year,
    range,
    trends,
    source: counted.source,
    listAsOf: counted.asOf,
    total: counted.ids.length,
    represented: result.represented.size,
    meetings: result.meetings,
    units,
    labels: Object.fromEntries([...info.values()].map((u) => [u.id, u.label])),
  };
}

export type YearCoverage = Awaited<ReturnType<typeof coverageForYear>>;

/** One meeting's coverage, with the year so far. */
export async function meetingCoverage(meetingId: string, date: string): Promise<{
  meeting: MeetingCoverage | null;
  total: number;
  year: string;
  labels: Record<string, string>;
  source: "list" | "roster";
}> {
  const year = scoutingYearOf(date);
  const c = await coverageForYear(year);
  return { meeting: c.meetings.find((m) => m.id === meetingId) ?? null, total: c.total, year, labels: c.labels, source: c.source };
}

export type Leader = { unitId: string; contactId: string; name: string; position: string; email: string | null; isYouth: boolean; guardianEmail: string | null };

/** Each unit's top leader, committee chair, and chartered org rep, for outreach. */
export async function outreachContacts(unitIds: string[]): Promise<Leader[]> {
  if (!unitIds.length) return [];
  const rows = await db
    .select({ unitId: affiliation.unitId, position: affiliation.position, c: contact })
    .from(affiliation)
    .innerJoin(contact, eq(affiliation.contactId, contact.id))
    .where(
      and(inArray(affiliation.unitId, unitIds), inArray(affiliation.position, OUTREACH_POSITIONS), ne(contact.status, "archived")),
    );
  return rows.map((r) => ({
    unitId: r.unitId!,
    contactId: r.c.id,
    name: contactName(r.c),
    position: r.position,
    email: r.c.email,
    isYouth: r.c.isYouth,
    guardianEmail: r.c.guardianEmail,
  }));
}
