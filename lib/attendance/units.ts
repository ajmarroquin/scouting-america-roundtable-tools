// Which units count as represented at a meeting. Shared by the meeting page,
// the meetings list, and (next) the coverage metric, so they always agree.

export type AttendeeUnits = {
  /** The unit they said they came for, if anyone recorded one. */
  representedUnitId: string | null;
  /** Every unit the person is affiliated with. */
  unitIds: string[];
};

/**
 * A recorded unit counts on its own. Otherwise every unit the attendee
 * belongs to counts, including units added by hand for "Multiple" registrations.
 */
export function unitsRepresented(attendees: AttendeeUnits[]): Set<string> {
  const units = new Set<string>();
  for (const a of attendees) {
    if (a.representedUnitId) units.add(a.representedUnitId);
    else for (const id of a.unitIds) units.add(id);
  }
  return units;
}
