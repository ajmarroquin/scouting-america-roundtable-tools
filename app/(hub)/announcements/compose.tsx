"use client";

import { RefreshCwIcon, SendIcon } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { renderAnnouncement } from "@/lib/announcements/render";
import { refreshUnsubscribesAction, sendAnnouncementAction, sendTestAction } from "./actions";

type Audience = { key: string; label: string; description: string; count: number };

const plural = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;

export function Compose({ audiences, sender }: { audiences: Audience[]; sender: { name: string; email: string } }) {
  const [audience, setAudience] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const picked = audiences.find((a) => a.key === audience);
  const firstName = (sender.name || "there").split(/\s+/)[0];
  const preview = useMemo(
    () =>
      renderAnnouncement({
        body: body || "Your message shows here.",
        footerFrom: `Sent by ${sender.name || sender.email} for the roundtable team`,
        firstName,
        unsubscribeUrl: "#",
      }).html,
    [body, sender, firstName],
  );
  const ready = subject.trim() !== "" && body.trim() !== "";

  function test() {
    start(async () => {
      const result = await sendTestAction({ subject, body });
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
    });
  }

  function send() {
    start(async () => {
      const result = await sendAnnouncementAction({ audience, subject, body });
      setConfirming(false);
      if (result.ok) {
        toast.success(result.message);
        setSubject("");
        setBody("");
        setAudience("");
      } else toast.error(result.message, { duration: 15000 });
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>New announcement</CardTitle>
        <CardDescription>Send yourself a test first. Replies go to {sender.email}.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="announce-audience">To</Label>
            <Select
              value={audience}
              onValueChange={(v) => {
                setAudience(v);
                setConfirming(false);
              }}
            >
              <SelectTrigger id="announce-audience" className="w-full">
                <SelectValue placeholder="Pick who it goes to" />
              </SelectTrigger>
              <SelectContent>
                {audiences.map((a) => (
                  <SelectItem key={a.key} value={a.key}>
                    {a.label} · {plural(a.count)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {picked && <p className="text-xs text-muted-foreground">{picked.description}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="announce-subject">Subject</Label>
            <Input id="announce-subject" maxLength={150} value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="announce-body">Message</Label>
            <Textarea id="announce-body" rows={12} value={body} onChange={(e) => setBody(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              Leave a blank line between paragraphs. Start lines with &ldquo;- &rdquo; for a list. Links work as typed, **two stars** make
              bold, and {"{first name}"} greets each person by name.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" disabled={pending || !ready} onClick={test}>
              Send me a test
            </Button>
            {!confirming ? (
              <Button disabled={pending || !ready || !picked || picked.count === 0} onClick={() => setConfirming(true)}>
                <SendIcon /> {picked ? `Send to ${plural(picked.count)}` : "Send"}
              </Button>
            ) : (
              <>
                <Button variant="destructive" disabled={pending} onClick={send}>
                  {pending ? "Sending…" : `Yes, send to ${plural(picked!.count)} now`}
                </Button>
                <Button variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
                  Cancel
                </Button>
              </>
            )}
          </div>
          {confirming && (
            <p className="text-sm text-muted-foreground" role="status">
              This goes out right away and can&apos;t be called back. People who unsubscribed are left out.
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Preview</span>
          <div className="rounded-lg border">
            <div className="border-b px-3 py-2 text-sm">
              <span className="text-muted-foreground">Subject:</span> {subject || <span className="text-muted-foreground">No subject yet</span>}
            </div>
            <iframe title="Preview of the announcement" sandbox="" srcDoc={preview} className="h-96 w-full rounded-b-lg bg-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function Unsubscribes({ count }: { count: number }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm">
      <p role="status">
        {count === 0
          ? "Nobody has unsubscribed."
          : `${plural(count)} unsubscribed. They're left out of announcements and copied emails, and marked on their contact.`}
      </p>
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await refreshUnsubscribesAction();
            if (result.ok) toast.success(result.message);
            else toast.error(result.message);
          })
        }
      >
        <RefreshCwIcon /> Check Resend for new unsubscribes
      </Button>
    </div>
  );
}
