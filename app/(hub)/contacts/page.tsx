import type { Metadata } from "next";
import { Suspense } from "react";
import { hasRole } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { listContacts, listUnits } from "@/lib/contacts/queries";
import { ContactsTable } from "./contacts-table";

export const metadata: Metadata = { title: "Contacts" };

export default function ContactsPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Contacts</h1>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
        <ContactsData />
      </Suspense>
    </div>
  );
}

async function ContactsData() {
  const user = await requireUser();
  const [contacts, units] = await Promise.all([listContacts(), listUnits()]);
  return (
    <ContactsTable
      contacts={contacts}
      units={units}
      canEdit={hasRole(user.role, "editor")}
      canImport={hasRole(user.role, "admin")}
    />
  );
}
