import { describe, expect, it } from "vitest";
import { checkInWindow, clockIn, matchPeople, normalizeName, zonedToUtc } from "./rules";

const NY = "America/New_York";

describe("checkInWindow", () => {
  const meeting = { date: "2026-11-19", startTime: "19:00:00", endTime: "20:30:00", status: "held" };

  it("opens 30 minutes before the start and closes 30 minutes after the end, in the district's zone", () => {
    // Nov 19 is after the fall-back, so New York is UTC-5: 7:00 pm is 00:00 UTC on the 20th.
    expect(zonedToUtc("2026-11-19", "19:00", NY).toISOString()).toBe("2026-11-20T00:00:00.000Z");
    expect(checkInWindow(meeting, new Date("2026-11-19T23:29:00Z"), NY).state).toBe("before");
    expect(checkInWindow(meeting, new Date("2026-11-19T23:30:00Z"), NY).state).toBe("open");
    expect(checkInWindow(meeting, new Date("2026-11-20T02:00:00Z"), NY).state).toBe("open");
    expect(checkInWindow(meeting, new Date("2026-11-20T02:01:00Z"), NY).state).toBe("after");
    const w = checkInWindow(meeting, new Date("2026-11-19T12:00:00Z"), NY);
    expect(w.state === "before" && clockIn(w.opensAt, NY)).toBe("6:30 pm");
  });

  it("handles summer time, a missing end, and meetings it can't open for", () => {
    // June: UTC-4.
    expect(zonedToUtc("2027-06-17", "19:00", NY).toISOString()).toBe("2027-06-17T23:00:00.000Z");
    const noEnd = checkInWindow({ ...meeting, endTime: null }, new Date("2026-11-20T02:29:00Z"), NY);
    expect(noEnd.state).toBe("open"); // 7:00 start, 9:00 assumed end, closes 9:30
    expect(checkInWindow({ ...meeting, startTime: null }, new Date(), NY)).toEqual({ state: "no_time" });
    expect(checkInWindow({ ...meeting, status: "cancelled" }, new Date(), NY)).toEqual({ state: "cancelled" });
  });
});

describe("matchPeople", () => {
  const base = { preferredName: null, altEmail: null, isYouth: false, status: "active" };
  const people = [
    { ...base, id: "1", firstName: "Sam", lastName: "O'Brien-Núñez", email: "Family@Example.org" },
    { ...base, id: "2", firstName: "Pat", lastName: "OBrien Nunez", email: null, altEmail: "family@example.org" },
    { ...base, id: "3", firstName: "Kid", lastName: "O'Brien-Núñez", email: "family@example.org", isYouth: true },
    { ...base, id: "4", firstName: "Gone", lastName: "O'Brien-Núñez", email: "family@example.org", status: "archived" },
    { ...base, id: "5", firstName: "Other", lastName: "Smith", email: "family@example.org" },
  ];

  it("needs the email (or second email) and last name, ignoring case, accents, and punctuation", () => {
    expect(normalizeName("O'Brien-Núñez")).toBe("obriennunez");
    expect(matchPeople(people, " FAMILY@example.org ", "obrien nunez").map((p) => p.id)).toEqual(["1", "2"]);
    expect(matchPeople(people, "family@example.org", "Smith").map((p) => p.id)).toEqual(["5"]);
  });

  it("never matches youth or archived contacts, or a blank", () => {
    expect(matchPeople(people, "family@example.org", "O'Brien-Núñez").map((p) => p.id)).not.toContain("3");
    expect(matchPeople(people, "family@example.org", "O'Brien-Núñez").map((p) => p.id)).not.toContain("4");
    expect(matchPeople(people, "", "Smith")).toEqual([]);
    expect(matchPeople(people, "family@example.org", "  ")).toEqual([]);
    expect(matchPeople(people, "someone@else.org", "Smith")).toEqual([]);
  });
});
