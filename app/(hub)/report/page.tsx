import type { Metadata } from "next";
import { Suspense } from "react";
import { scoutingYears } from "@/lib/attendance/coverage";
import { coverageForYear, outreachContacts } from "@/lib/attendance/metrics";
import { appTimeZone } from "@/lib/attendance/queries";
import { scoutingYearOf, todayIn } from "@/lib/attendance/year";
import { requireUser } from "@/lib/auth/session";
import { CouncilReport } from "./council-report";

export const metadata: Metadata = { title: "Council report" };

export default function ReportPage({ searchParams }: PageProps<"/report">) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Council report</h1>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
        <ReportData searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function ReportData({ searchParams }: { searchParams: PageProps<"/report">["searchParams"] }) {
  await requireUser();
  const current = scoutingYearOf(todayIn(appTimeZone()));
  const asked = (await searchParams).year;
  const years = await scoutingYears(current);
  const year = typeof asked === "string" && years.includes(asked) ? asked : current;
  const coverage = await coverageForYear(year);
  const toReach = coverage.units.filter((u) => u.counted && u.meetings === 0);
  const leaders = await outreachContacts(toReach.map((u) => u.id));
  return <CouncilReport coverage={coverage} years={years} leaders={leaders} />;
}
