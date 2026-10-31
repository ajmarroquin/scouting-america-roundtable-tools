import { readFileSync } from "node:fs";
import Papa from "papaparse";
import { describe, expect, it } from "vitest";
import { attendedMark, headerDate, type LegacySheet, parseLegacySheet, splitName } from "./legacy";

const fixture = readFileSync(new URL("../../tests/fixtures/attendance-sheet-sample.csv", import.meta.url), "utf8");
const rows = Papa.parse<string[]>(fixture, { skipEmptyLines: false }).data;

describe("headerDate", () => {
  it("reads month-year headers as the 1st of the month", () => {
    expect(headerDate("Nov 25")).toEqual({ date: "2025-11-01", monthOnly: true });
    expect(headerDate("June 26")).toEqual({ date: "2026-06-01", monthOnly: true });
    expect(headerDate("Sept 2026")).toEqual({ date: "2026-09-01", monthOnly: true });
    expect(headerDate("Mar '27")).toEqual({ date: "2027-03-01", monthOnly: true });
  });

  it("reads full dates", () => {
    expect(headerDate("11/19/2025")).toEqual({ date: "2025-11-19", monthOnly: false });
    expect(headerDate("2026-01-15")).toEqual({ date: "2026-01-15", monthOnly: false });
  });

  it("ignores other columns", () => {
    for (const h of ["Name", "Unit", "Column 11", "Position", "Notes 2", "13/45/2025"]) expect(headerDate(h)).toBeNull();
  });
});

describe("attendedMark", () => {
  it("counts any mark except a clear no", () => {
    for (const v of ["Attended", "x", "X", "yes", "✓", "1"]) expect(attendedMark(v)).toBe(true);
    for (const v of ["", " ", "no", "N", "0", "-", undefined]) expect(attendedMark(v)).toBe(false);
  });
});

describe("parseLegacySheet", () => {
  const sheet = parseLegacySheet(rows, "2026-10-31") as LegacySheet;

  it("finds the meetings and suggests what each was", () => {
    expect(sheet.meetings.map((m) => [m.header, m.date, m.attendees, m.suggested])).toEqual([
      ["Nov 25", "2025-11-01", 4, "held"],
      ["Dec 25", "2025-12-01", 0, "cancelled"],
      ["Jan 26", "2026-01-01", 3, "held"],
      ["Feb 26", "2026-02-01", 4, "held"],
      ["Apr 26", "2026-04-01", 3, "held"],
      ["May 26", "2026-05-01", 1, "held"],
      ["June 26", "2026-06-01", 0, "cancelled"],
    ]);
  });

  it("reads people, units, and notes, and skips blank and total rows", () => {
    expect(sheet.people.map((p) => p.name)).toEqual([
      "Alex Example",
      "Jim Placeholder",
      "Jordan",
      "Pat Testcase",
      "Casey Commish",
      "Newt Visitor",
      "Quinn Nomial",
    ]);
    expect(sheet.skippedRows).toBe(1);
    const pat = sheet.people.find((p) => p.name === "Pat Testcase")!;
    expect(pat).toMatchObject({ row: 5, unitText: "pack 101", notes: ["Position: Committee Chair"], otherUnitText: "" });
  });

  it("picks out extra units from other columns, and leaves roles as notes", () => {
    const s = parseLegacySheet(
      [
        ["Name", "Unit", "Column 11", "Nov 25"],
        ["Alex Example", "Troop 101 B", "pack 101, troop 101 g", "x"],
        ["Casey Commish", "", "unit commissioner", "x"],
      ],
      "2026-10-31",
    ) as LegacySheet;
    expect(s.people[0]).toMatchObject({ otherUnitText: "pack 101, troop 101 g", notes: ["Column 11: pack 101, troop 101 g"] });
    expect(s.people[1]).toMatchObject({ otherUnitText: "", notes: ["Column 11: unit commissioner"] });
  });

  it("merges a name that appears twice", () => {
    const pat = sheet.people.find((p) => p.name === "Pat Testcase")!;
    const headers = pat.attended.map((col) => sheet.meetings.find((m) => m.column === col)!.header);
    expect(headers).toEqual(["Nov 25", "Jan 26", "Feb 26", "Apr 26", "May 26"]);
  });

  it("skips future months with nobody in them", () => {
    const next = parseLegacySheet([["Name", "Oct 26", "Nov 26"], ["Alex Example", "x", ""]], "2026-10-31") as LegacySheet;
    expect(next.meetings.map((m) => m.suggested)).toEqual(["held", "skip"]);
  });

  it("explains a sheet it can't read", () => {
    expect(parseLegacySheet([], "2026-10-31")).toEqual({ error: "The sheet is empty." });
    expect(parseLegacySheet([["Who", "Nov 25"]], "2026-10-31")).toMatchObject({ error: expect.stringContaining("Name") });
    expect(parseLegacySheet([["Name", "Unit"]], "2026-10-31")).toMatchObject({ error: expect.stringContaining("meeting") });
  });

  it("accepts separate first and last name columns", () => {
    const s = parseLegacySheet([["First Name", "Last Name", "11/19/2025"], ["Alex", "Example", "x"]], "2026-10-31") as LegacySheet;
    expect(s.people[0]).toMatchObject({ name: "Alex Example", attended: [2] });
  });
});

describe("splitName", () => {
  it("keeps last-name particles together", () => {
    expect(splitName("Newt Visitor")).toEqual({ firstName: "Newt", lastName: "Visitor" });
    expect(splitName("Antonio Del Rosario")).toEqual({ firstName: "Antonio", lastName: "Del Rosario" });
    expect(splitName("Ana de la Cruz")).toEqual({ firstName: "Ana", lastName: "de la Cruz" });
    expect(splitName("Mary Ann Example")).toEqual({ firstName: "Mary Ann", lastName: "Example" });
    expect(splitName("Jeri")).toEqual({ firstName: "Jeri", lastName: "" });
  });
});
