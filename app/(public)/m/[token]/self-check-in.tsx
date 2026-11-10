"use client";

import { CalendarPlusIcon, CheckCircle2Icon, PlusIcon, XIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { meetingIcs } from "@/lib/selfcheckin/ics";
import type { Mode, Person, Response, UnitChoice } from "@/lib/selfcheckin/service";
import { answerAction, answerNewAction, confirmAction, identifyAction, pickAction, registerAction } from "./actions";

type Calendar = { id: string; start: string; end: string; title: string; place: string | null };

type Claim = { unitId: string; role: string };
type Step =
  | { kind: "find" }
  | { kind: "choose"; people: { contactId: string; firstName: string }[] }
  | { kind: "match"; person: Person }
  | { kind: "new" }
  | { kind: "done"; message: string; joinUrl?: string | null; going?: boolean };

/** "Pack 12", "Pack 12 & Troop 40", "Pack 12, Troop 40 & Crew 7". */
export function listUnits(labels: string[]): string {
  if (labels.length <= 1) return labels[0] ?? "";
  return `${labels.slice(0, -1).join(", ")} & ${labels.at(-1)}`;
}

export function SelfCheckIn({ token, units, mode, calendar }: { token: string; units: UnitChoice[]; mode: Mode; calendar?: Calendar }) {
  const [step, setStep] = useState<Step>({ kind: "find" });
  const [email, setEmail] = useState("");
  const [lastName, setLastName] = useState("");
  const [website, setWebsite] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const who = { email, lastName, website };

  const run = (fn: () => Promise<void>) =>
    start(async () => {
      setError("");
      try {
        await fn();
      } catch {
        setError("Something went wrong. Check in with the volunteer at the table.");
      }
    });

  const onFound = (r: Awaited<ReturnType<typeof identifyAction>>) => {
    if (!r.ok) return setError(r.message);
    if (r.kind === "new") setStep({ kind: "new" });
    else if (r.kind === "choose") setStep({ kind: "choose", people: r.people });
    else setStep({ kind: "match", person: r.person });
  };

  if (step.kind === "done") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border p-6 text-center" role="status">
        <CheckCircle2Icon className="size-12 text-green-600" aria-hidden />
        <p className="text-lg font-medium">{step.message}</p>
        {step.going && calendar && <CalendarButton calendar={calendar} joinUrl={step.joinUrl} />}
        {step.joinUrl && (
          <Button size="lg" asChild>
            <a href={step.joinUrl} target="_blank" rel="noreferrer">
              Join the meeting online
            </a>
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {step.kind === "find" && (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => onFound(await identifyAction(token, who, mode)));
          }}
        >
          <p className="text-sm text-muted-foreground">Enter the email you use for Scouting and your last name.</p>
          <div className="flex flex-col gap-2">
            <Label htmlFor="sci-email">Email</Label>
            <Input id="sci-email" type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="sci-last">Last name</Label>
            <Input id="sci-last" autoComplete="family-name" required value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
          {/* A field people never see; bots fill it in. */}
          <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
            <label>
              Website
              <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
            </label>
          </div>
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? "Looking…" : "Find me"}
          </Button>
        </form>
      )}

      {step.kind === "choose" && (
        <div className="flex flex-col gap-3">
          <p className="font-medium">More than one person uses that email. Which one are you?</p>
          {step.people.map((p) => (
            <Button key={p.contactId} variant="outline" size="lg" disabled={pending} onClick={() => run(async () => onFound(await pickAction(token, who, p.contactId, mode)))}>
              I&apos;m {p.firstName}
            </Button>
          ))}
          <Button variant="ghost" onClick={() => setStep({ kind: "new" })}>
            Neither, I&apos;m new
          </Button>
        </div>
      )}

      {step.kind === "match" && mode === "rsvp" && (
        <RsvpChoice
          person={step.person}
          pending={pending}
          onAnswer={(response) =>
            run(async () => {
              const r = await answerAction(token, { ...who, contactId: step.person.contactId, response });
              if (r.ok) setStep({ kind: "done", message: r.message, joinUrl: r.joinUrl, going: response === "yes" });
              else setError(r.message);
            })
          }
        />
      )}

      {step.kind === "match" && mode === "check_in" && (
        <Confirm
          person={step.person}
          units={units}
          pending={pending}
          onSubmit={(choice) =>
            run(async () => {
              const r = await confirmAction(token, { ...who, contactId: step.person.contactId, ...choice });
              if (r.ok) setStep({ kind: "done", message: r.message, joinUrl: r.joinUrl });
              else setError(r.message);
            })
          }
        />
      )}

      {step.kind === "new" && (
        <NewPerson
          email={email}
          lastName={lastName}
          units={units}
          mode={mode}
          pending={pending}
          onSubmit={(input) =>
            run(async () => {
              if (input.response) {
                const r = await answerNewAction(token, { ...input, website });
                if (r.ok) setStep({ kind: "done", message: r.message, joinUrl: r.joinUrl, going: input.response === "yes" });
                else setError(r.message);
                return;
              }
              const r = await registerAction(token, { ...input, website });
              if (r.ok) setStep({ kind: "done", message: r.message, joinUrl: r.joinUrl });
              else setError(r.message);
            })
          }
        />
      )}

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {step.kind !== "find" && (
        <Button variant="link" className="w-fit px-0" onClick={() => setStep({ kind: "find" })}>
          Start over
        </Button>
      )}
    </div>
  );
}

