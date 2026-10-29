import { describe, expect, it } from "vitest";
import { isValidEmail, normalizeEmail, parseEmailList } from "./emails";

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Leader@Example.COM ")).toBe("leader@example.com");
  });
});

describe("isValidEmail", () => {
  it("rejects obvious junk", () => {
    expect(isValidEmail("leader@example.com")).toBe(true);
    expect(isValidEmail("leader@example")).toBe(false);
    expect(isValidEmail("leader example.com")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });
});

describe("parseEmailList", () => {
  it("splits on commas, semicolons, and whitespace, normalizes, and dedupes", () => {
    expect(parseEmailList(" A@example.com, b@example.com;a@example.com\nc@example.com ")).toEqual([
      "a@example.com",
      "b@example.com",
      "c@example.com",
    ]);
  });

  it("drops invalid entries and handles unset values", () => {
    expect(parseEmailList("not-an-email, ok@example.com")).toEqual(["ok@example.com"]);
    expect(parseEmailList(undefined)).toEqual([]);
    expect(parseEmailList("")).toEqual([]);
  });
});
