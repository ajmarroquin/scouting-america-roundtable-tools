import "server-only";
import { and, eq, gte, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db, type Tx } from "@/lib/db";
import { affiliation, attendance, attendanceUnit, meeting } from "@/lib/db/schema";
import { appToday } from "./today";
import { scoutingYearOf, yearRange } from "./year";

// Every check-in keeps the units it counts, however it was made (at the door, on
// their phone, from a pasted list or an old sheet). A person who was there counts
// for their units. Keeping them on the check-in means a past year's numbers stay
// put when someone moves to another unit later.

type Executor = typeof db | Tx;

const chunks = <T>(list: T[], size = 500) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));

/** A new check-in counts the unit it names, or else every unit on the person's record. */
export async function countCheckInUnits(tx: Executor, rows: { id: string; contactId: string; unitId: string | null }[]): Promise<void> {
  if (!rows.length) return;
  const needRecord = [...new Set(rows.filter((r) => !r.unitId).map((r) => r.contactId))];
  const record = needRecord.length
    ? await tx
        .selectDistinct({ contactId: affiliation.contactId, unitId: affiliation.unitId })
        .from(affiliation)
        .where(and(inArray(affiliation.contactId, needRecord), isNotNull(affiliation.unitId)))
    : [];
  const values = rows.flatMap((r) =>
    r.unitId
      ? [{ attendanceId: r.id, unitId: r.unitId, approved: true }]
      : record.filter((u) => u.contactId === r.contactId).map((u) => ({ attendanceId: r.id, unitId: u.unitId!, approved: true })),
  );
  for (const batch of chunks(values)) await tx.insert(attendanceUnit).values(batch).onConflictDoNothing();
  for (const batch of chunks(rows.map((r) => r.id))) await tx.update(attendance).set({ unitsConfirmed: true }).where(inArray(attendance.id, batch));
}

/**
 * A unit added to someone's record (by hand, from a check-in claim, or from a
 * roster import) also counts for their check-ins this scouting year. Earlier
 * years stay as they were, since people move between units. A check-in an
 * editor narrowed to one unit stays narrowed.
 */
export async function countNewUnitsThisYear(tx: Executor, added: { contactId: string; unitId: string | null }[]): Promise<void> {
  const pairs = added.filter((a): a is { contactId: string; unitId: string } => !!a.unitId);
  if (!pairs.length) return;
  const { start } = yearRange(scoutingYearOf(appToday()));
  const contactIds = [...new Set(pairs.map((p) => p.contactId))];
  const checkIns = await tx
    .select({ id: attendance.id, contactId: attendance.contactId })
    .from(attendance)
    .innerJoin(meeting, eq(meeting.id, attendance.meetingId))
    .where(and(inArray(attendance.contactId, contactIds), gte(meeting.date, start), isNull(attendance.unitId)));
  const values = checkIns.flatMap((c) => pairs.filter((p) => p.contactId === c.contactId).map((p) => ({ attendanceId: c.id, unitId: p.unitId, approved: true })));
  for (const batch of chunks(values)) {
    // A unit they'd claimed and an editor has now put on their record counts too.
    await tx
      .insert(attendanceUnit)
      .values(batch)
      .onConflictDoUpdate({ target: [attendanceUnit.attendanceId, attendanceUnit.unitId], set: { approved: sql`true` } });
  }
  for (const batch of chunks(checkIns.map((c) => c.id))) await tx.update(attendance).set({ unitsConfirmed: true }).where(inArray(attendance.id, batch));
}
