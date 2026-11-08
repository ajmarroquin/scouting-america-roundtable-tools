"use client";

import { useActionState, useEffect } from "react";
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
import { ROLE_LABELS, ROLES } from "@/lib/auth/roles";
import { addUserAction } from "./actions";

export function AddUserForm({ onDone }: { onDone: () => void }) {
  const [state, action, pending] = useActionState(addUserAction, null);

  // Added: say so and close the form. A problem stays in the form to fix.
  useEffect(() => {
    if (state?.ok) {
      toast.success(state.message);
      onDone();
    }
    // onDone is a new function each render; only a new result matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-[2fr_2fr_1fr] sm:items-end">
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
      <div className="flex items-center gap-2 sm:col-span-3">
        <Checkbox id="new-welcome" name="welcome" defaultChecked />
        <Label htmlFor="new-welcome" className="font-normal">
          Email them a welcome note with the link and how to sign in
        </Label>
      </div>
      {state && !state.ok && (
        <p role="alert" className="text-sm text-destructive sm:col-span-3">
          {state.message}
        </p>
      )}
      <div className="flex gap-2 sm:col-span-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save user"}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
