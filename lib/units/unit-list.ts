import Papa from "papaparse";
import { parseExportDate } from "@/lib/import/normalize";

// Reads Scouting America's "Unit Membership Totals" report (OLR Membership
// Status Summary): a few lines about the report, then one row per unit with its
// current youth and adult counts. It has no unit IDs, so units are matched by
// type, number, and designation. Counts only; no people.

export const UNIT_TYPES = ["Pack", "Troop", "Crew", "Ship", "Post", "Club"] as const;

export type ListedUnit = {
  type: (typeof UNIT_TYPES)[number];
  number: number;
  genderAccepted: "B" | "G" | "F" | null;
  district: string;
  subdistrict: string | null;
  youth: number;
  adults: number;
};

export type UnitList = {
  /** "Date Report Generated", as YYYY-MM-DD. */
  asOf: string | null;
  districts: string[];
  units: ListedUnit[];
  /** Unit names that didn't parse, to show the person loading the list. */
  unreadable: string[];
};

const NAME = /^(pack|troop|crew|ship|post|club)\s+0*(\d{1,5})\s*(?:\(([bgf])\))?$/i;

/** "Sample - Sub Dist. #1 30" → "Sub Dist. #1". */
function cleanSubdistrict(value: string | undefined): string | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  return v.replace(/^.*?\s-\s/, "").replace(/\s+\d+$/, "").trim() || null;
}

const count = (value: string | undefined) => {
  const n = Number.parseInt((value ?? "").trim(), 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

export function parseUnitList(text: string): UnitList | { error: string } {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const headerAt = lines.findIndex((l) => /(^|,|")\.*unitname("|,|$)/i.test(l));
  if (headerAt < 0) return { error: 'This doesn\'t look like the Unit Membership Totals report. It needs a "unitname" column.' };

  const generated = lines.slice(0, headerAt).find((l) => /^date report generated:/i.test(l.trim()));
  const asOf = generated ? parseExportDate(generated.split(":").slice(1).join(":")) : null;

  const rows = Papa.parse<Record<string, string>>(lines.slice(headerAt).join("\n"), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.replace(/^\.+/, "").trim().toLowerCase(),
  }).data;

  const units: ListedUnit[] = [];
  const unreadable: string[] = [];
  for (const r of rows) {
    const name = (r.unitname ?? "").trim();
    if (!name) continue;
    const m = NAME.exec(name);
    if (!m) {
      unreadable.push(name);
      continue;
    }
    const type = UNIT_TYPES.find((t) => t.toLowerCase() === m[1].toLowerCase())!;
    units.push({
      type,
      number: Number(m[2]),
      genderAccepted: (m[3]?.toUpperCase() as "B" | "G" | "F" | undefined) ?? null,
      district: (r.districtname ?? "").trim(),
      subdistrict: cleanSubdistrict(r.subdistrictname),
      youth: count(r.youth_current),
      adults: count(r.adult_current),
    });
  }
  if (!units.length && !unreadable.length) return { error: "The report has no units in it." };
  return { asOf, districts: [...new Set(units.map((u) => u.district))].filter(Boolean), units, unreadable };
}

export type ExistingUnit = { id: string; type: string; number: number; genderAccepted: string | null };

export type UnitListPlan = {
  /** On the list and already in the app. */
  matched: { id: string; unit: ListedUnit }[];
  /** On the list with a new designation, such as a girls troop that's now a family troop. */
  changed: { id: string; from: string | null; unit: ListedUnit }[];
  /** On the list with members, and not in the app yet. */
  created: ListedUnit[];
  /** On the list with no members and not in the app: left out. */
  skipped: ListedUnit[];
};

const key = (u: { type: string; number: number; genderAccepted: string | null }) => `${u.type}|${u.number}|${u.genderAccepted ?? ""}`;

/** Matches the list to units already in the app by type, number, and designation. */
export function planUnitList(existing: ExistingUnit[], listed: ListedUnit[]): UnitListPlan {
  const plan: UnitListPlan = { matched: [], changed: [], created: [], skipped: [] };
  const byKey = new Map(existing.map((u) => [key(u), u]));
  const claimed = new Set<string>();
  const exact = listed.map((l) => byKey.get(key(l)));
  for (const e of exact) if (e) claimed.add(e.id);

  listed.forEach((l, i) => {
    const hit = exact[i];
    if (hit) return void plan.matched.push({ id: hit.id, unit: l });
    // One unit with this type and number on each side: the designation changed.
    const sameNumber = (u: { type: string; number: number }) => u.type === l.type && u.number === l.number;
    const others = existing.filter((u) => sameNumber(u) && !claimed.has(u.id));
    if (others.length === 1 && listed.filter(sameNumber).length === 1) {
      claimed.add(others[0].id);
      return void plan.changed.push({ id: others[0].id, from: others[0].genderAccepted, unit: l });
    }
    if (l.youth + l.adults > 0) plan.created.push(l);
    else plan.skipped.push(l);
  });
  return plan;
}
