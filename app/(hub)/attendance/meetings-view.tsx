"use client";

import { DownloadIcon, FileUpIcon, UserCheckIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  const shown = meetings.filter((m) => scoutingYearOf(m.date) === year);
  const todays = meetings.find((m) => m.date === today && m.status === "held");
  const [values, setValues] = useState<MeetingValues>({ date: today, title: "", format: "in_person", status: "held", notes: "" });
  const [pending, start] = useTransition();

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
          <Link href={`/attendance/${todays.id}/check-in`}>
            <UserCheckIcon /> Check people in for today&apos;s roundtable
          </Link>
        </Button>
      )}

      {canEdit && (
        <Card>
          <CardHeader>
            <CardTitle>New meeting</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                start(async () => {
                  const result = await createMeetingAction(values);
                  if (result.ok && result.id) {
                    toast.success(result.message);
                    router.push(`/attendance/${result.id}`);
                  } else {
                    toast.error(result.message);
                    if (result.id) router.push(`/attendance/${result.id}`);
                  }
                });
              }}
            >
              <MeetingFields idPrefix="new" values={values} onChange={setValues} compact />
              <Button type="submit" className="w-fit" disabled={pending}>
                {pending ? "Adding…" : "Add meeting"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Select value={year} onValueChange={setYear}>
          <SelectTrigger aria-label="Scouting year" className="w-40">
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
        <p className="mr-auto text-sm text-muted-foreground" role="status">
          {shown.filter((m) => m.status === "held").length} held, {shown.filter((m) => m.status === "cancelled").length} cancelled
        </p>
        {canImport && (
          <Button variant="outline" size="sm" asChild>
            <Link href="/attendance/import">
              <FileUpIcon /> Load an old sheet
            </Link>
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={shown.length === 0}>
              <DownloadIcon /> Export {year}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => void exportYear("xlsx")}>Excel (both views)</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void exportYear("matrix")}>CSV, one row per person</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void exportYear("long")}>CSV, one row per check-in</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">No meetings in {year} yet.</p>
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
                  <Link href={`/attendance/${m.id}`} className="font-medium underline-offset-4 hover:underline">
                    {meetingDateLabel(m.date)}
                  </Link>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {m.status === "cancelled" && <Badge variant="outline">Cancelled</Badge>}
                    {m.format !== "in_person" && <Badge variant="secondary">{FORMAT_LABELS[m.format]}</Badge>}
                    {m.date === today && <Badge>Today</Badge>}
                  </div>
                </TableCell>
                <TableCell className="hidden sm:table-cell">{m.title}</TableCell>
                <TableCell className="text-right tabular-nums">{m.status === "held" ? m.attendees : ""}</TableCell>
                <TableCell className="text-right tabular-nums">{m.status === "held" ? m.units : ""}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
