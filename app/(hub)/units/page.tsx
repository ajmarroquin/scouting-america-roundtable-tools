import type { Metadata } from "next";
import { Suspense } from "react";
import { scoutingYears } from "@/lib/attendance/coverage";
import { appTimeZone } from "@/lib/attendance/queries";
import { scoutingYearOf, todayIn, yearRange } from "@/lib/attendance/year";
import { hasRole } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { listUnitsOverview } from "@/lib/units/queries";
import { UnitsView } from "./units-view";

export const metadata: Metadata = { title: "Units" };

export default function UnitsPage({ searchParams }: PageProps<"/units">) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Units</h1>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
        <UnitsData searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function UnitsData({ searchParams }: { searchParams: PageProps<"/units">["searchParams"] }) {
  const user = await requireUser();
  const current = scoutingYearOf(todayIn(appTimeZone()));
  const asked = (await searchParams).year;
  const years = await scoutingYears(current);
  const year = typeof asked === "string" && years.includes(asked) ? asked : current;
  const data = await listUnitsOverview(yearRange(year));
  return (
    <UnitsView
      {...data}
      year={year}
      years={years}
      canEdit={hasRole(user.role, "editor")}
      canLoad={hasRole(user.role, "admin")}
    />
  );
}
