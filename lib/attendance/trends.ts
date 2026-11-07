// Year-over-year trends for the council report and each person's record. Pure.

import { percent } from "./coverage-math";

type Meeting = { id: string; date: string };
type CheckIn = { meetingId: string; contactId: string };

export type PeopleTrend = {
  /** Different people at any roundtable this year. */
  people: number;
  /** Of those, people at their first roundtable ever. */
  newPeople: number;
  /** Of those, people who also came last year. */
  returning: number;
  /** Different people last year. */
  lastYearPeople: number;
  /** Share of last year's people who came back this year. */
  retention: number;
};

export function peopleTrend(input: {
  thisYear: CheckIn[];
  lastYear: CheckIn[];
  /** Everyone who came to any roundtable before this year started. */
  everBefore: Set<string>;
}): PeopleTrend {
  const now = new Set(input.thisYear.map((c) => c.contactId));
  const before = new Set(input.lastYear.map((c) => c.contactId));
  const returning = [...now].filter((p) => before.has(p)).length;
  return {
    people: now.size,
    newPeople: [...now].filter((p) => !input.everBefore.has(p)).length,
    returning,
    lastYearPeople: before.size,
    retention: percent(returning, before.size),
  };
}

/** Last year's headcount for the meeting in the same month, by this year's meeting id. Null when there was none. */
export function sameMonthLastYear(
  thisYear: Meeting[],
  lastYear: (Meeting & { headcount: number })[],
): Map<string, number | null> {
  const byMonth = new Map<string, number>();
  for (const m of lastYear) byMonth.set(m.date.slice(5, 7), (byMonth.get(m.date.slice(5, 7)) ?? 0) + m.headcount);
  return new Map(thisYear.map((m) => [m.id, byMonth.get(m.date.slice(5, 7)) ?? null]));
}

export type ProgramCoverage = { type: string; counted: number; represented: number; percent: number };

const PROGRAM_ORDER = ["Pack", "Troop", "Crew", "Ship", "Post", "Club"];

/** Coverage split by unit type: packs, troops, crews, ships. */
export function coverageByProgram(units: { id: string; type: string; counted: boolean }[], represented: Set<string>): ProgramCoverage[] {
  const byType = new Map<string, { counted: number; represented: number }>();
  for (const u of units) {
    if (!u.counted) continue;
    const t = byType.get(u.type) ?? { counted: 0, represented: 0 };
    t.counted++;
    if (represented.has(u.id)) t.represented++;
    byType.set(u.type, t);
  }
  return [...byType]
    .sort(([a], [b]) => PROGRAM_ORDER.indexOf(a) - PROGRAM_ORDER.indexOf(b))
    .map(([type, t]) => ({ type, ...t, percent: percent(t.represented, t.counted) }));
}

export type PersonRecord = {
  /** Roundtables attended this year, of those held. */
  attended: number;
  held: number;
  /** Date of the last roundtable attended, any year. */
  last: string | null;
  /** Roundtables in a row, counting back from the most recent one held. */
  streak: number;
};

/**
 * `held` is every held meeting, oldest first, across years; `attended` is the
 * ids of the ones this person came to. The streak runs back from the newest held meeting.
 */
export function personRecord(held: Meeting[], attended: Set<string>, year: { start: string; end: string }): PersonRecord {
  const thisYear = held.filter((m) => m.date >= year.start && m.date <= year.end);
  const came = held.filter((m) => attended.has(m.id));
  let streak = 0;
  for (let i = held.length - 1; i >= 0 && attended.has(held[i].id); i--) streak++;
  return {
    attended: thisYear.filter((m) => attended.has(m.id)).length,
    held: thisYear.length,
    last: came.at(-1)?.date ?? null,
    streak,
  };
}
