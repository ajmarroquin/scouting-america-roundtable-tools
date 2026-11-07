import "server-only";
import { and, asc, eq, gte, inArray, isNotNull, isNull } from "drizzle-orm";
import { representation } from "@/lib/attendance/coverage";
import { coverageForYear } from "@/lib/attendance/metrics";
import { appTimeZone } from "@/lib/attendance/queries";
import { meetingDateLabel, scoutingYearOf, todayIn, yearRange } from "@/lib/attendance/year";
import { OUTREACH_POSITIONS } from "@/lib/contacts/positions";
import { db } from "@/lib/db";
import { contactName, unitLabel } from "@/lib/contacts/format";
import { affiliation, contact, meeting, rsvp, unit } from "@/lib/db/schema";
import { rolesFor } from "@/lib/contacts/roles";
import { getGroup, groupMemberIds, groupMembership, groupsOf, listGroups } from "@/lib/groups/store";
import type { Member } from "./mailer";
import { type LeftOutReason, leftOutReason, type Reach, reach } from "./reach";

// Who an announcement can go to. Always adults in contacts with an email, still
// in the roster (or added by hand), and not unsubscribed. Youth never get one.

export const AUDIENCES = [
  {
    key: "everyone",
    label: "Everyone in contacts",
    description: "Every adult in contacts who's still in the roster or was added by hand.",
  },
  {
    key: "unit-leaders",
    label: "Unit leaders",
    description:
      "Each unit's key leaders only: the Cubmaster, Scoutmaster, Crew Advisor, Skipper, Post or Club Advisor, Committee Chair, and Chartered Organization Rep. Not den leaders, assistants, or committee members.",
  },
  {
    key: "not-reached",
    label: "Units not at roundtable yet this year",
    description: "The unit leaders (as above) of units nobody has represented at a roundtable this scouting year.",
  },
  {
    key: "packs",
    label: "Pack leaders",
    description: "Every adult with any role in a pack: Cubmasters, den leaders, assistants, committee, and members.",
  },
  {
    key: "troops",
    label: "Troop leaders",
    description: "Every adult with any role in a troop: Scoutmasters, assistants, committee, and members.",
  },
  {
    key: "crews-ships",
    label: "Crew and ship leaders",
    description: "Every adult with any role in a crew, ship, post, or club.",
  },
  {
    key: "district",
    label: "District volunteers",
    description: "Adults with a district role rather than a unit one: commissioners, district committee, and merit badge counselors.",
  },
  {
    key: "came-this-year",
    label: "Came to roundtable this year",
    description: "Anyone checked in at a roundtable this scouting year, whatever their role.",
  },
] as const;

export type AudienceKey = (typeof AUDIENCES)[number]["key"];

export function isAudience(key: string): key is AudienceKey {
  return AUDIENCES.some((a) => a.key === key);
}

// Groups built by hand are audiences too, keyed "group:<id>".
const GROUP_KEY = /^group:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
export const groupKey = (id: string) => `group:${id}`;
const groupIdOf = (key: string) => GROUP_KEY.exec(key)?.[1] ?? null;

// RSVPs for an upcoming meeting: "rsvp-yes:<meeting id>" and "rsvp-none:<meeting id>".
const RSVP_KEY = /^rsvp-(yes|none):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const rsvpOf = (key: string) => {
  const m = RSVP_KEY.exec(key);
  return m ? { answer: m[1] as "yes" | "none", meetingId: m[2] } : null;
};
async function rsvpInfo(key: string): Promise<AudienceInfo | null> {
  const r = rsvpOf(key);
  if (!r) return null;
  const [m] = await db.select({ date: meeting.date }).from(meeting).where(eq(meeting.id, r.meetingId));
  if (!m) return null;
  const day = meetingDateLabel(m.date, "short");
  return r.answer === "yes"
    ? { key, label: `Said yes for ${day}`, description: "People who RSVP'd yes on the meeting's page.", custom: true, kind: "meeting" }
    : { key, label: `Haven't answered for ${day}`, description: "Everyone in contacts who hasn't RSVP'd for this meeting yet.", custom: true, kind: "meeting" };
}

/** A built-in audience or a group's key, by shape. Whether the group still exists is checked when it's used. */
function isSingleKey(key: string): boolean {
  return isAudience(key) || groupIdOf(key) !== null || rsvpOf(key) !== null;
}

// Several lists at once, joined by commas: "packs,troops". One email per person, whoever's in more than one.
const MAX_COMBINED = 6;
const partsOf = (key: string) => key.split(",");

/** A built-in audience, a group, a meeting's RSVPs, or several of those combined, by shape. */
export function isAudienceKey(key: string): boolean {
  const parts = partsOf(key);
  return parts.length >= 1 && parts.length <= MAX_COMBINED && new Set(parts).size === parts.length && parts.every(isSingleKey);
}

export type AudienceInfo = { key: string; label: string; description: string; custom: boolean; kind?: "built_in" | "group" | "meeting" | "combined" };

