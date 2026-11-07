import type { Metadata } from "next";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { audienceOptions } from "@/lib/announcements/audiences";
import { senderEmail } from "@/lib/announcements/brand";
import { getBrand } from "@/lib/announcements/brand-store";
import { listAnnouncements, unsubscribedCount } from "@/lib/announcements/send";
import { upcomingMeetings } from "@/lib/attendance/queries";
import { meetingDateLabel } from "@/lib/attendance/year";
import { KIND_LABELS } from "@/lib/reminders/rules";
import { upcomingReminders } from "@/lib/reminders/service";
import Link from "next/link";
import { CronWarning } from "./reminders/cron-warning";
import { hasRole } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { senderAddress } from "@/lib/email/sender";
import { BrandSettings } from "./brand-settings";
import { Compose, Unsubscribes } from "./compose";

export const metadata: Metadata = { title: "Announcements" };

// Sending syncs the audience to Resend first, which can take a little while.
export const maxDuration = 60;

export default function AnnouncementsPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Announcements</h1>
        <p className="text-sm text-muted-foreground">
          Email a group from contacts through Resend. Every message has an unsubscribe link, and replies come to you.
        </p>
      </div>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
        <AnnouncementsData />
      </Suspense>
    </div>
  );
}

const dateTime = (d: Date) =>
  d.toLocaleString("en-US", { timeZone: process.env.APP_TIME_ZONE || "America/New_York", dateStyle: "medium", timeStyle: "short" });

async function AnnouncementsData() {
  const user = await requireUser();
  if (!hasRole(user.role, "admin")) return <p className="text-sm text-muted-foreground">Only admins can send announcements.</p>;
  const [audiences, history, unsubscribed, brand, meetings] = await Promise.all([
    audienceOptions(),
    listAnnouncements(),
    unsubscribedCount(),
    getBrand(),
    upcomingMeetings(),
  ]);
  const reminders = await upcomingReminders();
  const fromEmail = senderEmail(senderAddress(process.env));
  return (
    <>
      <Compose
        audiences={audiences}
        sender={{ name: user.name, email: user.email }}
        brand={brand}
        fromEmail={fromEmail}
        meetings={meetings}
      />
      <Unsubscribes count={unsubscribed} />
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Reminders</h2>
        <CronWarning />
        {reminders.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            None scheduled. Open an upcoming meeting and choose &ldquo;Draft the usual reminders&rdquo; for a week before and the day of.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Goes out</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead className="hidden md:table-cell">For</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reminders.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap text-sm">{meetingDateLabel(r.sendOn, "short")}, 9 am</TableCell>
                  <TableCell className="whitespace-normal">
                    <Link href={`/announcements/reminders/${r.id}`} className="font-medium underline-offset-4 hover:underline">
                      {r.subject}
                    </Link>
                    <div className="text-xs text-muted-foreground">{KIND_LABELS[r.kind]}</div>
                  </TableCell>
                  <TableCell className="hidden text-sm md:table-cell">{meetingDateLabel(r.meetingDate, "short")}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={r.status === "approved" || r.status === "sent" ? "secondary" : r.status === "failed" ? "destructive" : "outline"}>
                      {r.status === "draft" ? "Needs approval" : r.status === "approved" ? "Approved" : r.status === "sent" ? "Sent" : "Didn't send"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Sent</h2>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing sent yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead className="hidden md:table-cell">To</TableHead>
                <TableHead className="text-right">People</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="whitespace-nowrap text-sm">{dateTime(a.createdAt)}</TableCell>
                  <TableCell className="whitespace-normal">
                    <div className="font-medium">{a.subject}</div>
                    <div className="text-xs text-muted-foreground">
                      {a.sentByEmail}
                      {a.status === "failed" && (
                        <Badge variant="destructive" className="ml-2" title={a.error ?? undefined}>
                          Didn&apos;t send
                        </Badge>
                      )}
                    </div>
                    {a.status === "failed" && a.error && <div className="text-xs text-destructive">{a.error}</div>}
                  </TableCell>
                  <TableCell className="hidden text-sm md:table-cell">{a.audienceLabel}</TableCell>
                  <TableCell className="text-right tabular-nums">{a.status === "sent" ? a.recipients : ""}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
      {/* Keyed so a save resets the form to what was stored. */}
      <BrandSettings key={JSON.stringify(brand)} brand={brand} fromEmail={fromEmail} />
    </>
  );
}
