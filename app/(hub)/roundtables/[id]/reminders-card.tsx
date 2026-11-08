"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { deleteReminderAction, draftUsualRemindersAction, sendReminderNowAction } from "../../announcements/actions";

type Item = {
  id: string;
  kindLabel: string;
  sendLabel: string;
  subject: string;
  status: "draft" | "approved" | "sent" | "failed";
  error: string | null;
  /** Late (goes at the next 9 am run) or too late to send. */
  timing: { note: string; tooLate: boolean } | null;
  /** Who a reminder that didn't send would reach if sent now ("Said yes (2 people)"); null when it can't be. */
  retryTo: string | null;
};

const STATUS: Record<Item["status"], string> = { draft: "Draft, not approved", approved: "Approved", sent: "Sent", failed: "Didn't send" };

/** A meeting's reminders: drafted ahead, approved by an admin, sent at 9 am on their day. */
export function RemindersCard({ meetingId, items, canDraft }: { meetingId: string; items: Item[]; canDraft: boolean }) {
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState<string | null>(null);
  const run = (action: () => Promise<{ ok: boolean; message: string }>) =>
    start(async () => {
      const r = await action();
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
    });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Reminders</CardTitle>
        <CardDescription>A week before and the day of, at 9 am. Nothing sends until an admin approves the exact message.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {items.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{r.kindLabel}</span>
                <span className="text-muted-foreground">{r.sendLabel}, 9 am</span>
                <Badge variant={r.status === "approved" || r.status === "sent" ? "secondary" : r.status === "failed" ? "destructive" : "outline"}>
                  {STATUS[r.status]}
                </Badge>
              </div>
              <div className="truncate text-muted-foreground">{r.subject}</div>
              {r.status === "failed" && r.error && <div className="text-xs text-destructive">{r.error}</div>}
              {r.timing && !r.retryTo && (
                <div className={r.timing.tooLate ? "text-xs text-destructive" : "text-xs text-amber-700 dark:text-amber-400"}>{r.timing.note}</div>
              )}
              {confirming === r.id && r.retryTo && (
                <div className="mt-2 flex flex-wrap items-center gap-2" role="alert">
                  <span>Send it now to {r.retryTo}? Replies come to you.</span>
                  <Button
                    size="sm"
                    disabled={pending}
                    onClick={() => {
                      setConfirming(null);
                      run(() => sendReminderNowAction(r.id));
                    }}
                  >
                    {pending ? "Sending…" : "Send it now"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                    Cancel
                  </Button>
                </div>
              )}
            </div>
            <div className="flex gap-1">
              {r.retryTo && confirming !== r.id && (
                <Button size="sm" disabled={pending} onClick={() => setConfirming(r.id)}>
                  Send now
                </Button>
              )}
              <Button size="sm" variant={r.status === "draft" || (r.status === "failed" && !r.retryTo) ? "default" : "outline"} asChild>
                <Link href={`/announcements/reminders/${r.id}`}>{r.status === "draft" || r.status === "failed" ? "Review and approve" : "Open"}</Link>
              </Button>
              {r.status !== "sent" && (
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => deleteReminderAction(r.id))}>
                  Delete
                </Button>
              )}
            </div>
          </div>
        ))}
        {canDraft && items.length < 2 && (
          <Button className="w-fit" variant="outline" disabled={pending} onClick={() => run(() => draftUsualRemindersAction(meetingId))}>
            {items.length ? "Draft the missing reminder" : "Draft the usual reminders"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
