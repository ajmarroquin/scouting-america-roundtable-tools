// Matches a name typed somewhere else (an old sheet, a Zoom report) to a contact.
// Confident matches are taken as-is; anything less goes to a person to review.

export type MatchCandidate = {
  id: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  email: string | null;
  units: string[];
};

export type MatchInput = { name: string; email?: string | null; unitHint?: string | null };

export type Scored = { id: string; score: number; reason: string };

export type MatchResult = {
  /** matched: safe to use. review: a person should confirm. none: probably someone new. */
  status: "matched" | "review" | "none";
  candidates: Scored[];
};

export const AUTO_MATCH = 0.95;
const REVIEW = 0.6;

// Common English nicknames. Each group is one name.
const NICKNAME_GROUPS = [
  ["abigail", "abby", "abbie"],
  ["alexander", "alex", "al", "xander"],
  ["alexandra", "alex", "lexi", "sandra"],
  ["andrew", "andy", "drew"],
  ["anthony", "tony"],
  ["barbara", "barb", "barbie"],
  ["benjamin", "ben", "benny"],
  ["catherine", "cathy", "cat", "kate", "katie"],
  ["katherine", "kathy", "kate", "katie", "kat"],
  ["christopher", "chris", "topher"],
  ["christine", "chris", "christy", "tina"],
  ["daniel", "dan", "danny"],
  ["david", "dave", "davey"],
  ["deborah", "deb", "debbie"],
  ["donald", "don", "donny"],
  ["edward", "ed", "eddie", "ted"],
  ["elizabeth", "liz", "beth", "betsy", "lisa", "eliza", "betty"],
  ["frederick", "fred", "freddie"],
  ["gregory", "greg"],
  ["jacqueline", "jackie"],
  ["james", "jim", "jimmy", "jamie"],
  ["jeffrey", "jeff"],
  ["jennifer", "jen", "jenny"],
  ["jessica", "jess", "jessie"],
  ["john", "jack", "johnny"],
  ["jonathan", "jon", "johnny"],
  ["joseph", "joe", "joey"],
  ["joshua", "josh"],
  ["kenneth", "ken", "kenny"],
  ["lawrence", "larry"],
  ["margaret", "maggie", "meg", "peggy", "marge"],
  ["matthew", "matt"],
  ["michael", "mike", "mikey", "mick"],
  ["nicholas", "nick", "nicky"],
  ["patricia", "pat", "patty", "trish"],
  ["patrick", "pat", "paddy"],
  ["peter", "pete"],
  ["raymond", "ray"],
  ["rebecca", "becky", "becca"],
  ["richard", "rick", "rich", "dick", "ricky"],
  ["robert", "rob", "bob", "bobby", "robbie", "bert"],
  ["ronald", "ron", "ronnie"],
  ["samantha", "sam", "sammy"],
  ["samuel", "sam", "sammy"],
  ["stephen", "steve", "stevie"],
  ["steven", "steve", "stevie"],
  ["susan", "sue", "suzy"],
  ["theodore", "ted", "teddy", "theo"],
  ["thomas", "tom", "tommy"],
  ["timothy", "tim", "timmy"],
  ["victoria", "vicky", "tori"],
  ["william", "will", "bill", "billy", "liam", "willy"],
];

const NICKNAMES = new Map<string, Set<string>>();
for (const group of NICKNAME_GROUPS) {
  for (const name of group) {
    const set = NICKNAMES.get(name) ?? new Set<string>();
    for (const other of group) set.add(other);
    NICKNAMES.set(name, set);
  }
}

export function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Jaro-Winkler similarity, 0 to 1. Catches small typos like Neil/Niel. */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const range = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aHit = new Array<boolean>(a.length).fill(false);
  const bHit = new Array<boolean>(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = Math.max(0, i - range); j < Math.min(b.length, i + range + 1); j++) {
      if (!bHit[j] && a[i] === b[j]) {
        aHit[i] = bHit[j] = true;
        matches++;
        break;
      }
    }
  }
  if (!matches) return 0;
  let k = 0;
  let transpositions = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aHit[i]) continue;
    while (!bHit[k]) k++;
    if (a[i] !== b[k++]) transpositions++;
  }
  const jaro = (matches / a.length + matches / b.length + (matches - transpositions / 2) / matches) / 3;
  let prefix = 0;
  while (prefix < 4 && a[prefix] === b[prefix]) prefix++;
  return jaro + prefix * 0.1 * (1 - jaro);
}

