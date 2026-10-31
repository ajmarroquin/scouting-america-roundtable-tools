"use client";

import { SearchIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MatchResult } from "@/lib/attendance/match";
import type { CheckInPerson } from "@/lib/attendance/queries";
import { searchPeople } from "@/lib/attendance/search";

// The review step shared by loading an old sheet and pasting a list: confident
// matches are taken, guesses wait for a person, and unknown names are added or skipped.

export type Decision = { kind: "existing"; id: string } | { kind: "new" } | { kind: "skip" } | { kind: "undecided" };

export type ReviewRow = {
  key: string;
  name: string;
  detail: string | null;
  result: MatchResult;
  decision: Decision;
};

export function initialDecision(result: MatchResult, unknown: "new" | "skip"): Decision {
  if (result.status === "matched") return { kind: "existing", id: result.candidates[0].id };
  if (result.status === "review") return { kind: "undecided" };
  return { kind: unknown };
}

const STATUS = {
  matched: { label: "Matched", variant: "secondary" },
  review: { label: "Check", variant: "destructive" },
  none: { label: "Not found", variant: "outline" },
} as const;

function encode(d: Decision): string {
  return d.kind === "existing" ? `c:${d.id}` : d.kind === "undecided" ? "" : d.kind;
}

export function reviewCounts(rows: ReviewRow[]) {
  return {
    existing: rows.filter((r) => r.decision.kind === "existing").length,
    new: rows.filter((r) => r.decision.kind === "new").length,
    skip: rows.filter((r) => r.decision.kind === "skip").length,
    undecided: rows.filter((r) => r.decision.kind === "undecided").length,
  };
}

export function MatchReview({
  rows,
  people,
  onDecide,
  newLabel = "Add as a new contact",
}: {
  rows: ReviewRow[];
  people: CheckInPerson[];
  onDecide: (key: string, decision: Decision) => void;
  newLabel?: string;
}) {
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const needsLook = rows.filter((r) => r.result.status !== "matched" || r.decision.kind === "undecided");
  const [filter, setFilter] = useState<"look" | "all">(needsLook.length ? "look" : "all");
  const shown = filter === "look" ? needsLook : rows;
  const counts = reviewCounts(rows);

  const describe = (id: string) => {
    const p = byId.get(id);
    if (!p) return "Unknown contact";
    const where = p.units.join(", ") || p.email || "no unit";
    return `${p.name} · ${where}${p.status === "archived" ? " (archived)" : ""}`;
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground" role="status">
          {counts.existing} matched, {counts.new} new, {counts.skip} skipped
          {counts.undecided > 0 && (
            <span className="font-medium text-destructive">, {counts.undecided} still to pick</span>
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          {counts.undecided > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                for (const r of rows) {
                  if (r.decision.kind === "undecided" && r.result.candidates[0]) {
                    onDecide(r.key, { kind: "existing", id: r.result.candidates[0].id });
                  }
                }
              }}
            >
              Take the best guess for the rest
            </Button>
          )}
          <div className="flex rounded-lg border p-0.5" role="group" aria-label="Show">
            <Button size="sm" variant={filter === "look" ? "secondary" : "ghost"} onClick={() => setFilter("look")}>
              Needs a look ({needsLook.length})
            </Button>
            <Button size="sm" variant={filter === "all" ? "secondary" : "ghost"} onClick={() => setFilter("all")}>
              All ({rows.length})
            </Button>
          </div>
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">Everyone matched. Switch to All to look them over.</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-xl border" aria-label="People to review">
          {shown.map((row) => (
            <ReviewItem key={row.key} row={row} people={people} describe={describe} onDecide={onDecide} newLabel={newLabel} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ReviewItem({
  row,
  people,
  describe,
  onDecide,
  newLabel,
}: {
  row: ReviewRow;
  people: CheckInPerson[];
  describe: (id: string) => string;
  onDecide: (key: string, decision: Decision) => void;
  newLabel: string;
}) {
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const results = useMemo(() => (query ? searchPeople(people, query, 6) : []), [people, query]);
  const status = STATUS[row.result.status];
  const candidateIds = row.result.candidates.map((c) => c.id);
  const picked = row.decision.kind === "existing" && !candidateIds.includes(row.decision.id) ? row.decision.id : null;

  return (
    <li className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium">{row.name}</span>
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>
        {row.detail && <p className="text-xs text-muted-foreground">{row.detail}</p>}
      </div>
      <div className="flex flex-col gap-2 sm:w-96">
        <Select
          value={encode(row.decision)}
          onValueChange={(v) => {
            if (v === "search") {
              setSearching(true);
              return;
            }
            setSearching(false);
            onDecide(row.key, v.startsWith("c:") ? { kind: "existing", id: v.slice(2) } : { kind: v as "new" | "skip" });
          }}
        >
          <SelectTrigger className="w-full" aria-label={`Who is ${row.name}?`}>
            <SelectValue placeholder="Pick who this is" />
          </SelectTrigger>
          <SelectContent>
            {(row.result.candidates.length > 0 || picked) && (
              <SelectGroup>
                <SelectLabel>Contacts</SelectLabel>
                {row.result.candidates.map((c) => (
                  <SelectItem key={c.id} value={`c:${c.id}`}>
                    {describe(c.id)}
                  </SelectItem>
                ))}
                {picked && <SelectItem value={`c:${picked}`}>{describe(picked)}</SelectItem>}
              </SelectGroup>
            )}
            <SelectSeparator />
            <SelectItem value="search">Someone else…</SelectItem>
            <SelectItem value="new">{newLabel}</SelectItem>
            <SelectItem value="skip">Skip</SelectItem>
          </SelectContent>
        </Select>
        {row.decision.kind === "existing" && (
          <p className="text-xs text-muted-foreground">
            {row.result.candidates.find((c) => c.id === (row.decision as { id: string }).id)?.reason ?? "picked by hand"}
          </p>
        )}
        {searching && (
          <div className="flex flex-col gap-1">
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                className="pl-8"
                placeholder="Search contacts"
                aria-label={`Search contacts for ${row.name}`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            {results.map((p) => (
              <Button
                key={p.id}
                variant="ghost"
                size="sm"
                className="h-auto justify-start py-1.5 text-left whitespace-normal"
                onClick={() => {
                  onDecide(row.key, { kind: "existing", id: p.id });
                  setSearching(false);
                  setQuery("");
                }}
              >
                {describe(p.id)}
              </Button>
            ))}
            {query && results.length === 0 && <p className="text-xs text-muted-foreground">Nobody matches.</p>}
          </div>
        )}
      </div>
    </li>
  );
}
