import { matchPerson, type MatchResult, type Scored } from "@/lib/attendance/match";
import { cleanEmail, nameCase } from "@/lib/import/normalize";

// Compares a list someone sent (a spreadsheet of names, emails, and phones, with
// no units) against contacts, to find who's already in contacts and who isn't.
// Pure, so the file can be read and matched in the browser without uploading it.

export type ListPerson = { firstName: string; lastName: string; suffix: string; email: string; phone: string };

export type ReadList = { people: ListPerson[]; used: string[]; skipped: number };

export const MAX_LIST = 3000;

/** A spreadsheet cell from ExcelJS (text, number, date, link, formula, rich text) as plain text. */
export function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    if (Array.isArray(o.richText)) return o.richText.map((r: { text?: string }) => r.text ?? "").join("").trim();
    if ("text" in o) return cellText(o.text);
    if ("result" in o) return cellText(o.result);
    if ("hyperlink" in o) return String(o.hyperlink).replace(/^mailto:/i, "").trim();
    return "";
  }
  return String(value).trim();
}

const COLUMNS = {
  first: [/^first( name)?$/, /first name/, /given name/, /^first/],
  last: [/^last( name)?$/, /last name/, /surname/, /family name/, /^last/],
  name: [/^(full )?name$/, /^(member|person|volunteer|contact) name$/],
  suffix: [/suffix/],
  email: [/^e-?mail( address)?$/, /e-?mail/],
  phone: [/^(phone|mobile|cell)/, /phone|mobile|cell/],
} as const;

type Field = keyof typeof COLUMNS;

function findColumns(header: string[]): Partial<Record<Field, number>> {
  const cells = header.map((h) => h.toLowerCase().replace(/\s+/g, " ").trim());
  const found: Partial<Record<Field, number>> = {};
  for (const field of Object.keys(COLUMNS) as Field[]) {
    for (const pattern of COLUMNS[field]) {
      const i = cells.findIndex((c, idx) => c && pattern.test(c) && !Object.values(found).includes(idx));
      if (i >= 0) {
        found[field] = i;
        break;
      }
    }
  }
  return found;
}

/** "Smith, Jane" or "Jane Q. Smith" from a single Name column. */
function splitName(full: string): { firstName: string; lastName: string } {
  const v = full.replace(/\s+/g, " ").trim();
  if (v.includes(",")) {
    const [last, first] = v.split(",", 2).map((s) => s.trim());
    return { firstName: first ?? "", lastName: last ?? "" };
  }
  const parts = v.split(" ");
  return parts.length === 1 ? { firstName: v, lastName: "" } : { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] };
}

/**
 * Finds the header row (in the first ten rows) and reads each person. It needs
 * first and last name columns, or one Name column; email and phone help matching.
 */
export function readList(table: string[][]): ReadList | { error: string } {
  const headerAt = table.slice(0, 10).findIndex((row) => {
    const c = findColumns(row);
    return (c.first !== undefined && c.last !== undefined) || c.name !== undefined;
  });
  if (headerAt < 0) return { error: "Couldn't find name columns. The list needs First Name and Last Name columns, or one Name column." };
  const header = table[headerAt];
  const col = findColumns(header);
  const at = (row: string[], i: number | undefined) => (i === undefined ? "" : (row[i] ?? "").replace(/\s+/g, " ").trim());
  const people: ListPerson[] = [];
  let skipped = 0;
  for (const row of table.slice(headerAt + 1)) {
    const names = col.first !== undefined ? { firstName: at(row, col.first), lastName: at(row, col.last) } : splitName(at(row, col.name));
    const email = at(row, col.email);
    if (!names.firstName && !names.lastName) {
      if (row.some((c) => c?.trim())) skipped++;
      continue;
    }
    people.push({
      firstName: nameCase(names.firstName) ?? "",
      lastName: nameCase(names.lastName) ?? "",
      suffix: at(row, col.suffix),
      email: cleanEmail(email) ?? "",
      phone: at(row, col.phone),
    });
  }
  if (!people.length) return { error: "Found the columns, but no names under them." };
  if (people.length > MAX_LIST) return { error: `That's ${people.length} people. Split it into lists of ${MAX_LIST} or fewer.` };
  const used = (["first", "last", "name", "suffix", "email", "phone"] as const).filter((f) => col[f] !== undefined).map((f) => header[col[f]!]);
  return { people, used, skipped };
}

export type CompareCandidate = {
  id: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  email: string | null;
  altEmail: string | null;
  phone: string | null;
};

/** The digits that identify a phone number: "+1 (212) 555-0101" and "2125550101" are the same. */
export function phoneDigits(value: string | null | undefined): string {
  let d = (value ?? "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  return d.length >= 7 ? d : "";
}

const SUFFIX = /[\s,]+(jr|sr|ii|iii|iv|v)\.?$/i;

/** One person on the list against every contact: matched, worth a look, or not in contacts. */
export function compareToContacts(p: ListPerson, people: CompareCandidate[]): MatchResult {
  const email = p.email.trim().toLowerCase();
  const phone = phoneDigits(p.phone);
  const name = `${p.firstName} ${p.lastName.replace(SUFFIX, "")}`.trim();
  const byName = name
    ? matchPerson(
        { name },
        people.map((c) => ({ ...c, email: null, units: [] })),
      )
    : { status: "none" as const, candidates: [] };
  const named = new Map(byName.candidates.map((c) => [c.id, c]));

  const scored: (Scored & { confirmed: boolean })[] = [];
  for (const c of people) {
    const emails = [c.email, c.altEmail].filter((e): e is string => !!e).map((e) => e.toLowerCase());
    const sameEmail = !!email && emails.includes(email);
    const samePhone = !!phone && phoneDigits(c.phone) === phone;
    const n = named.get(c.id);
    if (!sameEmail && !samePhone && !n) continue;
    const nameScore = n?.score ?? 0;
    const nameOk = nameScore >= 0.6;
    let score: number;
    let reason: string;
    if (sameEmail && nameOk) [score, reason] = [1, `same email, ${n!.reason}`];
    else if (samePhone && nameOk) [score, reason] = [0.99, `same phone, ${n!.reason}`];
    // A family often shares one email or phone: worth a look, never a match.
    else if (sameEmail) [score, reason] = [0.7, "same email but a different name"];
    else if (samePhone) [score, reason] = [0.6, "same phone but a different name"];
    else [score, reason] = [nameScore, n!.reason];

    const notes: string[] = [];
    if (email && !sameEmail) notes.push(emails.length ? "the email is different" : "the contact has no email");
    if (phone && !samePhone) notes.push(c.phone ? "the phone is different" : "the contact has no phone");
    scored.push({ id: c.id, score, reason: [reason, ...notes].join("; "), confirmed: (sameEmail || samePhone) && nameOk });
  }
  // An email or phone that agrees with the name beats a name alone.
  scored.sort((a, b) => Number(b.confirmed) - Number(a.confirmed) || b.score - a.score);
  const candidates = scored.slice(0, 5).map(({ id, score, reason }) => ({ id, score, reason }));
  const confirmed = scored.filter((s) => s.confirmed);
  const [best, next] = scored;

  let status: MatchResult["status"] = "none";
  if (confirmed.length === 1) status = "matched";
  else if (confirmed.length > 1) status = "review";
  else if (best && best.score >= 0.95 && (!next || next.score < best.score - 0.1)) status = "matched";
  else if (best && best.score >= 0.6) status = "review";
  return { status, candidates };
}
