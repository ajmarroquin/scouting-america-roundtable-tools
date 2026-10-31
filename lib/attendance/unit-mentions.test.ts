import { describe, expect, it } from "vitest";
import { type KnownUnit, parseUnitMentions, resolveUnitMentions } from "./unit-mentions";

describe("parseUnitMentions", () => {
  it("reads one unit, with or without a designation", () => {
    expect(parseUnitMentions("Pack 101")).toEqual([{ type: "Pack", number: 101, gender: null }]);
    expect(parseUnitMentions("troop 662B")).toEqual([{ type: "Troop", number: 662, gender: "B" }]);
    expect(parseUnitMentions("Troop 101 G")).toEqual([{ type: "Troop", number: 101, gender: "G" }]);
  });

  it("expands a shared number with two designations", () => {
    expect(parseUnitMentions("troop 1 b, g")).toEqual([
      { type: "Troop", number: 1, gender: "B" },
      { type: "Troop", number: 1, gender: "G" },
    ]);
  });

  it("reads several units and carries the type forward", () => {
    expect(parseUnitMentions("troop 662B, troop 662g, pack 662")).toEqual([
      { type: "Troop", number: 662, gender: "B" },
      { type: "Troop", number: 662, gender: "G" },
      { type: "Pack", number: 662, gender: null },
    ]);
    expect(parseUnitMentions("Troops 10 & 12")).toEqual([
      { type: "Troop", number: 10, gender: null },
      { type: "Troop", number: 12, gender: null },
    ]);
  });

  it("ignores roles and words around the unit", () => {
    expect(parseUnitMentions("crew 1/commissioner")).toEqual([{ type: "Crew", number: 1, gender: null }]);
    expect(parseUnitMentions("Committee chair, Pack #45 boys")).toEqual([{ type: "Pack", number: 45, gender: null }]);
    expect(parseUnitMentions("T520")).toEqual([{ type: "Troop", number: 520, gender: null }]);
    expect(parseUnitMentions("")).toEqual([]);
    expect(parseUnitMentions("District")).toEqual([]);
  });
});

describe("resolveUnitMentions", () => {
  const units: KnownUnit[] = [
    { id: "t101b", type: "Troop", number: 101, genderAccepted: "B" },
    { id: "t101g", type: "Troop", number: 101, genderAccepted: "G" },
    { id: "p101", type: "Pack", number: 101, genderAccepted: "F" },
    { id: "c205", type: "Crew", number: 205, genderAccepted: null },
  ];

  it("links units the text names without doubt", () => {
    expect(resolveUnitMentions("Troop 101 b, g", units)).toEqual({ unitIds: ["t101b", "t101g"], unresolved: [] });
    expect(resolveUnitMentions("pack 101", units)).toEqual({ unitIds: ["p101"], unresolved: [] });
    expect(resolveUnitMentions("205", units)).toEqual({ unitIds: ["c205"], unresolved: [] });
  });

  it("leaves ambiguous or unknown units for a person to sort out", () => {
    expect(resolveUnitMentions("Troop 101", units)).toEqual({ unitIds: [], unresolved: ["Troop 101"] });
    expect(resolveUnitMentions("101", units).unresolved).toEqual(["101 (Pack 101 or Troop 101 B or Troop 101 G)"]);
    expect(resolveUnitMentions("Pack 909", units)).toEqual({ unitIds: [], unresolved: ["Pack 909"] });
  });
});
