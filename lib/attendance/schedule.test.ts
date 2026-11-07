import { describe, expect, it } from "vitest";
import { hhmm, isUpcoming, suggestedTimes, timeLabel, timeRange } from "./schedule";

describe("meeting times", () => {
  it("reads times the way people say them", () => {
    expect(timeLabel("19:00:00")).toBe("7:00 pm");
    expect(timeLabel("00:05")).toBe("12:05 am");
    expect(timeLabel("12:30")).toBe("12:30 pm");
    expect(timeRange("19:00:00", "20:30:00")).toBe("7:00 to 8:30 pm");
    expect(timeRange("11:30", "13:00")).toBe("11:30 am to 1:00 pm");
    expect(timeRange("19:00", null)).toBe("7:00 pm");
    expect(timeRange(null, "20:00")).toBe("");
    expect(hhmm("19:00:00")).toBe("19:00");
  });

  it("calls a meeting upcoming only after today", () => {
    expect(isUpcoming("2026-11-09", "2026-11-07")).toBe(true);
    expect(isUpcoming("2026-11-07", "2026-11-07")).toBe(false);
    expect(isUpcoming("2026-10-01", "2026-11-07")).toBe(false);
  });

  it("starts a new meeting at the latest meeting's times, or 7 to 8:30", () => {
    expect(suggestedTimes([])).toEqual({ start: "19:00", end: "20:30" });
    expect(
      suggestedTimes([
        { date: "2026-10-01", startTime: "18:30:00", endTime: "20:00:00" },
        { date: "2026-11-09", startTime: "19:15:00", endTime: null },
        { date: "2026-12-01", startTime: null, endTime: null },
      ]),
    ).toEqual({ start: "19:15", end: "20:30" });
  });
});
