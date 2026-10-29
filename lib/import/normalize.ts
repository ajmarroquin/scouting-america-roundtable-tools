import { isValidEmail, normalizeEmail } from "@/lib/auth/emails";

/** Trims and collapses whitespace. Empty becomes null. */
export function clean(value: string | null | undefined): string | null {
  const v = (value ?? "").replace(/\s+/g, " ").trim();
  return v === "" ? null : v;
}

/** Title-cases names exported in all caps or all lowercase; leaves mixed case alone. */
export function nameCase(value: string | null | undefined): string | null {
  const v = clean(value);
  if (!v) return null;
  if (v !== v.toUpperCase() && v !== v.toLowerCase()) return v;
  return v.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

export function cleanEmail(value: string | null | undefined): string | null {
  const v = clean(value);
  if (!v) return null;
  const email = normalizeEmail(v);
  return isValidEmail(email) ? email : null;
}

/** US numbers become (212) 555-0101; anything else is kept as written. */
export function formatPhone(value: string | null | undefined): string | null {
  const v = clean(value);
  if (!v) return null;
  let digits = v.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (digits.length !== 10) return v;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/** The export mixes MM-DD-YY and M/D/YYYY in the same column. Returns YYYY-MM-DD. */
export function parseExportDate(value: string | null | undefined): string | null {
  const v = clean(value);
  if (!v) return null;
  const m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{2}|\d{4})$/.exec(v);
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const UNIT_TYPES = ["Pack", "Troop", "Crew", "Ship", "Post", "Club"] as const;

export function unitType(value: string | null | undefined): string | null {
  const v = clean(value)?.toLowerCase();
  return UNIT_TYPES.find((t) => t.toLowerCase() === v) ?? null;
}
