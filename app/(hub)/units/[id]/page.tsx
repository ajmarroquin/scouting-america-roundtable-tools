import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { scoutingYears } from "@/lib/attendance/coverage";
import { appTimeZone } from "@/lib/attendance/queries";
import { meetingDateLabel, scoutingYearOf, todayIn, yearRange } from "@/lib/attendance/year";
import { requireUser } from "@/lib/auth/session";
import { STATUS_LABELS } from "@/lib/contacts/format";
import { getUnitDetail } from "@/lib/units/queries";
import { YearSelect } from "../../year-select";
import { UnitFlags } from "../units-view";

export const metadata: Metadata = { title: "Unit" };

export default function UnitPage({ params, searchParams }: PageProps<"/units/[id]">) {
  return (
    <div className="flex flex-col gap-4">
      <Link href="/units" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> Units
      </Link>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
        <UnitView params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-xl border p-3">
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
      {detail && <div className="mt-1 text-xs text-muted-foreground">{detail}</div>}
    </div>
  );
}

async function UnitView({
  params,
  searchParams,
}: {
  params: PageProps<"/units/[id]">["params"];
  searchParams: PageProps<"/units/[id]">["searchParams"];
}) {
  const { id } = await params;
  await requireUser();
  if (!z.uuid().safeParse(id).success) notFound();
  const current = scoutingYearOf(todayIn(appTimeZone()));
  const asked = (await searchParams).year;
  const years = await scoutingYears(current);
  const year = typeof asked === "string" && years.includes(asked) ? asked : current;
  const data = await getUnitDetail(id, yearRange(year));
  if (!data) notFound();
  const { unit: u, meetings, people, contacts, listAsOf } = data;
  const represented = meetings.filter((m) => m.people.length > 0);
  const adults = contacts.filter((c) => !c.isYouth);

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{u.label}</h1>
          <p className="text-sm text-muted-foreground">
            {[u.subdistrict, u.charteredOrg].filter(Boolean).join(" · ")}
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            <UnitFlags unit={u} />
            {u.counted && <Badge variant="secondary">Counts toward coverage</Badge>}
          </div>
        </div>
        <YearSelect years={years} value={year} />
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat
          label={`meetings with someone from ${u.label}`}
          value={meetings.length ? `${represented.length} of ${meetings.length}` : "None held"}
          detail={meetings.length ? `${Math.round((represented.length / meetings.length) * 100)}% of ${year} roundtables` : undefined}
        />
        <Stat label="people who came for this unit" value={String(people.length)} />
        <Stat
          label="last at roundtable"
          value={represented.length ? meetingDateLabel(represented.at(-1)!.date, "short") : "Not yet"}
        />
        <Stat
          label="members"
          value={u.youth === null ? "Unknown" : `${u.youth + (u.adults ?? 0)}`}
          detail={u.youth === null ? undefined : `${u.youth} youth, ${u.adults} adults${listAsOf ? ` (list of ${meetingDateLabel(listAsOf, "short")})` : ""}`}
        />
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Roundtables in {year}</h2>
        {meetings.length === 0 ? (
          <p className="text-sm text-muted-foreground">No held meetings this scouting year yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Who came for {u.label}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {meetings.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <Link href={`/attendance/${m.id}`} className="underline-offset-4 hover:underline">
                      {meetingDateLabel(m.date, "short")}
                    </Link>
                  </TableCell>
                  <TableCell className={m.people.length ? "" : "text-muted-foreground"}>
                    {m.people.length ? m.people.map((p) => p.name).join(", ") : "Nobody"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      {people.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">How often they came</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Meetings</TableHead>
                <TableHead className="text-right">Last</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {people.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <Link href={`/contacts/${p.id}`} className="underline-offset-4 hover:underline">
                      {p.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {p.meetings} of {meetings.length}
                  </TableCell>
                  <TableCell className="text-right">{p.last ? meetingDateLabel(p.last, "short") : ""}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Adults in the app ({adults.length})</h2>
        {adults.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nobody in contacts is connected to this unit yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Position</TableHead>
                <TableHead className="hidden md:table-cell">Email</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {adults.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link href={`/contacts/${c.id}`} className="underline-offset-4 hover:underline">
                      {c.name}
                    </Link>
                    {c.status !== "active" && (
                      <Badge variant="outline" className="ml-2">
                        {STATUS_LABELS[c.status]}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{c.positions.join(", ")}</TableCell>
                  <TableCell className="hidden text-sm md:table-cell">{c.email}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </>
  );
}