function Confirm({
  person,
  units,
  pending,
  onSubmit,
}: {
  person: Person;
  units: UnitChoice[];
  pending: boolean;
  onSubmit: (c: { leaving: string[]; adding: Claim[] }) => void;
}) {
  // They represent every unit on their record. This is only a chance to correct it:
  // a unit they've left, or one that's missing.
  const [leaving, setLeaving] = useState<string[]>(person.leaving);
  const [adding, setAdding] = useState<Claim[]>([]);
  const [editing, setEditing] = useState(!person.alreadyIn);
  const label = (id: string) => units.find((u) => u.id === id)?.label ?? person.units.find((u) => u.id === id)?.label ?? "";
  const tonight = [...person.units.filter((u) => !leaving.includes(u.id)).map((u) => u.label), ...adding.map((a) => label(a.unitId))].filter(Boolean);
  const changed = adding.length > 0 || leaving.length !== person.leaving.length || leaving.some((id) => !person.leaving.includes(id));
  const summary = tonight.length ? `for ${listUnits(tonight)}` : "without a unit";

  // Already checked in: show what counts, and let them confirm or change it.
  if (!editing) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-lg font-medium">Hi {person.firstName}. You&apos;re already checked in {summary}.</p>
        <div className="grid grid-cols-2 gap-2">
          <Button size="lg" disabled={pending} onClick={() => onSubmit({ leaving, adding: [] })}>
            Looks right
          </Button>
          <Button size="lg" variant="outline" disabled={pending} onClick={() => setEditing(true)}>
            Fix my units
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ leaving, adding });
      }}
    >
      <p className="text-lg font-medium">Hi {person.firstName}.</p>
      <p className="rounded-xl bg-muted/50 p-3 text-sm" aria-live="polite">
        {person.units.length || adding.length
          ? `You're checking in ${summary}.`
          : "We don't have a unit on your record. If you're with one, add it below, or check in without one."}
      </p>
      {person.units.length > 0 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Your units. Anything out of date?</legend>
          {person.units.map((u) => {
            const gone = leaving.includes(u.id);
            return (
              <div key={u.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
                <span className={`text-sm ${gone ? "text-muted-foreground line-through" : ""}`}>
                  {u.label}
                  {u.role && <span className="text-muted-foreground"> · {u.role}</span>}
                  {u.pending && <span className="block text-xs text-muted-foreground">Waiting to be added to your record</span>}
                </span>
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline underline-offset-2"
                  onClick={() => setLeaving((l) => (gone ? l.filter((x) => x !== u.id) : [...l, u.id]))}
                >
                  {gone ? "Undo" : u.pending ? "Remove" : "Not with this unit anymore"}
                </button>
              </div>
            );
          })}
        </fieldset>
      )}
      <AddUnits units={units.filter((u) => !person.units.some((p) => p.id === u.id))} adding={adding} setAdding={setAdding} label={label} />
      <Button type="submit" size="lg" disabled={pending || (person.alreadyIn && !changed)}>
        {pending ? "Checking in…" : person.alreadyIn ? "Save changes" : "Check me in"}
      </Button>
    </form>
  );
}

