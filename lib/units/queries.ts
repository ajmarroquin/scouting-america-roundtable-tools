import "server-only";
import { asc, eq, inArray, ne, sql } from "drizzle-orm";
import { representation } from "@/lib/attendance/coverage";
import { compareUnits, contactName, unitLabel } from "@/lib/contacts/format";
import { db } from "@/lib/db";
import { affiliation, contact, unit } from "@/lib/db/schema";
import { countedUnitIds, unitListInfo } from "./apply";

export type UnitRow = {
  id: string;
  label: string;
  type: string;
  subdistrict: string | null;
  charteredOrg: string | null;
  youth: number | null;
  adults: number | null;
  /** On the latest unit list. Null before any list is loaded. */
  onList: boolean | null;
  /** Counts toward coverage. */
  counted: boolean;
  handAdded: boolean;
  contacts: number;
  /** Held meetings in the year where someone represented the unit. */
  meetings: number;
  lastRepresented: string | null;
};

export async function listUnitsOverview(range: { start: string; end: string }) {
  const [units, contactCounts, info, counted, rep] = await Promise.all([
    db.select().from(unit),
    db
      .select({ unitId: affiliation.unitId, n: sql<number>`count(distinct ${affiliation.contactId})::int` })
      .from(affiliation)
      .innerJoin(contact, eq(affiliation.contactId, contact.id))
      .where(ne(contact.status, "archived"))
      .groupBy(affiliation.unitId),
    unitListInfo(),
    countedUnitIds(),
    representation(range),
  ]);
  const contactsBy = new Map(contactCounts.map((c) => [c.unitId, c.n]));
  const countedSet = new Set(counted.ids);
  const meetingsBy = new Map<string, number>();
  const lastBy = new Map<string, string>();
  for (const m of rep.meetings) {
    for (const id of rep.byMeeting.get(m.id) ?? []) {
      meetingsBy.set(id, (meetingsBy.get(id) ?? 0) + 1);
      lastBy.set(id, m.date);
    }
  }
  const rows: UnitRow[] = units.sort(compareUnits).map((u) => ({
    id: u.id,
    label: unitLabel(u),
    type: u.type,
    subdistrict: u.subdistrict,
    charteredOrg: u.charteredOrg,
    youth: u.youthCount,
    adults: u.adultCount,
    onList: info ? u.listedOn === info.asOf && u.district === info.district : null,
    counted: countedSet.has(u.id),
    handAdded: u.bsaUnitId === null,
    contacts: contactsBy.get(u.id) ?? 0,
    meetings: meetingsBy.get(u.id) ?? 0,
    lastRepresented: lastBy.get(u.id) ?? null,
  }));
  return { units: rows, info, heldMeetings: rep.meetings.length };
}

export async function getUnitDetail(id: string, range: { start: string; end: string }) {
  const [u] = await db.select().from(unit).where(eq(unit.id, id));
  if (!u) return null;
  const [info, counted, rep, links] = await Promise.all([
    unitListInfo(),
    countedUnitIds(),
    representation(range),
    db
      .select({ c: contact, position: affiliation.position })
      .from(affiliation)
      .innerJoin(contact, eq(affiliation.contactId, contact.id))
      .where(eq(affiliation.unitId, id))
      .orderBy(asc(contact.lastName), asc(contact.firstName)),
  ]);

  const contacts = new Map<string, { id: string; name: string; email: string | null; status: string; isYouth: boolean; positions: string[] }>();
  for (const { c, position } of links) {
    const entry = contacts.get(c.id) ?? { id: c.id, name: contactName(c), email: c.email, status: c.status, isYouth: c.isYouth, positions: [] };
    entry.positions.push(position);
    contacts.set(c.id, entry);
  }

  // Who came for this unit: a recorded unit that's this one, or no recorded unit and affiliated with it.
  const cameFor = (c: { contactId: string; unitId: string | null }) =>
    c.unitId ? c.unitId === id : (rep.unitsOf.get(c.contactId) ?? []).includes(id);
  const attendees = rep.checkIns.filter(cameFor);
  const names = await namesOf([...new Set(attendees.map((a) => a.contactId))]);
  const meetings = rep.meetings.map((m) => {
    const here = attendees.filter((a) => a.meetingId === m.id);
    return { ...m, people: here.map((a) => ({ id: a.contactId, name: names.get(a.contactId) ?? "Unknown" })) };
  });
  const people = [...new Set(attendees.map((a) => a.contactId))]
    .map((contactId) => {
      const theirs = meetings.filter((m) => m.people.some((p) => p.id === contactId));
      return { id: contactId, name: names.get(contactId) ?? "Unknown", meetings: theirs.length, last: theirs.at(-1)?.date ?? null };
    })
    .sort((a, b) => b.meetings - a.meetings || a.name.localeCompare(b.name));

  return {
    unit: {
      id: u.id,
      label: unitLabel(u),
      type: u.type,
      number: u.number,
      genderAccepted: u.genderAccepted,
      charteredOrg: u.charteredOrg,
      subdistrict: u.subdistrict,
      youth: u.youthCount,
      adults: u.adultCount,
      onList: info ? u.listedOn === info.asOf && u.district === info.district : null,
      counted: counted.ids.includes(u.id),
      handAdded: u.bsaUnitId === null,
    },
    listAsOf: info?.asOf ?? null,
    contacts: [...contacts.values()],
    meetings,
    people,
  };
}

async function namesOf(ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const rows = await db
    .select({ id: contact.id, firstName: contact.firstName, lastName: contact.lastName, preferredName: contact.preferredName })
    .from(contact)
    .where(inArray(contact.id, ids));
  return new Map(rows.map((r) => [r.id, contactName(r)]));
}

