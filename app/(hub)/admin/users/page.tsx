import type { Metadata } from "next";
import { Suspense } from "react";
import { appTimeZone } from "@/lib/attendance/queries";
import { lastSignInLabel, signInTimestamp } from "@/lib/auth/last-sign-in";
import { hasRole } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { listUsers } from "@/lib/users";
import { UsersView } from "./users-view";

export const metadata: Metadata = { title: "Users" };

export default function UsersPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Users</h1>
        <p className="text-sm text-muted-foreground">
          Only people listed here can get a sign-in code.
        </p>
      </div>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" />}>
        <UsersPanel />
      </Suspense>
    </div>
  );
}

async function UsersPanel() {
  const me = await requireUser();
  if (!hasRole(me.role, "admin")) {
    return <p className="text-sm text-muted-foreground">Only admins can manage users.</p>;
  }
  const users = await listUsers();
  const timeZone = appTimeZone();
  const now = new Date();
  return (
    <UsersView
      users={users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        isMe: u.id === me.id,
        signedIn: lastSignInLabel(u.lastSignInAt, timeZone, now),
        signedInTitle: u.lastSignInAt ? signInTimestamp(u.lastSignInAt, timeZone) : "Hasn't signed in yet",
        hasSignedIn: !!u.lastSignInAt,
      }))}
    />
  );
}
