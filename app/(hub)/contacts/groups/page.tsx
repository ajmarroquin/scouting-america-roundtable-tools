import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AUDIENCES, membershipMap } from "@/lib/announcements/audiences";
import { hasRole } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { listGroups } from "@/lib/groups/store";
import { ContactsTabs } from "../contacts-tabs";
import { GroupsManager } from "./groups-manager";

export const metadata: Metadata = { title: "Groups" };

export default function GroupsPage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold">Contacts</h1>
        <ContactsTabs active="groups" />
        <p className="text-sm text-muted-foreground">
          Your groups are lists you build by hand, like a small test group or a committee. Built-in lists keep themselves up to date
          from the roster and attendance. Send an announcement to either, or filter contacts by it.
        </p>
      </div>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" />}>
        <GroupsData />
      </Suspense>
    </div>
  );
}

async function GroupsData() {
  const user = await requireUser();
  const [groups, memberships] = await Promise.all([listGroups(), membershipMap()]);
  const counts = new Map<string, number>();
  for (const keys of Object.values(memberships)) for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1);
  return (
    <>
      <section className="flex flex-col gap-3" aria-labelledby="your-groups">
        <h2 id="your-groups" className="text-lg font-medium">
          Your groups
        </h2>
        <GroupsManager groups={groups.map((g) => ({ ...g, updatedAt: g.updatedAt.toISOString() }))} canEdit={hasRole(user.role, "editor")} />
      </section>
      <Card>
        <CardHeader>
          <CardTitle>Built-in lists</CardTitle>
          <CardDescription>
            Who&apos;s in each, from contacts&apos; roles and check-ins. Announcements reach the adults in a list who have an email and
            haven&apos;t unsubscribed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="flex flex-col divide-y">
            {AUDIENCES.map((a) => (
              <div key={a.key} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  <dt className="font-medium">{a.label}</dt>
                  <dd className="text-sm text-muted-foreground">{a.description}</dd>
                </div>
                <Link
                  href={a.key === "everyone" ? "/contacts" : `/contacts?group=${a.key}`}
                  className="shrink-0 text-sm underline-offset-4 hover:underline"
                >
                  {counts.get(a.key) ?? 0} people
                </Link>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </>
  );
}
