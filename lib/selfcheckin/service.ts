import "server-only";
import { randomBytes } from "node:crypto";
import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { appTimeZone } from "@/lib/attendance/today";
import { writeAudit } from "@/lib/audit";
import type { CurrentUser } from "@/lib/auth/session";
import { compareUnits, contactName, unitLabel } from "@/lib/contacts/format";
import { db } from "@/lib/db";
import { affiliation, attendance, attendanceUnit, checkinReview, contact, meeting, publicRateLimit, unit } from "@/lib/db/schema";
import { checkInWindow, looksLikeEmail, matchPeople, normalizeEmail, normalizeName, SELF_REPORTED_ROLE, type WindowState } from "./rules";

// The public meeting page. Nobody is signed in here, so instead of
// requireUser() every public step checks the link's token, the time window,
// and a rate limit, and re-checks who the person is from their email and last
// name. It never shows anything but a first name and unit labels.

const TOKEN = /^[A-Za-z0-9_-]{16,64}$/;
const GENERIC = "That didn't work. Check with the volunteer at the table.";
const LIMITS = { perIp: { max: 60, seconds: 600 }, perEmail: { max: 10, seconds: 3600 } };

export type PublicMeeting = {
  id: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  title: string | null;
  format: string;
  window: WindowState;
};

export type UnitChoice = { id: string; label: string };
export type Person = { contactId: string; firstName: string; units: UnitChoice[]; alreadyIn: boolean };

export type IdentifyResult =
  | { ok: false; message: string }
  | { ok: true; kind: "new" }
  | { ok: true; kind: "choose"; people: { contactId: string; firstName: string }[] }
  | { ok: true; kind: "match"; person: Person };

type Done = { ok: boolean; message: string };

export async function publicMeeting(token: string, now = new Date()): Promise<PublicMeeting | null> {
  if (!TOKEN.test(token)) return null;
  const [m] = await db.select().from(meeting).where(eq(meeting.publicToken, token));
  if (!m) return null;
  return {
    id: m.id,
    date: m.date,
    startTime: m.startTime,
    endTime: m.endTime,
    title: m.title,
    format: m.format,
    window: checkInWindow(m, now, appTimeZone()),
  };
}

/** The district's active units, for "representing another unit?". */
export async function unitChoices(): Promise<UnitChoice[]> {
  const rows = await db.select().from(unit).where(eq(unit.active, true));
  return rows.sort(compareUnits).map((u) => ({ id: u.id, label: unitLabel(u) }));
}

/** Counts a try against a key; false once it's over the limit for the window. */
export async function allow(key: string, max: number, seconds: number): Promise<boolean> {
  const [row] = await db
    .insert(publicRateLimit)
    .values({ key, count: 1 })
    .onConflictDoUpdate({
      target: publicRateLimit.key,
      set: {
        count: sql`case when ${publicRateLimit.windowStart} < now() - make_interval(secs => ${seconds}) then 1 else ${publicRateLimit.count} + 1 end`,
        windowStart: sql`case when ${publicRateLimit.windowStart} < now() - make_interval(secs => ${seconds}) then now() else ${publicRateLimit.windowStart} end`,
      },
    })
    .returning({ count: publicRateLimit.count });
  return row.count <= max;
}

type Gate = { ok: true; meeting: PublicMeeting } | { ok: false; message: string };

/** The checks every public step makes: a real link, an open window, not a bot, not too many tries. */
async function gate(token: string, input: { email?: string; website?: string }, ip: string, now: Date): Promise<Gate> {
  const m = await publicMeeting(token, now);
  if (!m) return { ok: false, message: "This link isn't working. Ask the volunteer at the table." };
  if (m.window.state !== "open") return { ok: false, message: "Check-in isn't open right now." };
  // A hidden field people never see. Bots fill it in.
  if (input.website) return { ok: false, message: GENERIC };
  if (!(await allow(`ip:${m.id}:${ip}`, LIMITS.perIp.max, LIMITS.perIp.seconds))) {
    return { ok: false, message: "Too many tries. Wait a few minutes, or check in with the volunteer at the table." };
  }
  if (input.email && !(await allow(`email:${m.id}:${normalizeEmail(input.email)}`, LIMITS.perEmail.max, LIMITS.perEmail.seconds))) {
    return { ok: false, message: "Too many tries. Check in with the volunteer at the table." };
  }
  return { ok: true, meeting: m };
}

