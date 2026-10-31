import { TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { percent } from "@/lib/attendance/coverage-math";
import { meetingCoverage } from "@/lib/attendance/metrics";
import { Kpi } from "../../progress";

/** This meeting's unit coverage, and the year so far. Goal: someone from every unit. */
export async function CoverageCards({ meetingId, date }: { meetingId: string; date: string }) {
  const { meeting: m, total, year, labels, source } = await meetingCoverage(meetingId, date);
  if (!m) return null;
  const names = (ids: string[]) => ids.map((id) => labels[id] ?? "Unknown unit").join(", ");
  return (
    <section className="flex flex-col gap-2" aria-label="Unit coverage">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Units at this roundtable"
          value={`${m.represented.length} of ${total}`}
          progress={percent(m.represented.length, total)}
          detail={`${percent(m.represented.length, total)}% of units`}
        />
        <Kpi
          label={`${year} so far`}
          value={`${m.cumulative} of ${total}`}
          progress={percent(m.cumulative, total)}
          detail={`${percent(m.cumulative, total)}% toward 100%, ${total - m.cumulative} to go`}
        />
        <Kpi
          label="Units here for the first time this year"
          value={String(m.newUnits.length)}
          detail={m.newUnits.length ? names(m.newUnits) : "None new"}
        />
        <Kpi label="People" value={String(m.headcount)} detail={`${m.firstTimers} at their first roundtable this year`} />
      </div>
      {m.offList.length > 0 && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <TriangleAlertIcon className="size-4 text-destructive" />
          Also here, not on the council&apos;s unit list: {names(m.offList)}.{" "}
          <Link href="/units" className="underline underline-offset-4">
            See units
          </Link>
        </p>
      )}
      {source === "roster" && (
        <p className="text-xs text-muted-foreground">Measured against the roster&apos;s units until a unit list is loaded.</p>
      )}
    </section>
  );
}
