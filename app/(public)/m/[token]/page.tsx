import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { FORMAT_LABELS } from "@/lib/attendance/labels";
import { timeRange } from "@/lib/attendance/schedule";
import { appTimeZone } from "@/lib/attendance/today";
import { meetingDateLabel } from "@/lib/attendance/year";
import { clockIn } from "@/lib/selfcheckin/rules";
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
        <p className="text-sm font-medium text-muted-foreground">Roundtable check-in</p>
        <h1 className="text-2xl font-semibold">{meetingDateLabel(m.date)}</h1>
        {time && <p className="text-lg">{time}</p>}
        {m.title && <p className="text-muted-foreground">{m.title}</p>}
        {m.format !== "in_person" && <p className="text-sm text-muted-foreground">{FORMAT_LABELS[m.format]}</p>}
      </header>
      {w.state === "open" ? (
        <SelfCheckIn token={token} units={await unitChoices()} />
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
