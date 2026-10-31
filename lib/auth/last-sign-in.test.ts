import { describe, expect, it } from "vitest";
import { lastSignInLabel } from "./last-sign-in";

const NY = "America/New_York";
// Saturday, Oct 31, 2026, 10:00 AM in New York.
const now = new Date("2026-10-31T14:00:00Z");

describe("lastSignInLabel", () => {
  it("says never for someone who hasn't signed in", () => {
    expect(lastSignInLabel(null, NY, now)).toBe("Never");
  });

  it("uses today and yesterday in the app's time zone, not UTC", () => {
    expect(lastSignInLabel(new Date("2026-10-31T14:00:30Z"), NY, now)).toBe("Just now");
    expect(lastSignInLabel(new Date("2026-10-31T12:41:00Z"), NY, now)).toBe("Today, 8:41 AM");
    // 11:30 PM Oct 30 in New York is already Oct 31 in UTC.
    expect(lastSignInLabel(new Date("2026-10-31T03:30:00Z"), NY, now)).toBe("Yesterday, 11:30 PM");
  });

  it("counts days for the past week, then shows the date", () => {
    expect(lastSignInLabel(new Date("2026-10-28T15:00:00Z"), NY, now)).toBe("3 days ago");
    expect(lastSignInLabel(new Date("2026-10-12T15:00:00Z"), NY, now)).toBe("Oct 12, 2026");
  });
});
