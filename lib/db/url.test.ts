import { describe, expect, it } from "vitest";
import { databaseUrl } from "./url";

const prod = { DATABASE_URL: "postgres://pooled", DATABASE_URL_UNPOOLED: "postgres://direct" };

describe("databaseUrl", () => {
  it("uses the pooled URL by default and the direct URL for migrations", () => {
    expect(databaseUrl({ ...prod, VERCEL_ENV: "production" })).toBe("postgres://pooled");
    expect(databaseUrl({ ...prod, VERCEL_ENV: "production" }, "direct")).toBe("postgres://direct");
    expect(databaseUrl({ DATABASE_URL: "postgres://pooled" }, "direct")).toBe("postgres://pooled");
  });

  it("never gives a preview deployment the production database", () => {
    expect(databaseUrl({ ...prod, VERCEL_ENV: "preview" })).toBeUndefined();
    expect(databaseUrl({ ...prod, VERCEL_ENV: "preview" }, "direct")).toBeUndefined();
    expect(databaseUrl({ ...prod, VERCEL_ENV: "preview", PREVIEW_DATABASE_URL: "postgres://dev" })).toBe(
      "postgres://dev",
    );
  });
});
