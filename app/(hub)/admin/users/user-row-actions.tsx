"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ROLE_LABELS, ROLES, type Role } from "@/lib/auth/roles";
import type { Result } from "@/lib/users";
import { changeRoleAction, removeUserAction, renameUserAction, sendWelcomeAction } from "./actions";

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

export function SendWelcomeButton({ userId, email }: { userId: string; email: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      aria-label={`Send a welcome email to ${email}`}
      onClick={() =>
        startTransition(async () => {
          const result = await sendWelcomeAction(userId);
          if (result?.ok) toast.success(result.message);
          else toast.error(result?.message ?? "Couldn't send.", { duration: 15000 });
        })
      }
    >
      {pending ? "Sending…" : "Send welcome"}
    </Button>
  );
}

export function UserName({ userId, name }: { userId: string; name: string }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [pending, startTransition] = useTransition();

  if (!editing) {
    return (
      <span className="inline-flex items-center gap-1">
        {name}
        <Button variant="ghost" size="xs" aria-label={`Edit name for ${name}`} onClick={() => setEditing(true)}>
          Edit
        </Button>
      </span>
    );
  }

  return (
    <form
      className="flex items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const result = await renameUserAction(userId, value);
          if (result?.ok) {
            toast.success(result.message);
            setEditing(false);
          } else toast.error(result?.message ?? "Couldn't rename.");
        });
      }}
    >
      <Input
        aria-label="Name"
        className="h-7 w-40"
        autoFocus
        required
        maxLength={80}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setValue(name);
            setEditing(false);
          }
        }}
      />
      <Button type="submit" size="xs" disabled={pending}>
        Save
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        disabled={pending}
        onClick={() => {
          setValue(name);
          setEditing(false);
        }}
      >
        Cancel
      </Button>
    </form>
  );
}
