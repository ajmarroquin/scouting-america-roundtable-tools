// Unit coverage across a scouting year: the number council asks for. Pure, so
// the meeting page, the council report, and the tests all agree.

export type CoverageInput = {
  /** Held meetings, oldest first. */
  meetings: { id: string; date: string; title: string | null }[];
  /** Units represented at each meeting (see unitsRepresented). */
  byMeeting: Map<string, Set<string>>;
  checkIns: { meetingId: string; contactId: string }[];
  /** The units coverage is measured against. */
  counted: Set<string>;
};

export type MeetingCoverage = {
  id: string;
  date: string;
  title: string | null;
  headcount: number;
  /** People at their first meeting of the year. */
  firstTimers: number;
  /** Counted units represented at this meeting. */
  represented: string[];
  /** Units represented that aren't counted, such as one typed in for a walk-in. */
  offList: string[];
  /** Counted units represented for the first time this year at this meeting. */
  newUnits: string[];
  /** Counted units represented so far this year, through this meeting. */
  cumulative: number;
};

export type UnitTally = { meetings: number; first: string; last: string };

export function computeCoverage(input: CoverageInput): {
  meetings: MeetingCoverage[];
  /** Counted units represented at any meeting. */
  represented: Set<string>;
  perUnit: Map<string, UnitTally>;
} {
  const seenUnits = new Set<string>();
  const seenPeople = new Set<string>();
  const perUnit = new Map<string, UnitTally>();
  const meetings = input.meetings.map((m) => {
    const units = [...(input.byMeeting.get(m.id) ?? [])];
    const represented = units.filter((u) => input.counted.has(u));
    const people = [...new Set(input.checkIns.filter((c) => c.meetingId === m.id).map((c) => c.contactId))];
    const newUnits = represented.filter((u) => !seenUnits.has(u));
    const firstTimers = people.filter((p) => !seenPeople.has(p)).length;
    for (const u of represented) seenUnits.add(u);
    for (const p of people) seenPeople.add(p);
    for (const u of units) {
      const t = perUnit.get(u);
      perUnit.set(u, t ? { ...t, meetings: t.meetings + 1, last: m.date } : { meetings: 1, first: m.date, last: m.date });
    }
    return {
      ...m,
      headcount: people.length,
      firstTimers,
      represented,
      offList: units.filter((u) => !input.counted.has(u)),
      newUnits,
      cumulative: seenUnits.size,
    };
  });
  return { meetings, represented: seenUnits, perUnit };
}

/** 0 to 100, rounded; 0 when there's nothing to measure against. */
export function percent(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}
