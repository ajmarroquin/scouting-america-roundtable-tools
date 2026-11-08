import type { Metadata } from "next";
import { Suspense } from "react";
import { hasRole } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { AUDIENCES, groupKey, membershipMap } from "@/lib/announcements/audiences";
import { listContacts, listUnits, positionsInUse } from "@/lib/contacts/queries";
import { listGroups } from "@/lib/groups/store";
import { ContactsTable } from "./contacts-table";
import { ContactsTabs } from "./contacts-tabs";

export const metadata: Metadata = { title: "Contacts" };

export default function ContactsPage({ searchParams }: PageProps<"/contacts">) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold">Contacts</h1>
        <ContactsTabs active="contacts" />
      </div>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
        <ContactsData searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function ContactsData({ searchParams }: { searchParams: PageProps<"/contacts">["searchParams"] }) {
  const user = await requireUser();
  const canEdit = hasRole(user.role, "editor");
  const [{ group, add }, contacts, units, memberships, groups, fromRoster] = await Promise.all([
    searchParams,
    listContacts(),
    listUnits(),
    membershipMap(),
    listGroups(),
    canEdit ? positionsInUse() : Promise.resolve([]),
  ]);
  const groupOptions = [
    // "Everyone" is the whole list, so it isn't a filter.
    ...AUDIENCES.filter((a) => a.key !== "everyone").map((a) => ({ value: a.key, label: a.label, custom: false, description: a.description })),
    ...groups.map((g) => ({ value: groupKey(g.id), label: g.name, custom: true })),
  ];
  return (
    <ContactsTable
      contacts={contacts}
      units={units}
      memberships={memberships}
      groupOptions={groupOptions}
      initialGroup={typeof group === "string" && groupOptions.some((o) => o.value === group) ? group : undefined}
      fromRoster={fromRoster}
      startAdding={canEdit && add === "1"}
      canEdit={canEdit}
      canImport={hasRole(user.role, "admin")}
    />
  );
}
