"use client";

import { PlusIcon, UsersIcon } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createGroupAction, deleteGroupAction, updateGroupAction } from "./actions";

type Group = { id: string; name: string; description: string | null; count: number; createdByName: string | null; updatedAt: string };

export function GroupsManager({ groups, canEdit }: { groups: Group[]; canEdit: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      {canEdit && <NewGroup />}
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No groups yet.{canEdit && " Make one above, or pick people on the Contacts page and add them to a new group."}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Group</TableHead>
              <TableHead className="text-right">People</TableHead>
              <TableHead className="hidden md:table-cell">Made by</TableHead>
              {canEdit && <TableHead className="w-0" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((g) => (
              <GroupRow key={`${g.id}-${g.updatedAt}`} group={g} canEdit={canEdit} />
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function NewGroup() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pending, start] = useTransition();
  return (
    <Card>
      <CardHeader>
        <CardTitle>New group</CardTitle>
        <CardDescription>Then add people to it from the Contacts page, or from a person&apos;s own page.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const result = await createGroupAction({ name, description });
              if (result.ok) {
                toast.success(result.message);
                setName("");
                setDescription("");
              } else toast.error(result.message);
            });
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="group-name">Name</Label>
            <Input id="group-name" maxLength={60} placeholder="Test group" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="group-description">What it&apos;s for (optional)</Label>
            <Input
              id="group-description"
              maxLength={200}
              placeholder="A few of us, for trying an announcement first"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={pending || !name.trim()}>
            <PlusIcon /> Make group
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function GroupRow({ group, canEdit }: { group: Group; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description ?? "");
  const [pending, start] = useTransition();
  const run = (action: () => Promise<{ ok: boolean; message: string }>) =>
    start(async () => {
      const result = await action();
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
    });

  if (editing) {
    return (
      <TableRow>
        <TableCell colSpan={4} className="whitespace-normal">
          <form
            className="grid gap-2 sm:grid-cols-[1fr_2fr_auto_auto] sm:items-center"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => updateGroupAction(group.id, { name, description }));
            }}
          >
            <Input aria-label="Group name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
            <Input
              aria-label="What it's for"
              maxLength={200}
              placeholder="What it's for (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <Button type="submit" size="sm" disabled={pending || !name.trim()}>
              Save
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </form>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow>
      <TableCell className="whitespace-normal">
        <Link href={`/contacts?group=group:${group.id}`} className="font-medium underline-offset-4 hover:underline">
          {group.name}
        </Link>
        {group.description && <div className="text-xs text-muted-foreground">{group.description}</div>}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        <Link href={`/contacts?group=group:${group.id}`} className="inline-flex items-center gap-1 underline-offset-4 hover:underline">
          <UsersIcon className="size-3.5 text-muted-foreground" /> {group.count}
        </Link>
      </TableCell>
      <TableCell className="hidden text-sm text-muted-foreground md:table-cell">{group.createdByName ?? ""}</TableCell>
      {canEdit && (
        <TableCell className="text-right">
          {confirmDelete ? (
            <div className="flex justify-end gap-1">
              <Button size="sm" variant="destructive" disabled={pending} onClick={() => run(() => deleteGroupAction(group.id))}>
                Delete group
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                Keep
              </Button>
            </div>
          ) : (
            <div className="flex justify-end gap-1">
              <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
                Rename
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)}>
                Delete
              </Button>
            </div>
          )}
        </TableCell>
      )}
    </TableRow>
  );
}
