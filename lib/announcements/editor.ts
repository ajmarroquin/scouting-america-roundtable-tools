// Text edits behind the announcement toolbar. Each takes the textarea's value
// and selection and returns the new value and selection, so they're easy to
// test and the component only has to apply them.

export type EditorState = { value: string; start: number; end: number };

/** Wraps the selection in a marker (`**` for bold), or inserts a placeholder to type over. */
export function wrap(s: EditorState, marker: string, placeholder: string): EditorState {
  const m = marker.length;
  // Clicking again on text that's already wrapped takes the markers off.
  if (s.start !== s.end && s.value.slice(s.start - m, s.start) === marker && s.value.slice(s.end, s.end + m) === marker) {
    const value = s.value.slice(0, s.start - m) + s.value.slice(s.start, s.end) + s.value.slice(s.end + m);
    return { value, start: s.start - m, end: s.end - m };
  }
  const selected = s.value.slice(s.start, s.end);
  // Keep spaces outside the markers: "**bold **" doesn't render as bold.
  const lead = selected.length - selected.trimStart().length;
  const trail = selected.length - selected.trimEnd().length;
  const inner = selected.trim() || placeholder;
  const from = s.start + (selected.trim() ? lead : 0);
  const to = s.end - (selected.trim() ? trail : 0);
  const value = s.value.slice(0, from) + marker + inner + marker + s.value.slice(to);
  return { value, start: from + marker.length, end: from + marker.length + inner.length };
}

const LINE_PREFIX = /^(\s*(?:[-*]|\d+[.)])\s+|#{1,2}\s+)/;

/**
 * Starts each selected line with a prefix ("- ", "1. ", "## "), replacing any
 * list or heading prefix already there. If every line already has it, removes it.
 */
export function prefixLines(s: EditorState, kind: "bullet" | "numbered" | "heading"): EditorState {
  const lineStart = s.start === 0 ? 0 : s.value.lastIndexOf("\n", s.start - 1) + 1;
  const endBreak = s.value.indexOf("\n", s.end > s.start && s.value[s.end - 1] === "\n" ? s.end - 1 : s.end);
  const lineEnd = endBreak === -1 ? s.value.length : endBreak;
  const lines = s.value.slice(lineStart, lineEnd).split("\n");
  const prefixFor = (n: number) => (kind === "bullet" ? "- " : kind === "numbered" ? `${n + 1}. ` : "## ");
  const has = (line: string, n: number) =>
    kind === "numbered" ? /^\s*\d+[.)]\s+/.test(line) : line.startsWith(prefixFor(n));
  const filled = lines.filter((l) => l.trim());
  if (!filled.length) {
    // An empty line gets the prefix and the cursor after it, ready to type.
    const block = prefixFor(0);
    const value = s.value.slice(0, lineStart) + block + s.value.slice(lineEnd);
    return { value, start: lineStart + block.length, end: lineStart + block.length };
  }
  const removing = filled.every((l, n) => has(l, n));
  let n = 0;
  const next = lines.map((line) => {
    if (!line.trim()) return line;
    const bare = line.replace(LINE_PREFIX, "");
    return removing ? bare : prefixFor(n++) + bare;
  });
  const block = next.join("\n");
  const value = s.value.slice(0, lineStart) + block + s.value.slice(lineEnd);
  // One line with the cursor in it: keep typing at the end of it.
  if (s.start === s.end && lines.length === 1) return { value, start: lineStart + block.length, end: lineStart + block.length };
  return { value, start: lineStart, end: lineStart + block.length };
}

/** Puts a block (a button, a divider) on a line of its own, selecting part of it to type over. */
export function insertBlock(s: EditorState, text: string, select?: string): EditorState {
  const before = s.value.slice(0, s.start);
  const after = s.value.slice(s.end);
  const lead = before === "" ? "" : before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  const tail = after === "" ? "\n" : after.startsWith("\n\n") ? "" : after.startsWith("\n") ? "\n" : "\n\n";
  const value = before + lead + text + tail + after;
  const blockAt = before.length + lead.length;
  if (select && text.includes(select)) {
    const at = blockAt + text.indexOf(select);
    return { value, start: at, end: at + select.length };
  }
  const caret = blockAt + text.length + tail.length;
  return { value, start: caret, end: caret };
}

