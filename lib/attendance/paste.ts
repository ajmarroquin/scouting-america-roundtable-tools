import Papa from "papaparse";

// Turns a pasted list into names (and emails when present): one name per line,
// a Zoom or Teams participant report, or a column copied from a spreadsheet.

/** `altName` is Zoom's "original name" when someone renamed themselves in the meeting. */
export type PastedPerson = { name: string; email: string | null; altName?: string };

const EMAIL = /[^\s<>(),;"']+@[^\s<>(),;"']+\.[a-z]{2,}/i;
const JUNK = /^(participants?|attendees?|names?|in the meeting|in this meeting|waiting room|host|guests?|\d+)$/i;

/** "Jane Doe (Host)" → "Jane Doe"; "3. Jane Doe" → "Jane Doe"; "Doe, Jane" → "Jane Doe". */
export function cleanPastedName(raw: string): string {
  let name = raw
    .replace(EMAIL, " ")
    .replace(/[<>]/g, " ")
    .replace(/\((?:[^)]*)\)|\[(?:[^\]]*)\]/g, " ")
    .replace(/^\s*(?:\d+[.)]|[-•*–])\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
  const lastFirst = /^([^\s,]+(?:[ -][^\s,]+)?),\s*([^\s,]+(?: [^\s,]+)?)$/.exec(name);
  if (lastFirst) name = `${lastFirst[2]} ${lastFirst[1]}`;
  return name.replace(/[,;]+$/, "").trim();
}

function fromHeaderedTable(rows: string[][]): PastedPerson[] | null {
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const nameCol = header.findIndex((h) => /name/.test(h) && !/user ?name|email/.test(h));
  const emailCol = header.findIndex((h) => /e-?mail/.test(h));
  if (nameCol < 0) return null;
  const originals = /original/.test(header[nameCol]);
  return rows.slice(1).map((r) => {
    const cell = r[nameCol] ?? "";
    const original = originals ? /\(([^)]*)\)\s*$/.exec(cell)?.[1] : undefined;
    const person: PastedPerson = {
      name: cleanPastedName(cell),
      email: emailCol >= 0 ? (EMAIL.exec(r[emailCol] ?? "")?.[0] ?? null) : null,
    };
    const alt = original ? cleanPastedName(original) : "";
    if (alt && alt.toLowerCase() !== person.name.toLowerCase()) person.altName = alt;
    return person;
  });
}

export function parsePastedList(text: string): PastedPerson[] {
  const trimmed = text.replace(/^﻿/, "").trim();
  if (!trimmed) return [];
  let people: PastedPerson[] | null = null;

  const firstLine = trimmed.split(/\r?\n/, 1)[0];
  if (/[\t,]/.test(firstLine) && /name/i.test(firstLine)) {
    const rows = Papa.parse<string[]>(trimmed, { skipEmptyLines: "greedy" }).data;
    people = fromHeaderedTable(rows);
  }
  if (!people) {
    people = trimmed.split(/\r?\n/).map((line) => {
      const email = EMAIL.exec(line)?.[0] ?? null;
      // A copied row: take the first cell that has letters and isn't the email.
      const cells = line.includes("\t") ? line.split("\t") : [line];
      const cell = cells.find((c) => /\p{L}/u.test(c.replace(EMAIL, ""))) ?? "";
      return { name: cleanPastedName(cell), email };
    });
  }

  const seen = new Set<string>();
  return people.filter((p) => {
    if (!/\p{L}/u.test(p.name) || JUNK.test(p.name)) return false;
    const key = (p.email ?? p.name).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
