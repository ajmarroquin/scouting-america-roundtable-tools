import { describe, expect, it } from "vitest";
import { senderAddress } from "./sender";

describe("senderAddress", () => {
  it("prefers EMAIL_FROM", () => {
    expect(
      senderAddress({ EMAIL_FROM: " Team <a@example.com> ", RESEND_EMAIL_DOMAIN: "mail.example.com" }),
    ).toBe("Team <a@example.com>");
  });

  it("falls back to the Resend integration's domain", () => {
    expect(senderAddress({ RESEND_EMAIL_DOMAIN: "Mail.Example.com" })).toBe(
      "Roundtable Tools <no-reply@mail.example.com>",
    );
  });

  it("ignores a domain value that isn't a hostname", () => {
    expect(senderAddress({ RESEND_EMAIL_DOMAIN: "https://example.com/x" })).toBeNull();
    expect(senderAddress({})).toBeNull();
  });
});
