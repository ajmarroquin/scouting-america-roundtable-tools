export const UNIT_TYPE_ORDER = ["Pack", "Troop", "Crew", "Ship", "Post", "Club"] as const;

/** "Troop 101 B" for linked troops; packs, crews, and ships need no suffix. */
export function unitLabel(u: { type: string; number: number; genderAccepted: string | null }): string {
  const suffix = u.type === "Troop" && (u.genderAccepted === "B" || u.genderAccepted === "G") ? ` ${u.genderAccepted}` : "";
  return `${u.type} ${u.number}${suffix}`;
}

export function compareUnits(
  a: { type: string; number: number; genderAccepted: string | null },
  b: { type: string; number: number; genderAccepted: string | null },
): number {
  const ta = UNIT_TYPE_ORDER.indexOf(a.type as (typeof UNIT_TYPE_ORDER)[number]);
  const tb = UNIT_TYPE_ORDER.indexOf(b.type as (typeof UNIT_TYPE_ORDER)[number]);
  return ta - tb || a.number - b.number || (a.genderAccepted ?? "").localeCompare(b.genderAccepted ?? "");
}

export function contactName(c: { firstName: string; lastName: string; preferredName?: string | null }): string {
  return `${c.preferredName || c.firstName} ${c.lastName}`.trim();
}

export const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  not_in_roster: "Not in latest roster",
  archived: "Archived",
};

export const SOURCE_LABELS: Record<string, string> = {
  import: "Roster import",
  manual: "Added by hand",
  walk_in: "Walk-in",
};
