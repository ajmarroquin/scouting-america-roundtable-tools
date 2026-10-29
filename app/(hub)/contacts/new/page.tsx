import type { Metadata } from "next";
import { Suspense } from "react";
import { NotAllowed } from "@/components/not-allowed";
import { hasRole } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { listUnits } from "@/lib/contacts/queries";
import { NewContactForm } from "./new-contact-form";

export const metadata: Metadata = { title: "Add contact" };

export default function NewContactPage() {
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">Add a contact</h1>
      <p className="text-sm text-muted-foreground">
        For people who aren&apos;t in the roster export yet, like walk-ins or youth who need to hear from roundtable.
        If they show up in a later import with the same email and first name, the import links to this record.
      </p>
      <Suspense fallback={<div className="h-80 animate-pulse rounded-xl bg-muted" />}>
        <Gate />
      </Suspense>
    </div>
  );
}

async function Gate() {
  const user = await requireUser();
  if (!hasRole(user.role, "editor")) return <NotAllowed need="editor" />;
  const units = await listUnits();
  return <NewContactForm units={units.filter((u) => u.active)} />;
}
