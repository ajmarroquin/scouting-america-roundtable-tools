import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { hasRole } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { SOURCE_LABELS, STATUS_LABELS } from "@/lib/contacts/format";
import { getContact, listUnits } from "@/lib/contacts/queries";
import { AffiliationList, ArchiveButton, ContactEditor } from "./contact-editor";

export const metadata: Metadata = { title: "Contact" };

export default function ContactPage({ params }: PageProps<"/contacts/[id]">) {
  return (
    <div className="flex flex-col gap-4">
      <Link href="/contacts" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> Contacts
      </Link>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
        <ContactDetailView params={params} />
      </Suspense>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[10rem_1fr] sm:gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm break-words">{children || <span className="text-muted-foreground">None</span>}</dd>
    </div>
  );
}

async function ContactDetailView({ params }: { params: PageProps<"/contacts/[id]">["params"] }) {
  const { id } = await params;
  const user = await requireUser();
  if (!z.uuid().safeParse(id).success) notFound();
  const [c, units] = await Promise.all([getContact(id), listUnits()]);
  if (!c) notFound();
  const canEdit = hasRole(user.role, "editor");
  const fromRoster = c.source === "import";

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{c.name}</h1>
          <div className="mt-1 flex flex-wrap gap-1">
            <Badge variant={c.status === "active" ? "secondary" : "outline"}>{STATUS_LABELS[c.status]}</Badge>
            <Badge variant="outline">{SOURCE_LABELS[c.source]}</Badge>
            {c.isYouth && <Badge variant="secondary">Youth</Badge>}
            {c.multipleRegistrations && <Badge variant="outline">Multiple registrations</Badge>}
          </div>
        </div>
        {canEdit && <ArchiveButton contactId={c.id} archived={c.status === "archived"} />}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="flex flex-col gap-3">
            <Field label="Legal name">
              {[c.firstName, c.middleName, c.lastName, c.suffix].filter(Boolean).join(" ")}
            </Field>
            <Field label="Email">{c.email && <a className="underline-offset-4 hover:underline" href={`mailto:${c.email}`}>{c.email}</a>}</Field>
            {c.altEmail && <Field label="Second email">{c.altEmail}</Field>}
            <Field label="Phone">{c.phone && `${c.phone}${c.phoneType ? ` (${c.phoneType})` : ""}`}</Field>
            {c.isYouth && <Field label="Parent or guardian">{c.guardianEmail}</Field>}
            <Field label="Member ID">{c.memberId}</Field>
          </dl>
          {fromRoster && (
            <p className="mt-4 text-xs text-muted-foreground">
              Name, email, phone, and roster positions come from the Scouting America export and update with each import.
            </p>
          )}
        </CardContent>
      </Card>

      {canEdit && (
        <ContactEditor
          contactId={c.id}
          fromRoster={fromRoster}
          isYouth={c.isYouth}
          initial={{
            preferredName: c.preferredName ?? "",
            notes: c.notes ?? "",
            firstName: c.firstName,
            lastName: c.lastName,
            email: c.email ?? "",
            phone: c.phone ?? "",
            guardianEmail: c.guardianEmail ?? "",
          }}
        />
      )}
      {!canEdit && c.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent className="text-sm whitespace-pre-wrap">{c.notes}</CardContent>
        </Card>
      )}

      <AffiliationList
        contactId={c.id}
        affiliations={c.affiliations}
        units={units.filter((u) => u.active)}
        canEdit={canEdit}
        multiple={c.multipleRegistrations}
      />
    </>
  );
}
