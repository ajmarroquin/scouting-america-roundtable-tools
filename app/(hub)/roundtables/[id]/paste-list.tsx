"use client";

import { ClipboardPasteIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { splitName } from "@/lib/attendance/legacy";
import { type MatchResult, matchPerson } from "@/lib/attendance/match";
import { type PastedPerson, parsePastedList } from "@/lib/attendance/paste";
import type { CheckInPerson } from "@/lib/attendance/queries";
import type { BulkCheckInItem } from "@/lib/attendance/mutations";
import { bulkCheckInAction } from "../actions";
import { initialDecision, MatchReview, type ReviewRow, reviewCounts } from "../match-review";

type Row = ReviewRow & { pasted: PastedPerson };

const RANK = { matched: 2, review: 1, none: 0 } as const;
const better = (a: MatchResult, b: MatchResult) =>
  RANK[b.status] > RANK[a.status] || (RANK[b.status] === RANK[a.status] && (b.candidates[0]?.score ?? 0) > (a.candidates[0]?.score ?? 0));

/** For a meeting nobody checked people in at: paste a Zoom report or a typed-up sign-in sheet. */
export function PasteList({ meetingId, people }: { meetingId: string; people: CheckInPerson[] }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [pending, start] = useTransition();

  function close() {
    setOpen(false);
    setText("");
    setRows(null);
  }

  if (!open) {
    return (
      <Button variant="outline" className="w-fit" onClick={() => setOpen(true)}>
        <ClipboardPasteIcon /> Paste a list
      </Button>
    );
  }

  function matchAll() {
    const list = parsePastedList(text);
    if (!list.length) return void toast.error("Couldn't find any names in that text.");
    setRows(
      list.map((p, i) => {
        // Zoom keeps the account name when someone renames themselves; use whichever matches better.
        let result = matchPerson({ name: p.name, email: p.email }, people);
        if (p.altName) {
          const alt = matchPerson({ name: p.altName, email: p.email }, people);
          if (better(result, alt)) result = alt;
        }
        // A full name that matches nobody is probably someone new; a single word is probably a device or nickname.
        const unknown = (p.altName ?? p.name).split(/\s+/).length >= 2 ? "new" : "skip";
        return {
          key: String(i),
          name: p.altName ? `${p.name} (${p.altName})` : p.name,
          detail: p.email,
          result,
          decision: initialDecision(result, unknown),
          pasted: p,
        };
      }),
    );
  }

  const counts = rows ? reviewCounts(rows) : null;
  const toCheckIn = counts ? counts.existing + counts.new : 0;

  function submit() {
    if (!rows) return;
    const items = rows.flatMap((r): BulkCheckInItem[] => {
      if (r.decision.kind === "existing") return [{ kind: "existing", id: r.decision.id }];
      if (r.decision.kind === "new") {
        return [{ kind: "new", ...splitName(r.pasted.altName ?? r.pasted.name), email: r.pasted.email ?? "" }];
      }
      return [];
    });
    start(async () => {
      const result = await bulkCheckInAction(meetingId, items);
      if (result.ok) {
        toast.success(result.message);
        close();
      } else toast.error(result.message);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Paste a list</CardTitle>
        <CardDescription>
          One name per line, a Zoom participant report, or cells copied from a sign-in sheet. You&apos;ll check the matches
          before anyone is checked in.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!rows ? (
          <>
            <Label htmlFor="paste-list" className="sr-only">
              Names to check in
            </Label>
            <Textarea
              id="paste-list"
              rows={8}
              autoFocus
              placeholder={"Alex Example\nPat Testcase\n…"}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="flex gap-2">
              <Button disabled={!text.trim()} onClick={matchAll}>
                Match names
              </Button>
              <Button variant="ghost" onClick={close}>
                Cancel
              </Button>
            </div>
          </>
        ) : (
          <>
            <MatchReview
              rows={rows}
              people={people}
              onDecide={(key, decision) => setRows((list) => list!.map((r) => (r.key === key ? { ...r, decision } : r)))}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button disabled={pending || toCheckIn === 0 || counts!.undecided > 0} onClick={submit}>
                {pending ? "Checking in…" : `Check in ${toCheckIn} ${toCheckIn === 1 ? "person" : "people"}`}
              </Button>
              <Button variant="ghost" onClick={() => setRows(null)}>
                Back to the list
              </Button>
              {counts!.undecided > 0 && (
                <p className="text-sm text-muted-foreground">Pick who the people marked Check are first.</p>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
