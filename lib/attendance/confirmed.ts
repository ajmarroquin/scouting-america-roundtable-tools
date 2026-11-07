import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { attendanceUnit } from "@/lib/db/schema";

/**
 * For check-ins where the person said which units they represent (self
 * check-in), the units that count: the approved ones. Other check-ins aren't
 * in the map and keep the older rule.
 */
export async function confirmedUnits(rows: { id: string; unitsConfirmed: boolean }[]): Promise<Map<string, string[]>> {
  const ids = rows.filter((r) => r.unitsConfirmed).map((r) => r.id);
  const map = new Map<string, string[]>(ids.map((id) => [id, []]));
  if (!ids.length) return map;
  const units = await db
    .select({ attendanceId: attendanceUnit.attendanceId, unitId: attendanceUnit.unitId })
    .from(attendanceUnit)
    .where(and(inArray(attendanceUnit.attendanceId, ids), eq(attendanceUnit.approved, true)));
  for (const u of units) map.get(u.attendanceId)!.push(u.unitId);
  return map;
}