export async function audienceInfo(key: string): Promise<AudienceInfo | null> {
  const parts = partsOf(key);
  if (parts.length > 1) {
    if (!isAudienceKey(key)) return null;
    const infos = await Promise.all(parts.map(singleInfo));
    if (infos.some((i) => !i)) return null;
    return { key, label: infos.map((i) => i!.label).join(" + "), description: "Anyone in any of these lists, once each.", custom: true, kind: "combined" };
  }
  return singleInfo(key);
}

async function singleInfo(key: string): Promise<AudienceInfo | null> {
  const builtIn = AUDIENCES.find((a) => a.key === key);
  if (builtIn) return { ...builtIn, custom: false };
  if (rsvpOf(key)) return rsvpInfo(key);
  const id = groupIdOf(key);
  const group = id ? await getGroup(id) : null;
  return group ? { key, label: group.name, description: group.description || "A group built by hand.", custom: true } : null;
}

/** Contact ids in the audience, before the email and unsubscribe rules. */
export async function audienceContactIds(key: string): Promise<string[] | "all"> {
  const parts = partsOf(key);
  if (parts.length > 1) {
    if (!isAudienceKey(key)) return [];
    const each = await Promise.all(parts.map(singleContactIds));
    return each.includes("all") ? "all" : [...new Set(each.flat() as string[])];
  }
  return singleContactIds(key);
}

async function singleContactIds(key: string): Promise<string[] | "all"> {
  const id = groupIdOf(key);
  if (id) return groupMemberIds(id);
  const r = rsvpOf(key);
  if (r) {
    const answered = await db.select({ id: rsvp.contactId, response: rsvp.response }).from(rsvp).where(eq(rsvp.meetingId, r.meetingId));
    if (r.answer === "yes") return answered.filter((a) => a.response === "yes").map((a) => a.id);
    const skip = new Set(answered.map((a) => a.id));
    return (await db.select({ id: contact.id }).from(contact)).map((c) => c.id).filter((c) => !skip.has(c));
  }
  if (!isAudience(key)) return [];
  return builtInContactIds(key);
}

async function builtInContactIds(key: AudienceKey): Promise<string[] | "all"> {
  const year = scoutingYearOf(todayIn(appTimeZone()));
  const byUnitType = async (types: string[]) =>
    (
      await db
        .selectDistinct({ id: affiliation.contactId })
        .from(affiliation)
        .innerJoin(unit, eq(affiliation.unitId, unit.id))
        .where(inArray(unit.type, types))
    ).map((r) => r.id);
  switch (key) {
    case "everyone":
      return "all";
    case "unit-leaders":
      return (
        await db
          .selectDistinct({ id: affiliation.contactId })
          .from(affiliation)
          .where(and(inArray(affiliation.position, OUTREACH_POSITIONS), isNotNull(affiliation.unitId)))
      ).map((r) => r.id);
    case "not-reached": {
      const coverage = await coverageForYear(year);
      const units = coverage.units.filter((u) => u.counted && u.meetings === 0).map((u) => u.id);
      if (!units.length) return [];
      return (
        await db
          .selectDistinct({ id: affiliation.contactId })
          .from(affiliation)
          .where(and(inArray(affiliation.unitId, units), inArray(affiliation.position, OUTREACH_POSITIONS)))
      ).map((r) => r.id);
    }
    case "packs":
      return byUnitType(["Pack"]);
    case "troops":
      return byUnitType(["Troop"]);
    case "crews-ships":
      return byUnitType(["Crew", "Ship", "Post", "Club"]);
    case "district":
      return (await db.selectDistinct({ id: affiliation.contactId }).from(affiliation).where(isNull(affiliation.unitId))).map((r) => r.id);
    case "came-this-year": {
      const rep = await representation(yearRange(year));
      return [...new Set(rep.checkIns.map((c) => c.contactId))];
    }
  }
}

export type RosterPerson = {
  contactId: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string | null;
  isYouth: boolean;
  status: string;
  unsubscribed: boolean;
  pendingReview: boolean;
  /** Filled in for the "who's in it" list only. */
  roles?: string;
};

async function candidates(ids: string[] | "all"): Promise<RosterPerson[]> {
  if (ids !== "all" && !ids.length) return [];
  const rows = await db
    .select({
      id: contact.id,
      email: contact.email,
      firstName: contact.firstName,
      lastName: contact.lastName,
      preferredName: contact.preferredName,
      isYouth: contact.isYouth,
      status: contact.status,
      unsubscribedAt: contact.unsubscribedAt,
      pendingReview: contact.pendingReview,
    })
    .from(contact)
    .where(ids === "all" ? undefined : inArray(contact.id, ids));
  return rows.map((r) => ({
    contactId: r.id,
    name: contactName(r),
    firstName: r.preferredName || r.firstName,
    lastName: r.lastName,
    email: r.email,
    isYouth: r.isYouth,
    status: r.status,
    unsubscribed: r.unsubscribedAt !== null,
    pendingReview: r.pendingReview,
  }));
}

