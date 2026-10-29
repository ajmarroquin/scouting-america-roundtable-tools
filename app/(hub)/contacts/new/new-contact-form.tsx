"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { UnitOption } from "@/lib/contacts/queries";
import { createContactAction } from "../actions";

const NO_UNIT = "none";

export function NewContactForm({ units }: { units: UnitOption[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [isYouth, setIsYouth] = useState(false);
  const [unitId, setUnitId] = useState(NO_UNIT);
  const [error, setError] = useState<{ message: string; id?: string } | null>(null);

  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        const get = (k: string) => String(form.get(k) ?? "");
        start(async () => {
          const result = await createContactAction({
            firstName: get("firstName"),
            lastName: get("lastName"),
            email: get("email"),
            phone: get("phone"),
            isYouth,
            guardianEmail: get("guardianEmail"),
            unitId: unitId === NO_UNIT ? null : unitId,
            position: get("position"),
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
      <div className="flex flex-col gap-2">
        <Label htmlFor="unit">Unit (optional)</Label>
        <Select value={unitId} onValueChange={setUnitId}>
          <SelectTrigger id="unit" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_UNIT}>No unit</SelectItem>
            {units.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="position">Position (optional)</Label>
        <Input id="position" name="position" disabled={unitId === NO_UNIT} placeholder="For example, Den Leader" />
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