/** Inserts text at the cursor, replacing any selection. */
export function insertText(s: EditorState, text: string): EditorState {
  const value = s.value.slice(0, s.start) + text + s.value.slice(s.end);
  return { value, start: s.start + text.length, end: s.start + text.length };
}

/** Turns the selection into a link. With a URL (a paste), it's done; without, the address is selected to type over. */
export function link(s: EditorState, url?: string): EditorState {
  const selected = s.value.slice(s.start, s.end).trim();
  const label = selected || "link text";
  const address = url ?? "https://";
  const text = `[${label}](${address})`;
  const value = s.value.slice(0, s.start) + text + s.value.slice(s.end);
  if (url) return { value, start: s.start + text.length, end: s.start + text.length };
  if (!selected) return { value, start: s.start + 1, end: s.start + 1 + label.length };
  const at = s.start + label.length + 3;
  return { value, start: at, end: at + address.length };
}

export const isUrl = (text: string) => /^https?:\/\/[^\s<>()]+$/.test(text.trim());

/**
 * Things a sender probably meant to finish: a link with no address, or a
 * [bracketed] spot from a template.
 */
export function draftWarnings(body: string): string[] {
  const warnings: string[] = [];
  if (/\]\(\s*(https?:\/\/)?\s*\)/.test(body)) warnings.push("A link or button still needs its web address.");
  const spots = [...new Set([...body.matchAll(/\[([^\]\n]{1,40})\](?!\()/g)].map((m) => m[0]))];
  if (spots.length) warnings.push(`Fill in ${spots.slice(0, 3).join(", ")}${spots.length > 3 ? ", and the rest" : ""}.`);
  return warnings;
}

/**
 * The smallest edit that turns one string into another, so the component can
 * apply it as a single insert and keep the browser's undo working.
 */
export function diff(before: string, after: string): { from: number; to: number; text: string } {
  let from = 0;
  while (from < before.length && from < after.length && before[from] === after[from]) from++;
  let tail = 0;
  while (tail < before.length - from && tail < after.length - from && before[before.length - 1 - tail] === after[after.length - 1 - tail]) tail++;
  return { from, to: before.length - tail, text: after.slice(from, after.length - tail) };
}

export type Template = { key: string; label: string; subject: string; previewText: string; body: string };

export const TEMPLATES: Template[] = [
  {
    key: "reminder",
    label: "Roundtable reminder",
    subject: "Roundtable is this Thursday",
    previewText: "District news, program ideas, and time to swap notes with other leaders.",
    body: [
      "Hi {first name},",
      "",
      "Our next roundtable is **[day, date] at [time]** at [place]. Every unit is welcome, and it's the best hour of the month for news you can use.",
      "",
      "## On the agenda",
      "- District and council updates",
      "- Program ideas for next month",
      "- Open Q&A",
      "",
      "[button: Let us know you're coming](https://)",
      "",
      "Bring a fellow leader. See you there!",
    ].join("\n"),
  },
  {
    key: "not-reached",
    label: "Invite units we haven't seen",
    subject: "We'd love to see your unit at roundtable",
    previewText: "One leader, one evening a month. Here's what you'd get.",
    body: [
      "Hi {first name},",
      "",
      "We haven't seen your unit at roundtable yet this year, and we'd love to change that. Roundtable is a monthly hour for unit leaders to get news first, swap ideas, and get answers.",
      "",
      "## Why come",
      "- Hear district and council news before it lands in your inbox",
      "- Pick up program ideas from other leaders",
      "- Bring your questions and leave with answers",
      "",
      "Our next one is **[day, date] at [time]** at [place]. One leader from your unit makes a difference.",
      "",
      "[button: Let us know you're coming](https://)",
      "",
      "Hope to see you there,",
    ].join("\n"),
  },
  {
    key: "recap",
    label: "Recap after roundtable",
    subject: "Roundtable recap",
    previewText: "What we covered, and what's coming up.",
    body: [
      "Hi {first name},",
      "",
      "Thanks to everyone who came out. Here's what we covered.",
      "",
      "## Highlights",
      "- [first update]",
      "- [second update]",
      "",
      "## Coming up",
      "- **[date]:** [event]",
      "",
      "Missed it? Reply to this email and we'll fill you in.",
    ].join("\n"),
  },
];
