import type { Cell } from "@/lib/export/csv";
import { meetingDateLabel } from "./year";

export type ExportMeeting = { id: string; date: string; title: string | null; status: string };

export type ExportAttendance = {
  meetingId: string;
  contactId: string;
  name: string;
  email: string | null;
  units: string[];
  representing: string | null;
  method: string;
};

export const METHOD_LABELS: Record<string, string> = {
  check_in: "Checked in",
  walk_in: "Walk-in",
  pasted_list: "Pasted list",
  legacy_import: "Old sheet",
  manual: "Added by hand",
};

/**
 * People by meetings, "Attended" in each cell: the shape of the old Google
 * Sheet. Held meetings only, oldest first. Most-attended people first.
 */
export function attendanceMatrix(meetings: ExportMeeting[], rows: ExportAttendance[]): { headers: string[]; rows: Cell[][] } {
  const held = meetings.filter((m) => m.status === "held").sort((a, b) => a.date.localeCompare(b.date));
  const people = new Map<string, { name: string; email: string | null; units: string[]; attended: Set<string> }>();
  for (const r of rows) {
    const p = people.get(r.contactId) ?? { name: r.name, email: r.email, units: r.units, attended: new Set<string>() };
    p.attended.add(r.meetingId);
    people.set(r.contactId, p);
  }
  const sorted = [...people.values()].sort((a, b) => b.attended.size - a.attended.size || a.name.localeCompare(b.name));
  const headers = ["Name", "Email", "Units", ...held.map((m) => meetingDateLabel(m.date, "short")), "Meetings attended"];
  const body: Cell[][] = sorted.map((p) => [
    p.name,
    p.email,
    p.units.join("; "),
    ...held.map((m) => (p.attended.has(m.id) ? "Attended" : "")),
    held.filter((m) => p.attended.has(m.id)).length,
  ]);
  const headcount: Cell[] = ["Headcount", "", "", ...held.map((m) => rows.filter((r) => r.meetingId === m.id).length), ""];
  return { headers, rows: [...body, headcount] };
}

/** One row per check-in, for pivot tables. */
export function attendanceLong(meetings: ExportMeeting[], rows: ExportAttendance[]): { headers: string[]; rows: Cell[][] } {
  const byId = new Map(meetings.map((m) => [m.id, m]));
  const sorted = [...rows].sort(
    (a, b) => (byId.get(a.meetingId)?.date ?? "").localeCompare(byId.get(b.meetingId)?.date ?? "") || a.name.localeCompare(b.name),
  );
  return {
    headers: ["Date", "Meeting", "Name", "Email", "Units", "Representing", "How"],
    rows: sorted.map((r) => {
      const m = byId.get(r.meetingId);
      return [m?.date ?? "", m?.title ?? "", r.name, r.email, r.units.join("; "), r.representing, METHOD_LABELS[r.method] ?? r.method];
    }),
  };
}
