import { describe, expect, it } from "vitest";
import { draftWarnings, TEMPLATES } from "./editor";
import { fillMeeting } from "./meeting-fill";

const reminder = TEMPLATES.find((t) => t.key === "reminder")!.body;
const meeting = { date: "2026-11-19", startTime: "19:00:00", format: "in_person", place: "St. Mark's Hall", title: "Recharter", link: "https://example.org/m/abc" };

describe("fillMeeting", () => {
  it("fills the reminder template's blanks and its button, so nothing is left to warn about", () => {
    const out = fillMeeting(reminder, meeting);
    expect(out).toContain("**Thursday, Nov 19 at 7:00 pm** at St. Mark's Hall.");
    expect(out).toContain("[button: Let us know you're coming](https://example.org/m/abc)");
    expect(draftWarnings(out)).toEqual([]);
  });

  it("says online for virtual and hybrid meetings", () => {
    expect(fillMeeting("We meet [date] at [place].", { ...meeting, format: "virtual" })).toBe("We meet Nov 19 online.");
    expect(fillMeeting("We meet at [place].", { ...meeting, format: "hybrid" })).toBe("We meet at St. Mark's Hall or online.");
    expect(fillMeeting("Where: [place]", { ...meeting, format: "hybrid", place: null })).toBe("Where: online");
  });

  it("leaves blanks it can't fill, and real links alone", () => {
    const out = fillMeeting("At [time] at [place]. [button: Flyer](https://example.org/flyer)", { ...meeting, startTime: null, place: null, link: null });
    expect(out).toBe("At [time] at [place]. [button: Flyer](https://example.org/flyer)");
  });
});
