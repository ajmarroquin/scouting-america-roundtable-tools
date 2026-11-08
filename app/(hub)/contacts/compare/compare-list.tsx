"use client";

import { DownloadIcon, UserPlusIcon } from "lucide-react";
import Link from "next/link";
import Papa from "papaparse";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { type ListPerson, cellText, compareToContacts, readList } from "@/lib/contacts/compare";
import type { ComparePerson } from "@/lib/contacts/list-compare";
import { downloadCsv, downloadXlsx, stamp } from "@/lib/export/download";
import { type Decision, initialDecision, MatchReview, type ReviewRow } from "../../roundtables/match-review";
import { addFromListAction } from "./actions";

type Row = ReviewRow & { person: ListPerson };
type Loaded = { used: string[]; skipped: number; source: string };
type Done = { message: string; groupId?: string; failed?: string[] };

function parseTable(text: string): string[][] {
  return Papa.parse<string[]>(text.replace(/^﻿/, ""), { skipEmptyLines: "greedy" }).data;
}

/** The first sheet of an .xlsx, or a CSV, as rows of text. Read here, never uploaded. */
async function readFile(file: File): Promise<string[][]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xls")) throw new Error("That's an older Excel file (.xls). Save it as .xlsx or CSV and pick it again.");
  if (!name.endsWith(".xlsx")) return parseTable(await file.text());
  const { default: ExcelJS } = await import("exceljs");
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await file.arrayBuffer());
  const sheet = book.worksheets.find((s) => s.actualRowCount > 0);
  const rows: string[][] = [];
  sheet?.eachRow({ includeEmpty: false }, (row) => {
    const values = Array.isArray(row.values) ? row.values.slice(1) : [];
    rows.push(Array.from(values, cellText));
  });
  return rows;
}

