import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { NotAllowed } from "@/components/not-allowed";
import { checkInPeople, getMeeting } from "@/lib/attendance/queries";
import { meetingDateLabel } from "@/lib/attendance/year";
import { hasRole } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { listUnits, positionsInUse } from "@/lib/contacts/queries";
import { CheckInBoard } from "./check-in-board";

export const metadata: Metadata = { title: "Check in" };

export default function CheckInPage({ params }: PageProps<"/attendance/[id]/check-in">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
      <CheckInView params={params} />
    </Suspense>
  );
}

async function CheckInView({ params }: { params: PageProps<"/attendance/[id]/check-in">["params"] }) {
  const { id } = await params;
  const user = await requireUser();
  if (!z.uuid().safeParse(id).success) notFound();
  if (!hasRole(user.role, "editor")) return <NotAllowed need="editor" />;
  const [data, people, units, fromRoster] = await Promise.all([getMeeting(id), checkInPeople(), listUnits(), positionsInUse()]);
  if (!data) notFound();
  const { meeting: m, attendees } = data;

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={`/attendance/${m.id}`}
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" /> {meetingDateLabel(m.date)}
      </Link>
      {m.status !== "held" ? (
        <p className="text-sm text-muted-foreground">This meeting is marked cancelled. Change it to held to check people in.</p>
      ) : (
        <CheckInBoard
          meetingId={m.id}
          people={people}
          checkedIn={attendees.map((a) => a.contactId)}
          units={units.filter((u) => u.active)}
          fromRoster={fromRoster}
        />
      )}
    </div>
  );
}
