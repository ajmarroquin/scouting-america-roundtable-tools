"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { Role } from "@/lib/auth/roles";
import { NotAllowedError, requireRole, requireUser } from "@/lib/auth/session";
import type { ExportAttendance, ExportMeeting } from "@/lib/attendance/export";
import * as att from "@/lib/attendance/mutations";
import { attendanceForExport } from "@/lib/attendance/queries";
import { yearRange } from "@/lib/attendance/year";
import type { NewContactInput } from "@/lib/contacts/mutations";

type Result = att.Result;

async function withRole<T extends Result>(min: Role, run: (actor: Awaited<ReturnType<typeof requireRole>>) => Promise<T>) {
  try {
    const result = await run(await requireRole(min));
    if (result.ok) refresh();
    return result;
  } catch (error) {
    if (error instanceof NotAllowedError) return { ok: false, message: error.message } as T;
    throw error;
  }
}

const id = z.uuid();
const bad = (what: string): Result => ({ ok: false, message: `Unknown ${what}.` });

export async function createMeetingAction(input: att.MeetingInput): Promise<Result> {
  return withRole("editor", (actor) => att.createMeeting(actor, input));
}

export async function updateMeetingAction(meetingId: string, input: att.MeetingInput): Promise<Result> {
  if (!id.safeParse(meetingId).success) return bad("meeting");
  return withRole("editor", (actor) => att.updateMeeting(actor, meetingId, input));
}

export async function deleteMeetingAction(meetingId: string): Promise<Result> {
  if (!id.safeParse(meetingId).success) return bad("meeting");
  return withRole("admin", (actor) => att.deleteMeeting(actor, meetingId));
}

export async function checkInAction(meetingId: string, contactId: string): Promise<Result> {
  if (!id.safeParse(meetingId).success) return bad("meeting");
  if (!id.safeParse(contactId).success) return bad("contact");
  return withRole("editor", (actor) => att.checkIn(actor, meetingId, contactId));
}

export async function undoCheckInAction(meetingId: string, contactId: string): Promise<Result> {
  if (!id.safeParse(meetingId).success) return bad("meeting");
  if (!id.safeParse(contactId).success) return bad("contact");
  return withRole("editor", (actor) => att.undoCheckIn(actor, meetingId, contactId));
}

export async function setRepresentedUnitAction(attendanceId: string, unitId: string | null): Promise<Result> {
  if (!id.safeParse(attendanceId).success) return bad("check-in");
  if (unitId !== null && !id.safeParse(unitId).success) return bad("unit");
  return withRole("editor", (actor) => att.setRepresentedUnit(actor, attendanceId, unitId));
}

export async function addWalkInAction(meetingId: string, input: Omit<NewContactInput, "source">): Promise<Result> {
  if (!id.safeParse(meetingId).success) return bad("meeting");
  return withRole("editor", (actor) => att.addWalkIn(actor, meetingId, input));
}

type ExportResult = { ok: true; meetings: ExportMeeting[]; rows: ExportAttendance[] } | { ok: false; message: string };

/** Read-only, for any signed-in user: the data behind the attendance exports for one scouting year. */
export async function exportAttendanceAction(year: string): Promise<ExportResult> {
  if (!/^\d{4}-\d{2}$/.test(year)) return { ok: false, message: "Unknown scouting year." };
  await requireUser();
  return { ok: true, ...(await attendanceForExport(yearRange(year))) };
}
