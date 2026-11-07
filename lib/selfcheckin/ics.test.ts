import { describe, expect, it } from "vitest";
import { meetingIcs } from "./ics";

describe("meetingIcs", () => {
  it("writes one event in UTC, escaping text", () => {
    const ics = meetingIcs({
      id: "m1",
      start: new Date("2026-11-20T00:00:00Z"),
      end: new Date("2026-11-20T01:30:00Z"),
      title: "Roundtable: Recharter, popcorn; and more",
      place: "St. Mark's Hall, 123 Main St",
      url: "https://example.org/m/abc",
      description: "Join: https://example.org/zoom\nSee you there",
    });
    expect(ics).toContain("DTSTART:20261120T000000Z\r\nDTEND:20261120T013000Z");
    expect(ics).toContain("SUMMARY:Roundtable: Recharter\\, popcorn\\; and more");
    expect(ics).toContain("LOCATION:St. Mark's Hall\\, 123 Main St");
    expect(ics).toContain("DESCRIPTION:Join: https://example.org/zoom\\nSee you there");
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
  });
});
