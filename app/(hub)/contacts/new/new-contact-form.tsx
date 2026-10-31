"use client";

import { PlusIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AffiliationInput } from "@/lib/contacts/affiliation-input";
import type { UnitOption } from "@/lib/contacts/queries";
import { createContactAction } from "../actions";
import { AffiliationPicker, EMPTY_PICK, type Pick, pickToInput } from "../affiliation-picker";

let nextRowId = 1;
type Row = { id: number; pick: Pick };
const newRow = (): Row => ({ id: nextRowId++, pick: EMPTY_PICK });

export function NewContactForm({ units, fromRoster }: { units: UnitOption[]; fromRoster: string[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [isYouth, setIsYouth] = useState(false);
  const [rows, setRows] = useState<Row[]>(() => [newRow()]);
  const [error, setError] = useState<{ message: string; id?: string } | null>(null);

  const updateRow = (id: number, pick: Pick) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, pick } : r)));
  const removeRow = (id: number) => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.id !== id) : [newRow()]));

  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        const form = new FormData(e.currentTarget);
        const get = (k: string) => String(form.get(k) ?? "");
        const affiliations = rows.map((r) => pickToInput(r.pick)).filter((a): a is AffiliationInput => a !== null);
        if (affiliations.some((a) => !a.position)) {
          setError({ message: "Pick a position for each unit, or remove the row." });
          return;
        }
        start(async () => {
          const result = await createContactAction({
            firstName: get("firstName"),
            lastName: get("lastName"),
            email: get("email"),
            phone: get("phone"),
            isYouth,
            guardianEmail: get("guardianEmail"),
            affiliations,
            source: form.get("walkIn") ? "walk_in" : "manual",
          });
          if (result.ok && result.id) {
            toast.success(result.message);
            router.push(`/contacts/${result.id}`);
          } else {
            setError({ message: result.message, id: result.id });
          }
        });
      }}
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="firstName">First name</Label>
        <Input id="firstName" name="firstName" required autoComplete="off" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="lastName">Last name</Label>
        <Input id="lastName" name="lastName" autoComplete="off" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="off" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="phone">Phone</Label>
        <Input id="phone" name="phone" type="tel" autoComplete="off" />
      </div>

      <div className="flex items-center gap-2 sm:col-span-2">
        <Checkbox id="walkIn" name="walkIn" />
        <Label htmlFor="walkIn" className="font-normal">
          Walk-in at a roundtable
        </Label>
      </div>
      <div className="flex items-center gap-2 sm:col-span-2">
        <Checkbox id="isYouth" checked={isYouth} onCheckedChange={(v) => setIsYouth(v === true)} />
        <Label htmlFor="isYouth" className="font-normal">
          This is a youth member
        </Label>
      </div>
      {isYouth && (
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="guardianEmail">Parent or guardian email</Label>
          <Input id="guardianEmail" name="guardianEmail" type="email" required autoComplete="off" />
          <p className="text-xs text-muted-foreground">
            Required. Whenever this youth is in a copied or exported email list, this address comes along, so nothing goes
            to them one-on-one.
          </p>
        </div>
      )}

      <fieldset className="flex flex-col gap-3 sm:col-span-2">
        <legend className="mb-2 text-sm font-medium">Units and positions (optional)</legend>
        {rows.map((r, i) => (
          <div key={r.id} className="relative rounded-lg border p-3 pr-10">
            <AffiliationPicker
              idPrefix={`row${r.id}`}
              value={r.pick}
              onChange={(pick) => updateRow(r.id, pick)}
              units={units}
              youth={isYouth}
              fromRoster={fromRoster}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="absolute top-2 right-2"
              aria-label={`Remove position ${i + 1}`}
              onClick={() => removeRow(r.id)}
            >
              <XIcon />
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setRows((rs) => [...rs, newRow()])}>
          <PlusIcon /> Add another unit or position
        </Button>
      </fieldset>

      {error && (
        <p className="text-sm text-destructive sm:col-span-2" role="alert">
          {error.message}{" "}
          {error.id && (
            <Link className="underline" href={`/contacts/${error.id}`}>
              Open that contact
            </Link>
          )}
        </p>
      )}
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add contact"}
        </Button>
      </div>
    </form>
  );
}
