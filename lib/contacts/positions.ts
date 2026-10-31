// Adult position titles as Scouting America's registration system spells them,
// so hand-added positions match what roster imports bring in.

export const UNIT_LEADER_POSITIONS: Record<string, string[]> = {
  Pack: ["Cubmaster", "Assistant Cubmaster", "Den Leader", "Asst. Den Leader", "Pack Trainer"],
  Troop: ["Scoutmaster", "Assistant Scoutmaster"],
  Crew: ["Venturing Crew Advisor", "Venturing Crew Assoc. Advisor"],
  Ship: ["Skipper", "Mate"],
  Post: ["Post Advisor", "Post Associate Advisor"],
  Club: ["Club Advisor", "Assistant Club Advisor"],
};

/** Committee and support positions any unit can have. */
export const UNIT_SUPPORT_POSITIONS = [
  "Chartered Organization Rep.",
  "COR/CUR Delegate",
  "Executive Officer",
  "Key 3 Delegate",
  "Committee Chair",
  "Committee Member",
  "Unit Treasurer",
  "Unit Advancement Chair",
  "Unit Training Chair",
  "New Member Coordinator",
  "Youth Protection Champion",
  "Council Unit Representative",
  "Unit Scouter Reserve",
  "Unit College Scouter Reserve",
  "Adult member",
];

export const DISTRICT_POSITIONS = [
  "District Commissioner",
  "Assistant District Commissioner",
  "Unit Commissioner",
  "Roundtable Commissioner",
  "Assistant Roundtable Commissioner",
  "District Chair",
  "District Vice-Chair",
  "District Committee Member",
  "District Executive",
  "Merit Badge Counselor",
  "District Advancement Committee Chair",
  "District Training Committee Chair",
  "District Training Committee Member",
  "District Camping Committee Chair",
  "District Camping Committee Member",
  "District Activities Committee Member",
  "District Service Team Chair",
  "District Registration Support",
];

export const YOUTH_POSITION = "Youth member";

/** Who hears from us when a unit hasn't been to roundtable: its top leader, committee chair, and chartered org rep. */
export const OUTREACH_POSITIONS = [
  "Cubmaster",
  "Scoutmaster",
  "Venturing Crew Advisor",
  "Skipper",
  "Post Advisor",
  "Club Advisor",
  "Committee Chair",
  "Chartered Organization Rep.",
];

export type PositionGroup = { label: string; positions: string[] };

/**
 * The choices for a position picker. `unitType` is a unit type such as "Troop",
 * or null for a district position. `fromRoster` adds titles already in the
 * database (from imports) that the built-in list doesn't have.
 */
export function positionGroups(unitType: string | null, opts: { youth?: boolean; fromRoster?: string[] } = {}): PositionGroup[] {
  const groups: PositionGroup[] = [];
  if (opts.youth) groups.push({ label: "Youth", positions: [YOUTH_POSITION] });
  if (unitType === null) {
    groups.push({ label: "District", positions: DISTRICT_POSITIONS });
  } else {
    const leaders = UNIT_LEADER_POSITIONS[unitType];
    if (leaders) groups.push({ label: `${unitType} leaders`, positions: leaders });
    groups.push({ label: "Committee and support", positions: UNIT_SUPPORT_POSITIONS });
  }
  const listed = new Set(groups.flatMap((g) => g.positions));
  const extra = [...new Set(opts.fromRoster ?? [])].filter((p) => p && !listed.has(p)).sort();
  if (extra.length) groups.push({ label: "From the roster", positions: extra });
  return groups;
}