/**
 * Everyone in an audience: who an announcement reaches, and who's left out and
 * why. "Everyone" leaves out the archived and the roster drop-offs quietly,
 * since listing them all wouldn't help.
 */
export async function audienceRoster(key: string): Promise<Reach<RosterPerson>> {
  const ids = await audienceContactIds(key);
  const result = reach(await candidates(ids));
  if (ids === "all") result.leftOut = result.leftOut.filter((p) => p.reason !== "archived" && p.reason !== "not_in_roster");
  const roles = await rolesFor([...result.members, ...result.leftOut].map((p) => p.contactId));
  for (const p of [...result.members, ...result.leftOut]) p.roles = roles.get(p.contactId) ?? "";
  return result;
}

/** The people an audience reaches, one per email address. */
export async function audienceMembers(key: string): Promise<(Member & { contactId: string })[]> {
  return reach(await candidates(await audienceContactIds(key))).members.map((m) => ({
    contactId: m.contactId,
    email: m.email!,
    firstName: m.firstName,
    lastName: m.lastName,
  }));
}

export type AudienceOption = AudienceInfo & { count: number };

/** Every audience to pick from, built-in first, with how many it reaches. */
export async function audienceOptions(): Promise<AudienceOption[]> {
  const [groups, upcoming] = await Promise.all([
    listGroups(),
    // The next two meetings with a link, so RSVPs are possible.
    db
      .select({ id: meeting.id })
      .from(meeting)
      .where(and(eq(meeting.status, "held"), gte(meeting.date, todayIn(appTimeZone())), isNotNull(meeting.publicToken)))
      .orderBy(asc(meeting.date))
      .limit(2),
  ]);
  const meetings = (await Promise.all(upcoming.flatMap((m) => [rsvpInfo(`rsvp-yes:${m.id}`), rsvpInfo(`rsvp-none:${m.id}`)]))).filter(
    (a): a is AudienceInfo => a !== null,
  );
  const all: AudienceInfo[] = [
    ...AUDIENCES.map((a) => ({ ...a, custom: false, kind: "built_in" as const })),
    ...groups.map((g) => ({ key: groupKey(g.id), label: g.name, description: g.description || "A group built by hand.", custom: true, kind: "group" as const })),
    ...meetings,
  ];
  return Promise.all(all.map(async (a) => ({ ...a, count: (await audienceMembers(a.key)).length })));
}

/** Which audiences each contact is in, before the email rules, for the contacts list filter. */
export async function membershipMap(): Promise<Record<string, string[]>> {
  const map: Record<string, string[]> = {};
  const everyone = await db.select({ id: contact.id }).from(contact);
  for (const a of AUDIENCES) {
    const ids = await builtInContactIds(a.key);
    for (const id of ids === "all" ? everyone.map((c) => c.id) : ids) (map[id] ??= []).push(a.key);
  }
  for (const [id, groups] of await groupMembership()) (map[id] ??= []).push(...groups.map(groupKey));
  return map;
}

export type Membership = { key: string; label: string; why: string };

/**
 * The announcement lists one person is on, with why, and whether they'd get
 * the email at all. For the contact page.
 */
export async function membershipsFor(contactId: string): Promise<{
  builtIn: Membership[];
  groups: { id: string; name: string }[];
  leftOut: LeftOutReason | null;
}> {
  const [person] = await candidates([contactId]);
  if (!person) return { builtIn: [], groups: [], leftOut: null };
  const affs = await db
    .select({
      position: affiliation.position,
      unitId: affiliation.unitId,
      type: unit.type,
      number: unit.number,
      genderAccepted: unit.genderAccepted,
    })
    .from(affiliation)
    .leftJoin(unit, eq(unit.id, affiliation.unitId))
    .where(eq(affiliation.contactId, contactId));
  const describe = (list: typeof affs) =>
    list.map((a) => (a.type && a.number !== null ? `${a.position}, ${unitLabel({ type: a.type, number: a.number, genderAccepted: a.genderAccepted })}` : a.position)).join("; ");
  const leaders = affs.filter((a) => a.unitId && (OUTREACH_POSITIONS as readonly string[]).includes(a.position));
  const why: Record<AudienceKey, string> = {
    everyone: "Everyone in contacts",
    "unit-leaders": describe(leaders),
    "not-reached": `${describe(leaders)}. Nobody from the unit has come yet this year.`,
    packs: describe(affs.filter((a) => a.type === "Pack")),
    troops: describe(affs.filter((a) => a.type === "Troop")),
    "crews-ships": describe(affs.filter((a) => a.type && ["Crew", "Ship", "Post", "Club"].includes(a.type))),
    district: describe(affs.filter((a) => !a.unitId)),
    "came-this-year": "Checked in at a roundtable this scouting year",
  };
  const builtIn: Membership[] = [];
  for (const a of AUDIENCES) {
    const ids = await builtInContactIds(a.key);
    if (ids === "all" || ids.includes(contactId)) builtIn.push({ key: a.key, label: a.label, why: why[a.key] });
  }
  return { builtIn, groups: await groupsOf(contactId), leftOut: leftOutReason(person) };
}
