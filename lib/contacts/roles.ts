import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { affiliation, unit } from "@/lib/db/schema";
import { compareUnits, formatRoles, unitLabel } from "./format";

/** Each contact's roles as a short line ("Cubmaster, Pack 662"), for lists that show people by name. */
export async function rolesFor(contactIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(contactIds)];
  const map = new Map<string, string>();
  if (!ids.length) return map;
  const rows = await db
    .select({ contactId: affiliation.contactId, position: affiliation.position, u: unit })
    .from(affiliation)
    .leftJoin(unit, eq(unit.id, affiliation.unitId))
    .where(inArray(affiliation.contactId, ids));
  rows.sort((a, b) => (a.u && b.u ? compareUnits(a.u, b.u) : 0));
  const grouped = new Map<string, { position: string; unit: string | null }[]>();
  for (const r of rows) grouped.set(r.contactId, [...(grouped.get(r.contactId) ?? []), { position: r.position, unit: r.u ? unitLabel(r.u) : null }]);
  for (const [id, roles] of grouped) map.set(id, formatRoles(roles));
  return map;
}
