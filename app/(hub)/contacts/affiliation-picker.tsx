"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type AffiliationInput, DESIGNATIONS, NEW_UNIT_TYPES } from "@/lib/contacts/affiliation-input";
import { positionGroups } from "@/lib/contacts/positions";
import type { UnitOption } from "@/lib/contacts/queries";

const DISTRICT = "__district";
const NEW = "__new";
const OTHER = "__other";

export type Pick = {
  unit: string;
  newType: string;
  newNumber: string;
  newDesignation: string;
  position: string;
  otherPosition: string;
};

export const EMPTY_PICK: Pick = {
  unit: "",
  newType: "Troop",
  newNumber: "",
  newDesignation: "",
  position: "",
  otherPosition: "",
};

/** Null when no unit is chosen. A chosen unit with no position comes back with an empty position. */
export function pickToInput(p: Pick): AffiliationInput | null {
  if (!p.unit) return null;
  const unit: AffiliationInput["unit"] =
    p.unit === DISTRICT
      ? { kind: "district" }
      : p.unit === NEW
        ? {
            kind: "new",
            type: p.newType as (typeof NEW_UNIT_TYPES)[number],
            number: p.newNumber,
            genderAccepted: (p.newDesignation || null) as "B" | "G" | "F" | null,
          }
        : { kind: "existing", id: p.unit };
  return { unit, position: p.position === OTHER ? p.otherPosition.trim() : p.position };
}

function defaultDesignation(type: string): string {
  return type === "Pack" ? "F" : "";
}

export function AffiliationPicker({
  value,
  onChange,
  units,
  youth = false,
  fromRoster,
  idPrefix,
}: {
  value: Pick;
  onChange: (next: Pick) => void;
  units: UnitOption[];
  youth?: boolean;
  fromRoster: string[];
  idPrefix: string;
}) {
  const unitType =
    value.unit === DISTRICT
      ? null
      : value.unit === NEW
        ? value.newType
        : (units.find((u) => u.id === value.unit)?.type ?? undefined);
  const groups = unitType === undefined ? [] : positionGroups(unitType, { youth, fromRoster });
  const designations = value.unit === NEW ? DESIGNATIONS[value.newType] : undefined;
  const set = (patch: Partial<Pick>) => onChange({ ...value, ...patch });

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-unit`}>Unit</Label>
        <Select value={value.unit} onValueChange={(unit) => set({ unit, position: "", otherPosition: "" })}>
          <SelectTrigger id={`${idPrefix}-unit`} className="w-full">
            <SelectValue placeholder="Pick a unit" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={DISTRICT}>District position (no unit)</SelectItem>
            <SelectItem value={NEW}>Add a new unit…</SelectItem>
            {units.length > 0 && <SelectSeparator />}
            {units.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-position`}>Position</Label>
        <Select value={value.position} onValueChange={(position) => set({ position })} disabled={!value.unit}>
          <SelectTrigger id={`${idPrefix}-position`} className="w-full">
            <SelectValue placeholder={value.unit ? "Pick a position" : "Pick a unit first"} />
          </SelectTrigger>
          <SelectContent>
            {groups.map((g) => (
              <SelectGroup key={g.label}>
                <SelectLabel>{g.label}</SelectLabel>
                {g.positions.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
            <SelectSeparator />
            <SelectItem value={OTHER}>Other (type it)…</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {value.unit === NEW && (
        <div className="grid grid-cols-[1fr_1fr] gap-3 sm:col-span-2 sm:grid-cols-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${idPrefix}-type`}>Unit type</Label>
            <Select
              value={value.newType}
              onValueChange={(newType) => set({ newType, newDesignation: defaultDesignation(newType), position: "" })}
            >
              <SelectTrigger id={`${idPrefix}-type`} className="w-full">
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
            <Label htmlFor={`${idPrefix}-number`}>Number</Label>
            <Input
              id={`${idPrefix}-number`}
              inputMode="numeric"
              pattern="[0-9]*"
              required
              value={value.newNumber}
              onChange={(e) => set({ newNumber: e.target.value.replace(/\D/g, "") })}
            />
          </div>
          {designations && (
            <div className="col-span-2 flex flex-col gap-2 sm:col-span-1">
              <Label htmlFor={`${idPrefix}-designation`}>{value.newType === "Troop" ? "Boys or girls" : "Pack type"}</Label>
              <Select value={value.newDesignation} onValueChange={(newDesignation) => set({ newDesignation })}>
                <SelectTrigger id={`${idPrefix}-designation`} className="w-full">
                  <SelectValue placeholder="Pick one" />
                </SelectTrigger>
                <SelectContent>
                  {designations.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <p className="col-span-2 text-xs text-muted-foreground sm:col-span-3">
            If this unit is already in the app, it&apos;s reused. When it later shows up in a roster import, the import links
            to it.
          </p>
        </div>
      )}

      {value.position === OTHER && (
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor={`${idPrefix}-other`}>Position title</Label>
          <Input
            id={`${idPrefix}-other`}
            required
            placeholder="As Scouting America spells it"
            value={value.otherPosition}
            onChange={(e) => set({ otherPosition: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}
