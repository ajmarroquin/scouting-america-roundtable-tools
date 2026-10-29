import { describe, expect, it } from "vitest";
import { hasRole, isRole } from "./roles";

describe("hasRole", () => {
  it("ranks admin over editor over viewer", () => {
    expect(hasRole("admin", "editor")).toBe(true);
    expect(hasRole("editor", "editor")).toBe(true);
    expect(hasRole("viewer", "editor")).toBe(false);
    expect(hasRole("editor", "admin")).toBe(false);
  });

  it("gives unknown or missing roles no access", () => {
    expect(hasRole("superuser", "viewer")).toBe(false);
    expect(hasRole("", "viewer")).toBe(false);
    expect(hasRole(null, "viewer")).toBe(false);
    expect(hasRole(undefined, "viewer")).toBe(false);
  });
});

describe("isRole", () => {
  it("accepts only known roles", () => {
    expect(isRole("viewer")).toBe(true);
    expect(isRole("Admin")).toBe(false);
    expect(isRole(1)).toBe(false);
  });
});
