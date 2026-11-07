import { describe, expect, it } from "vitest";
import { diff, draftWarnings, type EditorState, insertBlock, insertText, isUrl, link, prefixLines, TEMPLATES, wrap } from "./editor";
import { parseBlocks } from "./render";

// "a|b|c" marks the selection with pipes: one pipe is a cursor, two a selection.
function at(marked: string): EditorState {
  const start = marked.indexOf("|");
  const end = marked.indexOf("|", start + 1);
  const value = marked.replaceAll("|", "");
  return end === -1 ? { value, start, end: start } : { value, start, end: end - 1 };
}
function show(s: EditorState): string {
  if (s.start === s.end) return `${s.value.slice(0, s.start)}|${s.value.slice(s.start)}`;
  return `${s.value.slice(0, s.start)}|${s.value.slice(s.start, s.end)}|${s.value.slice(s.end)}`;
}

describe("wrap", () => {
  it("wraps the selection, keeping spaces outside the markers", () => {
    expect(show(wrap(at("See you |Thursday |at 7"), "**", "bold text"))).toBe("See you **|Thursday|** at 7");
  });
  it("inserts a placeholder to type over", () => {
    expect(show(wrap(at("Hi |"), "_", "italic text"))).toBe("Hi _|italic text|_");
  });
  it("takes the markers off when clicked again", () => {
    expect(show(wrap(wrap(at("a |b| c"), "**", "x"), "**", "x"))).toBe("a |b| c");
  });
});

describe("prefixLines", () => {
  it("makes each selected line a list item, numbering an ordered list", () => {
    expect(show(prefixLines(at("Intro\n|one\n\ntwo|\nAfter"), "bullet"))).toBe("Intro\n|- one\n\n- two|\nAfter");
    expect(prefixLines(at("|one\n- two|"), "numbered").value).toBe("1. one\n2. two");
  });
  it("swaps a heading for a list and back, and removes it when every line has it", () => {
    expect(prefixLines(at("# Big|"), "heading").value).toBe("## Big");
    expect(prefixLines(at("## Big|"), "heading").value).toBe("Big");
    expect(prefixLines(at("|1. a\n2. b|"), "numbered").value).toBe("a\nb");
  });
  it("starts an item on an empty line, with the cursor ready", () => {
    expect(show(prefixLines(at("Para\n\n|"), "bullet"))).toBe("Para\n\n- |");
    expect(show(prefixLines(at("|\nnext"), "bullet"))).toBe("- |\nnext");
  });
  it("doesn't pull in the next line when the selection ends at a line break", () => {
    expect(prefixLines(at("|one\n|two"), "bullet").value).toBe("- one\ntwo");
  });
});

describe("blocks and links", () => {
  it("puts a button on its own paragraph and selects the address", () => {
    expect(show(insertBlock(at("Come on by.|"), "[button: RSVP](https://)", "https://"))).toBe(
      "Come on by.\n\n[button: RSVP](|https://|)\n",
    );
    expect(show(insertBlock(at("one\n|\ntwo"), "---"))).toBe("one\n\n---\n|\ntwo");
  });
  it("links the selection, or a placeholder", () => {
    expect(show(link(at("See |the flyer|."), "https://example.org/f"))).toBe("See [the flyer](https://example.org/f)|.");
    expect(show(link(at("See |the flyer|.")))).toBe("See [the flyer](|https://|).");
    expect(show(link(at("See |.")))).toBe("See [|link text|](https://).");
    expect(show(insertText(at("Hi |there|,"), "{first name}"))).toBe("Hi {first name}|,");
    expect(isUrl(" https://example.org/a?b=1 ")).toBe(true);
    expect(isUrl("see https://example.org")).toBe(false);
  });
});

describe("draftWarnings", () => {
  it("flags unfinished links and bracketed spots, not real links", () => {
    expect(draftWarnings("[button: RSVP](https://)\nWe meet **[day, date]** at [place].")).toEqual([
      "A link or button still needs its web address.",
      "Fill in [day, date], [place].",
    ]);
    expect(draftWarnings("[the flyer](https://example.org) and [button: Go](https://example.org/go)")).toEqual([]);
  });
});

describe("templates", () => {
  it("each parse into a greeting, a heading, a list, and an unfinished spot to fill in", () => {
    for (const t of TEMPLATES) {
      const kinds = parseBlocks(t.body).map((b) => b.kind);
      expect(kinds).toContain("heading");
      expect(kinds).toContain("list");
      expect(t.body.startsWith("Hi {first name},")).toBe(true);
      expect(draftWarnings(t.body).length).toBeGreaterThan(0);
      expect(t.previewText.length).toBeLessThanOrEqual(150);
    }
  });
});

describe("diff", () => {
  it("finds the one changed span", () => {
    expect(diff("Hi there", "Hi **there**")).toEqual({ from: 3, to: 8, text: "**there**" });
    expect(diff("abc", "abc")).toEqual({ from: 3, to: 3, text: "" });
    expect(diff("aaa", "aa")).toEqual({ from: 2, to: 3, text: "" });
  });
});
