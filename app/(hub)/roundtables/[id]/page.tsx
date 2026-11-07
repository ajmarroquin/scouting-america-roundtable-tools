import { ArrowLeftIcon, UserCheckIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { checkInPeople, getMeeting } from "@/lib/attendance/queries";
import { hhmm, isUpcoming, timeRange } from "@/lib/attendance/schedule";
import { appTimeZone, appToday } from "@/lib/attendance/today";
import { checkInWindow, clockIn } from "@/lib/selfcheckin/rules";
import { KIND_LABELS } from "@/lib/reminders/rules";
import { remindersFor } from "@/lib/reminders/service";
import { openReviews, rsvpsFor } from "@/lib/selfcheckin/service";
import { meetingDateLabel } from "@/lib/attendance/year";
import { FORMAT_LABELS } from "@/lib/attendance/labels";
import { hasRole } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { AttendeesTable, DeleteMeetingButton, ExportMeetingButton, MeetingEditor } from "./meeting-detail";
import { CoverageCards } from "./coverage-cards";
import { PasteList } from "./paste-list";
import { RemindersCard } from "./reminders-card";
import { ReviewList } from "./review-list";
import { SelfCheckInCard } from "./self-check-in-card";

export const metadata: Metadata = { title: "Meeting" };

export default function MeetingPage({ params }: PageProps<"/roundtables/[id]">) {
  return (
    <div className="flex flex-col gap-4">
      <Link href="/roundtables" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> Roundtables
      </Link>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
        <MeetingView params={params} />
      </Suspense>
    </div>
  );
}

async function MeetingView({ params }: { params: PageProps<"/roundtables/[id]">["params"] }) {
  const { id } = await params;
  const user = await requireUser();
  if (!z.uuid().safeParse(id).success) notFound();
  const data = await getMeeting(id);
  if (!data) notFound();
  const { meeting: m, attendees, unitsRepresented } = data;
  const canEdit = hasRole(user.role, "editor");
  const today = appToday();
  const upcoming = m.status === "held" && isUpcoming(m.date, today);
  // Check-in and the numbers start on the day; until then it's just on the calendar.
  const held = m.status === "held" && !upcoming;
  // Upcoming meetings get RSVPs, and new people from them, so they have a review list too.
  const [people, reviews, rsvps] = await Promise.all([
    canEdit && m.status === "held" ? checkInPeople() : [],
    canEdit && m.status === "held" ? openReviews(m.id) : [],
    m.status === "held" ? rsvpsFor(m.id) : { yes: [], no: [] },
  ]);
  const isAdmin = hasRole(user.role, "admin");
  const reminderItems = isAdmin && m.status === "held" ? await remindersFor(m.id) : [];
  const tz = appTimeZone();
  const w = checkInWindow(m, new Date(), tz);
  const selfStatus =
    w.state === "no_time"
      ? "Add a start time below to open it. People can check themselves in from 30 minutes before the start to 30 minutes after the end."
      : w.state === "before"
        ? `Opens at ${clockIn(w.opensAt, tz)} on ${meetingDateLabel(m.date, "short")} and closes at ${clockIn(w.closesAt, tz)}. You can share the link ahead of time.`
        : w.state === "open"
          ? `Open now, until ${clockIn(w.closesAt, tz)}.`
          : w.state === "after"
            ? `Closed at ${clockIn(w.closesAt, tz)}.`
            : "";

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{meetingDateLabel(m.date)}</h1>
          {m.startTime && <p className="text-sm text-muted-foreground">{timeRange(m.startTime, m.endTime)}</p>}
          {(m.place || m.joinUrl) && (
            <p className="text-sm text-muted-foreground">
              {m.place}
              {m.place && m.joinUrl && " · "}
              {m.joinUrl && (
                <a href={m.joinUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                  Join link
                </a>
              )}
            </p>
          )}
          {m.title && <p className="text-muted-foreground">{m.title}</p>}
          <div className="mt-1 flex flex-wrap gap-1">
            <Badge variant={held ? "secondary" : "outline"}>{upcoming ? "Upcoming" : held ? "Held" : "Cancelled"}</Badge>
            <Badge variant="outline">{FORMAT_LABELS[m.format]}</Badge>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canEdit && held && (
            <Button asChild>
              <Link href={`/roundtables/${m.id}/check-in`}>
                <UserCheckIcon /> Check people in
              </Link>
            </Button>
          )}
          <ExportMeetingButton meeting={m} attendees={attendees} />
          {hasRole(user.role, "admin") && <DeleteMeetingButton meetingId={m.id} checkIns={attendees.length} />}
        </div>
      </div>

      {upcoming && (
        <p className="text-sm text-muted-foreground" role="status">
          This meeting hasn&apos;t happened yet. Check-in opens on the day, and it counts toward the numbers after that.
        </p>
      )}

      {held && (
        <p className="text-sm text-muted-foreground" role="status">
          {attendees.length} {attendees.length === 1 ? "person" : "people"} from {unitsRepresented.length}{" "}
          {unitsRepresented.length === 1 ? "unit" : "units"}
          {unitsRepresented.length > 0 && `: ${unitsRepresented.map((u) => u.label).join(", ")}`}
        </p>
      )}

      {canEdit && <ReviewList reviews={reviews} people={people} />}

      {held && <CoverageCards meetingId={m.id} date={m.date} />}

      {canEdit && held && <PasteList meetingId={m.id} people={people} />}

      {!upcoming && <AttendeesTable attendees={attendees} canEdit={canEdit} meetingId={m.id} />}

      {(rsvps.yes.length > 0 || rsvps.no.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>RSVPs</CardTitle>
            <CardDescription>
              {rsvps.yes.length} coming, {rsvps.no.length} can&apos;t make it. From the meeting&apos;s link, before check-in opens.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
            {[
              { label: "Coming", people: rsvps.yes },
              { label: "Can't make it", people: rsvps.no },
            ].map((g) => (
              <div key={g.label}>
                <p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">{g.label}</p>
                {g.people.length ? (
                  <ul className="flex flex-col gap-0.5">
                    {g.people.map((p) => (
                      <li key={p.contactId}>
                        <Link href={`/contacts/${p.contactId}`} className="underline-offset-4 hover:underline">
                          {p.name}
                        </Link>
                        {p.roles && <span className="text-muted-foreground"> · {p.roles}</span>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground">Nobody yet.</p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {isAdmin && m.status === "held" && (upcoming || m.date === today || reminderItems.length > 0) && (
        <RemindersCard
          meetingId={m.id}
          canDraft={m.date >= today}
          items={reminderItems.map((r) => ({
            id: r.id,
            kindLabel: KIND_LABELS[r.kind],
            sendLabel: meetingDateLabel(r.sendOn, "short"),
            subject: r.subject,
            status: r.status,
            error: r.error,
          }))}
        />
      )}

      {canEdit && m.status === "held" && (
        <SelfCheckInCard meetingId={m.id} token={m.publicToken} status={selfStatus} fileName={`roundtable-check-in-${m.date}.png`} />
      )}

      {canEdit && (
        <MeetingEditor
          meetingId={m.id}
          today={today}
          initial={{
            date: m.date,
            startTime: hhmm(m.startTime),
            endTime: hhmm(m.endTime),
            place: m.place ?? "",
            joinUrl: m.joinUrl ?? "",
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
