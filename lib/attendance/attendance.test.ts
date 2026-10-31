import { describe, expect, it } from "vitest";
import { attendanceLong, attendanceMatrix, type ExportAttendance, type ExportMeeting } from "./export";
import { unitsRepresented } from "./units";
import { meetingDateLabel, scoutingYearOf, todayIn, yearRange } from "./year";

describe("scouting year", () => {
  it("runs September through August by default", () => {
    expect(scoutingYearOf("2026-09-01")).toBe("2026-27");
    expect(scoutingYearOf("2027-08-31")).toBe("2026-27");
    expect(scoutingYearOf("2026-08-31")).toBe("2025-26");
    expect(scoutingYearOf("2099-10-01")).toBe("2099-00");
  });

  it("respects another start month", () => {
    expect(scoutingYearOf("2026-08-15", 8)).toBe("2026-27");
    expect(yearRange("2026-27", 8)).toEqual({ start: "2026-08-01", end: "2027-07-31" });
  });

  it("gives the first and last day of a year", () => {
    expect(yearRange("2026-27")).toEqual({ start: "2026-09-01", end: "2027-08-31" });
    expect(yearRange("2027-28", 3)).toEqual({ start: "2027-03-01", end: "2028-02-29" });
  });

  it("finds today in a time zone, not UTC", () => {
    // 01:30 UTC on Nov 20 is still Nov 19 in New York.
    expect(todayIn("America/New_York", new Date("2026-11-20T01:30:00Z"))).toBe("2026-11-19");
  });

  it("labels dates without shifting the day", () => {
    expect(meetingDateLabel("2026-11-19")).toBe("Thu, Nov 19, 2026");
    expect(meetingDateLabel("2026-11-19", "short")).toBe("Nov 19, 2026");
  });
});

describe("unitsRepresented", () => {
  it("counts a recorded unit alone, otherwise all of the person's units, once each", () => {
    const units = unitsRepresented([
      { representedUnitId: "troop-1", unitIds: ["troop-1", "pack-1"] },
      { representedUnitId: null, unitIds: ["pack-1", "crew-1"] },
      { representedUnitId: null, unitIds: [] },
    ]);
    expect([...units].sort()).toEqual(["crew-1", "pack-1", "troop-1"]);
  });
});

describe("attendance exports", () => {
  const meetings: ExportMeeting[] = [
    { id: "m2", date: "2026-11-19", title: "November", status: "held" },
    { id: "m1", date: "2026-10-15", title: "October", status: "held" },
    { id: "m3", date: "2026-12-17", title: null, status: "cancelled" },
  ];
  const row = (meetingId: string, contactId: string, name: string): ExportAttendance => ({
    meetingId,
    contactId,
    name,
    email: `${contactId}@example.com`,
    units: ["Troop 101 B"],
    representing: null,
    method: "check_in",
  });
  const rows = [row("m1", "a", "Alex Example"), row("m2", "a", "Alex Example"), row("m2", "b", "Bea Sample")];

  it("builds the old sheet's shape: held meetings oldest first, most-attended people first, headcount last", () => {
    const m = attendanceMatrix(meetings, rows);
    expect(m.headers).toEqual(["Name", "Email", "Units", "Oct 15, 2026", "Nov 19, 2026", "Meetings attended"]);
    expect(m.rows[0]).toEqual(["Alex Example", "a@example.com", "Troop 101 B", "Attended", "Attended", 2]);
    expect(m.rows[1]).toEqual(["Bea Sample", "b@example.com", "Troop 101 B", "", "Attended", 1]);
    expect(m.rows.at(-1)).toEqual(["Headcount", "", "", 1, 2, ""]);
  });

  it("lists one row per check-in by date", () => {
    const l = attendanceLong(meetings, rows);
    expect(l.rows.map((r) => [r[0], r[2]])).toEqual([
      ["2026-10-15", "Alex Example"],
      ["2026-11-19", "Alex Example"],
      ["2026-11-19", "Bea Sample"],
    ]);
    expect(l.rows[0][6]).toBe("Checked in");
  });
});
