import { describe, expect, it } from "vitest";
import { clean, cleanEmail, formatPhone, nameCase, parseExportDate, unitType } from "./normalize";

describe("normalize", () => {
  it("cleans whitespace and empties", () => {
    expect(clean("  Troop   101 ")).toBe("Troop 101");
    expect(clean("   ")).toBeNull();
    expect(clean(undefined)).toBeNull();
  });

  it("title-cases all-caps or all-lowercase names only", () => {
    expect(nameCase("MARY-ANNE O'BRIEN")).toBe("Mary-Anne O'Brien");
    expect(nameCase("josé")).toBe("José");
    expect(nameCase("McDonald")).toBe("McDonald");
  });

  it("lowercases valid emails and drops junk", () => {
    expect(cleanEmail(" Leader@Example.COM ")).toBe("leader@example.com");
    expect(cleanEmail("not an email")).toBeNull();
  });

  it("formats US phone numbers and leaves others alone", () => {
    expect(formatPhone("212.555.0101")).toBe("(212) 555-0101");
    expect(formatPhone("+1 212 555 0101")).toBe("(212) 555-0101");
    expect(formatPhone("555-0101")).toBe("555-0101");
  });

  it("parses both date formats the export uses", () => {
    expect(parseExportDate("01-15-26")).toBe("2026-01-15");
    expect(parseExportDate("9/02/2025")).toBe("2025-09-02");
    expect(parseExportDate("12/31/2026")).toBe("2026-12-31");
    expect(parseExportDate("13/01/2026")).toBeNull();
    expect(parseExportDate("DOB")).toBeNull();
  });

  it("recognizes unit types case-insensitively", () => {
    expect(unitType("troop")).toBe("Troop");
    expect(unitType("Lodge")).toBeNull();
  });
});
