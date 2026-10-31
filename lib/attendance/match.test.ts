import { describe, expect, it } from "vitest";
import { type MatchCandidate, matchPerson, similarity } from "./match";

const c = (id: string, firstName: string, lastName: string, extra: Partial<MatchCandidate> = {}): MatchCandidate => ({
  id,
  firstName,
  lastName,
  preferredName: null,
  email: null,
  units: [],
  ...extra,
});

const people = [
  c("james", "James", "Placeholder", { units: ["Crew 205"] }),
  c("alex", "Alexander", "Example", { email: "alex@example.com", units: ["Troop 101 B", "Pack 101"] }),
  c("pat", "Patricia", "Testcase", { units: ["Pack 101"] }),
  c("sam", "Samuel", "Testcase", { units: ["Pack 101"] }),
  c("antonio", "Antonio", "Del Rosario", { units: ["Troop 662 B"] }),
  c("jeri", "Jeri", "Land"),
  c("allison", "Allison", "Tester"),
  c("neil", "Neil", "Worden"),
  c("maria", "María", "Núñez"),
];

const top = (name: string, extra: { email?: string; unitHint?: string } = {}) => matchPerson({ name, ...extra }, people);

describe("matchPerson", () => {
  it("matches an exact name, and an email outright", () => {
    expect(top("James Placeholder")).toMatchObject({ status: "matched", candidates: [{ id: "james", reason: "same name" }] });
    expect(top("A. Somebody", { email: "ALEX@example.com" })).toMatchObject({ status: "matched", candidates: [{ id: "alex" }] });
  });

  it("matches nicknames confidently", () => {
    expect(top("Jim Placeholder")).toMatchObject({ status: "matched", candidates: [{ id: "james", reason: expect.stringContaining("nickname") }] });
    expect(top("Alex Example").status).toBe("matched");
  });

  it("handles compound last names, accents, and extra middle names", () => {
    expect(top("Antonio Del Rosario")).toMatchObject({ status: "matched", candidates: [{ id: "antonio" }] });
    expect(top("Maria Nunez")).toMatchObject({ status: "matched", candidates: [{ id: "maria" }] });
    expect(top("Neil Flint Worden")).toMatchObject({ status: "matched", candidates: [{ id: "neil" }] });
  });

  it("sends a first name alone, or a last initial, to review", () => {
    expect(top("Jeri")).toMatchObject({ status: "review", candidates: [{ id: "jeri", reason: "first name only" }] });
    expect(top("Allison T")).toMatchObject({ status: "review", candidates: [{ id: "allison" }] });
  });

  it("doesn't confuse family members who share a last name", () => {
    const result = top("Pat Testcase");
    // "Pat" is a nickname for Patricia; Samuel shares only the last name.
    expect(result.candidates.map((x) => x.id)).toEqual(["pat"]);
  });

  it("uses the unit as a tie-breaker hint", () => {
    expect(top("Antonio Del Rosario", { unitHint: "Troop 662 B" }).candidates[0].reason).toContain("same unit");
    expect(top("Antonio Del Rosario", { unitHint: "troop 662b, pack 662" }).candidates[0].reason).toContain("same unit");
    expect(top("Antonio Del Rosario", { unitHint: "Troop 66" }).candidates[0].reason).not.toContain("same unit");
    expect(top("Antonio Del Rosario", { unitHint: "Troop 662 G" }).candidates[0].reason).not.toContain("same unit");
  });

  it("reports nobody for a new person", () => {
    expect(top("Zed Newcomer")).toEqual({ status: "none", candidates: [] });
  });

  it("catches a small typo for review", () => {
    expect(top("James Placholder").status).not.toBe("none");
  });
});

describe("similarity", () => {
  it("scores identical strings 1 and unrelated ones low", () => {
    expect(similarity("martha", "martha")).toBe(1);
    expect(similarity("martha", "marhta")).toBeGreaterThan(0.95);
    expect(similarity("abc", "xyz")).toBe(0);
  });
});
