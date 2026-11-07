"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { CheckInPerson } from "@/lib/attendance/queries";
import type { ReviewItem } from "@/lib/selfcheckin/service";
import { approveReviewAction, mergeReviewAction, rejectReviewAction } from "../actions";

/** What people said about themselves at self check-in, for an editor to approve. */
export function ReviewList({ reviews, people }: { reviews: ReviewItem[]; people: CheckInPerson[] }) {
  const byPerson = useMemo(() => {
    const map = new Map<string, ReviewItem[]>();
    for (const r of reviews) map.set(r.contactId, [...(map.get(r.contactId) ?? []), r]);
    return [...map.values()];
  }, [reviews]);
  if (!reviews.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>To review</CardTitle>
        <CardDescription>
          From self check-in and RSVPs. People who matched a contact count right away; this is only about their record. New people
          are left out of announcements, and their units don&apos;t count, until you approve them.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col divide-y">
        {byPerson.map((items) => (
          <PersonReviews key={items[0].contactId} items={items} people={people} />
        ))}
      </CardContent>
    </Card>
  );
}

function PersonReviews({ items, people }: { items: ReviewItem[]; people: CheckInPerson[] }) {
  const [pending, start] = useTransition();
  const [merging, setMerging] = useState(false);
  const [query, setQuery] = useState("");
  const first = items[0];
  const isNew = items.some((r) => r.kind === "new_person");
  const run = (action: () => Promise<{ ok: boolean; message: string }>) =>
    start(async () => {
      const r = await action();
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
    });
  const matches = query.trim().length >= 2
    ? people
        .filter((p) => p.id !== first.contactId && `${p.name} ${p.email ?? ""} ${p.units.join(" ")} ${p.roles}`.toLowerCase().includes(query.trim().toLowerCase()))
        .slice(0, 8)
    : [];

  return (
    <div className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/contacts/${first.contactId}`} className="font-medium underline-offset-4 hover:underline">
          {first.name}
        </Link>
        <span className="text-sm text-muted-foreground">{[first.roles, first.email].filter(Boolean).join(" · ")}</span>
        {isNew && <Badge variant="outline">New here</Badge>}
      </div>
      {items.map((r) => (
        <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span>
            {r.kind === "new_person" && "Added themselves; not in contacts before."}
            {r.kind === "add_unit" && (
              <>
                Says they&apos;re with <span className="font-medium">{r.unitLabel}</span>
                {r.role && ` as ${r.role}`}.{" "}
                <span className="text-muted-foreground">
                  {r.newPerson ? "Counts once you approve them." : "Counted at this roundtable. Add it to their record?"}
                </span>
              </>
            )}
            {r.kind === "remove_unit" && (
              <>
                Says they&apos;re not with <span className="font-medium">{r.unitLabel}</span> anymore.
                {r.fromRoster && <span className="text-muted-foreground"> It&apos;s from the roster, so the next import decides.</span>}
              </>
            )}
          </span>
          <span className="flex flex-wrap gap-1">
            {r.kind === "new_person" ? (
              <>
                <Button size="sm" disabled={pending} onClick={() => run(() => approveReviewAction(r.id))}>
                  Approve
                </Button>
                <Button size="sm" variant="outline" disabled={pending} onClick={() => setMerging((m) => !m)}>
                  It&apos;s actually…
                </Button>
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => rejectReviewAction(r.id))}>
                  Remove
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => approveReviewAction(r.id))}>
                  {r.kind === "remove_unit" ? (r.fromRoster ? "Noted" : "Take it off") : "Add to record"}
                </Button>
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => rejectReviewAction(r.id))}>
                  {r.kind === "remove_unit" ? "Keep the unit" : "Not with this unit"}
                </Button>
              </>
            )}
          </span>
        </div>
      ))}
      {merging && (
        <div className="flex flex-col gap-2 rounded-lg border p-2">
          <Input autoFocus aria-label="Find who they are" placeholder="Find who they really are: name, email, or unit" value={query} onChange={(e) => setQuery(e.target.value)} />
          {matches.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={pending}
              className="flex flex-col items-start rounded-md px-2 py-1 text-left text-sm hover:bg-muted"
              onClick={() => run(() => mergeReviewAction(items.find((r) => r.kind === "new_person")!.id, p.id))}
            >
              <span className="font-medium">{p.name}</span>
              <span className="text-xs text-muted-foreground">{[p.roles, p.email].filter(Boolean).join(" · ")}</span>
            </button>
          ))}
          <p className="text-xs text-muted-foreground">Their check-in moves to that person, and the email they typed becomes that person&apos;s second email.</p>
        </div>
      )}
    </div>
  );
}
