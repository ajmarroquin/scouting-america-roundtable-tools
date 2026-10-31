export type Searchable = {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  email: string | null;
  units: string[];
};

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/**
 * People matching every word typed, best first: first or preferred names that
 * start with what was typed, then last names, then other matches.
 * "jim 101" finds Jim in Troop 101; "jose" finds José.
 */
export function searchPeople<T extends Searchable>(people: T[], query: string, limit = 25): T[] {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const scored: { p: T; score: number }[] = [];
  for (const p of people) {
    const given = [p.firstName, p.preferredName ?? ""].map(norm);
    const last = norm(p.lastName);
    const hay = [...given, last, norm(p.email ?? ""), ...p.units.map(norm)].join(" ");
    if (!words.every((w) => hay.includes(w))) continue;
    // A first or preferred name that starts with a typed word ranks above a last name that does.
    const score = words.reduce((n, w) => n + (given.some((g) => g.startsWith(w)) ? 2 : last.startsWith(w) ? 1 : 0), 0);
    scored.push({ p, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.p.lastName.localeCompare(b.p.lastName) || a.p.name.localeCompare(b.p.name))
    .slice(0, limit)
    .map((s) => s.p);
}
