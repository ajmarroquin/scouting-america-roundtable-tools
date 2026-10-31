"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
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
import { meetingDateLabel } from "@/lib/attendance/year";
import { unitLabel } from "@/lib/contacts/format";
import type { UnitListPayload } from "@/lib/units/apply";
import { type ListedUnit, parseUnitList, type UnitList } from "@/lib/units/unit-list";
import { loadUnitListAction, previewUnitListAction } from "../actions";

type Preview = {
  counts: { matched: number; changed: number; created: number; skipped: number; counted: number };
  changed: { from: string | null; unit: ListedUnit }[];
  created: ListedUnit[];
  skipped: ListedUnit[];
};

const label = (u: ListedUnit) => unitLabel(u) + (u.type === "Troop" && u.genderAccepted === "F" ? " (family)" : "");

export function LoadUnitList({ savedDistrict, lastAsOf }: { savedDistrict: string | null; lastAsOf: string | null }) {
  const [list, setList] = useState<(UnitList & { fileName: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [district, setDistrict] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const payload = (): UnitListPayload | null =>
    list && district
      ? { fileName: list.fileName, asOf: list.asOf, district, units: list.units.filter((u) => u.district === district) }
      : null;

  function check(d: string, l = list) {
    setDistrict(d);
    setPreview(null);
    if (!l) return;
    start(async () => {
      const result = await previewUnitListAction({
        fileName: l.fileName,
        asOf: l.asOf,
        district: d,
        units: l.units.filter((u) => u.district === d),
      });
      if (result.ok && "counts" in result) setPreview(result);
      else toast.error(result.message ?? "Couldn't read the list.");
    });
  }

  async function onFile(file: File | undefined) {
    setList(null);
    setPreview(null);
    setDone(null);
    setError(null);
    if (!file) return;
    const parsed = parseUnitList(await file.text());
    if ("error" in parsed) return void setError(parsed.error);
    const loaded = { ...parsed, fileName: file.name };
    setList(loaded);
    const pick = parsed.districts.find((d) => d === savedDistrict) ?? parsed.districts[0] ?? "";
    if (pick) check(pick, loaded);
  }

  if (done) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Loaded</CardTitle>
          <CardDescription>{done}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/units">See the units</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>The report</CardTitle>
          <CardDescription>
            In Scouting America&apos;s reports, run the Unit Membership Totals report (OLR Membership Status Summary) for the district
            and download it as CSV. It has unit names and member counts, no people.
            {lastAsOf && ` The current list is from ${meetingDateLabel(lastAsOf, "short")}.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="unit-list-file">CSV file</Label>
            <Input id="unit-list-file" type="file" accept=".csv,text/csv" onChange={(e) => void onFile(e.target.files?.[0])} />
          </div>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          {list && list.districts.length > 1 && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="unit-list-district">District</Label>
              <Select value={district} onValueChange={(d) => check(d)}>
                <SelectTrigger id="unit-list-district" className="w-72">
                  <SelectValue placeholder="Pick a district" />
                </SelectTrigger>
                <SelectContent>
                  {list.districts.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {list && (
            <p className="text-sm text-muted-foreground" role="status">
              {list.units.filter((u) => !district || u.district === district).length} units
              {district ? ` in ${district}` : ""}
              {list.asOf ? `, as of ${meetingDateLabel(list.asOf, "short")}` : ""}.
              {list.unreadable.length > 0 && ` Couldn't read: ${list.unreadable.join(", ")}.`}
            </p>
          )}
        </CardContent>
      </Card>

      {preview && (
        <Card>
          <CardHeader>
            <CardTitle>What this changes</CardTitle>
            <CardDescription>
              {preview.counts.counted} units will count toward coverage. {preview.counts.matched} are already in the app.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            {preview.created.length > 0 && (
              <p>
                <span className="font-medium">New to the app ({preview.created.length}):</span>{" "}
                {preview.created.map(label).join(", ")}
              </p>
            )}
            {preview.changed.length > 0 && (
              <p>
                <span className="font-medium">Designation changed ({preview.changed.length}):</span>{" "}
                {preview.changed.map((c) => `${c.unit.type} ${c.unit.number} ${c.from ?? "none"} → ${c.unit.genderAccepted ?? "none"}`).join(", ")}
              </p>
            )}
            {preview.skipped.length > 0 && (
              <p className="text-muted-foreground">
                <span className="font-medium">Left out, no members ({preview.skipped.length}):</span>{" "}
                {preview.skipped.map(label).join(", ")}
              </p>
            )}
            <Button
              className="w-fit"
              disabled={pending}
              onClick={() => {
                const p = payload();
                if (!p) return;
                start(async () => {
                  const result = await loadUnitListAction(p);
                  if (result.ok) {
                    toast.success(result.message);
                    setDone(result.message);
                  } else toast.error(result.message);
                });
              }}
            >
              {pending ? "Loading…" : "Load the unit list"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
