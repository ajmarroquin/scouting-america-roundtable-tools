import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from ".";
import { hasRole, isRole, type Role } from "./roles";

export type CurrentUser = { id: string; name: string; email: string; role: Role };

export class NotAllowedError extends Error {
  constructor() {
    super("You don't have access to do that.");
  }
}

/** Reads the session once per request. Must run inside a <Suspense> boundary. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const result = await auth.api.getSession({ headers: await headers() });
  if (!result) return null;
  const { id, name, email, role } = result.user;
  return { id, name, email, role: isRole(role) ? role : "viewer" };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** For server actions and route handlers: throws unless the user has at least `min`. */
export async function requireRole(min: Role): Promise<CurrentUser> {
  const user = await requireUser();
  if (!hasRole(user.role, min)) throw new NotAllowedError();
  return user;
}
