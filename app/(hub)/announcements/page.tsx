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
import { AUDIENCES, audienceCounts } from "@/lib/announcements/audiences";
import { senderEmail } from "@/lib/announcements/brand";
import { getBrand } from "@/lib/announcements/brand-store";
import { listAnnouncements, unsubscribedCount } from "@/lib/announcements/send";
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
  const [counts, history, unsubscribed, brand] = await Promise.all([audienceCounts(), listAnnouncements(), unsubscribedCount(), getBrand()]);
  const fromEmail = senderEmail(senderAddress(process.env));
  return (
    <>
      <Compose
        audiences={AUDIENCES.map((a) => ({ key: a.key, label: a.label, description: a.description, count: counts[a.key] }))}
        sender={{ name: user.name, email: user.email }}
        brand={brand}
        fromEmail={fromEmail}
      />
      <Unsubscribes count={unsubscribed} />
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
