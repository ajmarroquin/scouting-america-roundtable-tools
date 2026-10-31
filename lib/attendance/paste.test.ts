import { describe, expect, it } from "vitest";
import { cleanPastedName, parsePastedList } from "./paste";

describe("cleanPastedName", () => {
  it("strips labels, numbering, and emails", () => {
    expect(cleanPastedName("Alex Example (Host, me)")).toBe("Alex Example");
    expect(cleanPastedName("3. Pat Testcase")).toBe("Pat Testcase");
    expect(cleanPastedName("- Jordan Sample [Guest]")).toBe("Jordan Sample");
    expect(cleanPastedName("Casey Commish <casey@example.com>")).toBe("Casey Commish");
  });

  it("flips Last, First", () => {
    expect(cleanPastedName("Placeholder, James")).toBe("James Placeholder");
    expect(cleanPastedName("Del Rosario, Antonio")).toBe("Antonio Del Rosario");
  });
});

describe("parsePastedList", () => {
  it("reads one name per line, skipping blanks, headings, and repeats", () => {
    const text = "Participants (4)\n\nAlex Example\nJim Placeholder (Host)\nalex example\n12\n";
    expect(parsePastedList(text)).toEqual([
      { name: "Alex Example", email: null },
      { name: "Jim Placeholder", email: null },
    ]);
  });

  it("reads a Zoom participant report with a header row", () => {
    const text = [
      "Name (original name),User email,Join time,Leave time,Duration (minutes),Guest",
      "Alex Example,alex@example.com,11/19/2026 07:01:00 PM,11/19/2026 08:30:00 PM,89,No",
      "Pat T (Pat Testcase),,11/19/2026 07:05:00 PM,11/19/2026 08:30:00 PM,85,Yes",
      "Alex Example,alex@example.com,11/19/2026 07:40:00 PM,11/19/2026 08:30:00 PM,50,No",
    ].join("\n");
    expect(parsePastedList(text)).toEqual([
      { name: "Alex Example", email: "alex@example.com" },
      { name: "Pat T", email: null, altName: "Pat Testcase" },
    ]);
  });

  it("reads rows copied from a spreadsheet, and emails on their own lines", () => {
    expect(parsePastedList("Alex Example\tTroop 101\nquinn@example.com\nCasey Commish, casey@example.com")).toEqual([
      { name: "Alex Example", email: null },
      // An email alone has no name to match on, so it's dropped.
      { name: "Casey Commish", email: "casey@example.com" },
    ]);
  });

  it("returns nothing for empty text", () => {
    expect(parsePastedList("  \n ")).toEqual([]);
  });
});
