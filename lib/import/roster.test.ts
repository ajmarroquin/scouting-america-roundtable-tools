import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseCsvText } from "./csv";
import { importPayloadSchema } from "./payload";
import { ADULT_MEMBER, districtsInFile, isYouthRow, missingColumns, parseRoster } from "./roster";

const DISTRICT = "SAMPLE DISTRICT 30";
const fixture = readFileSync(path.join(import.meta.dirname, "../../tests/fixtures/roster-export-sample.csv"), "utf8");
const { fields, rows } = parseCsvText(fixture);
const result = parseRoster(rows, fields, DISTRICT);
const person = (memberId: string) => result.people.find((p) => p.memberId === memberId)!;

describe("parseCsvText", () => {
  it("strips the byte-order mark from the first header", () => {
    expect(fields[0]).toBe("MemberID");
    expect(fields).toHaveLength(90);
  });
});

describe("missingColumns", () => {
  it("accepts the roster export and names what a wrong file lacks", () => {
    expect(missingColumns(fields)).toEqual([]);
    expect(missingColumns(["Name", "Unit"])).toContain("MemberID");
  });
});

describe("districtsInFile", () => {
  it("lists each district with its adult row count, largest first", () => {
    expect(districtsInFile(rows)).toEqual([
      { district: DISTRICT, adultRows: 11 },
      { district: "Other River District 15", adultRows: 1 },
    ]);
  });
});

describe("isYouthRow", () => {
  it("trusts IsYouth when present", () => {
    expect(isYouthRow({ IsYouth: "1", unitPosition: "Scoutmaster" })).toBe(true);
    expect(isYouthRow({ IsYouth: "0" })).toBe(false);
  });

  it("treats a blank IsYouth with no position as youth, regardless of age", () => {
    expect(isYouthRow({ IsYouth: "", AGE: "19" })).toBe(true);
    expect(isYouthRow({ IsYouth: "", unitPosition: "Den Leader" })).toBe(false);
    expect(isYouthRow({ IsYouth: "", aboveUnitPosition: "Merit Badge Counselor" })).toBe(false);
  });
});

describe("parseRoster", () => {
  it("counts what it kept and what it dropped", () => {
    expect(result.summary).toMatchObject({
      rowsRead: 14,
      youthRows: 2,
      otherDistrictRows: 1,
      noMemberIdRows: 0,
      noNameRows: 0,
      truncatedRows: 1,
      adultRows: 11,
      people: 10,
      units: 5,
      noEmail: 1,
      sharedEmails: [{ email: "testcase.family@example.com", people: 2 }],
    });
  });

  it("never outputs youth or people from other districts", () => {
    const ids = result.people.map((p) => p.memberId);
    expect(ids).not.toContain("900000006"); // IsYouth = 1
    expect(ids).not.toContain("900000007"); // 19, no position
    expect(ids).not.toContain("900000010"); // other district
  });

  it("collects units from every row in the district, youth rows included", () => {
    expect(result.units.map((u) => u.bsaUnitId).sort()).toEqual(["900101", "900102", "900103", "900205", "900303"]);
    expect(result.units.find((u) => u.bsaUnitId === "900103")).toMatchObject({
      type: "Troop",
      number: 101,
      genderAccepted: "G",
    });
  });

  it("merges rows that share a member ID into one person with several positions", () => {
    const alex = person("900000001");
    expect(alex.multipleRegistrations).toBe(true);
    expect(alex.affiliations.map((a) => [a.bsaUnitId, a.position])).toEqual([
      ["900101", "Scoutmaster"],
      ["900102", "Committee Member"],
    ]);
  });

  it("keeps district positions with no unit", () => {
    expect(person("900000008").affiliations).toEqual([
      {
        bsaUnitId: null,
        district: DISTRICT,
        position: "Merit Badge Counselor",
        registrationStatus: "Re-Registered",
        expiresOn: "2026-12-31",
      },
    ]);
  });

  it("picks the first email from Email, then EmailHome, then EmailBus", () => {
    expect(person("900000002").email).toBe("jordan@example.org");
    expect(person("900000001").email).toBe("alex@example.com");
    expect(person("900000011").email).toBeNull();
  });

  it("reads the preferred name and parses dates in either format", () => {
    expect(person("900000005").preferredName).toBe("Jim");
    expect(person("900000001").affiliations[0].expiresOn).toBe("2026-12-31");
  });

  it("keeps the truncated last row's person", () => {
    expect(person("900000013")).toMatchObject({ firstName: "Robin", email: "robin@example.com" });
  });

  it("outputs only allowed fields, and the result passes the server's schema", () => {
    const keys = new Set(result.people.flatMap((p) => Object.keys(p)));
    for (const forbidden of ["DateOfBirth", "AGE", "ETHNICITY", "School", "AddressLine1", "Gender"]) {
      expect(keys.has(forbidden)).toBe(false);
    }
    const parsed = importPayloadSchema.safeParse({
      fileName: "roster.csv",
      district: DISTRICT,
      people: result.people,
      units: result.units,
    });
    expect(parsed.success).toBe(true);
  });

  it("labels a registered adult with no listed position", () => {
    const r = parseRoster(
      [{ ...rows[0], MemberID: "1", unitPosition: "", IsYouth: "0" }],
      fields,
      DISTRICT,
    );
    expect(r.people[0].affiliations[0].position).toBe(ADULT_MEMBER);
  });
});
