import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { NotAllowed } from "@/components/not-allowed";
import { hasRole } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { compareData } from "@/lib/contacts/list-compare";
import { CompareList } from "./compare-list";

export const metadata: Metadata = { title: "Compare a list" };

export default function ComparePage() {
  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <Link href="/contacts" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> Contacts
      </Link>
      <div>
        <h1 className="text-2xl font-semibold">Compare a list with contacts</h1>
        <p className="text-sm text-muted-foreground">
          For a list someone sends you with names, emails, and phones but no units. See who&apos;s already in contacts and who
          isn&apos;t. The file is read and matched in your browser and isn&apos;t uploaded or saved; only people you choose to add
          are sent.
        </p>
      </div>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" />}>
        <Gate />
      </Suspense>
    </div>
  );
}

async function Gate() {
  const user = await requireUser();
  if (!hasRole(user.role, "editor")) return <NotAllowed need="editor" />;
  return <CompareList people={await compareData()} />;
}
