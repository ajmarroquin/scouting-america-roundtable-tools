"use client";

import { DownloadIcon, FileUpIcon, UserCheckIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { AddButton, AddPanel, MoreMenu, Toolbar, ToolbarActions, ToolbarSearch, ToolbarSummary } from "@/components/list-toolbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { attendanceLong, attendanceMatrix } from "@/lib/attendance/export";
import type { MeetingRow } from "@/lib/attendance/queries";
import { isUpcoming, savedDetails, suggestedTimes, timeRange } from "@/lib/attendance/schedule";
import { meetingDateLabel, scoutingYearOf } from "@/lib/attendance/year";
import { FORMAT_LABELS } from "@/lib/attendance/labels";
import { downloadCsv, downloadXlsx } from "@/lib/export/download";
import { createMeetingAction, exportAttendanceAction } from "./actions";
import { MeetingFields, type MeetingValues } from "./meeting-fields";

export function MeetingsView({
  meetings,
  today,
  currentYear,
  canEdit,
  canImport,
}: {
  meetings: MeetingRow[];
  today: string;
  currentYear: string;
  canEdit: boolean;
  canImport: boolean;
}) {
  const router = useRouter();
  const years = useMemo(
    () => [...new Set([currentYear, ...meetings.map((m) => scoutingYearOf(m.date))])].sort().reverse(),
    [meetings, currentYear],
  );
  const [year, setYear] = useState(currentYear);
  const [query, setQuery] = useState("");
  const inYear = meetings.filter((m) => scoutingYearOf(m.date) === year);
  const q = query.trim().toLowerCase();
  const shown = inYear.filter(
    (m) => !q || `${meetingDateLabel(m.date)} ${m.title ?? ""} ${m.place ?? ""} ${FORMAT_LABELS[m.format] ?? ""}`.toLowerCase().includes(q),
  );
  const todays = meetings.find((m) => m.date === today && m.status === "held");
  const [values, setValues] = useState<MeetingValues>(() => {
    const times = suggestedTimes(meetings);
    // Start from the latest meeting's details, so the same room and Zoom link don't get typed every month.
    const latest = [...meetings].sort((a, b) => b.date.localeCompare(a.date))[0];
    const saved = savedDetails(meetings);
    return {
      date: today,
      startTime: times.start,
      endTime: times.end,
      title: "",
      place: saved.places[0] ?? "",
      joinUrl: saved.joinUrls[0] ?? "",
      format: (latest?.format as MeetingValues["format"]) ?? "in_person",
      status: "held",
      notes: "",
    };
  });
  // Counts are for the whole year, whatever the search shows.
  const held = inYear.filter((m) => m.status === "held" && !isUpcoming(m.date, today)).length;
  const upcoming = inYear.filter((m) => m.status === "held" && isUpcoming(m.date, today)).length;
  const cancelled = inYear.filter((m) => m.status === "cancelled").length;
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);

  async function exportYear(kind: "xlsx" | "matrix" | "long") {
    const data = await exportAttendanceAction(year);
    if (!data.ok) return void toast.error(data.message);
    const matrix = attendanceMatrix(data.meetings, data.rows);
    const long = attendanceLong(data.meetings, data.rows);
    const base = `attendance-${year}`;
    if (kind === "matrix") downloadCsv(`${base}-matrix.csv`, matrix.headers, matrix.rows);
    else if (kind === "long") downloadCsv(`${base}-by-check-in.csv`, long.headers, long.rows);
    else
      await downloadXlsx(`${base}.xlsx`, [
        { name: "By person", ...matrix },
        { name: "By check-in", ...long },
      ]);
  }

  return (
    <div className="flex flex-col gap-4">
      {todays && canEdit && (
        <Button size="lg" className="w-full sm:w-fit" asChild>
          <Link href={`/roundtables/${todays.id}/check-in`}>
            <UserCheckIcon /> Check people in for today&apos;s roundtable
          </Link>
        </Button>
      )}

      <Toolbar>
        <ToolbarSearch label="Search meetings" placeholder="Search topics, places, dates" value={query} onChange={setQuery} />
        <ToolbarSummary>
          {held} held{upcoming > 0 && `, ${upcoming} upcoming`}, {cancelled} cancelled
          {q && ` · ${shown.length} of ${inYear.length} shown`}
        </ToolbarSummary>
        <ToolbarActions>
          {canEdit && (
            <AddButton open={adding} onOpenChange={setAdding} controls="new-meeting">
              Add meeting
            </AddButton>
          )}
          <MoreMenu label="More roundtable actions">
            {canImport && (
              <>
                <DropdownMenuItem asChild>
                  <Link href="/roundtables/import">
                    <FileUpIcon /> Load an old sheet
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuLabel>Export {year}</DropdownMenuLabel>
            <DropdownMenuItem disabled={inYear.length === 0} onSelect={() => void exportYear("xlsx")}>
              <DownloadIcon /> Excel (both views)
            </DropdownMenuItem>
            <DropdownMenuItem disabled={inYear.length === 0} onSelect={() => void exportYear("matrix")}>
              <DownloadIcon /> CSV, one row per person
            </DropdownMenuItem>
            <DropdownMenuItem disabled={inYear.length === 0} onSelect={() => void exportYear("long")}>
              <DownloadIcon /> CSV, one row per check-in
            </DropdownMenuItem>
          </MoreMenu>
        </ToolbarActions>
      </Toolbar>

      {canEdit && adding && (
        <AddPanel id="new-meeting" title="New meeting">
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const result = await createMeetingAction(values);
                if (result.ok && result.id) {
                  toast.success(result.message);
                  router.push(`/roundtables/${result.id}`);
                } else {
                  toast.error(result.message);
                  if (result.id) router.push(`/roundtables/${result.id}`);
                }
              });
            }}
          >
            <MeetingFields idPrefix="new" values={values} onChange={setValues} today={today} saved={savedDetails(meetings)} compact />
            <div className="flex gap-2">
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Save meeting"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </AddPanel>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Select value={year} onValueChange={setYear}>
          <SelectTrigger aria-label="Scouting year" className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={y}>
                {y} scouting year
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">{inYear.length ? "No meetings match." : `No meetings in ${year} yet.`}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead className="hidden sm:table-cell">Title</TableHead>
              <TableHead className="text-right">People</TableHead>
              <TableHead className="text-right">Units</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((m) => (
              <TableRow key={m.id}>
                <TableCell>
                  <Link href={`/roundtables/${m.id}`} className="font-medium underline-offset-4 hover:underline">
                    {meetingDateLabel(m.date)}
                  </Link>
                  {m.startTime && <div className="text-xs text-muted-foreground">{timeRange(m.startTime, m.endTime)}</div>}
                  <div className="mt-1 flex flex-wrap gap-1">
                    {m.status === "cancelled" && <Badge variant="outline">Cancelled</Badge>}
                    {m.status === "held" && isUpcoming(m.date, today) && <Badge variant="outline">Upcoming</Badge>}
                    {m.format !== "in_person" && <Badge variant="secondary">{FORMAT_LABELS[m.format]}</Badge>}
                    {m.date === today && <Badge>Today</Badge>}
                  </div>
                </TableCell>
                <TableCell className="hidden sm:table-cell">{m.title}</TableCell>
                <TableCell className="text-right tabular-nums">{m.status === "held" && !isUpcoming(m.date, today) ? m.attendees : ""}</TableCell>
                <TableCell className="text-right tabular-nums">{m.status === "held" && !isUpcoming(m.date, today) ? m.units : ""}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
