import { ArrowLeftIcon, UserCheckIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { checkInPeople, getMeeting } from "@/lib/attendance/queries";
import { meetingDateLabel } from "@/lib/attendance/year";
import { FORMAT_LABELS } from "@/lib/attendance/labels";
import { hasRole } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { AttendeesTable, DeleteMeetingButton, ExportMeetingButton, MeetingEditor } from "./meeting-detail";
import { PasteList } from "./paste-list";

export const metadata: Metadata = { title: "Meeting" };

export default function MeetingPage({ params }: PageProps<"/attendance/[id]">) {
  return (
    <div className="flex flex-col gap-4">
      <Link href="/attendance" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> Attendance
      </Link>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
        <MeetingView params={params} />
      </Suspense>
    </div>
  );
}

async function MeetingView({ params }: { params: PageProps<"/attendance/[id]">["params"] }) {
  const { id } = await params;
  const user = await requireUser();
  if (!z.uuid().safeParse(id).success) notFound();
  const data = await getMeeting(id);
  if (!data) notFound();
  const { meeting: m, attendees, unitsRepresented } = data;
  const canEdit = hasRole(user.role, "editor");
  const people = canEdit && m.status === "held" ? await checkInPeople() : [];

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{meetingDateLabel(m.date)}</h1>
          {m.title && <p className="text-muted-foreground">{m.title}</p>}
          <div className="mt-1 flex flex-wrap gap-1">
            <Badge variant={m.status === "held" ? "secondary" : "outline"}>{m.status === "held" ? "Held" : "Cancelled"}</Badge>
            <Badge variant="outline">{FORMAT_LABELS[m.format]}</Badge>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canEdit && m.status === "held" && (
            <Button asChild>
              <Link href={`/attendance/${m.id}/check-in`}>
                <UserCheckIcon /> Check people in
              </Link>
            </Button>
          )}
          <ExportMeetingButton meeting={m} attendees={attendees} />
          {hasRole(user.role, "admin") && <DeleteMeetingButton meetingId={m.id} checkIns={attendees.length} />}
        </div>
      </div>

      {m.status === "held" && (
        <p className="text-sm text-muted-foreground" role="status">
          {attendees.length} {attendees.length === 1 ? "person" : "people"} from {unitsRepresented.length}{" "}
          {unitsRepresented.length === 1 ? "unit" : "units"}
          {unitsRepresented.length > 0 && `: ${unitsRepresented.map((u) => u.label).join(", ")}`}
        </p>
      )}

      {canEdit && m.status === "held" && <PasteList meetingId={m.id} people={people} />}

      <AttendeesTable attendees={attendees} canEdit={canEdit} meetingId={m.id} />

      {canEdit && (
        <MeetingEditor
          meetingId={m.id}
          initial={{
            date: m.date,
            title: m.title ?? "",
            format: m.format as "in_person" | "virtual" | "hybrid",
            status: m.status as "held" | "cancelled",
            notes: m.notes ?? "",
          }}
        />
      )}
      {!canEdit && m.notes && <p className="text-sm whitespace-pre-wrap">{m.notes}</p>}
    </>
  );
}
