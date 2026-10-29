import { describe, expect, it } from "vitest";
import { trustedOriginsFromEnv } from "./origins";

describe("trustedOriginsFromEnv", () => {
  it("adds this project's Vercel hosts as https origins", () => {
    expect(
      trustedOriginsFromEnv({
        VERCEL_PROJECT_PRODUCTION_URL: "roundtable-tools.vercel.app",
        VERCEL_BRANCH_URL: "roundtable-tools-git-main.vercel.app",
        VERCEL_URL: "roundtable-tools-abc123.vercel.app",
      }),
    ).toEqual([
      "https://roundtable-tools.vercel.app",
      "https://roundtable-tools-git-main.vercel.app",
      "https://roundtable-tools-abc123.vercel.app",
    ]);
  });

  it("normalizes listed origins, skips junk, and dedupes", () => {
    expect(
      trustedOriginsFromEnv({
        BETTER_AUTH_TRUSTED_ORIGINS: "https://a.example.com/path, not a url, http://localhost:3000",
        VERCEL_URL: "a.example.com",
      }),
    ).toEqual(["https://a.example.com", "http://localhost:3000"]);
  });

  it("returns nothing outside Vercel with nothing configured", () => {
    expect(trustedOriginsFromEnv({})).toEqual([]);
  });
});
