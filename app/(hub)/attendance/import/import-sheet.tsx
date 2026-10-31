"use client";

import Link from "next/link";
import Papa from "papaparse";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { type LegacySheet, type MeetingAction, parseLegacySheet, splitName } from "@/lib/attendance/legacy";
import type { LegacyImportInput, LegacyMatchData } from "@/lib/attendance/legacy-import";
import { matchPerson } from "@/lib/attendance/match";
import { resolveUnitMentions } from "@/lib/attendance/unit-mentions";
import { meetingDateLabel } from "@/lib/attendance/year";
import { importLegacyAction } from "../actions";
import { type Decision, initialDecision, MatchReview, type ReviewRow, reviewCounts } from "../match-review";

type Choice = { date: string; action: MeetingAction };
type Loaded = { fileName: string | null; sheet: LegacySheet };

const ACTION_LABELS: Record<MeetingAction, string> = { held: "Held", cancelled: "Cancelled", skip: "Don't load" };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function ImportSheet({ data, today }: { data: LegacyMatchData; today: string }) {
  const [paste, setPaste] = useState("");
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [choices, setChoices] = useState<Map<number, Choice>>(new Map());
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const existingByDate = useMemo(() => new Map(data.meetings.map((m) => [m.date, m])), [data.meetings]);

  function read(text: string, fileName: string | null) {
    setDone(null);
    const parsed = parseLegacySheet(Papa.parse<string[]>(text.replace(/^﻿/, "")).data, today);
    if ("error" in parsed) {
      setLoaded(null);
      setError(parsed.error);
      return;
    }
    setError(null);
    setLoaded({ fileName, sheet: parsed });
    // A month-only column takes the date of a meeting already in the app that month, if there's exactly one.
    setChoices(
      new Map(
        parsed.meetings.map((m) => {
          const sameMonth = m.monthOnly ? data.meetings.filter((x) => x.date.startsWith(m.date.slice(0, 7))) : [];
          return [m.column, { date: sameMonth.length === 1 ? sameMonth[0].date : m.date, action: m.suggested }];
        }),
      ),
    );
    setRows(
      parsed.people.map((p, i) => {
        const result = matchPerson({ name: p.name, unitHint: p.unitText }, data.people);
        const came = `came to ${plural(p.attended.length, "meeting")}`;
        return {
          key: String(i),
          name: p.name,
          detail: [p.unitText, came, ...p.notes].filter(Boolean).join(" · "),
          result,
          decision: initialDecision(result, "new"),
        };
      }),
    );
  }

  const meetings = loaded?.sheet.meetings ?? [];
  const loading = meetings.filter((m) => choices.get(m.column)?.action !== "skip");
  const dates = loading.map((m) => choices.get(m.column)!.date);
  const clash = dates.find((d, i) => dates.indexOf(d) !== i);
  const counts = reviewCounts(rows);
  const blocked = !loaded
    ? "Load a sheet first."
    : loading.length === 0
      ? "Pick at least one meeting to load."
      : clash
        ? `Two meetings are set to ${meetingDateLabel(clash)}.`
        : dates.some((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d))
          ? "Every meeting needs a date."
          : counts.undecided
            ? `Pick who ${counts.undecided === 1 ? "1 person is" : `${counts.undecided} people are`} first.`
            : null;

  function submit() {
    if (!loaded || blocked) return;
    const input: LegacyImportInput = {
      fileName: loaded.fileName,
      meetings: loading.map((m) => {
        const c = choices.get(m.column)!;
        return { key: m.column, date: c.date, status: c.action === "held" ? "held" : "cancelled" };
      }),
      people: rows.flatMap((row) => {
        const p = loaded.sheet.people[Number(row.key)];
        const d = row.decision;
        if (d.kind === "skip" || d.kind === "undecided") return [];
        const units = resolveUnitMentions(p.unitText, data.units);
        const notes = [
          ...p.notes,
          units.unresolved.length ? `Unit on the old sheet: ${p.unitText}` : null,
          `Added from ${loaded.fileName ?? "an old attendance sheet"}`,
        ].filter(Boolean);
        return [
          {
            name: p.name,
            contact: d.kind === "existing" ? { kind: "existing", id: d.id } : { kind: "new", ...splitName(p.name), notes: notes.join("; ") },
            unitIds: units.unitIds,
            attended: p.attended,
          },
        ];
      }),
    };
    start(async () => {
      const result = await importLegacyAction(input);
      if (result.ok) {
        toast.success(result.message);
        setDone(result.message);
        setLoaded(null);
        setPaste("");
      } else toast.error(result.message);
    });
  }

  if (done) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Loaded</CardTitle>
          <CardDescription>{done}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/attendance">See the meetings</Link>
          </Button>
          <Button variant="outline" onClick={() => setDone(null)}>
            Load another sheet
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>1. The sheet</CardTitle>
          <CardDescription>
            In Google Sheets, use File, then Download, then CSV, and pick the file here. Or select all the cells, copy, and
            paste them below. The sheet needs a Name column and one column per meeting, headed by a month like
            &ldquo;Nov 25&rdquo; or a date.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="sheet-file">CSV file</Label>
            <Input
              id="sheet-file"
              type="file"
              accept=".csv,text/csv"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) read(await file.text(), file.name);
              }}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="sheet-paste">Or paste the cells</Label>
            <Textarea id="sheet-paste" rows={4} value={paste} onChange={(e) => setPaste(e.target.value)} />
            <Button variant="outline" className="w-fit" disabled={!paste.trim()} onClick={() => read(paste, null)}>
              Read pasted cells
            </Button>
          </div>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          {loaded && (
            <p className="text-sm text-muted-foreground" role="status">
              Found {plural(loaded.sheet.people.length, "person", "people")} and {plural(meetings.length, "meeting")}
              {loaded.sheet.skippedRows > 0 && `, and skipped ${plural(loaded.sheet.skippedRows, "row")} with no name or a total`}.
            </p>
          )}
        </CardContent>
      </Card>

      {loaded && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>2. Meetings</CardTitle>
              <CardDescription>
                A month heading becomes the 1st of that month unless a meeting that month is already in the app, so fix any
                dates you know. Empty past months are marked cancelled. A meeting already in the app keeps its status.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Column</TableHead>
                    <TableHead>People</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Load as</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {meetings.map((m) => {
                    const c = choices.get(m.column)!;
                    const existing = existingByDate.get(c.date);
                    const set = (patch: Partial<Choice>) => setChoices((map) => new Map(map).set(m.column, { ...c, ...patch }));
                    return (
                      <TableRow key={m.column}>
                        <TableCell className="font-medium">{m.header}</TableCell>
                        <TableCell className="tabular-nums">{m.attendees}</TableCell>
                        <TableCell>
                          <Input
                            type="date"
                            className="w-40"
                            aria-label={`Date for ${m.header}`}
                            value={c.date}
                            disabled={c.action === "skip"}
                            onChange={(e) => set({ date: e.target.value })}
                          />
                          {existing && c.action !== "skip" && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Already in the app: {existing.status}, {plural(existing.checkIns, "check-in")}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          <Select value={c.action} onValueChange={(v) => set({ action: v as MeetingAction })}>
                            <SelectTrigger className="w-36" aria-label={`Load ${m.header} as`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(Object.keys(ACTION_LABELS) as MeetingAction[]).map((a) => (
                                <SelectItem key={a} value={a}>
                                  {ACTION_LABELS[a]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>3. People</CardTitle>
              <CardDescription>
                Confident matches are already picked. Pick who the rest are, or add them as new contacts. New people get the
                units the sheet names, as &ldquo;Adult member&rdquo;, when those units are in the app.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MatchReview
                rows={rows}
                people={data.people}
                onDecide={(key: string, decision: Decision) =>
                  setRows((list) => list.map((r) => (r.key === key ? { ...r, decision } : r)))
                }
              />
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center gap-3">
            <Button size="lg" disabled={pending || !!blocked} onClick={submit}>
              {pending ? "Loading…" : `Load ${plural(loading.length, "meeting")}`}
            </Button>
            {blocked && <p className="text-sm text-muted-foreground">{blocked}</p>}
          </div>
        </>
      )}
    </div>
  );
}
