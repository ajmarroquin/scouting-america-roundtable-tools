import { describe, expect, it } from "vitest";
import { draftWarnings } from "@/lib/announcements/editor";
import { isDue, reminderDraft, sendDay } from "./rules";

const meeting = { id: "8f4c0b8e-7a43-4d64-9c3e-2b1e7f1d9a10", date: "2026-11-19", startTime: "19:00:00", format: "hybrid", place: "St. Mark's Hall", title: "Recharter", joinUrl: "https://example.org/zoom", link: "https://example.org/m/abc" };

describe("reminders", () => {
  it("go a week before and the day of, across month ends", () => {
    expect(sendDay("2026-11-19", "week_before")).toBe("2026-11-12");
    expect(sendDay("2026-12-03", "week_before")).toBe("2026-11-26");
    expect(sendDay("2026-11-19", "day_of")).toBe("2026-11-19");
  });

  it("send only when approved, on or after their day, before the meeting passes, from 9 am", () => {
    const held = { date: "2026-11-19", status: "held" };
    const approved = { kind: "week_before" as const, status: "approved" };
    expect(isDue(approved, held, "2026-11-12", 9)).toBe(true);
    expect(isDue(approved, held, "2026-11-12", 8)).toBe(false);
    expect(isDue(approved, held, "2026-11-11", 10)).toBe(false);
    expect(isDue({ ...approved, status: "draft" }, held, "2026-11-12", 9)).toBe(false);
    expect(isDue({ ...approved, status: "sent" }, held, "2026-11-12", 9)).toBe(false);
    expect(isDue(approved, { ...held, status: "cancelled" }, "2026-11-12", 9)).toBe(false);
    // Approved late: it goes at the next run, but never after the meeting.
    expect(isDue(approved, held, "2026-11-16", 9)).toBe(true);
    expect(isDue(approved, held, "2026-11-20", 9)).toBe(false);
  });

  it("start from drafts filled in from the meeting, with nothing left to fill", () => {
    const week = reminderDraft("week_before", meeting);
    expect(week).toMatchObject({ audience: "unit-leaders", subject: "Roundtable is next Thursday, Nov 19" });
    expect(week.body).toContain("at St. Mark's Hall or online");
    expect(draftWarnings(week.body)).toEqual([]);

    const day = reminderDraft("day_of", meeting);
    expect(day).toMatchObject({ audience: `rsvp-yes:${meeting.id}`, subject: "Roundtable is tonight at 7:00 pm" });
    expect(day.body).toContain("[button: Check in when you arrive](https://example.org/m/abc)");
    expect(day.body).toContain("[button: Join online](https://example.org/zoom)");
    expect(draftWarnings(day.body)).toEqual([]);

    const virtual = reminderDraft("day_of", { ...meeting, format: "virtual", place: null });
    expect(virtual.body).not.toContain("Check in when you arrive");
    expect(virtual.body).toContain("starts at **7:00 pm** online.");
  });
});
