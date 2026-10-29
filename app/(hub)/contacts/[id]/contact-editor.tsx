"use client";

import { useState, useTransition } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import type { AffiliationView, UnitOption } from "@/lib/contacts/queries";
import {
  addAffiliationAction,
  removeAffiliationAction,
  setArchivedAction,
  updateContactAction,
} from "../actions";

type Result = { ok: boolean; message: string };

function report(result: Result | undefined) {
  if (!result) return;
  if (result.ok) toast.success(result.message);
  else toast.error(result.message);
}

type EditorValues = {
  preferredName: string;
  notes: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  guardianEmail: string;
};

export function ContactEditor({
  contactId,
  fromRoster,
  isYouth,
  initial,
}: {
  contactId: string;
  fromRoster: boolean;
  isYouth: boolean;
  initial: EditorValues;
}) {
  const [values, setValues] = useState(initial);
  const [pending, start] = useTransition();
  const field = (key: keyof EditorValues) => ({
    value: values[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setValues((v) => ({ ...v, [key]: e.target.value })),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Edit</CardTitle>
        {fromRoster && <CardDescription>Roster fields change through imports. Preferred name and notes are yours.</CardDescription>}
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const input = fromRoster
                ? { preferredName: values.preferredName, notes: values.notes, ...(isYouth ? { guardianEmail: values.guardianEmail } : {}) }
                : values;
              report(await updateContactAction(contactId, input));
            });
          }}
        >
          {!fromRoster && (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor="firstName">First name</Label>
                <Input id="firstName" required {...field("firstName")} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="lastName">Last name</Label>
                <Input id="lastName" {...field("lastName")} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" {...field("email")} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" type="tel" {...field("phone")} />
              </div>
            </>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="preferredName">Preferred name</Label>
            <Input id="preferredName" placeholder="For example, Jim" {...field("preferredName")} />
          </div>
          {isYouth && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="guardianEmail">Parent or guardian email</Label>
              <Input id="guardianEmail" type="email" required {...field("guardianEmail")} />
            </div>
          )}
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" rows={4} {...field("notes")} />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export function ArchiveButton({ contactId, archived }: { contactId: string; archived: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => start(async () => report(await setArchivedAction(contactId, !archived)))}
    >
      {archived ? "Restore" : "Archive"}
    </Button>
  );
}

const DISTRICT = "district";

export function AffiliationList({
  contactId,
  affiliations,
  units,
  canEdit,
  multiple,
}: {
  contactId: string;
  affiliations: AffiliationView[];
  units: UnitOption[];
  canEdit: boolean;
  multiple: boolean;
}) {
  const [unitId, setUnitId] = useState<string>("");
  const [position, setPosition] = useState("");
  const [pending, start] = useTransition();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Units and positions</CardTitle>
        {multiple && (
          <CardDescription>
            Registered in more than one place. The roster lists one registration, so add the others here. Imports never
            remove positions added by hand.
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {affiliations.length === 0 ? (
          <p className="text-sm text-muted-foreground">None yet.</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {affiliations.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <span className="font-medium">{a.unitLabel ?? "District"}</span>
                <span>{a.position}</span>
                {a.source === "manual" && <Badge variant="outline">Added by hand</Badge>}
                {a.expiresOn && <span className="text-xs text-muted-foreground">expires {a.expiresOn}</span>}
                {canEdit && a.source === "manual" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto"
                    disabled={pending}
                    onClick={() => start(async () => report(await removeAffiliationAction(a.id)))}
                  >
                    Remove
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        {canEdit && (
          <form
            className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const result = await addAffiliationAction(contactId, {
                  unitId: unitId === DISTRICT ? null : unitId,
                  position,
                });
                report(result);
                if (result.ok) setPosition("");
              });
            }}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="add-unit">Unit</Label>
              <Select value={unitId} onValueChange={setUnitId} required>
                <SelectTrigger id="add-unit" className="w-full">
                  <SelectValue placeholder="Pick a unit" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={DISTRICT}>District position (no unit)</SelectItem>
                  {units.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="add-position">Position</Label>
              <Input
                id="add-position"
                required
                placeholder="For example, Committee Member"
                value={position}
                onChange={(e) => setPosition(e.target.value)}
              />
            </div>
            <Button type="submit" variant="outline" disabled={pending || !unitId}>
              Add position
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