async function findPeople(email: string, lastName: string) {
  const e = normalizeEmail(email);
  if (!e || !normalizeName(lastName)) return [];
  const rows = await db
    .select({
      id: contact.id,
      firstName: contact.firstName,
      preferredName: contact.preferredName,
      lastName: contact.lastName,
      email: contact.email,
      altEmail: contact.altEmail,
      isYouth: contact.isYouth,
      status: contact.status,
    })
    .from(contact)
    .where(or(sql`lower(trim(${contact.email})) = ${e}`, sql`lower(trim(${contact.altEmail})) = ${e}`));
  return matchPeople(rows, email, lastName);
}

async function unitsOf(contactId: string): Promise<UnitChoice[]> {
  const rows = await db
    .selectDistinct({ id: unit.id, type: unit.type, number: unit.number, genderAccepted: unit.genderAccepted })
    .from(affiliation)
    .innerJoin(unit, eq(unit.id, affiliation.unitId))
    .where(eq(affiliation.contactId, contactId));
  return rows.sort(compareUnits).map((u) => ({ id: u.id, label: unitLabel(u) }));
}

async function personFor(meetingId: string, c: { id: string; firstName: string; preferredName: string | null }): Promise<Person> {
  const [units, [existing]] = await Promise.all([
    unitsOf(c.id),
    db
      .select({ id: attendance.id })
      .from(attendance)
      .where(and(eq(attendance.meetingId, meetingId), eq(attendance.contactId, c.id))),
  ]);
  return { contactId: c.id, firstName: c.preferredName || c.firstName, units, alreadyIn: !!existing };
}

const identifyInput = z.object({
  email: z.string().trim().max(254),
  lastName: z.string().trim().max(80),
  website: z.string().max(200).optional(),
});

/** Step one: who is this? Shows only first names and unit labels, and only on a match. */
export async function identify(token: string, raw: unknown, ip: string, now = new Date()): Promise<IdentifyResult> {
  const parsed = identifyInput.safeParse(raw);
  if (!parsed.success || !looksLikeEmail(parsed.data.email) || !normalizeName(parsed.data.lastName)) {
    return { ok: false, message: "Enter your email and last name." };
  }
  const g = await gate(token, parsed.data, ip, now);
  if (!g.ok) return g;
  const people = await findPeople(parsed.data.email, parsed.data.lastName);
  if (!people.length) return { ok: true, kind: "new" };
  if (people.length > 1) return { ok: true, kind: "choose", people: people.map((p) => ({ contactId: p.id, firstName: p.preferredName || p.firstName })) };
  return { ok: true, kind: "match", person: await personFor(g.meeting.id, people[0]) };
}

/** Narrows "choose" to the one they picked, checking the pick is one of their matches. */
export async function pick(token: string, raw: unknown, contactId: string, ip: string, now = new Date()): Promise<IdentifyResult> {
  const parsed = identifyInput.safeParse(raw);
  if (!parsed.success) return { ok: false, message: GENERIC };
  const g = await gate(token, parsed.data, ip, now);
  if (!g.ok) return g;
  const chosen = (await findPeople(parsed.data.email, parsed.data.lastName)).find((p) => p.id === contactId);
  if (!chosen) return { ok: false, message: GENERIC };
  return { ok: true, kind: "match", person: await personFor(g.meeting.id, chosen) };
}

const claim = z.object({ unitId: z.uuid(), role: z.string().trim().max(80).optional() });

const confirmInput = identifyInput.extend({
  contactId: z.uuid(),
  representing: z.array(z.uuid()).max(20),
  leaving: z.array(z.uuid()).max(20),
  adding: z.array(claim).max(10),
});

/**
 * Checks them in with the units they say they represent tonight. Units on
 * their record count now; units they add, and units they say they've left, go
 * to an editor. Confirming again replaces what they said before.
 */
export async function confirm(token: string, raw: unknown, ip: string, now = new Date()): Promise<Done> {
  const parsed = confirmInput.safeParse(raw);
  if (!parsed.success) return { ok: false, message: GENERIC };
  const input = parsed.data;
  const g = await gate(token, input, ip, now);
  if (!g.ok) return g;
  const person = (await findPeople(input.email, input.lastName)).find((p) => p.id === input.contactId);
  if (!person) return { ok: false, message: GENERIC };
  const theirs = new Set((await unitsOf(person.id)).map((u) => u.id));
  const active = new Set((await unitChoices()).map((u) => u.id));
  const representing = [...new Set(input.representing)].filter((id) => theirs.has(id));
  const leaving = [...new Set(input.leaving)].filter((id) => theirs.has(id) && !representing.includes(id));
  const adding = input.adding.filter((a, i, all) => active.has(a.unitId) && !theirs.has(a.unitId) && all.findIndex((b) => b.unitId === a.unitId) === i);
  await record(g.meeting.id, person.id, representing, adding, leaving);
  const name = person.preferredName || person.firstName;
  return {
    ok: true,
    message: adding.length || leaving.length
      ? `You're checked in, ${name}. Thanks for coming! A volunteer will update your units.`
      : `You're checked in, ${name}. Thanks for coming!`,
  };
}

