import { describe, expect, it } from "vitest";
import { brandFrom, DEFAULT_BRAND, readBrand } from "./brand";
import { FIRST_NAME, parseBlocks, renderAnnouncement, UNSUBSCRIBE_URL } from "./render";

const brand = { ...DEFAULT_BRAND, fromName: "Riverbend Roundtable Team", accent: "#b91c1c", footerLine: "Sample Council · Riverbend District" };

describe("parseBlocks", () => {
  it("splits a list out of a paragraph it shares a block with", () => {
    // The exact shape of a real test message that came out as plain lines.
    const blocks = parseBlocks("Here is another paragraph!\n- and a list\n- another item\nanother item\n**bolded item**");
    expect(blocks).toEqual([
      { kind: "para", lines: ["Here is another paragraph!"] },
      { kind: "list", ordered: false, items: ["and a list", "another item"] },
      { kind: "para", lines: ["another item", "**bolded item**"] },
    ]);
  });

  it("reads headings, numbered lists, buttons, and dividers", () => {
    expect(parseBlocks("# Big\n## Small\n1. one\n2) two\n---\n[button: RSVP here](https://example.org/rsvp)")).toEqual([
      { kind: "heading", level: 1, text: "Big" },
      { kind: "heading", level: 2, text: "Small" },
      { kind: "list", ordered: true, items: ["one", "two"] },
      { kind: "divider" },
      { kind: "button", label: "RSVP here", url: "https://example.org/rsvp" },
    ]);
  });

  it("starts a new list when bullets switch to numbers", () => {
    expect(parseBlocks("- a\n1. b").map((b) => b.kind === "list" && b.ordered)).toEqual([false, true]);
  });
});

describe("renderAnnouncement", () => {
  const body = [
    "Hi {first name},",
    "",
    "Roundtable is **Thursday, Nov 19** at 7pm. _Bring a friend._ Details: [the flyer](https://example.org/flyer?a=1&b=2) or https://example.org/rt.",
    "",
    "- Popcorn wrap-up",
    "- Recharter Q&A",
    "",
    "[button: RSVP](https://example.org/rsvp)",
  ].join("\n");
  const out = renderAnnouncement({ body, brand, previewText: "Popcorn, recharter, pizza", footerFrom: "Sent by Sam Rivera for the roundtable team" });

  it("brands the header, buttons, and links with the accent color", () => {
    expect(out.html).toContain("background:#b91c1c;padding:20px 32px");
    expect(out.html).toContain(">Riverbend Roundtable Team</td>");
    expect(out.html).toContain('<td style="background:#b91c1c;border-radius:8px"><a href="https://example.org/rsvp"');
    expect(out.html).toContain('<a href="https://example.org/flyer?a=1&amp;b=2" style="color:#b91c1c;text-decoration:underline">the flyer</a>');
    expect(out.html).toContain('<a href="https://example.org/rt" style="color:#b91c1c;text-decoration:underline">https://example.org/rt</a>.');
  });

  it("formats bold, italics, lists, and the greeting", () => {
    expect(out.html).toContain(`Hi ${FIRST_NAME},`);
    expect(out.html).toContain("<strong>Thursday, Nov 19</strong>");
    expect(out.html).toContain("<em>Bring a friend.</em>");
    expect(out.html).toContain('<li style="margin:0 0 6px">Recharter Q&amp;A</li>');
  });

  it("hides the preview text at the top, and ends with the footer and unsubscribe link", () => {
    expect(out.html).toMatch(/<div style="display:none[^"]*">Popcorn, recharter, pizza/);
    expect(out.html).toContain("Sample Council · Riverbend District<br>Sent by Sam Rivera for the roundtable team.");
    expect(out.html).toContain(`<a href="${UNSUBSCRIBE_URL}"`);
    expect(out.text).toContain(`Unsubscribe: ${UNSUBSCRIBE_URL}`);
  });

  it("keeps the text version readable", () => {
    expect(out.text.startsWith("Riverbend Roundtable Team\n")).toBe(true);
    expect(out.text).toContain("Roundtable is Thursday, Nov 19 at 7pm. Bring a friend. Details: the flyer (https://example.org/flyer?a=1&b=2)");
    expect(out.text).toContain("- Popcorn wrap-up\n- Recharter Q&A");
    expect(out.text).toContain("RSVP: https://example.org/rsvp");
  });

  it("escapes anything that looks like markup, and never links javascript:", () => {
    const evil = renderAnnouncement({
      body: '<script>alert(1)</script> [click](javascript:alert(1)) [button: Go](javascript:x)',
      brand: { ...brand, headerTitle: "<b>x</b>" },
      footerFrom: "A <b>team</b>",
    });
    expect(evil.html).not.toContain("<script>");
    expect(evil.html).not.toMatch(/href="javascript/i);
    expect(evil.html).toContain("&lt;script&gt;");
    expect(evil.html).toContain("&lt;b&gt;x&lt;/b&gt;");
  });

  it("uses a real name and a placeholder link for a test send", () => {
    const test = renderAnnouncement({ body, brand, footerFrom: "x", firstName: "Sam", unsubscribeUrl: "#" });
    expect(test.html).toContain("Hi Sam,");
    expect(test.html).not.toContain("RESEND_UNSUBSCRIBE_URL");
    const odd = renderAnnouncement({ body: "Hi {first name},", footerFrom: "x", firstName: "<i>Sam</i>" });
    expect(odd.html).toContain("Hi &lt;i&gt;Sam&lt;/i&gt;,");
    expect(odd.text).toContain("Hi <i>Sam</i>,");
  });

  it("shows a logo only from an https link", () => {
    const withLogo = renderAnnouncement({ body: "Hi", brand: { ...brand, logoUrl: "https://example.org/logo.png" }, footerFrom: "x" });
    expect(withLogo.html).toContain('<img src="https://example.org/logo.png"');
    expect(readBrand({ logoUrl: "http://example.org/logo.png" }).logoUrl).toBe("");
  });
});

describe("brand", () => {
  it("fills in defaults and rejects bad values", () => {
    expect(readBrand(null)).toEqual(DEFAULT_BRAND);
    expect(readBrand({ fromName: "GNYC Big Apple Roundtable Team" }).fromName).toBe("GNYC Big Apple Roundtable Team");
    expect(readBrand({ fromName: 'Evil" <x@y.z>' })).toEqual(DEFAULT_BRAND);
    expect(readBrand({ accent: "#00ff00" }).accent).toBe(DEFAULT_BRAND.accent);
  });

  it("builds the From header from the brand name and the verified address", () => {
    const b = readBrand({ fromName: "GNYC Big Apple Roundtable Team" });
    expect(brandFrom(b, "Roundtable Tools <no-reply@example.org>")).toBe('"GNYC Big Apple Roundtable Team" <no-reply@example.org>');
    expect(brandFrom(b, "no-reply@example.org")).toBe('"GNYC Big Apple Roundtable Team" <no-reply@example.org>');
    expect(brandFrom(b, null)).toBeNull();
  });
});
