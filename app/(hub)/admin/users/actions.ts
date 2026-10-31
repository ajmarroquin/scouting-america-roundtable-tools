"use server";

import { refresh } from "next/cache";
import { NotAllowedError, requireRole } from "@/lib/auth/session";
import * as users from "@/lib/users";

type State = users.Result | null;

async function asAdmin(run: (actor: Awaited<ReturnType<typeof requireRole>>) => Promise<users.Result>) {
  try {
    const result = await run(await requireRole("admin"));
    if (result.ok) refresh();
    return result;
  } catch (error) {
    if (error instanceof NotAllowedError) return { ok: false, message: error.message };
    throw error;
  }
}

export async function addUserAction(_prev: State, form: FormData): Promise<State> {
  return asAdmin((actor) =>
    users.addUser(actor, {
      email: String(form.get("email") ?? ""),
      name: String(form.get("name") ?? ""),
      role: String(form.get("role") ?? ""),
      sendWelcome: form.get("welcome") === "on",
    }),
  );
}

export async function sendWelcomeAction(userId: string): Promise<State> {
  return asAdmin((actor) => users.sendWelcome(actor, String(userId)));
}

export async function renameUserAction(userId: string, name: string): Promise<State> {
  return asAdmin((actor) => users.renameUser(actor, String(userId), String(name)));
}

export async function changeRoleAction(_prev: State, form: FormData): Promise<State> {
  return asAdmin((actor) =>
    users.changeRole(actor, String(form.get("userId") ?? ""), String(form.get("role") ?? "")),
  );
}

export async function removeUserAction(_prev: State, form: FormData): Promise<State> {
  return asAdmin((actor) => users.removeUser(actor, String(form.get("userId") ?? "")));
}