async function record(
  meetingId: string,
  contactId: string,
  representing: string[],
  adding: { unitId: string; role?: string }[],
  leaving: string[],
  newPerson = false,
) {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(attendance)
      .values({ meetingId, contactId, method: "self_check_in", unitsConfirmed: true })
      .onConflictDoUpdate({ target: [attendance.meetingId, attendance.contactId], set: { unitsConfirmed: true } })
      .returning({ id: attendance.id });
    await tx.delete(attendanceUnit).where(eq(attendanceUnit.attendanceId, row.id));
    const units = [
      ...representing.map((unitId) => ({ attendanceId: row.id, unitId, approved: true })),
      ...adding.map((a) => ({ attendanceId: row.id, unitId: a.unitId, approved: false })),
    ];
    if (units.length) await tx.insert(attendanceUnit).values(units);
    // What they said last time at this meeting is replaced, not added to.
    await tx
      .delete(checkinReview)
      .where(
        and(
          eq(checkinReview.meetingId, meetingId),
          eq(checkinReview.contactId, contactId),
          eq(checkinReview.status, "open"),
          inArray(checkinReview.kind, ["add_unit", "remove_unit"]),
        ),
      );
    const reviews = [
      ...(newPerson ? [{ meetingId, contactId, kind: "new_person" }] : []),
      ...adding.map((a) => ({ meetingId, contactId, kind: "add_unit", unitId: a.unitId, role: a.role || null })),
      ...leaving.map((unitId) => ({ meetingId, contactId, kind: "remove_unit", unitId })),
    ];
    if (reviews.length) await tx.insert(checkinReview).values(reviews);
    await writeAudit(null, "self_check_in", { type: "attendance", id: row.id }, { meetingId, contactId, added: adding.length, leaving: leaving.length }, tx);
  });
}

const newInput = z.object({
  firstName: z.string().trim().min(1, "Enter your first name.").max(60),
  lastName: z.string().trim().min(1, "Enter your last name.").max(80),
  email: z.string().trim().max(254),
  adding: z.array(claim).max(10),
  adult: z.boolean(),
  website: z.string().max(200).optional(),
});

/** Someone the roster doesn't have. They're checked in now and wait for an editor. */
export async function registerNew(token: string, raw: unknown, ip: string, now = new Date()): Promise<Done> {
  const parsed = newInput.safeParse(raw);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? GENERIC };
  const input = parsed.data;
  if (!input.adult) return { ok: false, message: "If you're under 18, please check in with the volunteer at the table." };
  if (!looksLikeEmail(input.email)) return { ok: false, message: "Enter your email." };
  const g = await gate(token, input, ip, now);
  if (!g.ok) return g;
  const active = new Set((await unitChoices()).map((u) => u.id));
  const adding = input.adding.filter((a, i, all) => active.has(a.unitId) && all.findIndex((b) => b.unitId === a.unitId) === i);

  // Already on file after all (a second try, or a typo the first time): check in that person.
  const existing = (await findPeople(input.email, input.lastName)).filter(
    (p) => normalizeName(p.preferredName || p.firstName) === normalizeName(input.firstName) || normalizeName(p.firstName) === normalizeName(input.firstName),
  );
  if (existing.length === 1) {
    const theirs = await unitsOf(existing[0].id);
    const ids = new Set(theirs.map((u) => u.id));
    await record(g.meeting.id, existing[0].id, [...ids], adding.filter((a) => !ids.has(a.unitId)), []);
    return { ok: true, message: `You're checked in, ${input.firstName}. Thanks for coming!` };
  }

  const [created] = await db
    .insert(contact)
    .values({ firstName: input.firstName, lastName: input.lastName, email: input.email.trim(), source: "self_check_in", pendingReview: true })
    .returning({ id: contact.id });
  await writeAudit(null, "contact.self_add", { type: "contact", id: created.id }, { meetingId: g.meeting.id });
  await record(g.meeting.id, created.id, [], adding, [], true);
  return { ok: true, message: `You're checked in, ${input.firstName}. Welcome! A volunteer will add you to our list.` };
}