function firstNameScore(typed: string, c: MatchCandidate): { score: number; reason: string } {
  const names = [c.firstName, c.preferredName ?? ""].map(normalizeName).filter(Boolean);
  const firsts = names.map((n) => n.split(" ")[0]);
  if (firsts.includes(typed)) return { score: 1, reason: "same first name" };
  if (firsts.some((f) => NICKNAMES.get(typed)?.has(f))) return { score: 0.95, reason: "nickname" };
  if (typed.length >= 3 && firsts.some((f) => f.startsWith(typed) || typed.startsWith(f))) {
    return { score: 0.85, reason: "short form of the first name" };
  }
  if (typed.length === 1 && firsts.some((f) => f.startsWith(typed))) return { score: 0.5, reason: "first initial" };
  const best = Math.max(...firsts.map((f) => similarity(typed, f)));
  if (best >= 0.9) return { score: 0.8, reason: "first name spelled a little differently" };
  return { score: 0, reason: "" };
}

function lastNameScore(typedTokens: string[], c: MatchCandidate): { score: number; reason: string } {
  const last = normalizeName(c.lastName);
  if (!last) return { score: 0, reason: "" };
  // "Antonio Del Rosario": try every tail of the typed name against the last name.
  for (let i = 0; i < typedTokens.length; i++) {
    if (typedTokens.slice(i).join(" ") === last) return { score: 1, reason: "same last name" };
  }
  const typedLast = typedTokens[typedTokens.length - 1] ?? "";
  // "Allison T" is worth a look, never an automatic match.
  if (typedLast.length === 1 && last.startsWith(typedLast)) return { score: 0.75, reason: "last initial" };
  if (last.split(/[\s-]/).includes(typedLast)) return { score: 0.9, reason: "part of the last name" };
  if (similarity(typedLast, last) >= 0.92) return { score: 0.8, reason: "last name spelled a little differently" };
  return { score: 0, reason: "" };
}

function scoreCandidate(input: MatchInput, tokens: string[], c: MatchCandidate): Scored | null {
  if (input.email && c.email && input.email.trim().toLowerCase() === c.email.toLowerCase()) {
    return { id: c.id, score: 1, reason: "same email" };
  }
  if (!tokens.length) return null;
  const first = firstNameScore(tokens[0], c);
  if (!first.score) return null;
  let score: number;
  let reason: string;
  if (tokens.length === 1) {
    // Just a first name ("Jeri"): never enough on its own.
    score = first.score === 1 ? REVIEW : first.score * REVIEW;
    reason = "first name only";
  } else {
    const last = lastNameScore(tokens.slice(1), c);
    if (!last.score) return null;
    score = first.score * last.score;
    reason = last.score === 1 && first.score === 1 ? "same name" : `${first.reason}, ${last.reason}`;
  }
  if (input.unitHint && c.units.length) {
    const hint = normalizeName(input.unitHint).replace(/\s/g, "");
    if (c.units.some((u) => hint.includes(normalizeName(u).replace(/\s/g, "")))) {
      score = Math.min(1, score + 0.05);
      reason += ", same unit";
    }
  }
  return { id: c.id, score: Math.round(score * 1000) / 1000, reason };
}

export function matchPerson(input: MatchInput, people: MatchCandidate[]): MatchResult {
  const tokens = normalizeName(input.name).split(" ").filter(Boolean);
  const candidates = people
    .map((c) => scoreCandidate(input, tokens, c))
    .filter((s): s is Scored => s !== null && s.score >= 0.4)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  const [best, next] = candidates;
  if (!best) return { status: "none", candidates };
  if (best.score >= AUTO_MATCH && (!next || next.score < best.score - 0.1)) return { status: "matched", candidates };
  if (best.score >= REVIEW) return { status: "review", candidates };
  return { status: "none", candidates };
}
