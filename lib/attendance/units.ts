// Which units count as represented at a meeting. Shared by the meeting page,
// the meetings list, and (next) the coverage metric, so they always agree.

export type AttendeeUnits = {
  /** The unit they said they came for, if anyone recorded one. */
  representedUnitId: string | null;
  /** Every unit the person is affiliated with. */
  unitIds: string[];
  /** Units the person confirmed at self check-in (approved only). When set, only these count, even if empty. */
  confirmedUnitIds?: string[] | null;
};

/**
 * A recorded unit counts on its own. Otherwise every unit the attendee
 * belongs to counts, including units added by hand for "Multiple" registrations.
 */
export function unitsRepresented(attendees: AttendeeUnits[]): Set<string> {
  const units = new Set<string>();
  for (const a of attendees) {
    if (a.confirmedUnitIds) for (const id of a.confirmedUnitIds) units.add(id);
    else if (a.representedUnitId) units.add(a.representedUnitId);
    else for (const id of a.unitIds) units.add(id);
  }
  return units;
}
