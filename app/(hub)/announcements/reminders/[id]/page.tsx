import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { audienceInfo, audienceMembers, audienceOptions } from "@/lib/announcements/audiences";
import { senderEmail } from "@/lib/announcements/brand";
import { getBrand } from "@/lib/announcements/brand-store";
import { upcomingMeetings } from "@/lib/attendance/queries";
import { meetingDateLabel } from "@/lib/attendance/year";
import { hasRole } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { senderAddress } from "@/lib/email/sender";
import { KIND_LABELS } from "@/lib/reminders/rules";
import { getReminder, timingFor } from "@/lib/reminders/service";
import { Compose } from "../../compose";
import { CronWarning } from "../cron-warning";

export const metadata: Metadata = { title: "Reminder" };
export const maxDuration = 60;

export default function ReminderPage({ params }: PageProps<"/announcements/reminders/[id]">) {
  return (
    <div className="flex flex-col gap-4">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
        <ReminderView params={params} />
      </Suspense>
    </div>
  );
}

async function ReminderView({ params }: { params: PageProps<"/announcements/reminders/[id]">["params"] }) {
  const user = await requireUser();
  if (!hasRole(user.role, "admin")) return <p className="text-sm text-muted-foreground">Only admins can send announcements and reminders.</p>;
  const { id } = await params;
  const r = await getReminder(id);
  if (!r) notFound();
  const [options, brand, meetings] = await Promise.all([audienceOptions(), getBrand(), upcomingMeetings()]);
  // Its audience may not be in the usual list (a meeting further out), so add it.
  if (!options.some((o) => o.key === r.audience)) {
    const info = await audienceInfo(r.audience);
    if (info) options.push({ ...info, count: (await audienceMembers(r.audience)).length });
  }
  return (
    <>
      <Link href={`/roundtables/${r.meetingId}`} className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> {meetingDateLabel(r.meetingDate)}
        {r.meetingTitle ? ` · ${r.meetingTitle}` : ""}
      </Link>
      <CronWarning />
      <Compose
        audiences={options}
        sender={{ name: user.name, email: user.email }}
        brand={brand}
        fromEmail={senderEmail(senderAddress(process.env))}
        meetings={meetings}
        initial={{ audience: r.audience, subject: r.subject, previewText: r.previewText ?? "", body: r.body }}
        reminder={{
          id: r.id,
          kindLabel: KIND_LABELS[r.kind],
          sendLabel: meetingDateLabel(r.sendOn),
          status: r.status,
          approvedByName: r.approvedByName,
          error: r.error,
          timing: timingFor(r),
        }}
      />
    </>
  );
}
