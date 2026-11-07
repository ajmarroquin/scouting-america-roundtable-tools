import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { FORMAT_LABELS } from "@/lib/attendance/labels";
import { timeRange } from "@/lib/attendance/schedule";
import { appTimeZone } from "@/lib/attendance/today";
import { meetingDateLabel } from "@/lib/attendance/year";
import { clockIn, DEFAULT_LENGTH_MINUTES, zonedToUtc } from "@/lib/selfcheckin/rules";
import { publicMeeting, unitChoices } from "@/lib/selfcheckin/service";
import { SelfCheckIn } from "./self-check-in";

export const metadata: Metadata = { title: "Roundtable check-in" };

export default function MeetingPublicPage({ params }: PageProps<"/m/[token]">) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 py-8">
      <Suspense fallback={<div className="h-80 animate-pulse rounded-xl bg-muted" />}>
        <MeetingPublic params={params} />
      </Suspense>
    </main>
  );
}

/** What the "Add to calendar" file needs, when the meeting has a start time. */
function calendarFor(m: { id: string; date: string; startTime: string | null; endTime: string | null; title: string | null; place: string | null }, tz: string) {
  if (!m.startTime) return undefined;
  const start = zonedToUtc(m.date, m.startTime, tz);
  const end = m.endTime ? zonedToUtc(m.date, m.endTime, tz) : new Date(start.getTime() + DEFAULT_LENGTH_MINUTES * 60000);
  return { id: m.id, start: start.toISOString(), end: end.toISOString(), title: m.title ? `Roundtable: ${m.title}` : "Roundtable", place: m.place };
}

async function MeetingPublic({ params }: { params: PageProps<"/m/[token]">["params"] }) {
  await connection();
  const { token } = await params;
  const m = await publicMeeting(token);
  if (!m) notFound();
  const tz = appTimeZone();
  const w = m.window;
  const time = timeRange(m.startTime, m.endTime);

  return (
    <>
      <header className="flex flex-col gap-1">
        <p className="text-sm font-medium text-muted-foreground">{w.state === "open" ? "Roundtable check-in" : "Roundtable"}</p>
        <h1 className="text-2xl font-semibold">{meetingDateLabel(m.date)}</h1>
        {time && <p className="text-lg">{time}</p>}
        {m.title && <p className="text-muted-foreground">{m.title}</p>}
        {m.place && <p className="text-sm text-muted-foreground">{m.place}</p>}
        {m.format !== "in_person" && <p className="text-sm text-muted-foreground">{FORMAT_LABELS[m.format]}</p>}
      </header>
      {w.state === "open" ? (
        <SelfCheckIn token={token} units={await unitChoices()} mode="check_in" />
      ) : m.rsvpOpen ? (
        <>
          <p className="text-sm text-muted-foreground">
            Coming? Let us know.
            {w.state === "before" && ` Check-in opens here at ${clockIn(w.opensAt, tz)} on the day.`}
          </p>
          <SelfCheckIn token={token} units={[]} mode="rsvp" calendar={calendarFor(m, tz)} />
        </>
      ) : (
        <p className="rounded-xl border p-4 text-sm" role="status">
          {w.state === "before" && `Check-in opens at ${clockIn(w.opensAt, tz)}, 30 minutes before the start. Come back then.`}
          {w.state === "after" && "Check-in for this meeting has closed. Thanks for coming!"}
          {w.state === "no_time" && "Check-in isn't set up for this meeting yet. Check in with the volunteer at the table."}
          {w.state === "cancelled" && "This meeting was cancelled."}
        </p>
      )}
    </>
  );
}
