"use client";

import { type ChangeEvent, useState, useTransition } from "react";
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
import { ACCENTS, type Brand, brandSchema } from "@/lib/announcements/brand";
import { saveBrandAction } from "./actions";
import { InboxRow } from "./compose";

/** The From name, header, color, logo, and footer every announcement uses. */
export function BrandSettings({ brand, fromEmail }: { brand: Brand; fromEmail: string | null }) {
  const [draft, setDraft] = useState(brand);
  const [pending, start] = useTransition();
  const checked = brandSchema.safeParse(draft);
  const error = checked.success ? null : checked.error.issues[0]?.message;
  const changed = (Object.keys(brand) as (keyof Brand)[]).some((k) => draft[k].trim() !== brand[k]);
  const field = (key: keyof Brand) => ({
    value: draft[key],
    onChange: (e: ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, [key]: e.target.value }),
  });
  const shown = checked.success ? checked.data : brand;
  const logo = /^https:\/\/[^\s"'<>]+$/.test(draft.logoUrl.trim()) ? draft.logoUrl.trim() : "";

  function save() {
    start(async () => {
      const result = await saveBrandAction(draft);
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
    });
  }

  return (
    <Card id="email-look" className="scroll-mt-4">
      <CardHeader>
        <CardTitle>How emails look</CardTitle>
        <CardDescription>Set these once. Every announcement and test uses them.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-2">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="brand-from">From name</Label>
            <Input id="brand-from" maxLength={80} {...field("fromName")} />
            <p className="text-xs text-muted-foreground">
              The sender people see in their inbox. Use a name they know, like your roundtable&apos;s.
              {fromEmail && ` The address stays ${fromEmail}.`}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="brand-header">Header</Label>
            <Input id="brand-header" maxLength={80} placeholder={draft.fromName || "Same as the From name"} {...field("headerTitle")} />
            <p className="text-xs text-muted-foreground">The big line at the top of every email. Leave it blank to use the From name.</p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="brand-accent">Color</Label>
            <Select value={draft.accent} onValueChange={(accent) => setDraft({ ...draft, accent })}>
              <SelectTrigger id="brand-accent" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACCENTS.map((a) => (
                  <SelectItem key={a.value} value={a.value}>
                    <span aria-hidden className="size-3 rounded-full" style={{ background: a.value }} /> {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Used for the header, buttons, and links. Each one reads well in white text.</p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="brand-logo">Logo link</Label>
            <Input id="brand-logo" type="url" maxLength={500} placeholder="https://" {...field("logoUrl")} />
            <p className="text-xs text-muted-foreground">
              Optional. An https:// link to a PNG or JPG, shown small next to the header. Some inboxes hide images until the reader allows
              them.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="brand-footer">Footer line</Label>
            <Input id="brand-footer" maxLength={200} placeholder="Your council · Your district" {...field("footerLine")} />
          </div>
          {error && changed && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <div>
            <Button type="submit" disabled={pending || !changed || !!error}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
        <div className="flex min-w-0 flex-col gap-2">
          <span className="text-sm font-medium">How it looks</span>
          <div className="overflow-hidden rounded-lg border">
            <InboxRow brand={shown} subject="Roundtable is this Thursday" previewText="District news, program ideas, and more." />
            <div className="bg-[#f3f4f6] p-4">
              <div className="overflow-hidden rounded-xl border bg-white text-[#1f2937]">
                <div className="flex items-center gap-3 px-5 py-4 text-lg font-bold text-white" style={{ background: shown.accent }}>
                  {logo && (
                    // eslint-disable-next-line @next/next/no-img-element -- an outside link the admin typed, shown as the email will show it
                    <img src={logo} alt="" className="h-8 w-auto" />
                  )}
                  <span className="min-w-0 break-words">{shown.headerTitle || shown.fromName}</span>
                </div>
                <div className="flex flex-col gap-3 px-5 py-4 text-sm">
                  <p>Hi there, your message goes here.</p>
                  <span className="w-fit rounded-lg px-4 py-2 font-semibold text-white" style={{ background: shown.accent }}>
                    RSVP
                  </span>
                </div>
                <div className="border-t bg-[#f9fafb] px-5 py-3 text-xs text-[#6b7280]">
                  {shown.footerLine && (
                    <>
                      {shown.footerLine}
                      <br />
                    </>
                  )}
                  Sent by you for the roundtable team. <span className="underline">Unsubscribe</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
