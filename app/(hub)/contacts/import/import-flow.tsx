"use client";

import Link from "next/link";
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
import type { ImportPreview } from "@/lib/import/apply";
import { type CsvRow, parseCsvText } from "@/lib/import/csv";
import type { ImportPayload } from "@/lib/import/payload";
import { districtsInFile, missingColumns, parseRoster } from "@/lib/import/roster";
import { commitImportAction, previewImportAction } from "../actions";

type Recent = {
  id: string;
  at: string;
  actorEmail: string | null;
  district: string;
  fileName: string | null;
  counts: Record<string, number>;
};

type Loaded = { fileName: string; fields: string[]; rows: CsvRow[] };

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function Stat({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <div className="rounded-lg border p-3">
      <div className={`text-2xl font-semibold tabular-nums ${muted ? "text-muted-foreground" : ""}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

export function ImportFlow({ savedDistrict, recent }: { savedDistrict: string | null; recent: Recent[] }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [district, setDistrict] = useState<string>("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [done, setDone] = useState<Record<string, number> | null>(null);
  const [pending, start] = useTransition();

  const districts = useMemo(() => (loaded ? districtsInFile(loaded.rows) : []), [loaded]);
  const parsed = useMemo(
    () => (loaded && district ? parseRoster(loaded.rows, loaded.fields, district) : null),
    [loaded, district],
  );
  const payload: ImportPayload | null = parsed
    ? { fileName: loaded!.fileName, district, people: parsed.people, units: parsed.units }
    : null;

  async function onFile(file: File | undefined) {
    setLoaded(null);
    setPreview(null);
    setDone(null);
    setFileError(null);
    if (!file) return;
    const { fields, rows } = parseCsvText(await file.text());
    const missing = missingColumns(fields);
    if (missing.length) {
      setFileError(
        `This doesn't look like the "all registered people" export. Missing columns: ${missing.join(", ")}.`,
      );
      return;
    }
    const found = districtsInFile(rows);
    setLoaded({ fileName: file.name, fields, rows });
    setDistrict(found.find((d) => d.district === savedDistrict)?.district ?? found[0]?.district ?? "");
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>1. Pick the file</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Input
            type="file"
            accept=".csv,text/csv"
            aria-label="Roster export CSV"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
          {fileError && (
            <p className="text-sm text-destructive" role="alert">
              {fileError}
            </p>
          )}
          {loaded && districts.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="district">District</Label>
              <Select
                value={district}
                onValueChange={(v) => {
                  setDistrict(v);
                  setPreview(null);
                }}
              >
                <SelectTrigger id="district" className="w-full sm:w-96">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {districts.map((d) => (
                    <SelectItem key={d.district} value={d.district}>
                      {d.district} ({d.adultRows} adult rows)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      {parsed && payload && (
        <Card>
          <CardHeader>
            <CardTitle>2. What&apos;s in the file</CardTitle>
            <CardDescription>Counted in your browser. Nothing has been sent yet.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Adults to import" value={parsed.summary.people} />
              <Stat label="Units" value={parsed.summary.units} />
              <Stat label="Youth rows dropped" value={parsed.summary.youthRows} muted />
              <Stat label="Other district rows dropped" value={parsed.summary.otherDistrictRows} muted />
            </div>
            <ul className="list-disc pl-5 text-sm text-muted-foreground">
              <li>{plural(parsed.summary.rowsRead, "row")} read.</li>
              {parsed.summary.adultRows > parsed.summary.people && (
                <li>
                  {parsed.summary.adultRows - parsed.summary.people === 1
                    ? "1 extra row was the same person in another position, and was merged."
                    : `${parsed.summary.adultRows - parsed.summary.people} extra rows were the same person in another position, and were merged.`}
                </li>
              )}
              {parsed.summary.noEmail > 0 && (
                <li>
                  {plural(parsed.summary.noEmail, "adult")} {parsed.summary.noEmail === 1 ? "has" : "have"} no email.
                </li>
              )}
              {parsed.summary.sharedEmails.length > 0 && (
                <li>
                  {parsed.summary.sharedEmails.length} email{parsed.summary.sharedEmails.length === 1 ? " is" : "s are"} shared
                  by more than one person (usually a family). They stay separate contacts.
                </li>
              )}
              {parsed.summary.noMemberIdRows > 0 && (
                <li>{plural(parsed.summary.noMemberIdRows, "row")} had no member ID and {parsed.summary.noMemberIdRows === 1 ? "was" : "were"} skipped.</li>
              )}
              {parsed.summary.truncatedRows > 0 && (
                <li>
                  {plural(parsed.summary.truncatedRows, "row")} {parsed.summary.truncatedRows === 1 ? "was" : "were"} cut short in
                  the file. What {parsed.summary.truncatedRows === 1 ? "it" : "they"} had was used.
                </li>
              )}
            </ul>
            {!preview && (
              <Button
                className="w-fit"
                disabled={pending || parsed.summary.people === 0}
                onClick={() =>
                  start(async () => {
                    const result = await previewImportAction(payload);
                    if (result.ok) setPreview(result.preview);
                    else toast.error(result.message);
                  })
                }
              >
                {pending ? "Comparing…" : "Compare with current contacts"}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {preview && payload && !done && (
        <Card>
          <CardHeader>
            <CardTitle>3. Review and confirm</CardTitle>
            <CardDescription>
              Hand-entered notes, preferred names, and positions added by hand are never overwritten. Nobody is deleted.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="New" value={preview.counts.new} />
              <Stat label="Updated" value={preview.counts.updated} />
              <Stat label="Unchanged" value={preview.counts.unchanged} muted />
              <Stat label="No longer in roster" value={preview.counts.notInRoster} />
            </div>
            <ul className="list-disc pl-5 text-sm text-muted-foreground">
              <li>
                Units: {preview.counts.unitsNew} new, {preview.counts.unitsUpdated} updated
                {preview.counts.unitsDeactivated > 0 && `, ${preview.counts.unitsDeactivated} no longer listed (marked inactive)`}.
              </li>
              {preview.counts.reactivated > 0 && (
                <li>
                  {plural(preview.counts.reactivated, "person", "people")} {preview.counts.reactivated === 1 ? "is" : "are"} back
                  in the roster.
                </li>
              )}
              {preview.counts.linkedByEmail > 0 && (
                <li>
                  {plural(preview.counts.linkedByEmail, "hand-added contact")} matched by email and first name, and will be
                  linked.
                </li>
              )}
            </ul>
            {preview.updated.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer font-medium">What changes for the {preview.counts.updated} updated</summary>
                <ul className="mt-2 flex flex-col gap-1">
                  {preview.updated.map((u) => (
                    <li key={u.memberId}>
                      {u.name}: <span className="text-muted-foreground">{u.fields.join(", ")}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {preview.missing.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer font-medium">
                  Who is no longer in the roster ({preview.counts.notInRoster})
                </summary>
                <p className="mt-2 text-muted-foreground">
                  They stay in the app, marked &ldquo;not in latest roster&rdquo;, with their attendance history.
                </p>
                <ul className="mt-2 flex flex-col gap-1">
                  {preview.missing.map((m, i) => (
                    <li key={i}>
                      {m.name} <span className="text-muted-foreground">{m.email}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <div className="flex gap-2">
              <Button
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const result = await commitImportAction(payload);
                    if (result.ok) {
                      setDone(result.counts ?? {});
                      toast.success(result.message);
                    } else toast.error(result.message);
                  })
                }
              >
                {pending ? "Importing…" : `Import ${payload.people.length} people`}
              </Button>
              <Button variant="ghost" disabled={pending} onClick={() => setPreview(null)}>
                Back
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {done && (
        <Card>
          <CardHeader>
            <CardTitle>Done</CardTitle>
            <CardDescription>
              {done.new} new, {done.updated} updated, {done.notInRoster} marked not in roster.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/contacts">Open contacts</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {recent.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">Recent imports</h2>
          <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
            {recent.map((r) => (
              <li key={r.id}>
                {new Date(r.at).toLocaleString()} by {r.actorEmail ?? "unknown"}: {r.counts.people ?? 0} people,{" "}
                {r.counts.new ?? 0} new, {r.counts.updated ?? 0} updated, {r.counts.notInRoster ?? 0} not in roster
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
