import { describe, expect, it } from "vitest";
import { signInCodeEmail } from "./sign-in-code";

describe("signInCodeEmail", () => {
  it("puts the code in the subject, text, and html", () => {
    const email = signInCodeEmail("123456");
    expect(email.subject).toContain("123456");
    expect(email.text).toContain("123456");
    expect(email.html).toContain("123456");
  });

  it("refuses anything but digits, so nothing can be injected into the html", () => {
    expect(() => signInCodeEmail("<script>")).toThrow();
    expect(() => signInCodeEmail("12 34")).toThrow();
  });
});
