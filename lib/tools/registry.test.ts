import { describe, expect, it } from "vitest";
import { TOOLS, visibleTools } from "./registry";

describe("visibleTools", () => {
  it("hides admin tools from viewers and editors", () => {
    expect(visibleTools("viewer").map((t) => t.slug)).not.toContain("users");
    expect(visibleTools("editor").map((t) => t.slug)).not.toContain("users");
  });

  it("shows everything to admins", () => {
    expect(visibleTools("admin")).toHaveLength(TOOLS.length);
  });

  it("has unique slugs and hrefs", () => {
    expect(new Set(TOOLS.map((t) => t.slug)).size).toBe(TOOLS.length);
    expect(new Set(TOOLS.map((t) => t.href)).size).toBe(TOOLS.length);
  });
});
