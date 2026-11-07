"use client";

import { XIcon } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LEFT_OUT, type LeftOutReason } from "@/lib/announcements/reach";
import { addToGroupAction, removeFromGroupAction } from "../groups/actions";

type Props = {
  contactId: string;
  builtIn: { key: string; label: string; why: string }[];
  groups: { id: string; name: string }[];
  allGroups: { id: string; name: string }[];
  leftOut: LeftOutReason | null;
  canEdit: boolean;
};

/** The announcement lists and groups this person is on, and whether they'd get an announcement at all. */
export function GroupsCard({ contactId, builtIn, groups, allGroups, leftOut, canEdit }: Props) {
  const [pick, setPick] = useState("");
  const [pending, start] = useTransition();
  const notIn = allGroups.filter((g) => !groups.some((m) => m.id === g.id));
  const run = (action: () => Promise<{ ok: boolean; message: string }>) =>
    start(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(result.message);
        setPick("");
      } else toast.error(result.message);
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Groups</CardTitle>
        <CardDescription>
          {leftOut
            ? `Won't get announcements: ${LEFT_OUT[leftOut].toLowerCase()}.`
            : "Gets announcements sent to any of these."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">From the roster and attendance</p>
          {builtIn.length ? (
            <ul className="flex flex-col gap-1">
              {builtIn.map((m) => (
                <li key={m.key}>
                  <Link href={`/contacts?group=${m.key}`} className="font-medium underline-offset-4 hover:underline">
                    {m.label}
                  </Link>
                  {m.why && m.why !== m.label && <span className="text-muted-foreground"> · {m.why}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">None.</p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Built by hand</p>
          {groups.length ? (
            <ul className="flex flex-wrap gap-1.5">
              {groups.map((g) => (
                <li key={g.id} className="flex items-center gap-1 rounded-md border border-dashed py-0.5 pr-1 pl-2">
                  <Link href={`/contacts?group=group:${g.id}`} className="underline-offset-4 hover:underline">
                    {g.name}
                  </Link>
                  {canEdit && (
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label={`Take out of ${g.name}`}
                      disabled={pending}
                      onClick={() => run(() => removeFromGroupAction(g.id, [contactId]))}
                    >
                      <XIcon />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">Not in any group yet.</p>
          )}
          {canEdit &&
            (notIn.length ? (
              <div className="flex flex-wrap items-center gap-2">
                <Select value={pick} onValueChange={setPick}>
                  <SelectTrigger size="sm" aria-label="Add to a group" className="min-w-44">
                    <SelectValue placeholder="Add to a group…" />
                  </SelectTrigger>
                  <SelectContent>
                    {notIn.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" disabled={pending || !pick} onClick={() => run(() => addToGroupAction(pick, [contactId]))}>
                  Add
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                <Link href="/contacts/groups" className="underline underline-offset-2">
                  Make a group
                </Link>{" "}
                to add them to one.
              </p>
            ))}
        </div>
      </CardContent>
    </Card>
  );
}
