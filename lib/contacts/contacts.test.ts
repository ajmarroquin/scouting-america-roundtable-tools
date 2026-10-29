import { describe, expect, it } from "vitest";
import { safeCell, toCsv } from "@/lib/export/csv";
import { batchEmails, collectEmails, joinEmails } from "./emails";
import { contactExportRows, type ExportContact, resendExportRows } from "./export";
import { compareUnits, unitLabel } from "./format";

describe("unitLabel", () => {
  it("shows B or G only for linked troops", () => {
    expect(unitLabel({ type: "Troop", number: 101, genderAccepted: "G" })).toBe("Troop 101 G");
    expect(unitLabel({ type: "Pack", number: 101, genderAccepted: "F" })).toBe("Pack 101");
    expect(unitLabel({ type: "Crew", number: 205, genderAccepted: null })).toBe("Crew 205");
  });

  it("sorts packs before troops, then by number and B before G", () => {
    const units = [
      { type: "Troop", number: 101, genderAccepted: "G" },
      { type: "Pack", number: 300, genderAccepted: "F" },
      { type: "Troop", number: 101, genderAccepted: "B" },
      { type: "Troop", number: 9, genderAccepted: "B" },
    ];
    expect(units.sort(compareUnits).map(unitLabel)).toEqual(["Pack 300", "Troop 9 B", "Troop 101 B", "Troop 101 G"]);
  });
});

describe("collectEmails", () => {
  it("dedupes, counts people with no email, and always includes a youth's guardian", () => {
    const { emails, withoutEmail } = collectEmails([
      { email: "a@example.com", isYouth: false, guardianEmail: null },
      { email: "a@example.com", isYouth: false, guardianEmail: null },
      { email: null, isYouth: false, guardianEmail: null },
      { email: "youth@example.com", isYouth: true, guardianEmail: "parent@example.com" },
      { email: null, isYouth: true, guardianEmail: "parent2@example.com" },
    ]);
    expect(emails).toEqual(["a@example.com", "youth@example.com", "parent@example.com", "parent2@example.com"]);
    expect(withoutEmail).toBe(1);
  });

  it("joins with commas or semicolons and splits into batches", () => {
    expect(joinEmails(["a@x.com", "b@x.com"], "semicolon")).toBe("a@x.com; b@x.com");
    expect(joinEmails(["a@x.com", "b@x.com"], "comma")).toBe("a@x.com, b@x.com");
    expect(batchEmails(["1", "2", "3", "4", "5"], 2)).toEqual([["1", "2"], ["3", "4"], ["5"]]);
    expect(batchEmails(["1", "2"], null)).toEqual([["1", "2"]]);
    expect(batchEmails([], 50)).toEqual([]);
  });
});

describe("CSV export", () => {
  it("quotes commas and quotes, and neutralizes formulas", () => {
    expect(safeCell("=HYPERLINK(\"x\")")).toBe("'=HYPERLINK(\"x\")");
    expect(safeCell("-5")).toBe("'-5");
    expect(toCsv(["a", "b"], [["x, y", 'say "hi"'], [null, 3]])).toBe('a,b\r\n"x, y","say ""hi"""\r\n,3\r\n');
  });

  const contact: ExportContact = {
    memberId: "1",
    firstName: "Alex",
    lastName: "Example",
    preferredName: null,
    email: "alex@example.com",
    altEmail: null,
    phone: null,
    isYouth: false,
    guardianEmail: null,
    status: "active",
    affiliations: [
      { unitLabel: "Troop 101 B", position: "Scoutmaster", district: "D" },
      { unitLabel: "Troop 101 B", position: "Committee Member", district: "D" },
      { unitLabel: null, position: "Unit Commissioner", district: "D" },
    ],
  };

  it("lists units once, positions per unit, and district positions separately", () => {
    const [row] = contactExportRows([contact]);
    expect(row.slice(6, 9)).toEqual([
      "Troop 101 B",
      "Troop 101 B: Scoutmaster; Troop 101 B: Committee Member",
      "Unit Commissioner",
    ]);
  });

  it("builds a Resend contact list that includes youth guardians", () => {
    const youth = { ...contact, email: null, isYouth: true, guardianEmail: "parent@example.com" };
    expect(resendExportRows([contact, youth, contact])).toEqual([
      ["alex@example.com", "Alex", "Example"],
      ["parent@example.com", "", ""],
    ]);
  });
});
