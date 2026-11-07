import { describe, expect, it } from "vitest";
import { FIRST_NAME, renderAnnouncement, UNSUBSCRIBE_URL } from "./render";

const body = [
  "Hi {first name},",
  "",
  "Roundtable is **Thursday, Nov 19** at 7pm. Details: https://example.org/rt?x=1&y=2.",
  "",
  "- Popcorn wrap-up",
  "- Recharter Q&A",
  "",
  "See you there.",
].join("\n");

describe("renderAnnouncement", () => {
  const out = renderAnnouncement({ body, footerFrom: "Sent by Sam Rivera for the roundtable team" });

  it("makes paragraphs, a list, bold, and links", () => {
    expect(out.html).toContain(`<p style="margin:0 0 16px">Hi ${FIRST_NAME},</p>`);
    expect(out.html).toContain("<strong>Thursday, Nov 19</strong>");
    expect(out.html).toContain('<a href="https://example.org/rt?x=1&amp;y=2" style="color:#1d4ed8">https://example.org/rt?x=1&amp;y=2</a>.');
    expect(out.html).toContain('<li style="margin:0 0 4px">Popcorn wrap-up</li><li style="margin:0 0 4px">Recharter Q&amp;A</li>');
  });

  it("always ends with an unsubscribe link Resend fills in", () => {
    expect(out.html).toContain(`<a href="${UNSUBSCRIBE_URL}"`);
    expect(out.text).toContain(`Unsubscribe: ${UNSUBSCRIBE_URL}`);
    expect(out.text).toContain("Sent by Sam Rivera for the roundtable team.");
  });

  it("escapes anything that looks like markup", () => {
    const evil = renderAnnouncement({ body: '<script>alert(1)</script> <img src=x onerror="y">', footerFrom: "A <b>team</b>" });
    expect(evil.html).not.toContain("<script>");
    expect(evil.html).not.toContain("<img");
    expect(evil.html).toContain("&lt;script&gt;");
    expect(evil.html).toContain("A &lt;b&gt;team&lt;/b&gt;");
  });

  it("uses a real name and a placeholder link for a test send", () => {
    const test = renderAnnouncement({ body, footerFrom: "x", firstName: "Sam", unsubscribeUrl: "#" });
    expect(test.html).toContain("Hi Sam,");
    expect(test.text.startsWith("Hi Sam,")).toBe(true);
    expect(test.html).not.toContain("RESEND_UNSUBSCRIBE_URL");
  });

  it("keeps the text version readable", () => {
    expect(out.text).toContain("Roundtable is Thursday, Nov 19 at 7pm.");
    expect(out.text).toContain("- Popcorn wrap-up");
  });
});
