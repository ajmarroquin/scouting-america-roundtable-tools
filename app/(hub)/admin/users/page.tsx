import type { Metadata } from "next";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { hasRole, ROLE_DESCRIPTIONS, ROLE_LABELS, ROLES } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { listUsers } from "@/lib/users";
import { AddUserForm } from "./add-user-form";
import { RemoveUserButton, RoleSelect, UserName } from "./user-row-actions";

export const metadata: Metadata = { title: "Users" };

export default function UsersPage() {
  return (
    <div className="flex flex-col gap-6">
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

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Add a user</CardTitle>
          <CardDescription>
            <ul className="mt-1 list-disc pl-5">
              {ROLES.map((role) => (
                <li key={role}>
                  <span className="font-medium text-foreground">{ROLE_LABELS[role]}:</span>{" "}
                  {ROLE_DESCRIPTIONS[role]}
                </li>
              ))}
            </ul>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AddUserForm />
        </CardContent>
      </Card>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead className="hidden sm:table-cell">Name</TableHead>
            <TableHead>Role</TableHead>
            <TableHead className="text-right">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((u) => (
            <TableRow key={u.id}>
              <TableCell className="max-w-48 truncate">
                {u.email}
                {u.id === me.id && (
                  <Badge variant="outline" className="ml-2">
                    You
                  </Badge>
                )}
                <div className="sm:hidden">
                  <UserName key={u.name} userId={u.id} name={u.name} />
                </div>
              </TableCell>
              <TableCell className="hidden sm:table-cell">
                <UserName key={u.name} userId={u.id} name={u.name} />
              </TableCell>
              <TableCell>
                <RoleSelect userId={u.id} role={u.role} />
              </TableCell>
              <TableCell className="text-right">
                {u.id !== me.id && <RemoveUserButton userId={u.id} email={u.email} />}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}
