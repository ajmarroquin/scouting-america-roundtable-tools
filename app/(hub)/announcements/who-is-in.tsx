"use client";

import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { RosterPerson } from "@/lib/announcements/audiences";
import { LEFT_OUT, type Reach } from "@/lib/announcements/reach";
import { audienceRosterAction } from "./actions";

type State = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; roster: Reach<RosterPerson> };

/** The people an audience reaches, and who's left out and why. */
export function WhoIsIn({ audienceKey }: { audienceKey: string }) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let live = true;
    audienceRosterAction(audienceKey)
      .then((r) => live && setState(r.ok ? { status: "ready", roster: r.roster } : { status: "error", message: r.message }))
      .catch(() => live && setState({ status: "error", message: "Couldn't load who's in it." }));
    return () => {
      live = false;
    };
  }, [audienceKey]);

  if (state.status === "loading") return <p className="text-xs text-muted-foreground">Looking up who&apos;s in it…</p>;
  if (state.status === "error") return <p className="text-xs text-destructive">{state.message}</p>;
  const { members, leftOut } = state.roster;

  return (
    <details className="group rounded-lg border text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 select-none [&::-webkit-details-marker]:hidden">
        <ChevronRightIcon className="size-4 shrink-0 transition-transform group-open:rotate-90" />
        <span className="font-medium">Who&apos;s in it</span>
        <span className="text-muted-foreground">
          {members.length} {members.length === 1 ? "gets" : "get"} it
          {leftOut.length > 0 && `, ${leftOut.length} left out`}
        </span>
      </summary>
      <div className="flex max-h-80 flex-col gap-3 overflow-y-auto border-t px-3 py-2">
        {members.length === 0 ? (
          <p className="text-muted-foreground">Nobody in this group can get an announcement yet.</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {members.map((p) => (
              <li key={p.contactId} className="flex flex-wrap gap-x-2">
                <Link href={`/contacts/${p.contactId}`} className="underline-offset-4 hover:underline">
                  {p.name}
                </Link>
                <span className="text-muted-foreground">{p.email}</span>
              </li>
            ))}
          </ul>
        )}
        {leftOut.length > 0 && (
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Left out</p>
            <ul className="flex flex-col gap-0.5">
              {leftOut.map((p) => (
                <li key={p.contactId} className="flex flex-wrap gap-x-2">
                  <Link href={`/contacts/${p.contactId}`} className="underline-offset-4 hover:underline">
                    {p.name}
                  </Link>
                  <span className="text-muted-foreground">
                    {p.reason === "shared_email" && p.sharedWith ? `Shares an email with ${p.sharedWith}, who gets it` : LEFT_OUT[p.reason]}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  );
}
