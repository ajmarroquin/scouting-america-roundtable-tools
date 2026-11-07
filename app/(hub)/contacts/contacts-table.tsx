"use client";

import { DownloadIcon, PlusIcon, SearchIcon, UploadIcon, UsersIcon } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
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
import {
  CONTACT_EXPORT_HEADERS,
  contactExportRows,
  RESEND_EXPORT_HEADERS,
  resendExportRows,
} from "@/lib/contacts/export";
import { STATUS_LABELS, UNIT_TYPE_ORDER } from "@/lib/contacts/format";
import type { ContactListItem, UnitOption } from "@/lib/contacts/queries";
import { downloadCsv, downloadXlsx, stamp } from "@/lib/export/download";
import { CopyEmails } from "./copy-emails";
import { addToGroupAction, createGroupAction, removeFromGroupAction } from "./groups/actions";

const ALL = "all";
const DISTRICT = "district";

type Filters = {
  q: string;
  status: string;
  program: string;
  unit: string;
  position: string;
  email: string;
  group: string;
};

type GroupOption = { value: string; label: string; custom: boolean };

const DEFAULTS: Filters = { q: "", status: "active", program: ALL, unit: ALL, position: ALL, email: ALL, group: ALL };

function matches(c: ContactListItem, f: Filters, memberships: Record<string, string[]>): boolean {
  if (f.group !== ALL && !memberships[c.id]?.includes(f.group)) return false;
  if (f.status !== ALL && c.status !== f.status) return false;
  if (f.email === "with" && !c.email) return false;
  if (f.email === "without" && c.email) return false;
  if (f.program === DISTRICT && !c.affiliations.some((a) => !a.unitId)) return false;
  if (f.program !== ALL && f.program !== DISTRICT && !c.affiliations.some((a) => a.unitType === f.program)) return false;
  if (f.unit !== ALL && !c.affiliations.some((a) => a.unitId === f.unit)) return false;
  if (f.position !== ALL && !c.affiliations.some((a) => a.position === f.position)) return false;
  if (f.q) {
    const q = f.q.toLowerCase();
    const hay = [
      c.name,
      c.firstName,
      c.lastName,
      c.email,
      c.altEmail,
      c.phone,
      ...c.affiliations.flatMap((a) => [a.unitLabel, a.position]),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!q.split(/\s+/).every((word) => hay.includes(word))) return false;
  }
  return true;
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full sm:w-auto sm:min-w-36" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ContactsTable({
  contacts,
  units,
  memberships,
  groupOptions,
  initialGroup,
  canEdit,
  canImport,
}: {
  contacts: ContactListItem[];
  units: UnitOption[];
  memberships: Record<string, string[]>;
  groupOptions: GroupOption[];
  initialGroup?: string;
  canEdit: boolean;
  canImport: boolean;
}) {
  // A group link shows everyone in the group, whatever their status.
  const [filters, setFilterState] = useState<Filters>(initialGroup ? { ...DEFAULTS, group: initialGroup, status: ALL } : DEFAULTS);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Picking people is for what's on screen, so a new filter starts a new pick.
  const setFilters = (next: Filters | ((f: Filters) => Filters)) => {
    setFilterState(next);
    setSelected(new Set());
  };
  const set = (key: keyof Filters) => (value: string) => setFilters((f) => ({ ...f, [key]: value }));

  const filtered = useMemo(() => contacts.filter((c) => matches(c, filters, memberships)), [contacts, filters, memberships]);
  const groupNames = useMemo(() => new Map(groupOptions.filter((g) => g.custom).map((g) => [g.value, g.label])), [groupOptions]);
  const allPicked = filtered.length > 0 && filtered.every((c) => selected.has(c.id));
  const somePicked = !allPicked && filtered.some((c) => selected.has(c.id));
  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const programs = useMemo(() => {
    const present = new Set(contacts.flatMap((c) => c.affiliations.map((a) => a.unitType ?? DISTRICT)));
    return [
      { value: ALL, label: "All programs" },
      ...UNIT_TYPE_ORDER.filter((t) => present.has(t)).map((t) => ({ value: t, label: `${t}s` })),
      ...(present.has(DISTRICT) ? [{ value: DISTRICT, label: "District positions" }] : []),
    ];
  }, [contacts]);

  const positions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of contacts) for (const a of c.affiliations) counts.set(a.position, (counts.get(a.position) ?? 0) + 1);
    return [
      { value: ALL, label: "All positions" },
      ...[...counts].sort((a, b) => b[1] - a[1]).map(([p]) => ({ value: p, label: p })),
    ];
  }, [contacts]);

  const unitOptions = useMemo(
    () => [
      { value: ALL, label: "All units" },
      ...units
        .filter((u) => filters.program === ALL || u.type === filters.program)
        .map((u) => ({ value: u.id, label: u.active ? u.label : `${u.label} (inactive)` })),
    ],
    [units, filters.program],
  );

  if (contacts.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl border p-6">
        <p className="text-sm text-muted-foreground">No contacts yet.</p>
        <div className="flex gap-2">
          {canImport && (
            <Button asChild>
              <Link href="/contacts/import">
                <UploadIcon /> Import the roster
              </Link>
            </Button>
          )}
          {canEdit && (
            <Button variant="outline" asChild>
              <Link href="/contacts/new">
                <PlusIcon /> Add a contact
              </Link>
            </Button>
          )}
        </div>
      </div>
    );
  }

  const filtersActive = JSON.stringify(filters) !== JSON.stringify(DEFAULTS);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {canEdit && (
          <Button variant="outline" size="sm" asChild>
            <Link href="/contacts/new">
              <PlusIcon /> Add contact
            </Link>
          </Button>
        )}
        {canImport && (
          <Button variant="outline" size="sm" asChild>
            <Link href="/contacts/import">
              <UploadIcon /> Import roster
            </Link>
          </Button>
        )}
        <Button variant="outline" size="sm" asChild>
          <Link href="/contacts/groups">
            <UsersIcon /> Groups
          </Link>
        </Button>
      </div>

      <div className="grid gap-2 sm:flex sm:flex-wrap">
        <div className="relative sm:min-w-64 sm:flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search name, email, unit, position"
            aria-label="Search contacts"
            value={filters.q}
            onChange={(e) => set("q")(e.target.value)}
          />
        </div>
        <FilterSelect label="Program" value={filters.program} onChange={(v) => setFilters((f) => ({ ...f, program: v, unit: ALL }))} options={programs} />
        <FilterSelect label="Unit" value={filters.unit} onChange={set("unit")} options={unitOptions} />
        <FilterSelect label="Position" value={filters.position} onChange={set("position")} options={positions} />
        <FilterSelect
          label="Group"
          value={filters.group}
          onChange={set("group")}
          options={[
            { value: ALL, label: "Any group" },
            ...groupOptions.filter((g) => !g.custom),
            ...groupOptions.filter((g) => g.custom).map((g) => ({ value: g.value, label: `Group: ${g.label}` })),
          ]}
        />
        <FilterSelect
          label="Email"
          value={filters.email}
          onChange={set("email")}
          options={[
            { value: ALL, label: "With or without email" },
            { value: "with", label: "Has email" },
            { value: "without", label: "No email" },
          ]}
        />
        <FilterSelect
          label="Status"
          value={filters.status}
          onChange={set("status")}
          options={[
            { value: "active", label: STATUS_LABELS.active },
            { value: "not_in_roster", label: STATUS_LABELS.not_in_roster },
            { value: "archived", label: STATUS_LABELS.archived },
            { value: ALL, label: "Any status" },
          ]}
        />
        {filtersActive && (
          <Button variant="ghost" size="sm" className="self-center" onClick={() => setFilters(DEFAULTS)}>
            Clear filters
          </Button>
        )}
      </div>

      {canEdit && selected.size > 0 && (
        <GroupBar
          picked={[...selected]}
          groups={groupOptions.filter((g) => g.custom)}
          filteredGroup={groupNames.has(filters.group) ? { key: filters.group, name: groupNames.get(filters.group)! } : null}
          onDone={() => setSelected(new Set())}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-sm text-muted-foreground" role="status">
          {filtered.length} of {contacts.length} contacts
        </p>
        <CopyEmails contacts={filtered} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={filtered.length === 0}>
              <DownloadIcon /> Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() => downloadCsv(`contacts-${stamp()}.csv`, CONTACT_EXPORT_HEADERS, contactExportRows(filtered))}
            >
              CSV
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                void downloadXlsx(`contacts-${stamp()}.xlsx`, [
                  { name: "Contacts", headers: CONTACT_EXPORT_HEADERS, rows: contactExportRows(filtered) },
                ])
              }
            >
              Excel
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => downloadCsv(`resend-contacts-${stamp()}.csv`, RESEND_EXPORT_HEADERS, resendExportRows(filtered))}
            >
              Resend contact list (CSV)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            {canEdit && (
              <TableHead className="w-8">
                <Checkbox
                  aria-label="Pick everyone shown"
                  checked={allPicked ? true : somePicked ? "indeterminate" : false}
                  onCheckedChange={(on) => setSelected(on === true ? new Set(filtered.map((c) => c.id)) : new Set())}
                />
              </TableHead>
            )}
            <TableHead>Name</TableHead>
            <TableHead className="hidden md:table-cell">Email</TableHead>
            <TableHead className="hidden lg:table-cell">Phone</TableHead>
            <TableHead>Units and positions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((c) => (
            <TableRow key={c.id} data-state={selected.has(c.id) ? "selected" : undefined}>
              {canEdit && (
                <TableCell className="align-top">
                  <Checkbox aria-label={`Pick ${c.name}`} checked={selected.has(c.id)} onCheckedChange={(on) => toggle(c.id, on === true)} />
                </TableCell>
              )}
              <TableCell className="align-top">
                <Link href={`/contacts/${c.id}`} className="font-medium underline-offset-4 hover:underline">
                  {c.name}
                </Link>
                <div className="mt-1 flex flex-wrap gap-1">
                  {c.isYouth && <Badge variant="secondary">Youth</Badge>}
                  {c.status !== "active" && <Badge variant="outline">{STATUS_LABELS[c.status]}</Badge>}
                  {c.unsubscribed && <Badge variant="outline">Unsubscribed</Badge>}
                  {(memberships[c.id] ?? [])
                    .filter((k) => groupNames.has(k))
                    .map((k) => (
                      <Badge key={k} variant="outline" className="border-dashed">
                        {groupNames.get(k)}
                      </Badge>
                    ))}
                  {c.multipleRegistrations && (
                    <Badge variant="outline" title="Registered in more than one place; the roster lists one">
                      Multiple
                    </Badge>
                  )}
                </div>
                <div className="mt-1 truncate text-xs text-muted-foreground md:hidden">{c.email ?? "No email"}</div>
              </TableCell>
              <TableCell className="hidden align-top md:table-cell">
                {c.email ?? <span className="text-muted-foreground">None</span>}
              </TableCell>
              <TableCell className="hidden align-top whitespace-nowrap lg:table-cell">{c.phone}</TableCell>
              <TableCell className="align-top whitespace-normal">
                <ul className="flex flex-col gap-0.5 text-sm">
                  {c.affiliations.map((a) => (
                    <li key={a.id}>
                      {a.unitLabel ? <span className="font-medium">{a.unitLabel}</span> : <span className="font-medium">District</span>}
                      <span className="text-muted-foreground"> · {a.position}</span>
                    </li>
                  ))}
                </ul>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {filtered.length === 0 && <p className="text-sm text-muted-foreground">No contacts match these filters.</p>}
    </div>
  );
}

