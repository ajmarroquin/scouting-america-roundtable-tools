import { describe, expect, it } from "vitest";
import { draftWarnings, TEMPLATES } from "./editor";
import { fillMeeting, meetingPreview, meetingSubject } from "./meeting-fill";

const reminder = TEMPLATES.find((t) => t.key === "reminder")!.body;
const meeting = { date: "2026-11-19", startTime: "19:00:00", format: "in_person", place: "St. Mark's Hall", title: "Recharter", link: "https://example.org/m/abc" };

describe("fillMeeting", () => {
  it("fills the reminder template's blanks and its button, so nothing is left to warn about", () => {
    const out = fillMeeting(reminder, meeting);
    expect(out).toContain("**Thursday, Nov 19 at 7:00 pm** at St. Mark's Hall.");
    expect(out).toContain("[button: Let us know you're coming](https://example.org/m/abc)");
    expect(draftWarnings(out)).toEqual([]);
  });

  it("says online for virtual meetings, and leads with the room for hybrid ones", () => {
    expect(fillMeeting("We meet [date] at [place].", { ...meeting, format: "virtual" })).toBe("We meet Nov 19 online.");
    expect(fillMeeting("We meet at [place].", { ...meeting, format: "hybrid" })).toBe(
      "We meet at St. Mark's Hall, and online for anyone who can't make it in person.",
    );
    // No place yet: the blank stays, so the draft warns until someone fills it in.
    const noPlace = fillMeeting("We meet at [place].", { ...meeting, format: "hybrid", place: null });
    expect(noPlace).toBe("We meet at [place], and online for anyone who can't make it in person.");
    expect(draftWarnings(noPlace).length).toBe(1);
  });

  it("writes a subject and preview line from the meeting", () => {
    expect(meetingSubject({ date: "2026-11-09", startTime: "18:30:00" })).toBe("Roundtable: Monday, Nov 9 at 6:30 pm");
    expect(meetingSubject({ date: "2026-11-09", startTime: null })).toBe("Roundtable: Monday, Nov 9");
    expect(meetingPreview({ format: "hybrid", place: "St. Mark's Hall", title: null })).toBe("Join us at St. Mark's Hall, or online if you can't make it.");
    expect(meetingPreview({ format: "virtual", place: null, title: "Recharter" })).toBe("Recharter. Online this month. The link is inside.");
  });

  it("leaves blanks it can't fill, and real links alone", () => {
    const out = fillMeeting("At [time] at [place]. [button: Flyer](https://example.org/flyer)", { ...meeting, startTime: null, place: null, link: null });
    expect(out).toBe("At [time] at [place]. [button: Flyer](https://example.org/flyer)");
  });
});