const fullName = (p: ListPerson) => [p.firstName, p.lastName, p.suffix].filter(Boolean).join(" ");
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function CompareList({ people }: { people: ComparePerson[] }) {
  const [paste, setPaste] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [groupName, setGroupName] = useState("");
  const [done, setDone] = useState<Done | null>(null);
  const [pending, start] = useTransition();
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);

  function load(table: string[][], source: string) {
    setError(null);
    setDone(null);
    const list = readList(table);
    if ("error" in list) {
      setLoaded(null);
      setRows([]);
      return void setError(list.error);
    }
    setLoaded({ used: list.used, skipped: list.skipped, source });
    setRows(
      list.people.map((p, i) => {
        const result = compareToContacts(p, people);
        return {
          key: String(i),
          name: fullName(p),
          detail: [p.email, p.phone].filter(Boolean).join(" · ") || null,
          result,
          decision: initialDecision(result, "new"),
          person: p,
        };
      }),
    );
  }

  const decide = (key: string, decision: Decision) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, decision } : r)));
  const inContacts = rows.filter((r) => r.decision.kind === "existing");
  const notIn = rows.filter((r) => r.decision.kind === "new" || r.decision.kind === "skip");
  const toAdd = rows.filter((r) => r.decision.kind === "new");
  const toCheck = rows.filter((r) => r.decision.kind === "undecided");

  const outcome = (r: Row) => (r.decision.kind === "existing" ? "In contacts" : r.decision.kind === "undecided" ? "To check" : "Not in contacts");
  const listColumns = (p: ListPerson) => [p.firstName, p.lastName, p.suffix, p.email, p.phone];

  function downloadResults() {
    void downloadXlsx(`list-compared-${stamp()}.xlsx`, [
      {
        name: "Compared",
        headers: ["Result", "First Name", "Last Name", "Suffix", "Email", "Phone", "Contact", "Roles", "Contact email", "How it matched"],
        rows: rows.map((r) => {
          const id = r.decision.kind === "existing" ? r.decision.id : null;
          const c = id ? byId.get(id) : undefined;
          const how = id ? (r.result.candidates.find((x) => x.id === id)?.reason ?? "picked by hand") : (r.result.candidates[0]?.reason ?? "");
          return [outcome(r), ...listColumns(r.person), c?.name ?? "", c?.roles ?? "", c?.email ?? "", how];
        }),
      },
    ]);
  }

  function add() {
    start(async () => {
      const result = await addFromListAction({
        add: toAdd.map((r) => ({ firstName: r.person.firstName, lastName: r.person.lastName, email: r.person.email, phone: r.person.phone })),
        existingIds: [...new Set(inContacts.map((r) => (r.decision as { id: string }).id))],
        groupName: groupName.trim() || undefined,
      });
      if (!result.ok) return void toast.error(result.message);
      toast.success(result.message);
      setDone(result);
    });
  }

  if (done) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Done</CardTitle>
          <CardDescription>{done.message}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {!!done.failed?.length && (
            <div className="text-sm text-destructive" role="alert">
              <p>Couldn&apos;t add {plural(done.failed.length, "person", "people")}:</p>
              <ul className="list-disc pl-5">
                {done.failed.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-sm text-muted-foreground">
            New contacts have no unit or position yet. Open each one to add what you know.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href={done.groupId ? `/contacts?group=group:${done.groupId}` : "/contacts"}>{done.groupId ? "See the group" : "See contacts"}</Link>
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setDone(null);
                setLoaded(null);
                setRows([]);
                setPaste("");
                setGroupName("");
              }}
            >
              Compare another list
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>1. The list</CardTitle>
          <CardDescription>
            An Excel (.xlsx) or CSV file, or cells copied from a spreadsheet. It needs First Name and Last Name columns, or one
            Name column. Email and phone help it match; any other columns are ignored.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="list-file">File</Label>
            <Input
              id="list-file"
              type="file"
              accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  load(await readFile(file), file.name);
                } catch (err) {
                  setError(err instanceof Error && err.message.includes(".xls") ? err.message : "Couldn't read that file. Try saving it as CSV.");
                }
              }}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="list-paste">Or paste the cells, with the header row</Label>
            <Textarea id="list-paste" rows={4} value={paste} onChange={(e) => setPaste(e.target.value)} />
            <Button variant="outline" className="w-fit" disabled={!paste.trim()} onClick={() => load(parseTable(paste), "pasted cells")}>
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
              Read {plural(rows.length, "person", "people")} from {loaded.source}, using {loaded.used.join(", ")}
              {loaded.skipped > 0 && `. Skipped ${plural(loaded.skipped, "row")} with no name`}.
            </p>
          )}
        </CardContent>
      </Card>

      {loaded && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>2. Who&apos;s in contacts</CardTitle>
              <CardDescription>
                Of {plural(rows.length, "person", "people")} on the list,{" "}
                <span className="font-medium text-foreground">{inContacts.length} in contacts</span>,{" "}
                <span className="font-medium text-foreground">{notIn.length} not</span>
                {toCheck.length > 0 && (
                  <>
                    , and <span className="font-medium text-destructive">{toCheck.length} to check</span>
                  </>
                )}
                . Matches use the same email or phone with the name, or the name alone when only one contact fits (nicknames and small
                typos count). A shared family email or two people with one name wait for you to pick.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MatchReview rows={rows} people={people} onDecide={decide} newLabel="Not in contacts: add them" skipLabel="Not in contacts: leave out" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>3. Next</CardTitle>
              <CardDescription>Download what you found, or add the people who aren&apos;t in contacts yet.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={downloadResults}>
                  <DownloadIcon /> Download results (Excel)
                </Button>
                <Button
                  variant="outline"
                  disabled={notIn.length === 0}
                  onClick={() =>
                    downloadCsv(`not-in-contacts-${stamp()}.csv`, ["First Name", "Last Name", "Suffix", "Email", "Phone"], notIn.map((r) => listColumns(r.person)))
                  }
                >
                  <DownloadIcon /> Download the {notIn.length} not in contacts (CSV)
                </Button>
              </div>
              <div className="flex flex-col gap-2 border-t pt-4">
                <Label htmlFor="list-group">Also put everyone from this list in a new group (optional)</Label>
                <Input
                  id="list-group"
                  className="sm:max-w-sm"
                  maxLength={60}
                  placeholder="District commissioner's list"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  The {inContacts.length} in contacts and anyone you add, so you can filter contacts or send an announcement to just
                  them.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <Button className="w-fit" disabled={pending || (toAdd.length === 0 && !groupName.trim())} onClick={add}>
                  <UserPlusIcon />
                  {pending
                    ? "Saving…"
                    : toAdd.length
                      ? `Add ${plural(toAdd.length, "person", "people")} as contacts${groupName.trim() ? " and make the group" : ""}`
                      : "Make the group"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  They&apos;re added as adults with no unit or position yet, so they&apos;re easy to find and fill in later.
                  {toCheck.length > 0 && ` The ${plural(toCheck.length, "person", "people")} still to check ${toCheck.length === 1 ? "is" : "are"} left out until you pick.`}
                </p>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