const NEW_GROUP = "new";
const plural = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;

/** What to do with the people picked: add them to a group, new or existing, or take them out of the one shown. */
function GroupBar({
  picked,
  groups,
  filteredGroup,
  onDone,
}: {
  picked: string[];
  groups: GroupOption[];
  filteredGroup: { key: string; name: string } | null;
  onDone: () => void;
}) {
  const [target, setTarget] = useState(groups.length ? "" : NEW_GROUP);
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  const run = (action: () => Promise<{ ok: boolean; message: string }>) =>
    start(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(result.message);
        onDone();
      } else toast.error(result.message);
    });
  const idOf = (key: string) => key.replace(/^group:/, "");

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/40 p-2 text-sm" role="region" aria-label="Picked people">
      <span className="px-1 font-medium">{plural(picked.length)} picked</span>
      <Select value={target} onValueChange={setTarget}>
        <SelectTrigger size="sm" aria-label="Group to add them to" className="min-w-44">
          <SelectValue placeholder="Add to a group…" />
        </SelectTrigger>
        <SelectContent>
          {groups.map((g) => (
            <SelectItem key={g.value} value={g.value}>
              {g.label}
            </SelectItem>
          ))}
          <SelectItem value={NEW_GROUP}>New group…</SelectItem>
        </SelectContent>
      </Select>
      {target === NEW_GROUP && (
        <Input
          aria-label="New group name"
          placeholder="Name the new group"
          maxLength={60}
          className="h-7 w-48"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      )}
      <Button
        size="sm"
        disabled={pending || !target || (target === NEW_GROUP && !name.trim())}
        onClick={() =>
          run(() => (target === NEW_GROUP ? createGroupAction({ name }, picked) : addToGroupAction(idOf(target), picked)))
        }
      >
        Add
      </Button>
      {filteredGroup && (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => removeFromGroupAction(idOf(filteredGroup.key), picked))}>
          Take out of {filteredGroup.name}
        </Button>
      )}
      <Button size="sm" variant="ghost" className="ml-auto" disabled={pending} onClick={onDone}>
        Clear
      </Button>
    </div>
  );
}
