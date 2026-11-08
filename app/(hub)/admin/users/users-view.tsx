"use client";

import { useState } from "react";
import { AddButton, AddPanel, Toolbar, ToolbarActions, ToolbarSearch, ToolbarSummary } from "@/components/list-toolbar";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, ROLES, type Role } from "@/lib/auth/roles";
import { AddUserForm } from "./add-user-form";
import { RemoveUserButton, RoleSelect, SendWelcomeButton, UserName } from "./user-row-actions";

export type UserListRow = {
  id: string;
  email: string;
  name: string;
  role: Role;
  isMe: boolean;
  /** "Today", "Mar 3", or "Never", worked out on the server in the app's time zone. */
  signedIn: string;
  signedInTitle: string;
  hasSignedIn: boolean;
};

export function UsersView({ users }: { users: UserListRow[] }) {
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const q = query.trim().toLowerCase();
  const shown = users.filter((u) => !q || `${u.email} ${u.name} ${ROLE_LABELS[u.role]}`.toLowerCase().includes(q));
  const signedIn = (u: UserListRow) => (
    <span className={u.hasSignedIn ? "" : "text-muted-foreground"} title={u.signedInTitle}>
      {u.signedIn}
    </span>
  );

  return (
    <div className="flex flex-col gap-4">
      <Toolbar>
        <ToolbarSearch label="Search users" placeholder="Search emails, names, roles" value={query} onChange={setQuery} />
        <ToolbarSummary>
          {shown.length === users.length ? `${users.length} ${users.length === 1 ? "user" : "users"}` : `${shown.length} of ${users.length} users`}
        </ToolbarSummary>
        <ToolbarActions>
          <AddButton open={adding} onOpenChange={setAdding} controls="new-user">
            Add user
          </AddButton>
        </ToolbarActions>
      </Toolbar>

      {adding && (
        <AddPanel
          id="new-user"
          title="New user"
          description={
            <ul className="mt-1 list-disc pl-5">
              {ROLES.map((role) => (
                <li key={role}>
                  <span className="font-medium text-foreground">{ROLE_LABELS[role]}:</span> {ROLE_DESCRIPTIONS[role]}
                </li>
              ))}
            </ul>
          }
        >
          <AddUserForm onDone={() => setAdding(false)} />
        </AddPanel>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead className="hidden sm:table-cell">Name</TableHead>
            <TableHead className="hidden sm:table-cell">Last sign-in</TableHead>
            <TableHead>Role</TableHead>
            <TableHead className="text-right">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map((u) => (
            <TableRow key={u.id}>
              <TableCell className="max-w-48 truncate">
                {u.email}
                {u.isMe && (
                  <Badge variant="outline" className="ml-2">
                    You
                  </Badge>
                )}
                <div className="sm:hidden">
                  <UserName key={u.name} userId={u.id} name={u.name} />
                  <div className="text-xs text-muted-foreground">Last sign-in: {signedIn(u)}</div>
                </div>
              </TableCell>
              <TableCell className="hidden sm:table-cell">
                <UserName key={u.name} userId={u.id} name={u.name} />
              </TableCell>
              <TableCell className="hidden whitespace-nowrap sm:table-cell">{signedIn(u)}</TableCell>
              <TableCell>
                <RoleSelect userId={u.id} role={u.role} />
              </TableCell>
              <TableCell className="text-right">
                {!u.isMe && (
                  <div className="flex justify-end gap-1">
                    <SendWelcomeButton userId={u.id} email={u.email} />
                    <RemoveUserButton userId={u.id} email={u.email} />
                  </div>
                )}
              </TableCell>
            </TableRow>
          ))}
          {shown.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-sm text-muted-foreground">
                No users match.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
