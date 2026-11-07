"use client";

import {
  BoldIcon,
  Heading2Icon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
  MinusIcon,
  MonitorIcon,
  MousePointerClickIcon,
  RefreshCwIcon,
  SendIcon,
  SmartphoneIcon,
  TriangleAlertIcon,
  UserRoundIcon,
} from "lucide-react";
import Link from "next/link";
import { type ReactNode, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
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
import type { Brand } from "@/lib/announcements/brand";
import {
  diff,
  draftWarnings,
  type EditorState,
  insertBlock,
  insertText,
  isUrl,
  link,
  prefixLines,
  TEMPLATES,
  wrap,
} from "@/lib/announcements/editor";
import { renderAnnouncement } from "@/lib/announcements/render";
import { fillMeeting, meetingPreview, meetingSubject } from "@/lib/announcements/meeting-fill";
import type { UpcomingMeeting } from "@/lib/attendance/queries";
import { meetingDateLabel } from "@/lib/attendance/year";
import {
  approveReminderAction,
  meetingLinkAction,
  refreshUnsubscribesAction,
  saveReminderAction,
  sendAnnouncementAction,
  sendTestAction,
  unapproveReminderAction,
} from "./actions";

export type ReminderInfo = {
  id: string;
  kindLabel: string;
  /** "Thu, Nov 12". */
  sendLabel: string;
  status: "draft" | "approved" | "sent" | "failed";
  approvedByName: string | null;
  error: string | null;
};
import { WhoIsIn } from "./who-is-in";

type Audience = { key: string; label: string; description: string; count: number; custom: boolean; kind?: "built_in" | "group" | "meeting" | "combined" };
type Edit = (s: EditorState) => EditorState;

const plural = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;

const TOOLS: { label: string; icon: ReactNode; edit: Edit; keys?: string }[] = [
  { label: "Bold", icon: <BoldIcon />, edit: (s) => wrap(s, "**", "bold text"), keys: "B" },
  { label: "Italic", icon: <ItalicIcon />, edit: (s) => wrap(s, "_", "italic text"), keys: "I" },
  { label: "Heading", icon: <Heading2Icon />, edit: (s) => prefixLines(s, "heading") },
  { label: "Bulleted list", icon: <ListIcon />, edit: (s) => prefixLines(s, "bullet") },
  { label: "Numbered list", icon: <ListOrderedIcon />, edit: (s) => prefixLines(s, "numbered") },
  { label: "Link", icon: <LinkIcon />, edit: (s) => link(s), keys: "K" },
  { label: "Button", icon: <MousePointerClickIcon />, edit: (s) => insertBlock(s, "[button: RSVP](https://)", "https://") },
  { label: "Divider", icon: <MinusIcon />, edit: (s) => insertBlock(s, "---") },
  { label: "First name", icon: <UserRoundIcon />, edit: (s) => insertText(s, "{first name}") },
];
const SHORTCUTS: Record<string, Edit> = Object.fromEntries(TOOLS.filter((t) => t.keys).map((t) => [t.keys!.toLowerCase(), t.edit]));

// A subject or preview text still matching a template gets replaced when the sender picks another.
const fromTemplate = (v: string, field: "subject" | "previewText") => v.trim() === "" || TEMPLATES.some((t) => t[field] === v);

export function Compose({
  audiences,
  sender,
  brand,
  fromEmail,
  meetings = [],
  initial,
  reminder,
}: {
  audiences: Audience[];
  sender: { name: string; email: string };
  brand: Brand;
  fromEmail: string | null;
  meetings?: UpcomingMeeting[];
  /** Start from a saved message (a reminder). */
  initial?: { audience: string; subject: string; previewText: string; body: string };
  /** Editing a reminder: save and approve instead of sending now. */
  reminder?: ReminderInfo;
}) {
  const [audience, setAudience] = useState(initial?.audience ?? "");
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [previewText, setPreviewText] = useState(initial?.previewText ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const textarea = useRef<HTMLTextAreaElement>(null);
  // What "For meeting" last put in the subject and preview, so picking another meeting can replace it.
  const autoFilled = useRef({ subject: "", previewText: "" });
  // One list or several ("packs,troops"). Several are counted by "Who's in it", since people overlap.
  const keys = audience ? audience.split(",") : [];
  const [combinedCount, setCombinedCount] = useState<{ key: string; count: number } | null>(null);
  const chosen = keys.map((k) => audiences.find((a) => a.key === k)).filter((a): a is Audience => !!a);
  const picked: Audience | undefined =
    chosen.length === 1
      ? chosen[0]
      : chosen.length > 1
        ? {
            key: audience,
            label: chosen.map((a) => a.label).join(" + "),
            description: "Anyone in any of these lists, once each.",
            count: combinedCount?.key === audience ? combinedCount.count : 0,
            custom: true,
            kind: "combined",
          }
        : undefined;
  const counting = chosen.length > 1 && combinedCount?.key !== audience;
  const firstName = (sender.name || "there").split(/\s+/)[0];
  const preview = useMemo(
    () =>
      renderAnnouncement({
        body: body || "Your message shows here.",
        brand,
        previewText,
        footerFrom: `Sent by ${sender.name || sender.email} for the roundtable team`,
        firstName,
        unsubscribeUrl: "#",
      }).html,
    [body, brand, previewText, sender, firstName],
  );
  const warnings = useMemo(() => draftWarnings(body), [body]);
  const ready = subject.trim() !== "" && body.trim() !== "";

  /** Applies a toolbar edit as one insert, so Ctrl+Z still undoes it. */
  function apply(edit: Edit) {
    const el = textarea.current;
    if (!el) return;
    const next = edit({ value: el.value, start: el.selectionStart, end: el.selectionEnd });
    const change = diff(el.value, next.value);
    el.focus();
    el.setSelectionRange(change.from, change.to);
    const applied =
      change.from === change.to && change.text === ""
        ? true
        : document.execCommand(change.text ? "insertText" : "delete", false, change.text);
    if (applied && el.value === next.value) {
      el.setSelectionRange(next.start, next.end);
    } else {
      // No insertText (or it did something else): set the value, then the selection once React has drawn it.
      setBody(next.value);
      requestAnimationFrame(() => el.setSelectionRange(next.start, next.end));
    }
  }

  function pickTemplate(key: string) {
    const t = TEMPLATES.find((x) => x.key === key);
    if (!t) return;
    if (body.trim() && !window.confirm("Replace what you've written with this template?")) return;
    setBody(t.body);
    if (fromTemplate(subject, "subject")) setSubject(t.subject);
    if (fromTemplate(previewText, "previewText")) setPreviewText(t.previewText);
  }

  /** Fills the message's blanks from a meeting, starting from the reminder template if it's empty. */
  function pickMeeting(id: string) {
    const m = meetings.find((x) => x.id === id);
    if (!m) return;
    start(async () => {
      let token = m.publicToken;
      if (!token) {
        const r = await meetingLinkAction(m.id);
        if (!r.ok) return void toast.error(r.message);
        token = r.token;
      }
      const info = { ...m, link: `${window.location.origin}/m/${token}` };
      if (!body.trim()) setBody(fillMeeting(TEMPLATES.find((x) => x.key === "reminder")!.body, info));
      else apply((s) => ({ value: fillMeeting(s.value, info), start: s.start, end: s.end }));
      // The subject and preview come from the meeting too, unless the sender wrote their own.
      const auto = { subject: meetingSubject(m), previewText: meetingPreview(m) };
      if (fromTemplate(subject, "subject") || subject === autoFilled.current.subject) setSubject(auto.subject);
      if (fromTemplate(previewText, "previewText") || previewText === autoFilled.current.previewText) setPreviewText(auto.previewText);
      autoFilled.current = auto;
      toast.success(`Filled in from ${meetingDateLabel(m.date)}. The button goes to its RSVP and check-in page.`);
    });
  }

  function test() {
    start(async () => {
      const result = await sendTestAction({ subject, body, previewText });
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
    });
  }

  function send() {
    start(async () => {
      const result = await sendAnnouncementAction({ audience, subject, body, previewText });
      setConfirming(false);
      if (result.ok) {
        toast.success(result.message);
        setSubject("");
        setPreviewText("");
        setBody("");
        setAudience("");
      } else toast.error(result.message, { duration: 15000 });
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{reminder ? `Reminder: ${reminder.kindLabel.toLowerCase()} the meeting` : "New announcement"}</CardTitle>
        <CardDescription>
          From {brand.fromName}
          {fromEmail && ` <${fromEmail}>`}. Replies go to {sender.email}.{" "}
          <a href="#email-look" className="underline underline-offset-2">
            Change how emails look
          </a>
          .
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="announce-audience">To</Label>
            <Combobox
              multiple
              id="announce-audience"
              label="Who it goes to"
              allLabel="Pick who it goes to"
              value={keys}
              onChange={(v) => {
                setAudience(v.slice(0, 6).join(","));
                setConfirming(false);
              }}
              options={audiences.map((a) => ({
                value: a.key,
                label: `${a.label} · ${plural(a.count)}`,
                hint: a.description,
                group: a.kind === "meeting" ? "Meetings" : a.kind === "group" ? "Your groups" : "From contacts",
              }))}
            />
            <p className="text-xs text-muted-foreground">
              {picked ? `${picked.description} ` : ""}
              {picked?.kind === "group" ? (
                <Link href={`/contacts?group=${picked.key}`} className="underline underline-offset-2">
                  Change who&apos;s in it
                </Link>
              ) : (
                <>
                  <Link href="/contacts/groups" className="underline underline-offset-2">
                    Make a group
                  </Link>{" "}
                  to send to a hand-picked list, like a small test group.
                </>
              )}
            </p>
            {picked && (
              <WhoIsIn
                key={picked.key}
                audienceKey={picked.key}
                onCount={(count) => chosen.length > 1 && setCombinedCount({ key: picked.key, count })}
              />
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="announce-subject">Subject</Label>
            <Input id="announce-subject" maxLength={150} value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="announce-preview">Preview text</Label>
            <Input
              id="announce-preview"
              maxLength={150}
              placeholder="Optional. Shows after the subject in most inboxes."
              value={previewText}
              onChange={(e) => setPreviewText(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <Label htmlFor="announce-body">Message</Label>
              <div className="flex flex-wrap gap-2">
              {meetings.length > 0 && (
                <Select value="" onValueChange={pickMeeting}>
                  <SelectTrigger size="sm" aria-label="For meeting">
                    <SelectValue placeholder="For meeting" />
                  </SelectTrigger>
                  <SelectContent>
                    {meetings.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {meetingDateLabel(m.date)}
                        {m.title ? ` · ${m.title}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Select value="" onValueChange={pickTemplate}>
                <SelectTrigger size="sm" aria-label="Start from a template">
                  <SelectValue placeholder="Start from a template" />
                </SelectTrigger>
                <SelectContent>
                  {TEMPLATES.map((t) => (
                    <SelectItem key={t.key} value={t.key}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              </div>
            </div>
            <div className="overflow-hidden rounded-lg border border-input focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
              <div role="toolbar" aria-label="Formatting" aria-controls="announce-body" className="flex flex-wrap gap-0.5 border-b bg-muted/40 p-1">
                {TOOLS.map((t) => (
                  <Button
                    key={t.label}
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    title={t.keys ? `${t.label} (Ctrl+${t.keys})` : t.label}
                    aria-label={t.label}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => apply(t.edit)}
                  >
                    {t.icon}
                  </Button>
                ))}
              </div>
              <Textarea
                ref={textarea}
                id="announce-body"
                rows={14}
                maxLength={20000}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={(e) => {
                  const edit = (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey ? SHORTCUTS[e.key.toLowerCase()] : undefined;
                  if (edit) {
                    e.preventDefault();
                    apply(edit);
                  }
                }}
                onPaste={(e) => {
                  // Pasting a link over selected words links them.
                  const pasted = e.clipboardData.getData("text/plain");
                  const el = e.currentTarget;
                  if (el.selectionStart !== el.selectionEnd && isUrl(pasted)) {
                    e.preventDefault();
                    apply((s) => link(s, pasted.trim()));
                  }
                }}
                className="min-h-72 max-h-[70vh] rounded-none border-0 shadow-none focus-visible:ring-0"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Select words and use the toolbar, or type **bold**, _italic_, ## headings, and - lists. Paste a link over selected words to link
              them. Leave a blank line between paragraphs.
            </p>
            {warnings.map((w) => (
              <p key={w} className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                <TriangleAlertIcon className="mt-px size-3.5 shrink-0" /> {w}
              </p>
            ))}
          </div>
          {reminder ? (
            <ReminderControls
              reminder={reminder}
              draft={{ audience, subject, previewText, body }}
              ready={ready && !!picked}
              unfinished={warnings.length > 0}
              audienceLabel={picked?.label}
              pending={pending}
              start={start}
              onTest={test}
            />
          ) : (
          <>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" disabled={pending || !ready} onClick={test}>
              Send me a test
            </Button>
            {!confirming ? (
              <Button disabled={pending || !ready || !picked || counting || picked.count === 0} onClick={() => setConfirming(true)}>
                <SendIcon /> {picked && !counting ? `Send to ${plural(picked.count)}` : "Send"}
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
              {warnings.length > 0 && " It still has spots to fill in, flagged above."}
            </p>
          )}
          </>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">Preview</span>
            <div className="flex gap-0.5" role="group" aria-label="Preview size">
              <Button
                type="button"
                variant={device === "desktop" ? "secondary" : "ghost"}
                size="icon-sm"
                aria-label="Computer"
                aria-pressed={device === "desktop"}
                onClick={() => setDevice("desktop")}
              >
                <MonitorIcon />
              </Button>
              <Button
                type="button"
                variant={device === "phone" ? "secondary" : "ghost"}
                size="icon-sm"
                aria-label="Phone"
                aria-pressed={device === "phone"}
                onClick={() => setDevice("phone")}
              >
                <SmartphoneIcon />
              </Button>
            </div>
          </div>
          <div className="overflow-hidden rounded-lg border">
            <InboxRow brand={brand} subject={subject} previewText={previewText} />
            <div className="bg-[#f3f4f6]">
              <iframe
                title="Preview of the announcement"
                sandbox=""
                srcDoc={preview}
                className={device === "phone" ? "mx-auto block h-[600px] w-[375px] max-w-full" : "block h-[600px] w-full"}
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** How the message shows in an inbox list: sender, subject, preview text. */
export function InboxRow({ brand, subject, previewText }: { brand: Brand; subject: string; previewText: string }) {
  const initials = brand.fromName
    .split(/\s+/)
    .filter((w) => /^[A-Za-z0-9]/.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
  return (
    <div className="flex items-start gap-3 border-b bg-background px-3 py-2.5 text-sm">
      <div
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
        style={{ background: brand.accent }}
      >
        {initials || "RT"}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold">{brand.fromName}</div>
        <div className="truncate">{subject || <span className="text-muted-foreground">No subject yet</span>}</div>
        <div className="truncate text-muted-foreground">
          {previewText || <span className="italic">No preview text. Inboxes show the first words of the email.</span>}
        </div>
      </div>
    </div>
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

/** Save and approve, instead of sending now. Only an approved reminder goes out, at 9 am on its day. */
function ReminderControls({
  reminder,
  draft,
  ready,
  unfinished,
  audienceLabel,
  pending,
  start,
  onTest,
}: {
  reminder: ReminderInfo;
  draft: { audience: string; subject: string; previewText: string; body: string };
  ready: boolean;
  unfinished: boolean;
  audienceLabel?: string;
  pending: boolean;
  start: (fn: () => Promise<void>) => void;
  onTest: () => void;
}) {
  const sent = reminder.status === "sent";
  const run = (action: () => Promise<{ ok: boolean; message: string }>) =>
    start(async () => {
      const r = await action();
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
    });
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm" role="status">
        {reminder.status === "approved" &&
          `Approved by ${reminder.approvedByName ?? "an admin"}. It goes out ${reminder.sendLabel} at 9 am${audienceLabel ? ` to ${audienceLabel}` : ""}. Saving a change makes it a draft again.`}
        {reminder.status === "draft" && `Draft. It won't send unless it's approved. Once approved, it goes out ${reminder.sendLabel} at 9 am.`}
        {reminder.status === "failed" && <span className="text-destructive">Didn&apos;t send: {reminder.error}</span>}
        {sent && "Sent."}
      </p>
      {!sent && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" disabled={pending || !ready} onClick={onTest}>
            Send me a test
          </Button>
          <Button variant="outline" disabled={pending || !ready} onClick={() => run(() => saveReminderAction(reminder.id, draft))}>
            Save
          </Button>
          {reminder.status === "approved" ? (
            <Button variant="ghost" disabled={pending} onClick={() => run(() => unapproveReminderAction(reminder.id))}>
              Undo approval
            </Button>
          ) : (
            <Button disabled={pending || !ready || unfinished} onClick={() => run(() => approveReminderAction(reminder.id, draft))}>
              Approve to send {reminder.sendLabel}
            </Button>
          )}
        </div>
      )}
      {unfinished && !sent && <p className="text-xs text-muted-foreground">Fill in the flagged spots before approving.</p>}
    </div>
  );
}
