"use client";

import { FileUpIcon, SearchIcon, TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
import { meetingDateLabel } from "@/lib/attendance/year";
import { DESIGNATIONS, NEW_UNIT_TYPES } from "@/lib/contacts/affiliation-input";
import type { UnitListInfo } from "@/lib/units/apply";
import type { UnitRow } from "@/lib/units/queries";
import { YearSelect } from "../year-select";
import { addUnitAction } from "./actions";

const ALL = "__all";

/** Badges that explain why a unit does or doesn't count toward coverage. */
export function UnitFlags({ unit }: { unit: Pick<UnitRow, "onList" | "counted" | "handAdded" | "youth" | "adults"> }) {
  return (
    <>
      {unit.onList === false && <Badge variant="destructive">Not on the unit list</Badge>}
      {unit.onList && !unit.counted && <Badge variant="outline">No members</Badge>}
      {unit.onList === null && unit.handAdded && <Badge variant="outline">Added by hand</Badge>}
    </>
  );
}

export function UnitsView({
  units,
  info,
  heldMeetings,
  year,
  years,
  canEdit,
  canLoad,
}: {
  units: UnitRow[];
  info: UnitListInfo | null;
  heldMeetings: number;
  year: string;
  years: string[];
  canEdit: boolean;
  canLoad: boolean;
}) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState(ALL);
  const offList = units.filter((u) => u.onList === false);
  const [onlyOff, setOnlyOff] = useState(false);
  const counted = units.filter((u) => u.counted).length;
  const types = useMemo(() => [...new Set(units.map((u) => u.type))], [units]);

  const shown = units.filter((u) => {
    if (onlyOff && u.onList !== false) return false;
    if (type !== ALL && u.type !== type) return false;
    const q = query.trim().toLowerCase().replace(/\s+/g, " ");
    return !q || `${u.label} ${u.subdistrict ?? ""} ${u.charteredOrg ?? ""}`.toLowerCase().includes(q);
  });

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm" role="status">
            {info ? (
              <>
                <span className="font-medium">{counted} units</span> count toward coverage, from the unit list as of{" "}
                {meetingDateLabel(info.asOf, "short")}.
              </>
            ) : (
              <>
                No unit list loaded yet, so coverage counts the <span className="font-medium">{counted} active units</span> from the
                roster.
              </>
            )}
          </p>
          {canLoad && (
            <Button variant="outline" size="sm" asChild>
              <Link href="/units/load">
                <FileUpIcon /> {info ? "Load a newer unit list" : "Load the unit list"}
              </Link>
            </Button>
          )}
        </CardContent>
      </Card>

      {offList.length > 0 && (
        <button
          type="button"
          onClick={() => setOnlyOff((v) => !v)}
          className="flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-left text-sm"
          aria-pressed={onlyOff}
        >
          <TriangleAlertIcon className="size-4 shrink-0 text-destructive" />
          <span>
            {offList.length} {offList.length === 1 ? "unit isn't" : "units aren't"} on the council&apos;s unit list:{" "}
            {offList.map((u) => u.label).join(", ")}. Usually a walk-in&apos;s unit typed by hand, or a unit that folded.{" "}
            <span className="font-medium underline">{onlyOff ? "Show all units" : "Show only these"}</span>
          </span>
        </button>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search units" aria-label="Search units" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-32" aria-label="Unit type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All types</SelectItem>
            {types.map((t) => (
              <SelectItem key={t} value={t}>
                {t}s
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <YearSelect years={years} value={year} />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Unit</TableHead>
            <TableHead className="hidden md:table-cell">Sub-district</TableHead>
            <TableHead className="hidden sm:table-cell text-right">Members</TableHead>
            <TableHead className="text-right">Contacts</TableHead>
            <TableHead className="text-right">At roundtable</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map((u) => (
            <TableRow key={u.id}>
              <TableCell>
                <Link href={`/units/${u.id}?year=${year}`} className="font-medium underline-offset-4 hover:underline">
                  {u.label}
                </Link>
                <div className="mt-1 flex flex-wrap gap-1">
                  <UnitFlags unit={u} />
                </div>
              </TableCell>
              <TableCell className="hidden md:table-cell">{u.subdistrict}</TableCell>
              <TableCell className="hidden sm:table-cell text-right tabular-nums text-sm">
                {u.youth === null ? "" : `${u.youth} youth, ${u.adults} adults`}
              </TableCell>
              <TableCell className="text-right tabular-nums">{u.contacts}</TableCell>
              <TableCell className="text-right tabular-nums">
                {heldMeetings ? `${u.meetings} of ${heldMeetings}` : "No meetings"}
                {u.lastRepresented && (
                  <div className="text-xs text-muted-foreground">last {meetingDateLabel(u.lastRepresented, "short")}</div>
                )}
              </TableCell>
            </TableRow>
          ))}
          {shown.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-sm text-muted-foreground">
                No units match.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {canEdit && <AddUnit />}
    </div>
  );
}

function AddUnit() {
  const [type, setType] = useState<string>("Pack");
  const [number, setNumber] = useState("");
  const [designation, setDesignation] = useState<string>("");
  const [pending, start] = useTransition();
  const options = DESIGNATIONS[type];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add a unit</CardTitle>
        <CardDescription>
          For a unit that isn&apos;t in the app yet. It shows as &ldquo;Not on the unit list&rdquo; until a unit list or roster includes
          it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const result = await addUnitAction({
                type,
                number,
                genderAccepted: options ? ((designation || null) as "B" | "G" | "F" | null) : null,
              });
              if (result.ok) {
                toast.success(result.message);
                setNumber("");
                setDesignation("");
              } else toast.error(result.message);
            });
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="unit-type">Type</Label>
            <Select
              value={type}
              onValueChange={(v) => {
                setType(v);
                setDesignation("");
              }}
            >
              <SelectTrigger id="unit-type" className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NEW_UNIT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="unit-number">Number</Label>
            <Input
              id="unit-number"
              className="w-28"
              inputMode="numeric"
              required
              value={number}
              onChange={(e) => setNumber(e.target.value.replace(/\D/g, ""))}
            />
          </div>
          {options && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="unit-designation">Designation</Label>
              <Select value={designation} onValueChange={setDesignation}>
                <SelectTrigger id="unit-designation" className="w-36">
                  <SelectValue placeholder="Pick one" />
                </SelectTrigger>
                <SelectContent>
                  {options.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <Button type="submit" disabled={pending || !number}>
            {pending ? "Adding…" : "Add unit"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
