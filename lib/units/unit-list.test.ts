import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseUnitList, planUnitList, type UnitList } from "./unit-list";

const fixture = readFileSync(new URL("../../tests/fixtures/unit-list-sample.csv", import.meta.url), "utf8");

describe("parseUnitList", () => {
  const list = parseUnitList(fixture) as UnitList;

  it("reads the report date and the districts in it", () => {
    expect(list.asOf).toBe("2026-10-31");
    expect(list.districts).toEqual(["SAMPLE DISTRICT 30", "OTHER RIVER DISTRICT 15"]);
  });

  it("reads each unit's type, number, designation, sub-district, and current counts", () => {
    expect(list.units).toHaveLength(8);
    expect(list.units[1]).toEqual({
      type: "Pack",
      number: 101,
      genderAccepted: "F",
      district: "SAMPLE DISTRICT 30",
      subdistrict: null,
      youth: 12,
      adults: 9,
    });
    expect(list.units.find((u) => u.type === "Crew")).toMatchObject({ number: 205, genderAccepted: null, subdistrict: "Sub Dist. #1" });
    expect(list.units[0]).toMatchObject({ number: 101, genderAccepted: "B", youth: 0, adults: 0 });
  });

  it("lists names it can't read instead of guessing", () => {
    expect(list.unreadable).toEqual(["Mystery Unit 9"]);
  });

  it("refuses something that isn't the report", () => {
    expect(parseUnitList("Name,Unit\nAlex,Pack 1")).toMatchObject({ error: expect.stringContaining("unitname") });
  });
});

describe("planUnitList", () => {
  const list = parseUnitList(fixture) as UnitList;
  const sample = list.units.filter((u) => u.district === "SAMPLE DISTRICT 30");
  const existing = [
    { id: "t101b", type: "Troop", number: 101, genderAccepted: "B" },
    { id: "t101g", type: "Troop", number: 101, genderAccepted: "G" },
    { id: "p101", type: "Pack", number: 101, genderAccepted: "F" },
    { id: "c205", type: "Crew", number: 205, genderAccepted: null },
    { id: "t707", type: "Troop", number: 707, genderAccepted: "G" },
  ];
  const plan = planUnitList(existing, sample);

  it("matches by type, number, and designation", () => {
    expect(plan.matched.map((m) => m.id).sort()).toEqual(["c205", "p101", "t101b", "t101g"]);
  });

  it("follows a troop whose designation changed instead of adding a second one", () => {
    expect(plan.changed).toEqual([{ id: "t707", from: "G", unit: expect.objectContaining({ number: 707, genderAccepted: "F" }) }]);
  });

  it("adds new units with members and leaves out empty ones", () => {
    expect(plan.created.map((u) => `${u.type} ${u.number}`)).toEqual(["Pack 404"]);
    expect(plan.skipped.map((u) => `${u.type} ${u.number} ${u.genderAccepted}`)).toEqual(["Pack 101 B"]);
  });

  it("doesn't treat a linked troop's partner as a designation change", () => {
    // Troop 101 G is missing from the app; Troop 101 B exists. Both are on the list, so G is new.
    const p = planUnitList(existing.filter((u) => u.id !== "t101g"), sample);
    expect(p.created.map((u) => `${u.type} ${u.number} ${u.genderAccepted}`)).toContain("Troop 101 G");
    expect(p.changed.map((c) => c.id)).toEqual(["t707"]);
  });
});
