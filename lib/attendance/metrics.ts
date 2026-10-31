import "server-only";
import { and, eq, inArray, ne } from "drizzle-orm";
import { compareUnits, contactName, unitLabel } from "@/lib/contacts/format";
import { OUTREACH_POSITIONS } from "@/lib/contacts/positions";
import { db } from "@/lib/db";
import { affiliation, contact, unit } from "@/lib/db/schema";
import { countedUnitIds } from "@/lib/units/apply";
import { representation } from "./coverage";
import { computeCoverage, type MeetingCoverage } from "./coverage-math";
import { scoutingYearOf, yearRange } from "./year";

export type UnitInfo = { id: string; label: string; type: string; subdistrict: string | null };

async function unitInfo(ids: string[]): Promise<Map<string, UnitInfo>> {
  if (!ids.length) return new Map();
  const rows = await db.select().from(unit).where(inArray(unit.id, ids));
  return new Map(
    rows.sort(compareUnits).map((u) => [u.id, { id: u.id, label: unitLabel(u), type: u.type, subdistrict: u.subdistrict }]),
  );
}

/** Coverage for one scouting year, measured against the units on the latest unit list. */
export async function coverageForYear(year: string) {
  const range = yearRange(year);
  const [counted, rep] = await Promise.all([countedUnitIds(), representation(range)]);
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
  return {
    year,
    range,
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
