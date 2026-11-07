export const ROLES = ["viewer", "editor", "admin"] as const;

export type Role = (typeof ROLES)[number];

const RANK: Record<Role, number> = { viewer: 1, editor: 2, admin: 3 };

export const ROLE_LABELS: Record<Role, string> = {
  viewer: "Viewer",
  editor: "Editor",
  admin: "Admin",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  viewer: "Can see contacts, units, attendance, and the council report, export lists, and copy emails.",
  editor: "Can also add and edit contacts, units, and groups, set up meetings, and check people in.",
  admin: "Can also manage users, send announcements, load rosters, unit lists, and old sheets, and delete records.",
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** True when `role` is at least `min`. Unknown roles get no access. */
export function hasRole(role: string | null | undefined, min: Role): boolean {
  return isRole(role) && RANK[role] >= RANK[min];
}