// ---- Editors: the link and the review list -------------------------------

const meetingIdSchema = z.uuid();

/** The meeting's link token, made the first time an editor asks for it. */
export async function ensureToken(actor: CurrentUser, meetingId: string): Promise<{ ok: true; token: string } | { ok: false; message: string }> {
  if (!meetingIdSchema.safeParse(meetingId).success) return { ok: false, message: "Unknown meeting." };
  const [m] = await db.select({ token: meeting.publicToken }).from(meeting).where(eq(meeting.id, meetingId));
  if (!m) return { ok: false, message: "That meeting no longer exists." };
  if (m.token) return { ok: true, token: m.token };
  return resetToken(actor, meetingId, "made");
}

/** A new token: the old link and QR code stop working. */
export async function resetToken(actor: CurrentUser, meetingId: string, why: "made" | "reset" = "reset"): Promise<{ ok: true; token: string } | { ok: false; message: string }> {
  if (!meetingIdSchema.safeParse(meetingId).success) return { ok: false, message: "Unknown meeting." };
  const token = randomBytes(16).toString("base64url");
  const updated = await db.update(meeting).set({ publicToken: token }).where(eq(meeting.id, meetingId)).returning({ id: meeting.id });
  if (!updated.length) return { ok: false, message: "That meeting no longer exists." };
  await writeAudit(actor, `meeting.checkin_link_${why}`, { type: "meeting", id: meetingId });
  return { ok: true, token };
}

export type ReviewItem = {
  id: string;
  kind: "new_person" | "add_unit" | "remove_unit";
  contactId: string;
  name: string;
  email: string | null;
  unitLabel: string | null;
  role: string | null;
  fromRoster: boolean;
};

export async function openReviews(meetingId: string): Promise<ReviewItem[]> {
  if (!meetingIdSchema.safeParse(meetingId).success) return [];
  const rows = await db
    .select({ r: checkinReview, c: contact, u: unit })
    .from(checkinReview)
    .innerJoin(contact, eq(contact.id, checkinReview.contactId))
    .leftJoin(unit, eq(unit.id, checkinReview.unitId))
    .where(and(eq(checkinReview.meetingId, meetingId), eq(checkinReview.status, "open")))
    .orderBy(asc(contact.lastName), asc(contact.firstName), asc(checkinReview.createdAt));
  const removals = rows.filter((r) => r.r.kind === "remove_unit");
  const roster = removals.length
    ? await db
        .select({ contactId: affiliation.contactId, unitId: affiliation.unitId })
        .from(affiliation)
        .where(and(eq(affiliation.source, "import"), inArray(affiliation.contactId, removals.map((r) => r.c.id))))
    : [];
  return rows.map(({ r, c, u }) => ({
    id: r.id,
    kind: r.kind as ReviewItem["kind"],
    contactId: c.id,
    name: contactName(c),
    email: c.email,
    unitLabel: u ? unitLabel(u) : null,
    role: r.role,
    fromRoster: r.kind === "remove_unit" && roster.some((a) => a.contactId === c.id && a.unitId === r.unitId),
  }));
}

async function loadReview(id: string) {
  if (!meetingIdSchema.safeParse(id).success) return null;
  const [r] = await db.select().from(checkinReview).where(eq(checkinReview.id, id));
  return r && r.status === "open" ? r : null;
}

const resolved = (actor: CurrentUser, status: "approved" | "rejected" | "merged") => ({ status, resolvedAt: new Date(), resolvedBy: actor.id });

export async function approveReview(actor: CurrentUser, id: string): Promise<Done> {
  const r = await loadReview(id);
  if (!r) return { ok: false, message: "That's already been handled." };
  await db.transaction(async (tx) => {
    if (r.kind === "new_person") {
      await tx.update(contact).set({ pendingReview: false }).where(eq(contact.id, r.contactId));
    } else if (r.kind === "add_unit" && r.unitId) {
      const [a] = await tx
        .select({ id: attendance.id })
        .from(attendance)
        .where(and(eq(attendance.meetingId, r.meetingId), eq(attendance.contactId, r.contactId)));
      if (a) await tx.update(attendanceUnit).set({ approved: true }).where(and(eq(attendanceUnit.attendanceId, a.id), eq(attendanceUnit.unitId, r.unitId)));
      await tx
        .insert(affiliation)
        .values({ contactId: r.contactId, unitId: r.unitId, position: r.role || SELF_REPORTED_ROLE, source: "manual" })
        .onConflictDoNothing();
    } else if (r.kind === "remove_unit" && r.unitId) {
      // Only hand-added rows go; a roster row stays until the next import says otherwise.
      await tx.delete(affiliation).where(and(eq(affiliation.contactId, r.contactId), eq(affiliation.unitId, r.unitId), eq(affiliation.source, "manual")));
    }
    await tx.update(checkinReview).set(resolved(actor, "approved")).where(eq(checkinReview.id, id));
    await writeAudit(actor, `review.approve_${r.kind}`, { type: "contact", id: r.contactId }, { meetingId: r.meetingId, unitId: r.unitId }, tx);
  });
  return { ok: true, message: "Approved." };
}

