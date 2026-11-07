import { describe, expect, it } from "vitest";
import { leftOutReason, reach, type ReachCandidate } from "./reach";

const person = (name: string, extra: Partial<ReachCandidate> = {}): ReachCandidate => ({
  contactId: name.toLowerCase(),
  name,
  email: `${name.toLowerCase()}@example.org`,
  isYouth: false,
  status: "active",
  unsubscribed: false,
  ...extra,
});

describe("reach", () => {
  it("sends to adults with an email, and says why everyone else is left out", () => {
    const result = reach([
      person("Riley"),
      person("Ava", { isYouth: true }),
      person("Ben", { status: "archived" }),
      person("Cam", { status: "not_in_roster" }),
      person("Dee", { email: null }),
      person("Eli", { email: "  " }),
      person("Fay", { unsubscribed: true }),
    ]);
    expect(result.members.map((m) => m.name)).toEqual(["Riley"]);
    expect(result.leftOut.map((p) => [p.name, p.reason])).toEqual([
      ["Ava", "youth"],
      ["Ben", "archived"],
      ["Cam", "not_in_roster"],
      ["Dee", "no_email"],
      ["Eli", "no_email"],
      ["Fay", "unsubscribed"],
    ]);
  });

  it("sends once per address, to the first by name, and names who gets it", () => {
    const result = reach([person("Sam Park", { email: "Family@Example.org" }), person("Pat Park", { email: "family@example.org" })]);
    expect(result.members.map((m) => m.name)).toEqual(["Pat Park"]);
    expect(result.leftOut).toMatchObject([{ name: "Sam Park", reason: "shared_email", sharedWith: "Pat Park" }]);
  });

  it("checks youth before anything else, so a youth is never just 'no email'", () => {
    expect(leftOutReason({ isYouth: true, email: null, status: "archived", unsubscribed: true })).toBe("youth");
    expect(leftOutReason({ isYouth: false, email: "a@b.c", status: "active", unsubscribed: false })).toBeNull();
  });
});
