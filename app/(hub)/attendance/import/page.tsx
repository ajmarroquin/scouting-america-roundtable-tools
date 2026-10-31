import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { legacyMatchData } from "@/lib/attendance/legacy-import";
import { appTimeZone } from "@/lib/attendance/queries";
import { todayIn } from "@/lib/attendance/year";
import { hasRole } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { ImportSheet } from "./import-sheet";

export const metadata: Metadata = { title: "Load an old attendance sheet" };

export default function ImportSheetPage() {
  return (
    <div className="flex flex-col gap-4">
      <Link href="/attendance" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> Attendance
      </Link>
      <div>
        <h1 className="text-2xl font-semibold">Load an old attendance sheet</h1>
        <p className="text-sm text-muted-foreground">
          Brings a past year&apos;s sign-in sheet into the app as meetings and check-ins. Loading the same sheet twice adds
          nothing new.
        </p>
      </div>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" />}>
        <ImportData />
      </Suspense>
    </div>
  );
}

async function ImportData() {
  const user = await requireUser();
  if (!hasRole(user.role, "admin")) {
    return <p className="text-sm text-muted-foreground">Only admins can load old sheets.</p>;
  }
  const data = await legacyMatchData();
  return <ImportSheet data={data} today={todayIn(appTimeZone())} />;
}