export async function rejectReview(actor: CurrentUser, id: string): Promise<Done> {
  const r = await loadReview(id);
  if (!r) return { ok: false, message: "That's already been handled." };
  await db.transaction(async (tx) => {
    if (r.kind === "new_person") {
      // Not a real attendee: the contact, their check-in, and their other claims all go.
      await writeAudit(actor, "review.reject_new_person", { type: "contact", id: r.contactId }, { meetingId: r.meetingId }, tx);
      await tx.delete(contact).where(and(eq(contact.id, r.contactId), eq(contact.pendingReview, true)));
      return;
    }
    if (r.kind === "add_unit" && r.unitId) {
      const [a] = await tx
        .select({ id: attendance.id })
        .from(attendance)
        .where(and(eq(attendance.meetingId, r.meetingId), eq(attendance.contactId, r.contactId)));
      if (a) await tx.delete(attendanceUnit).where(and(eq(attendanceUnit.attendanceId, a.id), eq(attendanceUnit.unitId, r.unitId), eq(attendanceUnit.approved, false)));
    }
    await tx.update(checkinReview).set(resolved(actor, "rejected")).where(eq(checkinReview.id, id));
    await writeAudit(actor, `review.reject_${r.kind}`, { type: "contact", id: r.contactId }, { meetingId: r.meetingId, unitId: r.unitId }, tx);
  });
  return { ok: true, message: r.kind === "new_person" ? "Removed them and their check-in." : "Left as it was." };
}

/**
 * "It's actually..." for a new person who's already a contact under another
 * email: their check-ins and claims move to that contact, the email they typed
 * becomes that contact's second email if it has none, and the duplicate goes.
 */
export async function mergeReview(actor: CurrentUser, id: string, intoContactId: string): Promise<Done> {
  const r = await loadReview(id);
  if (!r || r.kind !== "new_person") return { ok: false, message: "That's already been handled." };
  if (!meetingIdSchema.safeParse(intoContactId).success || intoContactId === r.contactId) return { ok: false, message: "Pick who they are." };
  const [[from], [into]] = await Promise.all([
    db.select().from(contact).where(eq(contact.id, r.contactId)),
    db.select().from(contact).where(eq(contact.id, intoContactId)),
  ]);
  if (!from || !into) return { ok: false, message: "That contact no longer exists." };
  if (into.isYouth) return { ok: false, message: "Self check-in is for adults; pick an adult contact." };
  await db.transaction(async (tx) => {
    const theirs = await tx.select().from(attendance).where(eq(attendance.contactId, from.id));
    for (const a of theirs) {
      const [clash] = await tx
        .select({ id: attendance.id })
        .from(attendance)
        .where(and(eq(attendance.meetingId, a.meetingId), eq(attendance.contactId, into.id)));
      if (clash) await tx.delete(attendance).where(eq(attendance.id, a.id));
      else await tx.update(attendance).set({ contactId: into.id }).where(eq(attendance.id, a.id));
    }
    await tx.update(checkinReview).set({ contactId: into.id }).where(eq(checkinReview.contactId, from.id));
    await tx.update(checkinReview).set(resolved(actor, "merged")).where(eq(checkinReview.id, id));
    const typed = from.email && normalizeEmail(from.email) !== normalizeEmail(into.email ?? "") ? from.email : null;
    if (typed && !into.altEmail) await tx.update(contact).set({ altEmail: typed }).where(eq(contact.id, into.id));
    await tx.delete(contact).where(eq(contact.id, from.id));
    await writeAudit(actor, "review.merge_new_person", { type: "contact", id: into.id }, { meetingId: r.meetingId, removed: from.id }, tx);
  });
  return { ok: true, message: `Checked in as ${contactName(into)}.` };
}
