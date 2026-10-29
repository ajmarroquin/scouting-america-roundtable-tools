"use client";

import { CopyIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { batchEmails, collectEmails, type EmailSource, joinEmails, type Separator } from "@/lib/contacts/emails";

const PREFS_KEY = "copy-emails";

function loadPrefs(): { separator: Separator; batch: string } {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}");
    return {
      separator: saved.separator === "semicolon" ? "semicolon" : "comma",
      batch: ["all", "50", "100"].includes(saved.batch) ? saved.batch : "all",
    };
  } catch {
    return { separator: "comma", batch: "all" };
  }
}

function savePrefs(prefs: { separator: Separator; batch: string }) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Private windows can refuse storage; the defaults still work.
  }
}

export function CopyEmails({ contacts }: { contacts: EmailSource[] }) {
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState(loadPrefs);
  const { emails, withoutEmail } = useMemo(() => collectEmails(contacts), [contacts]);
  const groups = batchEmails(emails, prefs.batch === "all" ? null : Number(prefs.batch));

  const update = (next: Partial<typeof prefs>) => {
    const merged = { ...prefs, ...next };
    setPrefs(merged);
    savePrefs(merged);
  };

  async function copy(group: string[], label: string) {
    try {
      await navigator.clipboard.writeText(joinEmails(group, prefs.separator));
      const missing = withoutEmail ? ` ${withoutEmail} contact${withoutEmail === 1 ? " has" : "s have"} no email.` : "";
      toast.success(`Copied ${label}.${missing}`, { description: "Paste into BCC so addresses stay private." });
    } catch {
      toast.error("Your browser blocked the clipboard. Try again, or use Export.");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" disabled={emails.length === 0} onClick={() => (groups.length === 1 && !open ? void copy(emails, `${emails.length} emails`) : setOpen(!open))}>
        <CopyIcon /> Copy {emails.length} email{emails.length === 1 ? "" : "s"}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setOpen(!open)} aria-expanded={open}>
        Options
      </Button>
      {open && (
        <div className="flex w-full flex-wrap items-center gap-2 rounded-lg border p-2">
          <Select value={prefs.separator} onValueChange={(v) => update({ separator: v as Separator })}>
            <SelectTrigger size="sm" aria-label="Separator">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="comma">Commas (Gmail)</SelectItem>
              <SelectItem value="semicolon">Semicolons (Outlook)</SelectItem>
            </SelectContent>
          </Select>
          <Select value={prefs.batch} onValueChange={(v) => update({ batch: v })}>
            <SelectTrigger size="sm" aria-label="Batch size">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All at once</SelectItem>
              <SelectItem value="50">50 at a time</SelectItem>
              <SelectItem value="100">100 at a time</SelectItem>
            </SelectContent>
          </Select>
          {groups.map((g, i) => {
            const start = groups.slice(0, i).reduce((n, x) => n + x.length, 0) + 1;
            const label = groups.length === 1 ? `${g.length} emails` : `${start}–${start + g.length - 1}`;
            return (
              <Button key={i} variant="outline" size="sm" onClick={() => void copy(g, label)}>
                Copy {label}
              </Button>
            );
          })}
          <p className="w-full text-xs text-muted-foreground">
            Youth contacts bring their parent or guardian&apos;s email along. Paste into BCC.
          </p>
        </div>
      )}
    </div>
  );
}
