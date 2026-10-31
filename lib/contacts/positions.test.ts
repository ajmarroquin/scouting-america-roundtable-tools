import { describe, expect, it } from "vitest";
import { positionGroups, YOUTH_POSITION } from "./positions";

const flat = (groups: ReturnType<typeof positionGroups>) => groups.flatMap((g) => g.positions);

describe("positionGroups", () => {
  it("offers the unit's leader titles plus committee positions", () => {
    const troop = flat(positionGroups("Troop"));
    expect(troop).toContain("Scoutmaster");
    expect(troop).toContain("Committee Chair");
    expect(troop).not.toContain("Cubmaster");
  });

  it("offers district titles when there's no unit", () => {
    const district = flat(positionGroups(null));
    expect(district).toContain("Unit Commissioner");
    expect(district).not.toContain("Scoutmaster");
  });

  it("puts the youth title first for youth", () => {
    expect(flat(positionGroups("Crew", { youth: true }))[0]).toBe(YOUTH_POSITION);
  });

  it("adds roster titles the built-in list lacks, once", () => {
    const groups = positionGroups("Pack", { fromRoster: ["Cubmaster", "Supernova Mentor", "Supernova Mentor", ""] });
    expect(groups.at(-1)).toEqual({ label: "From the roster", positions: ["Supernova Mentor"] });
  });

  it("covers every adult position in the roster fixture", () => {
    // Titles the synthetic fixture uses, which mirror the real export.
    for (const [type, title] of [
      ["Troop", "Scoutmaster"],
      ["Troop", "Assistant Scoutmaster"],
      ["Pack", "Committee Member"],
      ["Pack", "Den Leader"],
      ["Pack", "Asst. Den Leader"],
      ["Crew", "Venturing Crew Assoc. Advisor"],
      ["Ship", "Skipper"],
      ["Troop", "Committee Chair"],
      [null, "Merit Badge Counselor"],
      [null, "Unit Commissioner"],
    ] as const) {
      expect(flat(positionGroups(type))).toContain(title);
    }
  });
});
