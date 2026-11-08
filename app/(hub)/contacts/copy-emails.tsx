"use client";

import { CopyIcon } from "lucide-react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { useId, useMemo, useState } from "react";
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

/**
 * A button that copies the emails, with its options in a panel that opens
 * under it, so nothing else on the row moves. Pass `optionsOpen` and
 * `onOptionsOpenChange` to open the options from somewhere else, like a menu,
 * and `optionsButton={false}` to leave out the Options button.
 */
export function CopyEmails({
  contacts,
  optionsOpen,
  onOptionsOpenChange,
  optionsButton = true,
  variant = "default",
}: {
  contacts: EmailSource[];
  variant?: "default" | "outline";
  optionsOpen?: boolean;
  onOptionsOpenChange?: (open: boolean) => void;
  optionsButton?: boolean;
}) {
  const [ownOpen, setOwnOpen] = useState(false);
  const open = optionsOpen ?? ownOpen;
  const setOpen = (next: boolean) => {
    if (optionsOpen === undefined) setOwnOpen(next);
    onOptionsOpenChange?.(next);
  };
  const [prefs, setPrefs] = useState(loadPrefs);
  const id = useId();
  const { emails, withoutEmail, unsubscribed } = useMemo(() => collectEmails(contacts), [contacts]);
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
      const left = unsubscribed ? ` Left out ${unsubscribed} who unsubscribed.` : "";
      toast.success(`Copied ${label}.${missing}${left}`, { description: "Paste into BCC so addresses stay private." });
    } catch {
      toast.error("Your browser blocked the clipboard. Try again, or use Export.");
    }
  }

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Anchor asChild>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={variant}
            disabled={emails.length === 0}
            // In batches, the panel is where you pick which batch to copy.
            onClick={() => (groups.length > 1 ? setOpen(true) : void copy(emails, `${emails.length} emails`))}
          >
            <CopyIcon /> Copy {emails.length} email{emails.length === 1 ? "" : "s"}
          </Button>
          {optionsButton && (
            <PopoverPrimitive.Trigger asChild>
              <Button variant="ghost" size="sm">
                Options
              </Button>
            </PopoverPrimitive.Trigger>
          )}
        </div>
      </PopoverPrimitive.Anchor>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="end"
          sideOffset={4}
          aria-label="Email copy options"
          className="z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-3 rounded-lg border bg-popover p-3 text-popover-foreground shadow-md"
        >
          <p className="text-sm font-medium">Email copy options</p>
          <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 text-sm">
            <span id={`${id}-separator`} className="text-muted-foreground">
              Separate with
            </span>
            <Select value={prefs.separator} onValueChange={(v) => update({ separator: v as Separator })}>
              <SelectTrigger size="sm" aria-labelledby={`${id}-separator`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="comma">Commas (Gmail)</SelectItem>
                <SelectItem value="semicolon">Semicolons (Outlook)</SelectItem>
              </SelectContent>
            </Select>
            <span id={`${id}-batch`} className="text-muted-foreground">
              Copy
            </span>
            <Select value={prefs.batch} onValueChange={(v) => update({ batch: v })}>
              <SelectTrigger size="sm" aria-labelledby={`${id}-batch`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All at once</SelectItem>
                <SelectItem value="50">50 at a time</SelectItem>
                <SelectItem value="100">100 at a time</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {emails.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {groups.map((g, i) => {
                const start = groups.slice(0, i).reduce((n, x) => n + x.length, 0) + 1;
                const label = groups.length === 1 ? `${g.length} emails` : `${start}–${start + g.length - 1}`;
                return (
                  <Button key={i} variant="outline" size="sm" onClick={() => void copy(g, label)}>
                    Copy {label}
                  </Button>
                );
              })}
            </div>
          )}
          <p className="text-xs text-muted-foreground">Youth contacts bring their parent or guardian&apos;s email along. Paste into BCC.</p>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
