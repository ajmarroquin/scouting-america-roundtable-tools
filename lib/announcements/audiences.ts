import "server-only";
import { and, eq, inArray, isNotNull, isNull, ne } from "drizzle-orm";
import { representation } from "@/lib/attendance/coverage";
import { coverageForYear } from "@/lib/attendance/metrics";
import { appTimeZone } from "@/lib/attendance/queries";
import { scoutingYearOf, todayIn, yearRange } from "@/lib/attendance/year";
import { OUTREACH_POSITIONS } from "@/lib/contacts/positions";
import { db } from "@/lib/db";
import { affiliation, contact, unit } from "@/lib/db/schema";
import type { Member } from "./mailer";

// Who an announcement can go to. Always adults in contacts with an email, still
// in the roster (or added by hand), and not unsubscribed. Youth never get one.

export const AUDIENCES = [
  { key: "everyone", label: "Everyone in contacts", description: "Every adult with an email." },
  { key: "unit-leaders", label: "Unit leaders", description: "Each unit's top leader, committee chair, and chartered org rep." },
  {
    key: "not-reached",
    label: "Units not at roundtable yet this year",
    description: "The leaders of units nobody has come for this scouting year.",
  },
  { key: "packs", label: "Pack leaders", description: "Adults in packs." },
  { key: "troops", label: "Troop leaders", description: "Adults in troops." },
  { key: "crews-ships", label: "Crew and ship leaders", description: "Adults in crews, ships, posts, and clubs." },
  { key: "district", label: "District volunteers", description: "Commissioners, district committee, and merit badge counselors." },
  { key: "came-this-year", label: "Came to roundtable this year", description: "Anyone checked in at a roundtable this scouting year." },
] as const;

export type AudienceKey = (typeof AUDIENCES)[number]["key"];

export function isAudience(key: string): key is AudienceKey {
  return AUDIENCES.some((a) => a.key === key);
}

/** Contact ids in the audience, before the email and unsubscribe rules. */
async function audienceContactIds(key: AudienceKey): Promise<string[] | "all"> {
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

/** The people an audience reaches, one per email address. */
export async function audienceMembers(key: AudienceKey): Promise<(Member & { contactId: string })[]> {
  const ids = await audienceContactIds(key);
  if (ids !== "all" && !ids.length) return [];
  const rows = await db
    .select({ id: contact.id, email: contact.email, firstName: contact.firstName, lastName: contact.lastName, preferredName: contact.preferredName })
    .from(contact)
    .where(
      and(
        eq(contact.isYouth, false),
        ne(contact.status, "archived"),
        ne(contact.status, "not_in_roster"),
        isNotNull(contact.email),
        isNull(contact.unsubscribedAt),
        ids === "all" ? undefined : inArray(contact.id, ids),
      ),
    );
  const seen = new Set<string>();
  const out: (Member & { contactId: string })[] = [];
  for (const r of rows) {
    const email = r.email!.toLowerCase();
    if (seen.has(email)) continue;
    seen.add(email);
    out.push({ contactId: r.id, email: r.email!, firstName: r.preferredName || r.firstName, lastName: r.lastName });
  }
  return out;
}

export async function audienceCounts(): Promise<Record<AudienceKey, number>> {
  const counts = await Promise.all(AUDIENCES.map(async (a) => [a.key, (await audienceMembers(a.key)).length] as const));
  return Object.fromEntries(counts) as Record<AudienceKey, number>;
}
