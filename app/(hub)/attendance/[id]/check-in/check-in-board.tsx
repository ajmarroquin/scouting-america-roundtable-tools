"use client";

import { CheckIcon, SearchIcon, UserPlusIcon } from "lucide-react";
import { useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CheckInPerson } from "@/lib/attendance/queries";
import { searchPeople } from "@/lib/attendance/search";
import type { UnitOption } from "@/lib/contacts/queries";
import { AffiliationPicker, EMPTY_PICK, type Pick, pickToInput } from "../../../contacts/affiliation-picker";
import { addWalkInAction, checkInAction, undoCheckInAction } from "../../actions";

export function CheckInBoard({
  meetingId,
  people,
  checkedIn,
  units,
  fromRoster,
}: {
  meetingId: string;
  people: CheckInPerson[];
  checkedIn: string[];
  units: UnitOption[];
  fromRoster: string[];
}) {
  const [query, setQuery] = useState("");
  // Taps show at once; the server's list takes over after each refresh.
  const [overrides, setOverrides] = useState<Map<string, boolean>>(new Map());
  const [, start] = useTransition();
  const [walkIn, setWalkIn] = useState(false);
  const search = useRef<HTMLInputElement>(null);

  const server = useMemo(() => new Set(checkedIn), [checkedIn]);
  const isIn = (id: string) => overrides.get(id) ?? server.has(id);
  const here = people.filter((p) => isIn(p.id));
  const results = useMemo(() => searchPeople(people, query), [people, query]);

  function toggle(p: CheckInPerson) {
    const next = !isIn(p.id);
    setOverrides((m) => new Map(m).set(p.id, next));
    if (next) {
      setQuery("");
      search.current?.focus();
    }
    start(async () => {
      const result = next ? await checkInAction(meetingId, p.id) : await undoCheckInAction(meetingId, p.id);
      if (!result.ok) {
        setOverrides((m) => {
          const copy = new Map(m);
          copy.delete(p.id);
          return copy;
        });
        toast.error(result.message);
      } else if (next) {
        toast.success(`${p.name} checked in.`);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold">Check in</h1>
        <p className="text-lg tabular-nums" role="status">
          {here.length} here
        </p>
      </div>

      <div className="sticky top-0 z-10 -mx-4 bg-background px-4 py-2">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={search}
            autoFocus
            className="h-12 pl-10 text-lg"
            placeholder="Type a name or unit"
            aria-label="Search people to check in"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {query && (
        <ul className="flex flex-col gap-2" aria-label="Matches">
          {results.length === 0 && <li className="text-sm text-muted-foreground">No one matches. Add them as a walk-in below.</li>}
          {results.map((p) => {
            const checked = isIn(p.id);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => toggle(p)}
                  aria-pressed={checked}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl border p-4 text-left transition-colors ${
                    checked ? "border-primary bg-primary/10" : "hover:bg-muted"
                  }`}
                >
                  <span>
                    <span className="block text-base font-medium">{p.name}</span>
                    <span className="block text-sm text-muted-foreground">{p.units.join(", ") || p.email || "No unit"}</span>
                  </span>
                  <span className="shrink-0 text-sm font-medium">
                    {checked ? (
                      <span className="flex items-center gap-1">
                        <CheckIcon className="size-4" /> Here (tap to undo)
                      </span>
                    ) : (
                      "Check in"
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {walkIn ? (
        <WalkInForm
          meetingId={meetingId}
          units={units}
          fromRoster={fromRoster}
          initialName={query}
          onDone={() => {
            setWalkIn(false);
            setQuery("");
          }}
        />
      ) : (
        <Button variant="outline" className="w-full sm:w-fit" onClick={() => setWalkIn(true)}>
          <UserPlusIcon /> Someone new? Add a walk-in
        </Button>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">Here so far</h2>
        {here.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nobody yet.</p>
        ) : (
          <ul className="flex flex-col divide-y rounded-xl border">
            {here.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 px-4 py-2">
                <span>
                  <span className="block text-sm font-medium">{p.name}</span>
                  <span className="block text-xs text-muted-foreground">{p.units.join(", ")}</span>
                </span>
                <Button variant="ghost" size="sm" onClick={() => toggle(p)} aria-label={`Undo check-in for ${p.name}`}>
                  Undo
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function WalkInForm({
  meetingId,
  units,
  fromRoster,
  initialName,
  onDone,
}: {
  meetingId: string;
  units: UnitOption[];
  fromRoster: string[];
  initialName: string;
  onDone: () => void;
}) {
  const [first, ...rest] = initialName.trim().split(/\s+/);
  const [values, setValues] = useState({ firstName: first ?? "", lastName: rest.join(" "), email: "", phone: "" });
  const [pick, setPick] = useState<Pick>(EMPTY_PICK);
  const [pending, start] = useTransition();
  const field = (key: keyof typeof values) => ({
    value: values[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setValues((v) => ({ ...v, [key]: e.target.value })),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add a walk-in</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const affiliation = pickToInput(pick);
            if (affiliation && !affiliation.position) return void toast.error("Pick their position, or clear the unit.");
            start(async () => {
              const result = await addWalkInAction(meetingId, {
                ...values,
                isYouth: false,
                guardianEmail: "",
                affiliations: affiliation ? [affiliation] : [],
              });
              if (result.ok) {
                toast.success(result.message);
                onDone();
              } else toast.error(result.message);
            });
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="walkin-first">First name</Label>
            <Input id="walkin-first" required autoComplete="off" {...field("firstName")} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="walkin-last">Last name</Label>
            <Input id="walkin-last" autoComplete="off" {...field("lastName")} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="walkin-email">Email</Label>
            <Input id="walkin-email" type="email" inputMode="email" autoComplete="off" {...field("email")} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="walkin-phone">Phone</Label>
            <Input id="walkin-phone" type="tel" autoComplete="off" {...field("phone")} />
          </div>
          <div className="sm:col-span-2">
            <AffiliationPicker idPrefix="walkin" value={pick} onChange={setPick} units={units} fromRoster={fromRoster} />
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Adding…" : "Add and check in"}
            </Button>
            <Button type="button" variant="ghost" onClick={onDone}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
