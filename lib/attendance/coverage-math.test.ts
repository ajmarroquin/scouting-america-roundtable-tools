import { describe, expect, it } from "vitest";
import { computeCoverage, percent } from "./coverage-math";

const meetings = [
  { id: "sep", date: "2026-09-17", title: null },
  { id: "oct", date: "2026-10-15", title: "Popcorn" },
  { id: "nov", date: "2026-11-19", title: null },
];

describe("computeCoverage", () => {
  const result = computeCoverage({
    meetings,
    byMeeting: new Map([
      ["sep", new Set(["pack1", "troop1"])],
      ["oct", new Set(["pack1", "crew9", "walkin"])],
      ["nov", new Set<string>()],
    ]),
    checkIns: [
      { meetingId: "sep", contactId: "ann" },
      { meetingId: "sep", contactId: "bo" },
      { meetingId: "oct", contactId: "ann" },
      { meetingId: "oct", contactId: "cy" },
    ],
    counted: new Set(["pack1", "troop1", "crew9", "ship4"]),
  });

  it("counts units at each meeting and builds up across the year", () => {
    expect(result.meetings.map((m) => [m.id, m.represented.length, m.cumulative])).toEqual([
      ["sep", 2, 2],
      ["oct", 2, 3],
      ["nov", 0, 3],
    ]);
    expect([...result.represented].sort()).toEqual(["crew9", "pack1", "troop1"]);
  });

  it("names the units new this year at each meeting, and units not on the list", () => {
    expect(result.meetings[1]).toMatchObject({ newUnits: ["crew9"], offList: ["walkin"] });
  });

  it("counts people, and people at their first meeting of the year", () => {
    expect(result.meetings.map((m) => [m.headcount, m.firstTimers])).toEqual([
      [2, 2],
      [2, 1],
      [0, 0],
    ]);
  });

  it("tallies meetings per unit, off-list units included", () => {
    expect(result.perUnit.get("pack1")).toEqual({ meetings: 2, first: "2026-09-17", last: "2026-10-15" });
    expect(result.perUnit.get("walkin")).toEqual({ meetings: 1, first: "2026-10-15", last: "2026-10-15" });
    expect(result.perUnit.has("ship4")).toBe(false);
  });
});

describe("percent", () => {
  it("rounds, and is 0 with nothing to measure against", () => {
    expect(percent(1, 3)).toBe(33);
    expect(percent(2, 3)).toBe(67);
    expect(percent(5, 0)).toBe(0);
  });
});
