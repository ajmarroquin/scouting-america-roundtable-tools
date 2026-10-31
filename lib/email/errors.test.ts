import { describe, expect, it } from "vitest";
import { emailFailureReason } from "./errors";

describe("emailFailureReason", () => {
  it("explains Resend's test-mode refusal", () => {
    const error = new Error(
      "Resend: validation_error: You can only send testing emails to your own email address (owner@example.com). To send emails to other recipients, please verify a domain at resend.com/domains.",
    );
    expect(emailFailureReason(error)).toMatch(/no verified sending domain/);
    expect(emailFailureReason(new Error("Resend: validation_error: The example.com domain is not verified."))).toMatch(
      /no verified sending domain/,
    );
  });

  it("names missing configuration", () => {
    expect(emailFailureReason(new Error("RESEND_API_KEY is not set"))).toMatch(/API key/);
    expect(emailFailureReason(new Error("Set EMAIL_FROM, or connect Resend so RESEND_EMAIL_DOMAIN is set"))).toMatch(
      /sender address/,
    );
  });

  it("passes anything else through, trimmed", () => {
    expect(emailFailureReason(new Error("Resend: application_error: Something broke"))).toBe(
      'Resend said "application_error: Something broke"',
    );
    expect(emailFailureReason(new Error(`Resend: ${"x".repeat(500)}`)).length).toBeLessThan(230);
  });
});
