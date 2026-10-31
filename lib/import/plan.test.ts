import { describe, expect, it } from "vitest";
import type { ImportPerson } from "./payload";
import { type ExistingContact, type ExistingUnit, planCounts, planImport } from "./plan";

const D = "SAMPLE DISTRICT 30";

const person = (memberId: string, over: Partial<ImportPerson> = {}): ImportPerson => ({
  memberId,
  firstName: "Alex",
  middleName: null,
  lastName: "Example",
  suffix: null,
  preferredName: null,
  email: `${memberId}@example.com`,
  altEmail: null,
  phone: null,
  phoneType: null,
  multipleRegistrations: false,
  affiliations: [{ bsaUnitId: "900101", district: D, position: "Scoutmaster", registrationStatus: "New", expiresOn: null }],
  ...over,
});

const existing = (id: string, p: ImportPerson, over: Partial<ExistingContact> = {}): ExistingContact => ({
  id,
  memberId: p.memberId,
  firstName: p.firstName,
  middleName: p.middleName,
  lastName: p.lastName,
  suffix: p.suffix,
  preferredName: p.preferredName,
  email: p.email,
  altEmail: p.altEmail,
  phone: p.phone,
  phoneType: p.phoneType,
  multipleRegistrations: p.multipleRegistrations,
  status: "active",
  source: "import",
  affiliations: p.affiliations,
  ...over,
});

const unit = (bsaUnitId: string, over: Partial<ExistingUnit> = {}): ExistingUnit => ({
  id: `u-${bsaUnitId}`,
  bsaUnitId,
  type: "Troop",
  number: 101,
  genderAccepted: "B",
  charteredOrg: null,
  district: D,
  active: true,
  ...over,
});

describe("planImport", () => {
  it("treats everyone as new on the first import", () => {
    const plan = planImport({ district: D, people: [person("1"), person("2")], units: [] }, [], []);
    expect(plan.newPeople).toHaveLength(2);
    expect(planCounts(plan, 2)).toMatchObject({ new: 2, updated: 0, unchanged: 0, notInRoster: 0 });
  });

  it("re-importing the same file changes nothing", () => {
    const p = person("1");
    const plan = planImport({ district: D, people: [p], units: [] }, [existing("c1", p)], []);
    expect(plan.unchanged).toBe(1);
    expect(plan.updated).toEqual([]);
  });

  it("lists which fields changed, including units and positions", () => {
    const before = person("1");
    const after = person("1", {
      email: "new@example.com",
      affiliations: [{ ...before.affiliations[0], position: "Committee Chair" }],
    });
    const plan = planImport({ district: D, people: [after], units: [] }, [existing("c1", before)], []);
    expect(plan.updated).toEqual([{ memberId: "1", name: "Alex Example", fields: ["email", "units or positions"] }]);
  });

  it("fills in a preferred name but never overwrites one", () => {
    const p = person("1", { preferredName: "Al" });
    const keep = planImport({ district: D, people: [p], units: [] }, [existing("c1", p, { preferredName: "Lex" })], []);
    expect(keep.unchanged).toBe(1);
    const fill = planImport({ district: D, people: [p], units: [] }, [existing("c1", p, { preferredName: null })], []);
    expect(fill.updated[0].fields).toEqual(["preferred name"]);
  });

  it("marks active import contacts missing from the file, but not manual or archived ones", () => {
    const kept = person("1");
    const plan = planImport({ district: D, people: [kept], units: [] }, [
      existing("c1", kept),
      existing("c2", person("2"), { firstName: "Gone" }),
      existing("c3", person("3"), { source: "manual" }),
      existing("c4", person("4"), { status: "archived" }),
    ], []);
    expect(plan.missing.map((m) => m.id)).toEqual(["c2"]);
  });

  it("brings someone back when they reappear", () => {
    const p = person("1");
    const plan = planImport({ district: D, people: [p], units: [] }, [existing("c1", p, { status: "not_in_roster" })], []);
    expect(plan.reactivated).toBe(1);
  });

  it("links a hand-added contact by email and first name instead of duplicating", () => {
    const p = person("1");
    const walkIn = existing("w1", p, { memberId: null, source: "walk_in", affiliations: [] });
    const plan = planImport({ district: D, people: [p], units: [] }, [walkIn], []);
    expect(plan.newPeople).toEqual([]);
    expect(plan.linkedByEmail).toEqual([{ memberId: "1", contactId: "w1" }]);
  });

  it("does not link two people who share a family email", () => {
    const pat = person("1", { firstName: "Pat", email: "family@example.com" });
    const sam = person("2", { firstName: "Sam", email: "family@example.com" });
    const walkIn = existing("w1", pat, { memberId: null, source: "walk_in" });
    const plan = planImport({ district: D, people: [pat, sam], units: [] }, [walkIn], []);
    expect(plan.linkedByEmail).toEqual([{ memberId: "1", contactId: "w1" }]);
    expect(plan.newPeople.map((p) => p.firstName)).toEqual(["Sam"]);
  });

  it("counts new, changed, returning, and dropped units in the district", () => {
    const plan = planImport(
      {
        district: D,
        people: [],
        units: [
          { bsaUnitId: "1", type: "Troop", number: 101, genderAccepted: "B", charteredOrg: null, district: D },
          { bsaUnitId: "2", type: "Troop", number: 101, genderAccepted: "G", charteredOrg: "New Org", district: D },
          { bsaUnitId: "3", type: "Pack", number: 5, genderAccepted: "F", charteredOrg: null, district: D },
        ],
      },
      [],
      [
        unit("2", { genderAccepted: "G" }),
        unit("3", { type: "Pack", number: 5, genderAccepted: "F", active: false }),
        unit("4"),
        unit("5", { district: "Elsewhere" }),
      ],
    );
    expect(plan.units).toEqual({ new: 1, updated: 1, deactivated: ["4"], reactivated: 1, linked: [] });
  });

  it("links a unit added by hand to the roster's unit instead of duplicating it", () => {
    const plan = planImport(
      {
        district: D,
        people: [],
        units: [{ bsaUnitId: "900101", type: "Troop", number: 101, genderAccepted: "B", charteredOrg: null, district: D }],
      },
      [],
      [
        unit("x", { id: "manual-b", bsaUnitId: null, genderAccepted: "B" }),
        unit("y", { id: "manual-g", bsaUnitId: null, genderAccepted: "G" }),
      ],
    );
    expect(plan.units.linked).toEqual([{ unitId: "manual-b", bsaUnitId: "900101" }]);
    expect(plan.units.new).toBe(0);
    expect(plan.units.deactivated).toEqual([]);
  });
});
