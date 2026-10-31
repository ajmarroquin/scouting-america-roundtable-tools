import type { Metadata } from "next";
import { Suspense } from "react";
import { appTimeZone, listMeetings } from "@/lib/attendance/queries";
import { scoutingYearOf, todayIn } from "@/lib/attendance/year";
import { hasRole } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { MeetingsView } from "./meetings-view";

export const metadata: Metadata = { title: "Attendance" };

export default function AttendancePage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Attendance</h1>
      <Suspense fallback={<div className="h-80 animate-pulse rounded-xl bg-muted" />}>
        <AttendanceData />
      </Suspense>
    </div>
  );
}

async function AttendanceData() {
  const user = await requireUser();
  const meetings = await listMeetings();
  const today = todayIn(appTimeZone());
  return (
    <MeetingsView
      meetings={meetings}
      today={today}
      currentYear={scoutingYearOf(today)}
      canEdit={hasRole(user.role, "editor")}
      canImport={hasRole(user.role, "admin")}
    />
  );
}