function AddUnits({
  units,
  adding,
  setAdding,
  label,
}: {
  units: UnitChoice[];
  adding: Claim[];
  setAdding: (f: (a: Claim[]) => Claim[]) => void;
  label: (id: string) => string;
}) {
  const [unitId, setUnitId] = useState("");
  const [role, setRole] = useState("");
  const choices = units.filter((u) => !adding.some((a) => a.unitId === u.id));
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">Representing another unit?</p>
      {adding.map((a) => (
        <div key={a.unitId} className="flex items-center justify-between gap-2 rounded-lg border border-dashed px-3 py-2 text-sm">
          <span>
            {label(a.unitId)}
            {a.role && <span className="text-muted-foreground"> · {a.role}</span>}
          </span>
          <Button type="button" variant="ghost" size="icon-xs" aria-label={`Remove ${label(a.unitId)}`} onClick={() => setAdding((all) => all.filter((x) => x.unitId !== a.unitId))}>
            <XIcon />
          </Button>
        </div>
      ))}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Combobox
          label="Unit"
          placeholder="Pick a unit"
          className="h-9 sm:w-44"
          value={unitId}
          onChange={setUnitId}
          options={choices.map((u) => ({ value: u.id, label: u.label, group: u.label.split(" ")[0] + "s" }))}
        />
        <Input aria-label="Your role (optional)" placeholder="Your role (optional)" maxLength={80} value={role} onChange={(e) => setRole(e.target.value)} />
        <Button
          type="button"
          variant="outline"
          disabled={!unitId}
          onClick={() => {
            setAdding((all) => [...all, { unitId, role: role.trim() }]);
            setUnitId("");
            setRole("");
          }}
        >
          <PlusIcon /> Add
        </Button>
      </div>
      {adding.length > 0 && <p className="text-xs text-muted-foreground">A volunteer will add it to your record.</p>}
    </div>
  );
}

function NewPerson({
  email: initialEmail,
  lastName: initialLast,
  units,
  mode,
  pending,
  onSubmit,
}: {
  email: string;
  lastName: string;
  units: UnitChoice[];
  mode: Mode;
  pending: boolean;
  onSubmit: (input: { firstName: string; lastName: string; email: string; adding: Claim[]; adult: boolean; response?: Response }) => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState(initialLast);
  const [email, setEmail] = useState(initialEmail);
  const [adding, setAdding] = useState<Claim[]>([]);
  const [adult, setAdult] = useState(false);
  const label = (id: string) => units.find((u) => u.id === id)?.label ?? "";
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ firstName, lastName, email, adding, adult });
      }}
    >
      <div>
        <p className="font-medium">We don&apos;t have you yet. Welcome!</p>
        <p className="text-sm text-muted-foreground">If you think we should, check the email for typos, or try the other email you use.</p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="sci-new-first">First name</Label>
        <Input id="sci-new-first" autoComplete="given-name" required value={firstName} onChange={(e) => setFirstName(e.target.value)} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="sci-new-last">Last name</Label>
        <Input id="sci-new-last" autoComplete="family-name" required value={lastName} onChange={(e) => setLastName(e.target.value)} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="sci-new-email">Email</Label>
        <Input id="sci-new-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      {mode === "check_in" && <AddUnits units={units} adding={adding} setAdding={setAdding} label={label} />}
      <label className="flex items-start gap-2 text-sm">
        <Checkbox className="mt-0.5" checked={adult} onCheckedChange={(on) => setAdult(on === true)} />
        <span>I&apos;m 18 or older. (Under 18? Please check in with the volunteer at the table.)</span>
      </label>
      {mode === "check_in" ? (
        <Button type="submit" size="lg" disabled={pending || !adult}>
          {pending ? "Checking in…" : "Check me in"}
        </Button>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" size="lg" disabled={pending || !adult || !firstName.trim()} onClick={() => onSubmit({ firstName, lastName, email, adding: [], adult, response: "yes" })}>
            I&apos;ll be there
          </Button>
          <Button type="button" size="lg" variant="outline" disabled={pending || !adult || !firstName.trim()} onClick={() => onSubmit({ firstName, lastName, email, adding: [], adult, response: "no" })}>
            Can&apos;t make it
          </Button>
        </div>
      )}
    </form>
  );
}

function RsvpChoice({ person, pending, onAnswer }: { person: Person; pending: boolean; onAnswer: (r: Response) => void }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-lg font-medium">Hi {person.firstName}. Are you coming?</p>
        {person.rsvp && (
          <p className="text-sm text-muted-foreground">
            You said {person.rsvp === "yes" ? "you're coming" : "you can't make it"}. You can change your answer.
          </p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button size="lg" disabled={pending} onClick={() => onAnswer("yes")}>
          I&apos;ll be there
        </Button>
        <Button size="lg" variant="outline" disabled={pending} onClick={() => onAnswer("no")}>
          Can&apos;t make it
        </Button>
      </div>
    </div>
  );
}

/** An .ics file made here in the browser, with the join link if there is one. */
function CalendarButton({ calendar, joinUrl }: { calendar: Calendar; joinUrl?: string | null }) {
  const download = () => {
    const ics = meetingIcs({
      id: calendar.id,
      start: new Date(calendar.start),
      end: new Date(calendar.end),
      title: calendar.title,
      place: calendar.place,
      url: window.location.href,
      description: joinUrl ? `Join online: ${joinUrl}` : null,
    });
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "roundtable.ics" });
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <Button size="lg" variant="outline" onClick={download}>
      <CalendarPlusIcon /> Add to calendar
    </Button>
  );
}
