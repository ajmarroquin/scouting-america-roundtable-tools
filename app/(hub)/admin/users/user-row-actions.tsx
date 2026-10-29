"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ROLE_LABELS, ROLES, type Role } from "@/lib/auth/roles";
import type { Result } from "@/lib/users";
import { changeRoleAction, removeUserAction } from "./actions";

function useResultToast(state: Result | null) {
  useEffect(() => {
    if (!state) return;
    if (state.ok) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);
}

export function RoleSelect({ userId, role }: { userId: string; role: Role }) {
  return <RoleSelectInner key={role} userId={userId} role={role} />;
}

function RoleSelectInner({ userId, role }: { userId: string; role: Role }) {
  const [value, setValue] = useState<string>(role);
  const [pending, startTransition] = useTransition();

  return (
    <Select
      value={value}
      disabled={pending}
      onValueChange={(next) => {
        setValue(next);
        const form = new FormData();
        form.set("userId", userId);
        form.set("role", next);
        startTransition(async () => {
          const result = await changeRoleAction(null, form);
          if (result?.ok) {
            toast.success(result.message);
          } else {
            setValue(role);
            toast.error(result?.message ?? "Couldn't change the role.");
          }
        });
      }}
    >
      <SelectTrigger size="sm" className="w-28" aria-label="Role">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ROLES.map((r) => (
          <SelectItem key={r} value={r}>
            {ROLE_LABELS[r]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function RemoveUserButton({ userId, email }: { userId: string; email: string }) {
  const [state, action, pending] = useActionState(removeUserAction, null);
  const [confirming, setConfirming] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useResultToast(state);

  useEffect(() => () => clearTimeout(timer.current), []);

  if (!confirming) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setConfirming(true);
          timer.current = setTimeout(() => setConfirming(false), 5000);
        }}
      >
        Remove
      </Button>
    );
  }

  return (
    <form action={action}>
      <input type="hidden" name="userId" value={userId} />
      <Button type="submit" variant="destructive" size="sm" disabled={pending} aria-label={`Confirm removing ${email}`}>
        {pending ? "Removing…" : "Confirm remove"}
      </Button>
    </form>
  );
}
