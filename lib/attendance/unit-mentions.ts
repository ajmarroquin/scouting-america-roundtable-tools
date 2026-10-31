import { compareUnits, unitLabel } from "@/lib/contacts/format";

// Reads the free-text unit column from the old attendance sheets, such as
// "troop 1 b, g", "troop 662B, troop 662g, pack 662", or "crew 1/commissioner",
// and finds the units it names. Only units already in the app count, and only
// when the text picks out exactly one of them.

export type UnitMention = { type: string | null; number: number; gender: "B" | "G" | null };
export type KnownUnit = { id: string; type: string; number: number; genderAccepted: string | null };
export type UnitResolution = {
  /** Units the text names without doubt. */
  unitIds: string[];
  /** Mentions that matched no unit, or more than one, as written labels ("Troop 1", "Pack 909"). */
  unresolved: string[];
};

const TYPE_WORDS: Record<string, string> = {
  pack: "Pack",
  pk: "Pack",
  p: "Pack",
  troop: "Troop",
  tr: "Troop",
  t: "Troop",
  crew: "Crew",
  c: "Crew",
  ship: "Ship",
  post: "Post",
  club: "Club",
};

// A type word, a number with an optional B/G/F right after it, or a lone B/G
// that adds a second designation to the number before it ("troop 1 b, g").
const TOKEN = /\b(packs?|pk|troops?|tr|crews?|ships?|posts?|clubs?)\b|\b([ptc])(?=\s*#?\s*\d)|#?\s*(\d{1,5})\s*([bgf])?\b|\b([bg])\b/gi;

export function parseUnitMentions(text: string | null | undefined): UnitMention[] {
  const mentions: UnitMention[] = [];
  let type: string | null = null;
  let last: UnitMention | null = null;
  for (const m of (text ?? "").matchAll(TOKEN)) {
    const [, word, letterType, digits, suffix, lone] = m;
    if (word || letterType) {
      type = TYPE_WORDS[(word ?? letterType).toLowerCase().replace(/s$/, "")] ?? null;
      last = null;
    } else if (digits) {
      const g = suffix?.toUpperCase();
      last = { type, number: Number(digits), gender: g === "B" || g === "G" ? g : null };
      mentions.push(last);
    } else if (lone && last) {
      const prev: UnitMention = last;
      const g = lone.toUpperCase() as "B" | "G";
      if (prev.gender === null) prev.gender = g;
      else if (prev.gender !== g) {
        last = { type: prev.type, number: prev.number, gender: g };
        mentions.push(last);
      }
    }
  }
  // "troop 662B, troop 662B" names one unit.
  const seen = new Set<string>();
  return mentions.filter((x) => {
    const key = `${x.type}|${x.number}|${x.gender}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mentionLabel(m: UnitMention): string {
  return `${m.type ?? "Unit"} ${m.number}${m.gender ? ` ${m.gender}` : ""}`;
}

export function resolveUnitMentions(text: string | null | undefined, units: KnownUnit[]): UnitResolution {
  const unitIds: string[] = [];
  const unresolved: string[] = [];
  for (const m of parseUnitMentions(text)) {
    const hits = units.filter(
      (u) =>
        u.number === m.number &&
        (m.type === null || u.type === m.type) &&
        (m.gender === null || u.genderAccepted === m.gender),
    );
    if (hits.length === 1) {
      if (!unitIds.includes(hits[0].id)) unitIds.push(hits[0].id);
    } else {
      unresolved.push(
        hits.length > 1 && m.type === null ? `${m.number} (${hits.sort(compareUnits).map(unitLabel).join(" or ")})` : mentionLabel(m),
      );
    }
  }
  return { unitIds, unresolved };
}
