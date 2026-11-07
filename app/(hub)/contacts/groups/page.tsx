import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { hasRole } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { listGroups } from "@/lib/groups/store";
import { GroupsManager } from "./groups-manager";

export const metadata: Metadata = { title: "Groups" };

export default function GroupsPage() {
  return (
    <div className="flex flex-col gap-4">
      <Link href="/contacts" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> Contacts
      </Link>
      <div>
        <h1 className="text-2xl font-semibold">Groups</h1>
        <p className="text-sm text-muted-foreground">
          Lists you build by hand, like a small test group or a committee. Send an announcement to one, or filter contacts by it. Lists
          like Unit leaders keep themselves up to date from the roster and aren&apos;t here.
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
  const groups = await listGroups();
  return <GroupsManager groups={groups.map((g) => ({ ...g, updatedAt: g.updatedAt.toISOString() }))} canEdit={hasRole(user.role, "editor")} />;
}
