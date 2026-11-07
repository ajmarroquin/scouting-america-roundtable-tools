import { describe, expect, it } from "vitest";
import { coverageByProgram, peopleTrend, personRecord, sameMonthLastYear } from "./trends";

describe("peopleTrend", () => {
  it("counts new and returning people, and retention from last year", () => {
    const t = peopleTrend({
      thisYear: [
        { meetingId: "a", contactId: "ann" },
        { meetingId: "b", contactId: "ann" },
        { meetingId: "a", contactId: "bo" },
        { meetingId: "b", contactId: "cy" },
      ],
      lastYear: [
        { meetingId: "x", contactId: "ann" },
        { meetingId: "x", contactId: "dee" },
        { meetingId: "y", contactId: "eve" },
        { meetingId: "y", contactId: "fay" },
      ],
      // Bo came two years ago but not last year: back, but not new and not returning.
      everBefore: new Set(["ann", "dee", "eve", "fay", "bo"]),
    });
    expect(t).toEqual({ people: 3, newPeople: 1, returning: 1, lastYearPeople: 4, retention: 25 });
  });

  it("handles a first year with nothing before it", () => {
    expect(peopleTrend({ thisYear: [{ meetingId: "a", contactId: "ann" }], lastYear: [], everBefore: new Set() })).toEqual({
      people: 1,
      newPeople: 1,
      returning: 0,
      lastYearPeople: 0,
      retention: 0,
    });
  });
});

describe("sameMonthLastYear", () => {
  it("lines up meetings by month, and says when last year had none", () => {
    const m = sameMonthLastYear(
      [
        { id: "sep", date: "2026-09-17" },
        { id: "oct", date: "2026-10-15" },
        { id: "dec", date: "2026-12-17" },
      ],
      [
        { id: "s", date: "2025-09-18", headcount: 15 },
        { id: "o", date: "2025-10-16", headcount: 16 },
      ],
    );
    expect([...m]).toEqual([
      ["sep", 15],
      ["oct", 16],
      ["dec", null],
    ]);
  });
});

describe("coverageByProgram", () => {
  it("splits counted units by type, in program order, and skips units that don't count", () => {
    const units = [
      { id: "t1", type: "Troop", counted: true },
      { id: "p1", type: "Pack", counted: true },
      { id: "p2", type: "Pack", counted: true },
      { id: "c1", type: "Crew", counted: true },
      { id: "p9", type: "Pack", counted: false },
    ];
    expect(coverageByProgram(units, new Set(["p1", "t1", "p9"]))).toEqual([
      { type: "Pack", counted: 2, represented: 1, percent: 50 },
      { type: "Troop", counted: 1, represented: 1, percent: 100 },
      { type: "Crew", counted: 1, represented: 0, percent: 0 },
    ]);
  });
});

describe("personRecord", () => {
  const held = [
    { id: "may", date: "2026-05-21" },
    { id: "sep", date: "2026-09-17" },
    { id: "oct", date: "2026-10-15" },
    { id: "nov", date: "2026-11-19" },
  ];
  const year = { start: "2026-09-01", end: "2027-08-31" };

  it("counts this year's roundtables, the last one, and the current streak", () => {
    expect(personRecord(held, new Set(["may", "oct", "nov"]), year)).toEqual({ attended: 2, held: 3, last: "2026-11-19", streak: 2 });
  });

  it("has no streak when they missed the latest one", () => {
    expect(personRecord(held, new Set(["may", "sep", "oct"]), year)).toMatchObject({ streak: 0, last: "2026-10-15" });
  });

  it("handles someone who never came", () => {
    expect(personRecord(held, new Set(), year)).toEqual({ attended: 0, held: 3, last: null, streak: 0 });
  });
});
