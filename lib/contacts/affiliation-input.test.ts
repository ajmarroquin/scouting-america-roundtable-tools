import { describe, expect, it } from "vitest";
import { affiliationInputSchema, unitRefSchema } from "./affiliation-input";

describe("unitRefSchema", () => {
  it("accepts district, existing, and new units", () => {
    expect(unitRefSchema.safeParse({ kind: "district" }).success).toBe(true);
    expect(unitRefSchema.safeParse({ kind: "existing", id: "7b0f6a2e-1c1d-4a59-9c2e-3f1e0a6b2d11" }).success).toBe(true);
    expect(unitRefSchema.parse({ kind: "new", type: "Troop", number: "101", genderAccepted: "G" })).toEqual({
      kind: "new",
      type: "Troop",
      number: 101,
      genderAccepted: "G",
    });
  });

  it("requires a designation for troops and packs only", () => {
    expect(unitRefSchema.safeParse({ kind: "new", type: "Troop", number: 1, genderAccepted: null }).success).toBe(false);
    expect(unitRefSchema.safeParse({ kind: "new", type: "Crew", number: 1, genderAccepted: "B" }).success).toBe(false);
    expect(unitRefSchema.safeParse({ kind: "new", type: "Crew", number: 1, genderAccepted: null }).success).toBe(true);
  });

  it("rejects missing or odd unit numbers", () => {
    expect(unitRefSchema.safeParse({ kind: "new", type: "Ship", number: "", genderAccepted: null }).success).toBe(false);
    expect(unitRefSchema.safeParse({ kind: "new", type: "Ship", number: "12a", genderAccepted: null }).success).toBe(false);
  });
});

describe("affiliationInputSchema", () => {
  it("needs a position", () => {
    expect(affiliationInputSchema.safeParse({ unit: { kind: "district" }, position: "  " }).success).toBe(false);
  });
});
