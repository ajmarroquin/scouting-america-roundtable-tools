"use client";

import { DownloadIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { attendanceLong, METHOD_LABELS } from "@/lib/attendance/export";
import type { Attendee } from "@/lib/attendance/queries";
import { downloadCsv } from "@/lib/export/download";
import { deleteMeetingAction, setRepresentedUnitAction, undoCheckInAction, updateMeetingAction } from "../actions";
import { MeetingFields, type MeetingValues } from "../meeting-fields";

type Result = { ok: boolean; message: string };

function report(result: Result) {
  if (result.ok) toast.success(result.message);
  else toast.error(result.message);
}

const ALL_UNITS = "__all";

export function AttendeesTable({ attendees, canEdit, meetingId }: { attendees: Attendee[]; canEdit: boolean; meetingId: string }) {
  const [pending, start] = useTransition();
  if (attendees.length === 0) return <p className="text-sm text-muted-foreground">Nobody checked in yet.</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Representing</TableHead>
          <TableHead className="hidden md:table-cell">How</TableHead>
          {canEdit && (
            <TableHead className="text-right">
              <span className="sr-only">Remove</span>
            </TableHead>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {attendees.map((a) => (
          <TableRow key={a.attendanceId}>
            <TableCell className="align-top">
              <Link href={`/contacts/${a.contactId}`} className="font-medium underline-offset-4 hover:underline">
                {a.name}
              </Link>
              {a.isYouth && (
                <Badge variant="secondary" className="ml-2">
                  Youth
                </Badge>
              )}
              <div className="text-xs text-muted-foreground">{a.email}</div>
            </TableCell>
            <TableCell className="align-top">
              {a.units.length === 0 ? (
                <span className="text-sm text-muted-foreground">No unit</span>
              ) : canEdit && a.units.length > 1 ? (
                <Select
                  value={a.representedUnitId ?? ALL_UNITS}
                  disabled={pending}
                  onValueChange={(v) => start(async () => report(await setRepresentedUnitAction(a.attendanceId, v === ALL_UNITS ? null : v)))}
                >
                  <SelectTrigger size="sm" aria-label={`Unit ${a.name} represented`} className="w-full max-w-56">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_UNITS}>All: {a.units.map((u) => u.label).join(", ")}</SelectItem>
                    {a.units.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        Only {u.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span className="text-sm">
                  {a.representedUnitId
                    ? a.units.find((u) => u.id === a.representedUnitId)?.label
                    : a.units.map((u) => u.label).join(", ")}
                </span>
              )}
            </TableCell>
            <TableCell className="hidden align-top text-sm text-muted-foreground md:table-cell">
              {METHOD_LABELS[a.method] ?? a.method}
            </TableCell>
            {canEdit && (
              <TableCell className="text-right align-top">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => start(async () => report(await undoCheckInAction(meetingId, a.contactId)))}
                >
                  Remove
                </Button>
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function MeetingEditor({ meetingId, initial }: { meetingId: string; initial: MeetingValues }) {
  const [values, setValues] = useState(initial);
  const [pending, start] = useTransition();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Edit meeting</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => report(await updateMeetingAction(meetingId, values)));
          }}
        >
          <MeetingFields idPrefix="edit" values={values} onChange={setValues} />
          <Button type="submit" className="w-fit" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function ExportMeetingButton({
  meeting,
  attendees,
}: {
  meeting: { id: string; date: string; title: string | null; status: string };
  attendees: Attendee[];
}) {
  return (
    <Button
      variant="outline"
      disabled={attendees.length === 0}
      onClick={() => {
        const long = attendanceLong(
          [meeting],
          attendees.map((a) => ({
            meetingId: meeting.id,
            contactId: a.contactId,
            name: a.name,
            email: a.email,
            units: a.units.map((u) => u.label),
            representing: a.units.find((u) => u.id === a.representedUnitId)?.label ?? null,
            method: a.method,
          })),
        );
        downloadCsv(`attendance-${meeting.date}.csv`, long.headers, long.rows);
      }}
    >
      <DownloadIcon /> Export
    </Button>
  );
}

export function DeleteMeetingButton({ meetingId, checkIns }: { meetingId: string; checkIns: number }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  if (!confirming) {
    return (
      <Button variant="ghost" onClick={() => setConfirming(true)}>
        Delete
      </Button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="destructive"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await deleteMeetingAction(meetingId);
            report(result);
            if (result.ok) router.push("/attendance");
          })
        }
      >
        {pending ? "Deleting…" : checkIns ? `Delete with ${checkIns} check-in${checkIns === 1 ? "" : "s"}` : "Delete for good"}
      </Button>
      <Button variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
        Cancel
      </Button>
    </div>
  );
}
