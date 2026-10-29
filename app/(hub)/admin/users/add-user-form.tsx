"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ROLE_LABELS, ROLES } from "@/lib/auth/roles";
import { addUserAction } from "./actions";

export function AddUserForm() {
  const [state, action, pending] = useActionState(addUserAction, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="grid gap-4 sm:grid-cols-[2fr_2fr_1fr_auto] sm:items-end">
      <div className="flex flex-col gap-2">
        <Label htmlFor="new-email">Email</Label>
        <Input id="new-email" name="email" type="email" required autoComplete="off" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="new-name">Name (optional)</Label>
        <Input id="new-name" name="name" autoComplete="off" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="new-role">Role</Label>
        <Select name="role" defaultValue="viewer">
          <SelectTrigger id="new-role" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLES.map((role) => (
              <SelectItem key={role} value={role}>
                {ROLE_LABELS[role]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add user"}
      </Button>
      {state && (
        <p
          role="status"
          className={`text-sm sm:col-span-4 ${state.ok ? "text-muted-foreground" : "text-destructive"}`}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
