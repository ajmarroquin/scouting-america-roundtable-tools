"use client";

import { DownloadIcon } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { percent } from "@/lib/attendance/coverage-math";
import type { Leader, YearCoverage } from "@/lib/attendance/metrics";
import { meetingDateLabel } from "@/lib/attendance/year";
import { downloadCsv, downloadXlsx } from "@/lib/export/download";
import { CopyEmails } from "../contacts/copy-emails";
import { Kpi, Progress } from "../progress";
import { YearSelect } from "../year-select";

export function CouncilReport({ coverage: c, years, leaders }: { coverage: YearCoverage; years: string[]; leaders: Leader[] }) {
  const pct = percent(c.represented, c.total);
  const t = c.trends;
  const counted = c.units.filter((u) => u.counted);
  const toReach = counted.filter((u) => u.meetings === 0);
  const name = (ids: string[]) => ids.map((id) => c.labels[id] ?? "Unknown unit").join(", ");
  const leadersOf = (unitId: string) => leaders.filter((l) => l.unitId === unitId);
  const basis =
    c.source === "list" && c.listAsOf
      ? `the ${c.total} units on the unit list of ${meetingDateLabel(c.listAsOf, "short")}`
      : `the ${c.total} active units from the roster (no unit list loaded yet)`;

  const byMeeting = {
    headers: ["Date", "Topic", "People", `Same month ${c.trends.lastYear}`, "First time this year", "Units", "% of units", "Year so far", "% year so far", "New units", "Not on unit list"],
    rows: c.meetings.map((m) => [
      m.date,
      m.title ?? "",
      m.headcount,
      c.trends.sameMonth[m.id] ?? "",
      m.firstTimers,
      m.represented.length,
      percent(m.represented.length, c.total),
      m.cumulative,
      percent(m.cumulative, c.total),
      name(m.newUnits),
      name(m.offList),
    ]),
  };
  const byUnit = {
    headers: ["Unit", "Sub-district", "Counts toward coverage", "Roundtables attended", "Held roundtables", "Last attended"],
    rows: c.units.map((u) => [u.label, u.subdistrict ?? "", u.counted ? "Yes" : "No", u.meetings, c.meetings.length, u.last ?? ""]),
  };
  const outreach = {
    headers: ["Unit", "Sub-district", "Name", "Position", "Email"],
    rows: toReach.flatMap((u) => {
      const ls = leadersOf(u.id);
      return ls.length ? ls.map((l) => [u.label, u.subdistrict ?? "", l.name, l.position, l.email ?? ""]) : [[u.label, u.subdistrict ?? "", "", "", ""]];
    }),
  };
  const summary = {
    headers: ["Measure", "Value"],
    rows: [
      ["Scouting year", c.year],
      ["Units counted", c.total],
      ["Measured against", basis],
      ["Units with someone at a roundtable", c.represented],
      ["Unit coverage (%)", pct],
      ["Units still to reach", toReach.length],
      ["Held roundtables", c.meetings.length],
      ["Check-ins", c.meetings.reduce((n, m) => n + m.headcount, 0)],
      ["Different people", t.people.people],
      ["New people (first roundtable ever)", t.people.newPeople],
      [`Back from ${t.lastYear}`, t.people.returning],
      [`People in ${t.lastYear}`, t.people.lastYearPeople],
      ["Retention (%)", t.people.retention],
    ],
  };
  const byProgram = {
    headers: ["Program", "Units counted", "Units reached", "% reached"],
    rows: t.programs.map((p) => [`${p.type}s`, p.counted, p.represented, p.percent]),
  };

  async function exportAll() {
    await downloadXlsx(`council-report-${c.year}.xlsx`, [
      { name: "Summary", ...summary },
      { name: "By roundtable", ...byMeeting },
      { name: "By program", ...byProgram },
      { name: "By unit", ...byUnit },
      { name: "Still to reach", ...outreach },
    ]);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <YearSelect years={years} value={c.year} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="ml-auto">
              <DownloadIcon /> Export {c.year}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => void exportAll()}>Excel (summary, roundtables, units, outreach)</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => downloadCsv(`council-report-${c.year}-by-roundtable.csv`, byMeeting.headers, byMeeting.rows)}>
              CSV, one row per roundtable
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => downloadCsv(`council-report-${c.year}-by-unit.csv`, byUnit.headers, byUnit.rows)}>
              CSV, one row per unit
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Card>
        <CardHeader>
          <CardDescription>Unit coverage, {c.year} scouting year</CardDescription>
          <CardTitle className="text-4xl tabular-nums">{pct}%</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Progress value={pct} label="Unit coverage" />
          <p className="text-sm" role="status">
            {c.represented} of {c.total} units had someone at a roundtable. Goal: 100%, {toReach.length} to go.
          </p>
          <p className="text-xs text-muted-foreground">
            Measured against {basis}, across {c.meetings.length} held {c.meetings.length === 1 ? "roundtable" : "roundtables"}.
          </p>
        </CardContent>
      </Card>

      <section className="flex flex-col gap-2" aria-label="Trends">
        <h2 className="text-lg font-medium">Trends</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            label="Different people this year"
            value={String(t.people.people)}
            detail={`${t.people.newPeople} at their first roundtable ever`}
          />
          <Kpi
            label={`Back from ${t.lastYear}`}
            value={t.people.lastYearPeople ? `${t.people.retention}%` : "No data"}
            progress={t.people.lastYearPeople ? t.people.retention : undefined}
            detail={
              t.people.lastYearPeople
                ? `${t.people.returning} of ${t.people.lastYearPeople} people from last year came back`
                : `No roundtables recorded in ${t.lastYear}`
            }
          />
          {t.programs.slice(0, 2).map((p) => (
            <Kpi
              key={p.type}
              label={`${p.type}s reached`}
              value={`${p.represented} of ${p.counted}`}
              progress={p.percent}
              detail={`${p.percent}% of ${p.type.toLowerCase()}s`}
            />
          ))}
        </div>
        {t.programs.length > 2 && (
          <p className="text-sm text-muted-foreground">
            {t.programs
              .slice(2)
              .map((p) => `${p.type}s: ${p.represented} of ${p.counted}`)
              .join(" · ")}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-medium">Units still to reach ({toReach.length})</h2>
          {toReach.some((u) => leadersOf(u.id).length > 0) && <CopyEmails contacts={toReach.flatMap((u) => leadersOf(u.id))} />}
        </div>
        <p className="text-sm text-muted-foreground">
          Leaders here means each unit&apos;s Key 3 in contacts: the unit leader, the committee chair, and the unit rep (chartered org rep
          or council unit representative).
        </p>
        {toReach.length === 0 ? (
          <p className="text-sm">Every unit has had someone at a roundtable this year.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Unit</TableHead>
                <TableHead className="hidden md:table-cell">Sub-district</TableHead>
                <TableHead>Leaders</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {toReach.map((u) => {
                const ls = leadersOf(u.id);
                return (
                  <TableRow key={u.id}>
                    <TableCell>
                      <Link href={`/units/${u.id}?year=${c.year}`} className="font-medium underline-offset-4 hover:underline">
                        {u.label}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{u.subdistrict}</TableCell>
                    <TableCell className="text-sm">
                      {ls.length ? (
                        ls.map((l) => (
                          <div key={`${l.contactId}-${l.position}`}>
                            {l.name} <span className="text-muted-foreground">· {l.position}</span>
                          </div>
                        ))
                      ) : (
                        <Badge variant="outline">No leader in contacts</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">By roundtable</h2>
        {c.meetings.length === 0 ? (
          <p className="text-sm text-muted-foreground">No held roundtables this scouting year yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">People</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Same month {t.lastYear}</TableHead>
                <TableHead className="text-right">Units</TableHead>
                <TableHead className="text-right">Year so far</TableHead>
                <TableHead className="hidden md:table-cell">New units</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {c.meetings.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <Link href={`/roundtables/${m.id}`} className="underline-offset-4 hover:underline">
                      {meetingDateLabel(m.date, "short")}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{m.headcount}</TableCell>
                  <TableCell className="hidden text-right tabular-nums text-muted-foreground sm:table-cell">
                    {t.sameMonth[m.id] ?? "None"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {m.represented.length} <span className="text-xs text-muted-foreground">({percent(m.represented.length, c.total)}%)</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {m.cumulative} <span className="text-xs text-muted-foreground">({percent(m.cumulative, c.total)}%)</span>
                  </TableCell>
                  <TableCell className="hidden text-sm whitespace-normal md:table-cell">{name(m.newUnits)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">By unit</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Unit</TableHead>
              <TableHead className="hidden md:table-cell">Sub-district</TableHead>
              <TableHead className="text-right">Roundtables</TableHead>
              <TableHead className="text-right">Last</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {c.units.map((u) => (
              <TableRow key={u.id}>
                <TableCell>
                  <Link href={`/units/${u.id}?year=${c.year}`} className="underline-offset-4 hover:underline">
                    {u.label}
                  </Link>
                  {!u.counted && (
                    <Badge variant="destructive" className="ml-2">
                      Not on the unit list
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="hidden md:table-cell">{u.subdistrict}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {u.meetings} of {c.meetings.length}
                </TableCell>
                <TableCell className="text-right">{u.last ? meetingDateLabel(u.last, "short") : ""}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
