import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { hasRole } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { savedDistrict, unitListInfo } from "@/lib/units/apply";
import { LoadUnitList } from "./load-list";

export const metadata: Metadata = { title: "Load the unit list" };

export default function LoadUnitListPage() {
  return (
    <div className="flex flex-col gap-4">
      <Link href="/units" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> Units
      </Link>
      <div>
        <h1 className="text-2xl font-semibold">Load the unit list</h1>
        <p className="text-sm text-muted-foreground">
          The units on the latest list with at least one member are the ones coverage counts. Load a new list whenever units
          join, fold, or change.
        </p>
      </div>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" />}>
        <LoadData />
      </Suspense>
    </div>
  );
}

async function LoadData() {
  const user = await requireUser();
  if (!hasRole(user.role, "admin")) return <p className="text-sm text-muted-foreground">Only admins can load the unit list.</p>;
  const [district, info] = await Promise.all([savedDistrict(), unitListInfo()]);
  return <LoadUnitList savedDistrict={district} lastAsOf={info?.asOf ?? null} />;
}
