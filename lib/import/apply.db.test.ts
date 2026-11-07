import { readFileSync } from "node:fs";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/lib/auth/session";
import { parseCsvText } from "./csv";
import type { ImportPayload } from "./payload";
import { parseRoster } from "./roster";

// Runs only with TEST_DATABASE_URL pointing at a throwaway local Postgres (CI
// provides one). The schema is dropped and rebuilt, so remote hosts are refused.
const url = process.env.TEST_DATABASE_URL;
const local = url ? ["localhost", "127.0.0.1"].includes(new URL(url).hostname) : false;

const DISTRICT = "SAMPLE DISTRICT 30";
const fixture = readFileSync(path.join(import.meta.dirname, "../../tests/fixtures/roster-export-sample.csv"), "utf8");
const { fields, rows } = parseCsvText(fixture);
const parsed = parseRoster(rows, fields, DISTRICT);
const payload: ImportPayload = { fileName: "fixture.csv", district: DISTRICT, people: parsed.people, units: parsed.units };

describe.skipIf(!local)("import against Postgres", () => {
  let apply: typeof import("./apply");
  let db: typeof import("@/lib/db").db;
  let schema: typeof import("@/lib/db/schema");
  const actor: CurrentUser = { id: "test-admin", name: "Test", email: "admin@example.com", role: "admin" };

  beforeAll(async () => {
    // Meetings after today count as upcoming, so pin today after the last
    // fixture meeting (still in the 2026-27 scouting year).
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2027-02-01T17:00:00Z"));
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    await client.query("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
    await migrate(drizzle(client), { migrationsFolder: path.join(import.meta.dirname, "../../drizzle") });
    await client.query(`insert into "user" (id, name, email, role) values ('test-admin', 'Test', 'admin@example.com', 'admin')`);
    await client.end();

    process.env.DATABASE_URL = url;
    apply = await import("./apply");
    ({ db } = await import("@/lib/db"));
    schema = await import("@/lib/db/schema");
  });

  it("previews and then imports the fixture", async () => {
    const preview = await apply.previewImport(payload);
    expect(preview.counts).toMatchObject({ people: 10, new: 10, updated: 0, notInRoster: 0, unitsNew: 5 });

    const { counts } = await apply.commitImport(actor, payload);
    expect(counts).toMatchObject({ new: 10, affiliations: 11, skippedAffiliations: 0 });
    expect(await db.$count(schema.contact)).toBe(10);
    expect(await db.$count(schema.unit)).toBe(5);
    expect(await db.$count(schema.affiliation)).toBe(11);
    expect(await db.$count(schema.contact, eq(schema.contact.memberId, "900000006"))).toBe(0);
  });

  it("re-importing the same file changes nothing", async () => {
    const { counts } = await apply.commitImport(actor, payload);
    expect(counts).toMatchObject({ new: 0, updated: 0, unchanged: 10, notInRoster: 0 });
    expect(await db.$count(schema.affiliation)).toBe(11);
  });

  it("keeps hand edits: preferred name, archive, and a hand-added copy of a roster position", async () => {
    const [taylor] = await db.select().from(schema.contact).where(eq(schema.contact.memberId, "900000008"));
    const [alex] = await db.select().from(schema.contact).where(eq(schema.contact.memberId, "900000001"));
    const [quinn] = await db.select().from(schema.contact).where(eq(schema.contact.memberId, "900000011"));
    await db.update(schema.contact).set({ preferredName: "Lex", notes: "keep me" }).where(eq(schema.contact.id, alex.id));
    await db.update(schema.contact).set({ status: "archived" }).where(eq(schema.contact.id, quinn.id));
    // Delete the imported district position, then add the same one by hand: the
    // next import must take it over instead of failing on the unique key.
    await db.delete(schema.affiliation).where(eq(schema.affiliation.contactId, taylor.id));
    await db.insert(schema.affiliation).values({
      contactId: taylor.id,
      unitId: null,
      district: DISTRICT,
      position: "Merit Badge Counselor",
      source: "manual",
    });

    await apply.commitImport(actor, payload);

    const [alexAfter] = await db.select().from(schema.contact).where(eq(schema.contact.id, alex.id));
    expect(alexAfter).toMatchObject({ preferredName: "Lex", notes: "keep me" });
    const [quinnAfter] = await db.select().from(schema.contact).where(eq(schema.contact.id, quinn.id));
    expect(quinnAfter.status).toBe("archived");
    const taylorAffs = await db.select().from(schema.affiliation).where(eq(schema.affiliation.contactId, taylor.id));
    expect(taylorAffs).toHaveLength(1);
    expect(taylorAffs[0].source).toBe("import");
  });

  it("marks people who left as not in roster, and brings them back when they return", async () => {
    const withoutJordan = { ...payload, people: payload.people.filter((p) => p.memberId !== "900000002") };
    const left = await apply.commitImport(actor, withoutJordan);
    expect(left.counts.notInRoster).toBe(1);
    const [jordan] = await db.select().from(schema.contact).where(eq(schema.contact.memberId, "900000002"));
    expect(jordan.status).toBe("not_in_roster");
    expect(
      await db.$count(schema.affiliation, and(eq(schema.affiliation.contactId, jordan.id), eq(schema.affiliation.source, "import"))),
    ).toBe(1);

    const back = await apply.commitImport(actor, payload);
    expect(back.counts.reactivated).toBe(1);
    const [jordanAfter] = await db.select().from(schema.contact).where(eq(schema.contact.id, jordan.id));
    expect(jordanAfter.status).toBe("active");
  });

  it("refuses a payload that fails validation", async () => {
    await expect(apply.commitImport(actor, { ...payload, people: [{ memberId: "" }] })).rejects.toThrow();
  });

  it("adds a contact with two positions in a new unit, creating the unit once", async () => {
    const contacts = await import("@/lib/contacts/mutations");
    const newTroop = { kind: "new", type: "Troop", number: "888", genderAccepted: "B" } as const;
    const result = await contacts.createContact(actor, {
      firstName: "Hand",
      lastName: "Added",
      email: "hand@example.com",
      phone: "",
      isYouth: false,
      guardianEmail: "",
      source: "manual",
      affiliations: [
        { unit: newTroop, position: "Scoutmaster" },
        { unit: newTroop, position: "Committee Member" },
        { unit: { kind: "district" }, position: "Unit Commissioner" },
      ],
    });
    expect(result.ok).toBe(true);
    const troops = await db.select().from(schema.unit).where(and(eq(schema.unit.type, "Troop"), eq(schema.unit.number, 888)));
    expect(troops).toHaveLength(1);
    expect(troops[0]).toMatchObject({ bsaUnitId: null, genderAccepted: "B", district: DISTRICT });
    expect(await db.$count(schema.affiliation, eq(schema.affiliation.contactId, result.id!))).toBe(3);

    // Picking "new unit" for a unit that already exists reuses it.
    const again = await contacts.addAffiliation(actor, result.id!, { unit: newTroop, position: "Unit Treasurer" });
    expect(again.ok).toBe(true);
    expect(await db.$count(schema.unit, and(eq(schema.unit.type, "Troop"), eq(schema.unit.number, 888)))).toBe(1);
  });

  it("links a hand-added unit when the roster brings it in", async () => {
    const [manual] = await db.select().from(schema.unit).where(eq(schema.unit.number, 888));
    const withTroop888 = {
      ...payload,
      units: [...payload.units, { bsaUnitId: "900888", type: "Troop" as const, number: 888, genderAccepted: "B" as const, charteredOrg: null, district: DISTRICT }],
    };
    const { counts } = await apply.commitImport(actor, withTroop888);
    expect(counts).toMatchObject({ unitsLinked: 1, unitsNew: 0 });
    const [after] = await db.select().from(schema.unit).where(eq(schema.unit.id, manual.id));
    expect(after.bsaUnitId).toBe("900888");
    expect(await db.$count(schema.unit, eq(schema.unit.number, 888))).toBe(1);
  });

  it("deletes hand-added contacts but not roster ones", async () => {
    const contacts = await import("@/lib/contacts/mutations");
    const [hand] = await db.select().from(schema.contact).where(eq(schema.contact.email, "hand@example.com"));
    const [roster] = await db.select().from(schema.contact).where(eq(schema.contact.memberId, "900000001"));
    expect((await contacts.deleteContact(actor, roster.id)).ok).toBe(false);
    expect((await contacts.deleteContact(actor, hand.id)).ok).toBe(true);
    expect(await db.$count(schema.contact, eq(schema.contact.id, hand.id))).toBe(0);
    expect(await db.$count(schema.affiliation, eq(schema.affiliation.contactId, hand.id))).toBe(0);
    expect(await db.$count(schema.contact, eq(schema.contact.id, roster.id))).toBe(1);
  });

  it("runs a meeting: create, refuse a second on the same date, check in, walk-in, represented unit", async () => {
    const att = await import("@/lib/attendance/mutations");
    const queries = await import("@/lib/attendance/queries");
    const created = await att.createMeeting(actor, { date: "2026-11-19", title: "November", format: "in_person", status: "held", notes: "" });
    expect(created.ok).toBe(true);
    const again = await att.createMeeting(actor, { date: "2026-11-19", title: "", format: "hybrid", status: "held", notes: "" });
    expect(again).toMatchObject({ ok: false, id: created.id });

    const [alex] = await db.select().from(schema.contact).where(eq(schema.contact.memberId, "900000001"));
    expect((await att.checkIn(actor, created.id!, alex.id)).ok).toBe(true);
    expect(await att.checkIn(actor, created.id!, alex.id)).toMatchObject({ ok: true, alreadyIn: true });

    // Walk-in: a new person is created and checked in; a repeat of the same person just checks in.
    const walk = await att.addWalkIn(actor, created.id!, {
      firstName: "Wanda",
      lastName: "Walkin",
      email: "wanda@example.com",
      phone: "",
      isYouth: false,
      guardianEmail: "",
      affiliations: [],
    });
    expect(walk.ok).toBe(true);
    const repeat = await att.addWalkIn(actor, created.id!, {
      firstName: "wanda",
      lastName: "W",
      email: "WANDA@example.com",
      phone: "",
      isYouth: false,
      guardianEmail: "",
      affiliations: [],
    });
    expect(repeat).toMatchObject({ ok: true, id: walk.id });
    const [wanda] = await db.select().from(schema.contact).where(eq(schema.contact.id, walk.id!));
    expect(wanda.source).toBe("walk_in");

    const meetingView = await queries.getMeeting(created.id!);
    expect(meetingView!.attendees).toHaveLength(2);
    // Alex belongs to Troop 101 B and Pack 101: both count until one is recorded.
    expect(meetingView!.unitsRepresented.map((u) => u.label).sort()).toEqual(["Pack 101", "Troop 101 B"]);
    const alexRow = meetingView!.attendees.find((a) => a.contactId === alex.id)!;
    const troop = alexRow.units.find((u) => u.label === "Troop 101 B")!;
    expect((await att.setRepresentedUnit(actor, alexRow.attendanceId, troop.id)).ok).toBe(true);
    expect((await queries.getMeeting(created.id!))!.unitsRepresented.map((u) => u.label)).toEqual(["Troop 101 B"]);

    const list = await queries.listMeetings();
    expect(list.find((m) => m.id === created.id)).toMatchObject({ attendees: 2, units: 1 });

    const exported = await queries.attendanceForExport({ start: "2026-09-01", end: "2027-08-31" });
    expect(exported.rows).toHaveLength(2);
    expect(exported.rows.find((r) => r.contactId === alex.id)?.representing).toBe("Troop 101 B");
  });

  it("refuses check-ins at a cancelled meeting, and deleting a meeting takes its check-ins", async () => {
    const att = await import("@/lib/attendance/mutations");
    const cancelled = await att.createMeeting(actor, { date: "2026-12-17", title: "", format: "in_person", status: "cancelled", notes: "" });
    const [alex] = await db.select().from(schema.contact).where(eq(schema.contact.memberId, "900000001"));
    expect((await att.checkIn(actor, cancelled.id!, alex.id)).ok).toBe(false);

    const [nov] = await db.select().from(schema.meeting).where(eq(schema.meeting.date, "2026-11-19"));
    const deleted = await att.deleteMeeting(actor, nov.id);
    expect(deleted).toMatchObject({ ok: true, message: expect.stringContaining("2 check-ins") });
    expect(await db.$count(schema.attendance, eq(schema.attendance.meetingId, nov.id))).toBe(0);
  });

  it("loads an old attendance sheet after review, and a second run adds nothing", async () => {
    const { parseLegacySheet, splitName } = await import("@/lib/attendance/legacy");
    const { matchPerson } = await import("@/lib/attendance/match");
    const { resolveUnitMentions } = await import("@/lib/attendance/unit-mentions");
    const legacy = await import("@/lib/attendance/legacy-import");
    const att = await import("@/lib/attendance/mutations");
    const Papa = (await import("papaparse")).default;
    const sheetText = readFileSync(path.join(import.meta.dirname, "../../tests/fixtures/attendance-sheet-sample.csv"), "utf8");
    const sheet = parseLegacySheet(Papa.parse<string[]>(sheetText).data, "2026-10-31");
    if ("error" in sheet) throw new Error(sheet.error);

    // January's roundtable is already in the app, on its real date.
    const jan = await att.createMeeting(actor, { date: "2026-01-15", title: "", format: "in_person", status: "held", notes: "" });

    // What the review screen does: take confident matches, have a person confirm the rest, add the unknown.
    const decide = async () => {
      const data = await legacy.legacyMatchData();
      return sheet.people.map((p) => {
        const match = matchPerson({ name: p.name, unitHint: p.unitText }, data.people);
        const { unitIds } = resolveUnitMentions(p.unitText, data.units);
        const contact =
          match.status === "none"
            ? { kind: "new" as const, ...splitName(p.name), notes: p.notes.join("; ") }
            : { kind: "existing" as const, id: match.candidates[0].id };
        return { name: p.name, contact, unitIds, attended: p.attended, status: match.status };
      });
    };
    const meetings = sheet.meetings.map((m) => ({
      key: m.column,
      date: m.header === "Jan 26" ? "2026-01-15" : m.date,
      status: m.suggested === "held" ? ("held" as const) : ("cancelled" as const),
    }));

    const people = await decide();
    expect(people.map((p) => [p.name, p.status])).toEqual([
      ["Alex Example", "matched"],
      ["Jim Placeholder", "matched"],
      ["Jordan", "review"],
      ["Pat Testcase", "matched"],
      ["Casey Commish", "matched"],
      ["Newt Visitor", "none"],
      ["Quinn Nomial", "review"],
    ]);

    const first = await legacy.importLegacySheet(actor, { fileName: "sheet.csv", meetings, people });
    expect(first).toMatchObject({
      ok: true,
      counts: { meetingsAdded: 6, meetingsFound: 1, contactsAdded: 1, checkIns: 15, alreadyIn: 0, skippedCancelled: 0 },
    });
    const [newt] = await db.select().from(schema.contact).where(eq(schema.contact.lastName, "Visitor"));
    expect(newt).toMatchObject({ firstName: "Newt", source: "walk_in" });
    // Pack 909 isn't a unit in the app, so Newt gets no position.
    expect(await db.$count(schema.affiliation, eq(schema.affiliation.contactId, newt.id))).toBe(0);
    expect(await db.$count(schema.attendance, eq(schema.attendance.meetingId, jan.id!))).toBe(3);

    // "Troop 101 b, g" narrows Alex (Troop 101 B and Pack 101) to Troop 101 B.
    const [alex] = await db.select().from(schema.contact).where(eq(schema.contact.memberId, "900000001"));
    const [troopB] = await db
      .select()
      .from(schema.unit)
      .where(and(eq(schema.unit.type, "Troop"), eq(schema.unit.number, 101), eq(schema.unit.genderAccepted, "B")));
    const alexRows = await db.select().from(schema.attendance).where(eq(schema.attendance.contactId, alex.id));
    expect(alexRows.filter((r) => r.method === "legacy_import").map((r) => r.unitId)).toEqual([troopB.id, troopB.id, troopB.id]);

    const [dec] = await db.select().from(schema.meeting).where(eq(schema.meeting.date, "2025-12-01"));
    expect(dec).toMatchObject({ status: "cancelled", notes: "Loaded from sheet.csv." });

    // Run it again: Newt is matched now, and every check-in is already there.
    const again = await decide();
    expect(again.find((p) => p.name === "Newt Visitor")?.contact).toEqual({ kind: "existing", id: newt.id });
    const second = await legacy.importLegacySheet(actor, { fileName: "sheet.csv", meetings, people: again });
    expect(second).toMatchObject({ ok: true, counts: { meetingsAdded: 0, contactsAdded: 0, checkIns: 0, alreadyIn: 15 } });
  });

  it("refuses two columns on one date, and skips check-ins for a meeting already marked cancelled", async () => {
    const legacy = await import("@/lib/attendance/legacy-import");
    const [alex] = await db.select().from(schema.contact).where(eq(schema.contact.memberId, "900000001"));
    const person = { name: "Alex Example", contact: { kind: "existing" as const, id: alex.id }, unitIds: [], attended: [1, 2] };
    const clash = await legacy.importLegacySheet(actor, {
      fileName: null,
      meetings: [
        { key: 1, date: "2025-09-01", status: "held" },
        { key: 2, date: "2025-09-01", status: "held" },
      ],
      people: [person],
    });
    expect(clash).toMatchObject({ ok: false, message: expect.stringContaining("Two columns") });

    // 2026-12-17 was created as cancelled earlier; the sheet can't override that.
    const result = await legacy.importLegacySheet(actor, {
      fileName: null,
      meetings: [{ key: 1, date: "2026-12-17", status: "held" }],
      people: [{ ...person, attended: [1] }],
    });
    expect(result).toMatchObject({ ok: true, counts: { meetingsFound: 1, checkIns: 0, skippedCancelled: 1 } });
  });

  it("checks in a reviewed pasted list: existing people, new people, and repeats", async () => {
    const att = await import("@/lib/attendance/mutations");
    const m = await att.createMeeting(actor, { date: "2027-01-21", title: "", format: "virtual", status: "held", notes: "" });
    const [alex] = await db.select().from(schema.contact).where(eq(schema.contact.memberId, "900000001"));
    const result = await att.bulkCheckIn(actor, m.id!, [
      { kind: "existing", id: alex.id },
      { kind: "new", firstName: "Zoe", lastName: "Zoomer", email: "zoe@example.com" },
    ]);
    expect(result).toMatchObject({ ok: true, message: "Checked in 2 people, added 1 new contact." });
    const rows = await db.select().from(schema.attendance).where(eq(schema.attendance.meetingId, m.id!));
    expect(rows.map((r) => r.method)).toEqual(["pasted_list", "pasted_list"]);

    // Pasting the same report again: Zoe is found by email, and both are already in.
    const again = await att.bulkCheckIn(actor, m.id!, [
      { kind: "existing", id: alex.id },
      { kind: "new", firstName: "Zoe", lastName: "Zoomer", email: "ZOE@example.com" },
    ]);
    expect(again).toMatchObject({ ok: true, message: "Checked in 0 people, 2 were already in." });
    expect(await db.$count(schema.contact, eq(schema.contact.lastName, "Zoomer"))).toBe(1);
  });

  it("loads a unit list: matches, follows a designation change, adds new units, and counts only listed units", async () => {
    const { parseUnitList } = await import("@/lib/units/unit-list");
    const units = await import("@/lib/units/apply");
    const { addUnit } = await import("@/lib/units/mutations");
    const queries = await import("@/lib/units/queries");
    const list = parseUnitList(readFileSync(path.join(import.meta.dirname, "../../tests/fixtures/unit-list-sample.csv"), "utf8"));
    if ("error" in list) throw new Error(list.error);

    // Before any list: coverage counts the roster's active units.
    expect((await units.countedUnitIds()).source).toBe("roster");

    // A troop typed in by hand as girls, which the list now has as a family troop.
    const t707 = await addUnit(actor, { type: "Troop", number: "707", genderAccepted: "G" });
    expect(t707.ok).toBe(true);
    expect(await addUnit(actor, { type: "Troop", number: "707", genderAccepted: "G" })).toMatchObject({ ok: false, id: t707.id });

    const payload = { fileName: "units.csv", asOf: list.asOf, district: DISTRICT, units: list.units };
    const preview = await units.previewUnitList(payload);
    expect(preview).toMatchObject({ ok: true, counts: { matched: 4, changed: 1, created: 1, skipped: 1, counted: 6 } });
    const loaded = await units.loadUnitList(actor, payload);
    expect(loaded).toMatchObject({ ok: true, counts: { counted: 6 } });

    const counted = await units.countedUnitIds();
    expect(counted).toMatchObject({ source: "list", asOf: "2026-10-31" });
    expect(counted.ids).toHaveLength(6);
    const [troop707] = await db.select().from(schema.unit).where(eq(schema.unit.id, t707.id!));
    expect(troop707).toMatchObject({ genderAccepted: "F", youthCount: 9, adultCount: 4, subdistrict: "Sub Dist. #2" });

    // Ship 303 came from the roster but isn't on the list: flagged, and not counted.
    const overview = await queries.listUnitsOverview({ start: "2025-09-01", end: "2026-08-31" });
    const ship = overview.units.find((u) => u.label === "Ship 303")!;
    expect(ship).toMatchObject({ onList: false, counted: false });
    expect(overview.units.find((u) => u.label === "Pack 404")).toMatchObject({ onList: true, counted: true, handAdded: true, contacts: 0 });
    // Pat came to five 2025-26 meetings for Pack 101 (from the old sheet).
    const pack = overview.units.find((u) => u.label === "Pack 101")!;
    expect(pack).toMatchObject({ onList: true, counted: true, meetings: 5, lastRepresented: "2026-05-01" });

    const detail = await queries.getUnitDetail(pack.id, { start: "2025-09-01", end: "2026-08-31" });
    // Alex goes by Lex, set by hand in an earlier test.
    expect(detail!.contacts.map((c) => c.name).sort()).toEqual(["Lex Example", "Pat Testcase", "Sam Testcase"]);
    expect(detail!.people.find((p) => p.name === "Pat Testcase")).toMatchObject({ meetings: 5, last: "2026-05-01" });
    // Alex's check-ins named Troop 101 B, so they don't count for Pack 101.
    expect(detail!.people.map((p) => p.name)).not.toContain("Lex Example");
  });

  it("reports unit coverage for a year against the unit list, with outreach contacts for units still to reach", async () => {
    const metrics = await import("@/lib/attendance/metrics");
    const c = await metrics.coverageForYear("2025-26");
    // The old sheet reached Troop 101 B (Alex), Troop 101 G (Jordan), Pack 101 (Pat), and Crew 205 (Jim) of the 6 listed units.
    expect(c).toMatchObject({ source: "list", total: 6, represented: 4 });
    expect(c.meetings.map((m) => [m.date, m.represented.length, m.cumulative])).toEqual([
      ["2025-11-01", 3, 3],
      ["2026-01-15", 3, 4],
      ["2026-02-01", 3, 4],
      ["2026-04-01", 2, 4],
      ["2026-05-01", 1, 4],
    ]);
    // Quinn came for Ship 303, which isn't on the list: shown, not counted.
    expect(c.meetings[3].offList.map((id) => c.labels[id])).toEqual(["Ship 303"]);
    const toReach = c.units.filter((u) => u.counted && u.meetings === 0).map((u) => u.label);
    expect(toReach).toEqual(["Pack 404", "Troop 707"]);

    // Outreach goes to each unit's Key 3 only: the unit leader, the committee chair, and the
    // unit rep, who can be a council unit representative instead of a chartered org rep.
    const troopB = c.units.find((u) => u.label === "Troop 101 B")!;
    const leaders = await metrics.outreachContacts([troopB.id]);
    expect(leaders.map((l) => [l.name, l.position]).sort()).toEqual([
      ["Avery Transfer", "Committee Chair"],
      ["Lex Example", "Scoutmaster"],
    ]);
    const [pat] = await db.select().from(schema.contact).where(eq(schema.contact.lastName, "Testcase")).limit(1);
    const added = await db
      .insert(schema.affiliation)
      .values([
        { contactId: pat.id, unitId: troopB.id, position: "Council Unit Representative" },
        { contactId: pat.id, unitId: troopB.id, position: "Committee Member" },
      ])
      .returning({ id: schema.affiliation.id });
    expect((await metrics.outreachContacts([troopB.id])).filter((l) => l.contactId === pat.id).map((l) => l.position)).toEqual([
      "Council Unit Representative",
    ]);
    for (const a of added) await db.delete(schema.affiliation).where(eq(schema.affiliation.id, a.id));

    const nov = await metrics.meetingCoverage(c.meetings[0].id, "2025-11-01");
    expect(nov).toMatchObject({ total: 6, year: "2025-26", meeting: { represented: expect.any(Array), newUnits: expect.any(Array) } });
    expect(nov.meeting!.newUnits).toHaveLength(3);
  });

  it("adds trends: people new and returning, same month last year, coverage by program, and a person's record", async () => {
    const metrics = await import("@/lib/attendance/metrics");
    const queries = await import("@/lib/attendance/queries");
    const c = await metrics.coverageForYear("2026-27");
    // 2026-27 so far: Alex and Zoe at the January virtual meeting. 2025-26 had 7 people from the old sheet.
    expect(c.trends.lastYear).toBe("2025-26");
    expect(c.trends.people).toEqual({ people: 2, newPeople: 1, returning: 1, lastYearPeople: 7, retention: 14 });
    const jan = c.meetings.find((m) => m.date === "2027-01-21")!;
    expect(c.trends.sameMonth[jan.id]).toBe(3);
    expect(c.trends.programs).toEqual([
      { type: "Pack", counted: 2, represented: 1, percent: 50 },
      { type: "Troop", counted: 3, represented: 1, percent: 33 },
      { type: "Crew", counted: 1, represented: 0, percent: 0 },
    ]);

    const [alex] = await db.select().from(schema.contact).where(eq(schema.contact.memberId, "900000001"));
    const history = await queries.contactRecord(alex.id);
    expect(history.meetings.map((m) => m.date)).toEqual(["2027-01-21", "2026-04-01", "2026-01-15", "2025-11-01"]);
    expect(history.record).toMatchObject({ last: "2027-01-21", streak: 1 });
    expect(history.meetings[0].method).toBe("pasted_list");
  });

  it("sends announcements: audiences, unsubscribes pulled back, the segment synced, and failures recorded", async () => {
    const audiences = await import("@/lib/announcements/audiences");
    const send = await import("@/lib/announcements/send");
    process.env.EMAIL_FROM = "Roundtable Tools <no-reply@example.org>";
    const calls: { sync: { name: string; id: string | null; emails: string[] }[]; broadcasts: Record<string, string>[]; tests: Record<string, string>[] } = {
      sync: [],
      broadcasts: [],
      tests: [],
    };
    let failWith: string | null = null;
    const mailer = {
      unsubscribedEmails: async () => ["ALEX@example.com"],
      syncSegment: async (name: string, id: string | null, members: { email: string }[]) => {
        calls.sync.push({ name, id, emails: members.map((m) => m.email) });
        return id ?? "seg-1";
      },
      sendBroadcast: async (opts: Record<string, string>) => {
        if (failWith) throw new Error(failWith);
        calls.broadcasts.push(opts);
        return "bc-1";
      },
      sendTest: async (opts: Record<string, string>) => {
        calls.tests.push(opts);
      },
    };

    const everyoneBefore = (await audiences.audienceMembers("everyone")).map((m) => m.email);
    expect(everyoneBefore).toContain("alex@example.com");
    // One email per address: Pat and Sam share a family email.
    expect(new Set(everyoneBefore.map((e) => e.toLowerCase())).size).toBe(everyoneBefore.length);
    expect((await audiences.audienceMembers("unit-leaders")).map((m) => m.email)).toContain("alex@example.com");

    const test = await send.sendTestAnnouncement(actor, { subject: "Nov roundtable", body: "Hi {first name}, see you Thursday." }, mailer);
    expect(test.ok).toBe(true);
    expect(calls.tests[0]).toMatchObject({ to: "admin@example.com", subject: "[Test] Nov roundtable", replyTo: "admin@example.com" });
    expect(calls.tests[0].text).toContain("\n\nHi Test, see you Thursday.\n\n");
    // Until an admin sets a brand, mail comes from the default name at the verified address.
    expect(calls.tests[0].from).toBe('"Roundtable Team" <no-reply@example.org>');

    const brandStore = await import("@/lib/announcements/brand-store");
    expect(await brandStore.saveBrand(actor, { fromName: 'Bad" <x@y.z>', headerTitle: "", accent: "#1f3a68", logoUrl: "", footerLine: "" })).toMatchObject({ ok: false });
    expect(
      await brandStore.saveBrand(actor, {
        fromName: "GNYC Big Apple Roundtable Team",
        headerTitle: "Big Apple Roundtable",
        accent: "#b91c1c",
        logoUrl: "",
        footerLine: "Sample Council · Big Apple District",
      }),
    ).toMatchObject({ ok: true });
    expect((await brandStore.getBrand()).accent).toBe("#b91c1c");

    const sent = await send.sendAnnouncement(
      actor,
      { audience: "everyone", subject: "Nov roundtable", body: "Hi {first name}, see you Thursday.", previewText: "Popcorn and pizza" },
      mailer,
    );
    expect(sent.ok).toBe(true);
    // Alex unsubscribed in Resend: marked here, and left out of the segment.
    const [alex] = await db.select().from(schema.contact).where(eq(schema.contact.memberId, "900000001"));
    expect(alex.unsubscribedAt).not.toBeNull();
    expect(calls.sync[0]).toMatchObject({ name: "Roundtable Tools: Everyone in contacts", id: null });
    expect(calls.sync[0].emails).not.toContain("alex@example.com");
    expect(calls.sync[0].emails.length).toBe(everyoneBefore.length - 1);
    expect(calls.broadcasts[0]).toMatchObject({ segmentId: "seg-1", replyTo: "admin@example.com", subject: "Nov roundtable" });
    expect(calls.broadcasts[0].html).toContain("{{{RESEND_UNSUBSCRIBE_URL}}}");
    expect(calls.broadcasts[0].html).toContain("{{{contact.first_name|there}}}");
    expect(calls.broadcasts[0].from).toBe('"GNYC Big Apple Roundtable Team" <no-reply@example.org>');
    expect(calls.broadcasts[0].html).toContain(">Big Apple Roundtable</td>");
    expect(calls.broadcasts[0].html).toContain("Popcorn and pizza");
    expect(calls.broadcasts[0].html).toContain("Sample Council · Big Apple District");

    // The next send reuses the segment.
    await send.sendAnnouncement(actor, { audience: "everyone", subject: "Reminder", body: "Tomorrow." }, mailer);
    expect(calls.sync[1].id).toBe("seg-1");

    failWith = "Resend: restricted_api_key: This API key is restricted to only send emails";
    const failed = await send.sendAnnouncement(actor, { audience: "unit-leaders", subject: "Leaders", body: "Hello." }, mailer);
    expect(failed).toMatchObject({ ok: false, message: expect.stringContaining("RESEND_BROADCAST_API_KEY") });

    const history = await send.listAnnouncements();
    expect(history.map((a) => [a.subject, a.status])).toEqual([
      ["Leaders", "failed"],
      ["Reminder", "sent"],
      ["Nov roundtable", "sent"],
    ]);
    expect(history[2]).toMatchObject({ audienceLabel: "Everyone in contacts", recipients: everyoneBefore.length - 1, resendBroadcastId: "bc-1" });
    expect(await send.unsubscribedCount()).toBe(1);
    expect(await send.sendAnnouncement(actor, { audience: "nobody", subject: "x", body: "y" }, mailer)).toMatchObject({ ok: false });
  });

  it("builds groups by hand, shows who's in one and who's left out, and sends to it", async () => {
    const groups = await import("@/lib/groups/store");
    const audiences = await import("@/lib/announcements/audiences");
    const send = await import("@/lib/announcements/send");
    const sent: Record<string, string>[] = [];
    const mailer = {
      unsubscribedEmails: async () => [],
      syncSegment: async (_name: string, id: string | null) => id ?? "seg-group",
      sendBroadcast: async (opts: Record<string, string>) => {
        sent.push(opts);
        return "bc-group";
      },
      sendTest: async () => {},
    };

    // People the group's announcement can't reach, each for a different reason.
    const [youth] = await db
      .insert(schema.contact)
      .values({ firstName: "Kid", lastName: "Testcase", isYouth: true, guardianEmail: "parent@example.com", email: "kid@example.com" })
      .returning();
    const [noEmail] = await db.insert(schema.contact).values({ firstName: "Nomail", lastName: "Person" }).returning();
    const byName = async (first: string) => (await db.select().from(schema.contact).where(eq(schema.contact.firstName, first)))[0];
    const [pat, sam, alex] = [await byName("Pat"), await byName("Sam"), await db.select().from(schema.contact).where(eq(schema.contact.memberId, "900000001")).then((r) => r[0])];
    expect(alex.unsubscribedAt).not.toBeNull();

    const made = await groups.createGroup(actor, { name: "Test group", description: "Trying things first" }, [pat.id, sam.id, alex.id, youth.id]);
    expect(made).toMatchObject({ ok: true, message: 'Made the group "Test group" with 4 people.' });
    const id = (made as { id: string }).id;
    expect(await groups.createGroup(actor, { name: "test GROUP" })).toMatchObject({ ok: false, message: expect.stringContaining("already a group") });
    expect(await groups.createGroup(actor, { name: "  " })).toMatchObject({ ok: false });
    expect(await groups.addToGroup(actor, id, [noEmail.id, pat.id])).toMatchObject({ ok: true, message: 'Added 1 to "Test group". 1 was already in it.' });

    const key = audiences.groupKey(id);
    expect(audiences.isAudienceKey(key)).toBe(true);
    expect(audiences.isAudienceKey("group:not-a-uuid")).toBe(false);
    const roster = await audiences.audienceRoster(key);
    // Pat and Sam share a family email, so one of them gets it.
    expect(roster.members.map((m) => m.name)).toEqual(["Pat Testcase"]);
    expect(Object.fromEntries(roster.leftOut.map((p) => [p.name, p.reason]))).toEqual({
      "Kid Testcase": "youth",
      "Nomail Person": "no_email",
      [`${alex.preferredName || alex.firstName} ${alex.lastName}`]: "unsubscribed",
      "Sam Testcase": "shared_email",
    });
    expect((await audiences.audienceMembers(key)).map((m) => m.email)).toEqual([pat.email]);

    const options = await audiences.audienceOptions();
    expect(options.find((o) => o.key === key)).toMatchObject({ label: "Test group", custom: true, count: 1 });
    expect((await audiences.membershipMap())[pat.id]).toEqual(expect.arrayContaining(["everyone", key]));

    const mine = await audiences.membershipsFor(pat.id);
    expect(mine.groups).toEqual([{ id, name: "Test group" }]);
    expect(mine.builtIn.map((m) => m.key)).toContain("packs");
    expect(mine.builtIn.find((m) => m.key === "packs")!.why).toContain("Pack 101");
    expect((await audiences.membershipsFor(youth.id)).leftOut).toBe("youth");

    const result = await send.sendAnnouncement(actor, { audience: key, subject: "Just us", body: "Hi {first name}." }, mailer);
    expect(result.ok).toBe(true);
    const [latest] = await send.listAnnouncements();
    expect(latest).toMatchObject({ audience: key, audienceLabel: "Test group", recipients: 1 });

    expect(await groups.updateGroup(actor, id, { name: "Testers" })).toMatchObject({ ok: true });
    expect((await groups.listGroups()).map((g) => [g.name, g.count, g.createdByName])).toEqual([["Testers", 5, "Test"]]);
    expect(await groups.removeFromGroup(actor, id, [pat.id])).toMatchObject({ message: 'Took 1 out of "Testers".' });
    expect(await groups.groupsOf(pat.id)).toEqual([]);

    // Several lists at once: everyone in any of them, once each.
    expect(audiences.isAudienceKey(`packs,${key}`)).toBe(true);
    expect(audiences.isAudienceKey("packs,packs")).toBe(false);
    expect(audiences.isAudienceKey("packs,nobody")).toBe(false);
    expect((await audiences.audienceInfo(`packs,${key}`))?.label).toBe("All Cub Scout Volunteers + Testers");
    const packs = (await audiences.audienceMembers("packs")).map((m) => m.contactId);
    const both = (await audiences.audienceMembers(`packs,${key}`)).map((m) => m.contactId);
    expect(new Set(both).size).toBe(both.length);
    expect(packs.every((c) => both.includes(c))).toBe(true);

    expect(await groups.deleteGroup(actor, id)).toMatchObject({ ok: true });
    // The people are still there; only the group is gone.
    expect(await byName("Sam")).toBeDefined();
    expect(await send.sendAnnouncement(actor, { audience: key, subject: "x", body: "y" }, mailer)).toMatchObject({
      ok: false,
      message: expect.stringContaining("doesn't exist anymore"),
    });
    expect(await groups.addToGroup(actor, id, [sam.id])).toMatchObject({ ok: false });
  });

  it("keeps meeting times, and leaves upcoming meetings out of what was held", async () => {
    const att = await import("@/lib/attendance/mutations");
    const queries = await import("@/lib/attendance/queries");
    const metrics = await import("@/lib/attendance/metrics");
    const base = { title: "", format: "in_person" as const, status: "held" as const, notes: "" };

    expect(await att.createMeeting(actor, { ...base, date: "2027-03-04", startTime: "20:00", endTime: "19:00" })).toMatchObject({
      ok: false,
      message: "The meeting has to end after it starts.",
    });
    expect(await att.createMeeting(actor, { ...base, date: "2027-03-04", endTime: "19:00" })).toMatchObject({ ok: false });
    const made = await att.createMeeting(actor, { ...base, date: "2027-03-04", startTime: "19:00", endTime: "20:30" });
    expect(made.ok).toBe(true);
    const listed = (await queries.listMeetings()).find((m) => m.id === made.id)!;
    expect([listed.startTime, listed.endTime]).toEqual(["19:00:00", "20:30:00"]);

    // Today is pinned to Feb 1, 2027: the March meeting is on the calendar but not held yet.
    const coverage = await metrics.coverageForYear("2026-27");
    expect(coverage.meetings.map((m) => m.date)).not.toContain("2027-03-04");
    const [someone] = await db.select().from(schema.contact).limit(1);
    expect(await att.checkIn(actor, made.id!, someone.id)).toMatchObject({ ok: false, message: expect.stringContaining("Check-in opens on the day") });
    const record = await queries.contactRecord(someone.id);
    expect(record.meetings.map((m) => m.date)).not.toContain("2027-03-04");
    const exported = await queries.attendanceForExport({ start: "2026-09-01", end: "2027-08-31" });
    expect(exported.meetings.map((m) => m.date)).not.toContain("2027-03-04");

    // On the day, it opens.
    vi.setSystemTime(new Date("2027-03-04T23:00:00Z"));
    expect(await att.checkIn(actor, made.id!, someone.id)).toMatchObject({ ok: true });
    expect((await metrics.coverageForYear("2026-27")).meetings.map((m) => m.date)).toContain("2027-03-04");
    expect(await att.updateMeeting(actor, made.id!, { ...base, date: "2027-03-04", startTime: "", endTime: "" })).toMatchObject({ ok: true });
    vi.setSystemTime(new Date("2027-02-01T17:00:00Z"));
  });

  it("runs self check-in: the link, the window, matching by email and last name, claims for review, and coverage", async () => {
    const att = await import("@/lib/attendance/mutations");
    const queries = await import("@/lib/attendance/queries");
    const audiences = await import("@/lib/announcements/audiences");
    const sci = await import("@/lib/selfcheckin/service");
    const { SELF_REPORTED_ROLE } = await import("@/lib/selfcheckin/rules");
    const base = { title: "", format: "in_person" as const, status: "held" as const, notes: "" };
    const made = await att.createMeeting(actor, { ...base, date: "2027-01-28", startTime: "19:00", endTime: "20:30" });
    const meetingId = made.id!;
    const open = new Date("2027-01-28T23:45:00Z"); // 6:45 pm in New York
    const ip = "203.0.113.7";

    const t1 = await sci.ensureToken(actor, meetingId);
    expect(t1.ok).toBe(true);
    const token = (t1 as { token: string }).token;
    expect(await sci.ensureToken(actor, meetingId)).toEqual({ ok: true, token });

    const alex = (await db.select().from(schema.contact).where(eq(schema.contact.memberId, "900000001")))[0];
    const who = { email: alex.email!.toUpperCase(), lastName: ` ${alex.lastName.toLowerCase()} ` };
    expect(await sci.identify(token, who, ip, new Date("2027-01-28T12:00:00Z"))).toMatchObject({ ok: false, message: "Check-in isn't open right now." });
    expect(await sci.identify("not-a-real-token-at-all", who, ip, open)).toMatchObject({ ok: false, message: expect.stringContaining("isn't working") });
    expect(await sci.identify(token, { ...who, website: "spam" }, ip, open)).toMatchObject({ ok: false });
    expect(await sci.identify(token, { email: alex.email, lastName: "Wrong" }, ip, open)).toEqual({ ok: true, kind: "new" });

    const found = await sci.identify(token, who, ip, open);
    expect(found).toMatchObject({ ok: true, kind: "match", person: { contactId: alex.id, alreadyIn: false } });
    const person = (found as { person: import("@/lib/selfcheckin/service").Person }).person;
    expect(person.units.length).toBeGreaterThan(0);
    // Only a first name and unit labels come back.
    expect(Object.keys(person).sort()).toEqual(["alreadyIn", "contactId", "firstName", "representing", "rsvp", "units"]);
    // Each unit comes with their role there, so they can confirm it at a glance.
    expect(person.units[0]).toMatchObject({ pending: false, role: expect.any(String) });
    expect(person.units[0].role!.length).toBeGreaterThan(0);

    // A family email shared by Pat and Sam: pick by first name.
    const pat = (await db.select().from(schema.contact).where(eq(schema.contact.firstName, "Pat")))[0];
    const choose = await sci.identify(token, { email: pat.email, lastName: pat.lastName }, ip, open);
    expect(choose).toMatchObject({ ok: true, kind: "choose" });
    expect((choose as { people: { firstName: string }[] }).people.map((p) => p.firstName).sort()).toEqual(["Pat", "Sam"]);
    const sam = (choose as { people: { contactId: string; firstName: string }[] }).people.find((p) => p.firstName === "Sam")!;
    expect(await sci.pick(token, { email: pat.email, lastName: pat.lastName }, sam.contactId, ip, open)).toMatchObject({ kind: "match" });
    expect(await sci.pick(token, { email: pat.email, lastName: pat.lastName }, alex.id, ip, open)).toMatchObject({ ok: false });

    // Youth are never matched, even with their own email.
    const kid = { email: "kid@example.com", lastName: "Testcase" };
    expect(await sci.identify(token, kid, ip, open)).toEqual({ ok: true, kind: "new" });

    // Alex represents one of their units tonight and claims another.
    const units = await sci.unitChoices();
    const mine = person.units[0];
    const other = units.find((u) => !person.units.some((p) => p.id === u.id))!;
    const done = await sci.confirm(token, { ...who, contactId: alex.id, representing: [mine.id], leaving: [], adding: [{ unitId: other.id, role: "Den Leader" }] }, ip, open);
    expect(done).toMatchObject({ ok: true, message: expect.stringContaining("A volunteer will update your record") });
    // Alex matched a contact, so the claimed unit counts now; the review is only about the record.
    let m = await queries.getMeeting(meetingId);
    expect(m!.unitsRepresented.map((u) => u.id).sort()).toEqual([mine.id, other.id].sort());
    expect(m!.attendees[0]).toMatchObject({ method: "self_check_in" });
    expect(m!.attendees[0].confirmedLabels.sort()).toEqual([mine.label, other.label].sort());
    expect(m!.attendees[0].roles.length).toBeGreaterThan(0);

    let reviews = await sci.openReviews(meetingId);
    expect(reviews.map((r) => [r.kind, r.unitLabel, r.role, r.newPerson])).toEqual([["add_unit", other.label, "Den Leader", false]]);

    // Checking in again starts from what they said, shows the claim as waiting, and doesn't duplicate or drop it.
    const again = (await sci.identify(token, who, ip, open)) as { person: import("@/lib/selfcheckin/service").Person };
    expect(again.person).toMatchObject({ alreadyIn: true });
    expect(again.person.representing!.sort()).toEqual([mine.id, other.id].sort());
    expect(again.person.units.find((u) => u.id === other.id)).toMatchObject({ pending: true, role: "Den Leader" });
    await sci.confirm(token, { ...who, contactId: alex.id, representing: again.person.representing!, leaving: [], adding: [] }, ip, open);
    expect((await sci.openReviews(meetingId)).map((r) => [r.kind, r.unitLabel])).toEqual([["add_unit", other.label]]);
    expect((await queries.getMeeting(meetingId))!.unitsRepresented.map((u) => u.id).sort()).toEqual([mine.id, other.id].sort());
    expect(await sci.approveReview(actor, reviews[0].id)).toMatchObject({ ok: true });
    expect(await sci.approveReview(actor, reviews[0].id)).toMatchObject({ ok: false });
    m = await queries.getMeeting(meetingId);
    expect(m!.unitsRepresented.map((u) => u.id).sort()).toEqual([mine.id, other.id].sort());
    const [aff] = await db.select().from(schema.affiliation).where(and(eq(schema.affiliation.contactId, alex.id), eq(schema.affiliation.unitId, other.id)));
    expect(aff).toMatchObject({ position: "Den Leader", source: "manual" });

    // Confirming again replaces it: unticking everything means no unit tonight.
    await sci.confirm(token, { ...who, contactId: alex.id, representing: [], leaving: [mine.id], adding: [] }, ip, open);
    m = await queries.getMeeting(meetingId);
    expect(m!.unitsRepresented).toEqual([]);
    reviews = await sci.openReviews(meetingId);
    expect(reviews).toMatchObject([{ kind: "remove_unit", unitLabel: mine.label, fromRoster: true }]);
    // A roster unit stays until the next import says otherwise.
    await sci.approveReview(actor, reviews[0].id);
    expect(
      (await db.select().from(schema.affiliation).where(and(eq(schema.affiliation.contactId, alex.id), eq(schema.affiliation.unitId, mine.id)))).length,
    ).toBeGreaterThan(0);

    // Someone new: checked in, left out of announcements until approved.
    expect(await sci.registerNew(token, { firstName: "Young", lastName: "Person", email: "young@example.org", adding: [], adult: false }, ip, open)).toMatchObject({
      ok: false,
      message: expect.stringContaining("under 18"),
    });
    const fresh = await sci.registerNew(token, { firstName: "Nia", lastName: "Newcomer", email: "nia@example.org", adding: [{ unitId: other.id }], adult: true }, ip, open);
    expect(fresh).toMatchObject({ ok: true, message: expect.stringContaining("Welcome") });
    const [nia] = await db.select().from(schema.contact).where(eq(schema.contact.email, "nia@example.org"));
    expect(nia).toMatchObject({ pendingReview: true, source: "self_check_in" });
    expect((await audiences.audienceMembers("everyone")).map((p) => p.email)).not.toContain("nia@example.org");
    expect((await audiences.audienceRoster("everyone")).leftOut.find((p) => p.contactId === nia.id)?.reason).toBe("pending_review");
    // Trying again with the same details checks in the same person, not a second one.
    await sci.registerNew(token, { firstName: "Nia", lastName: "Newcomer", email: "nia@example.org", adding: [], adult: true }, ip, open);
    expect((await db.select().from(schema.contact).where(eq(schema.contact.email, "nia@example.org"))).length).toBe(1);

    reviews = await sci.openReviews(meetingId);
    const niaNew = reviews.find((r) => r.kind === "new_person" && r.contactId === nia.id)!;
    // "It's actually Pat": the check-in moves, Pat gains a second email, the duplicate goes.
    expect(await sci.mergeReview(actor, niaNew.id, pat.id)).toMatchObject({ ok: true, message: expect.stringContaining("Pat") });
    expect((await db.select().from(schema.contact).where(eq(schema.contact.id, nia.id))).length).toBe(0);
    expect((await db.select().from(schema.contact).where(eq(schema.contact.id, pat.id)))[0].altEmail).toBe("nia@example.org");
    expect((await queries.getMeeting(meetingId))!.attendees.map((a) => a.contactId)).toContain(pat.id);

    // Rejecting someone new removes them and their check-in.
    await sci.registerNew(token, { firstName: "Not", lastName: "Real", email: "fake@example.org", adding: [], adult: true }, ip, open);
    const fake = (await sci.openReviews(meetingId)).find((r) => r.kind === "new_person")!;
    expect(await sci.rejectReview(actor, fake.id)).toMatchObject({ ok: true });
    expect((await db.select().from(schema.contact).where(eq(schema.contact.email, "fake@example.org"))).length).toBe(0);

    // Rate limits, and a reset link stops the old one.
    expect([await sci.allow("test:limit", 2, 600), await sci.allow("test:limit", 2, 600), await sci.allow("test:limit", 2, 600)]).toEqual([true, true, false]);
    const reset = await sci.resetToken(actor, meetingId);
    expect(reset.ok && reset.token !== token).toBe(true);
    expect(await sci.identify(token, who, ip, open)).toMatchObject({ ok: false, message: expect.stringContaining("isn't working") });
    expect(SELF_REPORTED_ROLE).toContain("self-reported");

    // A hybrid meeting's join link is given out only after someone checks in.
    const newToken = (reset as { token: string }).token;
    const hybrid = { ...base, date: "2027-01-28", startTime: "19:00", endTime: "20:30", format: "hybrid" as const, place: "St. Mark's Hall" };
    expect(await att.updateMeeting(actor, meetingId, { ...hybrid, joinUrl: "http://example.org/zoom" })).toMatchObject({ ok: false });
    expect(await att.updateMeeting(actor, meetingId, { ...hybrid, joinUrl: "https://example.org/zoom" })).toMatchObject({ ok: true });
    expect((await sci.publicMeeting(newToken, open))?.place).toBe("St. Mark's Hall");
    const joined = await sci.confirm(newToken, { ...who, contactId: alex.id, representing: [], leaving: [], adding: [] }, ip, open);
    expect(joined).toMatchObject({ ok: true, joinUrl: "https://example.org/zoom" });
    expect((await queries.upcomingMeetings()).map((u) => u.date)).not.toContain("2026-11-19");
  });

  it("takes RSVPs on the meeting page before check-in opens", async () => {
    const att = await import("@/lib/attendance/mutations");
    const audiences = await import("@/lib/announcements/audiences");
    const sci = await import("@/lib/selfcheckin/service");
    const base = { title: "Spring planning", format: "hybrid" as const, status: "held" as const, notes: "", place: "St. Mark's Hall", joinUrl: "https://example.org/zoom" };
    const made = await att.createMeeting(actor, { ...base, date: "2027-02-18", startTime: "19:00", endTime: "20:30" });
    const meetingId = made.id!;
    const token = ((await sci.ensureToken(actor, meetingId)) as { token: string }).token;
    const before = new Date("2027-02-01T17:00:00Z");
    const ip = "198.51.100.4";

    const page = await sci.publicMeeting(token, before);
    expect(page).toMatchObject({ rsvpOpen: true, window: { state: "before" } });
    const alex = (await db.select().from(schema.contact).where(eq(schema.contact.memberId, "900000001")))[0];
    const who = { email: alex.email, lastName: alex.lastName };
    // Check-in isn't open yet; RSVP is.
    expect(await sci.identify(token, who, ip, before)).toMatchObject({ ok: false, message: "Check-in isn't open right now." });
    expect(await sci.identify(token, who, ip, before, "rsvp")).toMatchObject({ kind: "match", person: { rsvp: null } });

    expect(await sci.answer(token, { ...who, contactId: alex.id, response: "yes" }, ip, before)).toMatchObject({
      ok: true,
      message: expect.stringContaining("See you there"),
      joinUrl: "https://example.org/zoom",
    });
    expect(await sci.identify(token, who, ip, before, "rsvp")).toMatchObject({ person: { rsvp: "yes" } });
    expect(await sci.answer(token, { ...who, contactId: alex.id, response: "no" }, ip, before)).toMatchObject({ ok: true, joinUrl: null });

    const sam = (await db.select().from(schema.contact).where(eq(schema.contact.firstName, "Sam")))[0];
    await sci.answer(token, { email: sam.email, lastName: sam.lastName, contactId: sam.id, response: "yes" }, ip, before);

    // Someone new RSVPs: added for review, left out of announcements until approved.
    expect(await sci.answerNew(token, { firstName: "Rae", lastName: "Newman", email: "rae@example.org", response: "yes", adult: true }, ip, before)).toMatchObject({ ok: true });
    const [rae] = await db.select().from(schema.contact).where(eq(schema.contact.email, "rae@example.org"));
    expect(rae.pendingReview).toBe(true);
    expect((await sci.openReviews(meetingId)).map((r) => [r.kind, r.name])).toEqual([["new_person", "Rae Newman"]]);

    const list = await sci.rsvpsFor(meetingId);
    expect(list.yes.map((p) => p.name).sort()).toEqual(["Rae Newman", "Sam Testcase"]);
    expect(list.no.map((p) => p.contactId)).toEqual([alex.id]);

    // Audiences for the meeting: who said yes (Rae waits for review), and who hasn't answered.
    const yesKey = `rsvp-yes:${meetingId}`;
    expect(audiences.isAudienceKey(yesKey)).toBe(true);
    expect((await audiences.audienceMembers(yesKey)).map((m) => m.contactId)).toEqual([sam.id]);
    const none = (await audiences.audienceMembers(`rsvp-none:${meetingId}`)).map((m) => m.contactId);
    expect(none).not.toContain(alex.id);
    expect(none).not.toContain(sam.id);
    const options = await audiences.audienceOptions();
    expect(options.find((o) => o.key === yesKey)).toMatchObject({ label: "Said yes for Feb 18, 2027", kind: "meeting", count: 1 });

    // "It's actually Pat": Rae's RSVP moves to Pat.
    const pat = (await db.select().from(schema.contact).where(eq(schema.contact.firstName, "Pat")))[0];
    const raeReview = (await sci.openReviews(meetingId))[0];
    await sci.mergeReview(actor, raeReview.id, pat.id);
    expect((await sci.rsvpsFor(meetingId)).yes.map((p) => p.contactId).sort()).toEqual([pat.id, sam.id].sort());

    // Once check-in opens, the page checks people in instead.
    const during = new Date("2027-02-18T23:45:00Z");
    expect(await sci.answer(token, { ...who, contactId: alex.id, response: "yes" }, ip, during)).toMatchObject({
      ok: false,
      message: expect.stringContaining("Check-in is open now"),
    });
    expect((await sci.publicMeeting(token, during))?.rsvpOpen).toBe(false);
  });

  it("sends reminders at 9 am on their day, only once approved, and never twice", async () => {
    const att = await import("@/lib/attendance/mutations");
    const rem = await import("@/lib/reminders/service");
    const send = await import("@/lib/announcements/send");
    process.env.EMAIL_FROM = "Roundtable Tools <no-reply@example.org>";
    const broadcasts: Record<string, string>[] = [];
    const mailer = {
      unsubscribedEmails: async () => [],
      syncSegment: async (_n: string, id: string | null) => id ?? "seg-r",
      sendBroadcast: async (opts: Record<string, string>) => {
        broadcasts.push(opts);
        return "bc-r";
      },
      sendTest: async () => {},
    };
    const made = await att.createMeeting(actor, {
      date: "2027-02-25",
      startTime: "19:00",
      endTime: "20:30",
      title: "Pinewood prep",
      format: "hybrid",
      status: "held",
      notes: "",
      place: "St. Mark's Hall",
      joinUrl: "https://example.org/zoom",
    });
    const meetingId = made.id!;
    expect(await rem.draftUsual(actor, meetingId, "https://rt.example.org")).toMatchObject({ ok: true, message: expect.stringContaining("Drafted both") });
    expect(await rem.draftUsual(actor, meetingId, "https://rt.example.org")).toMatchObject({ message: expect.stringContaining("already drafted") });
    const [week, day] = await rem.remindersFor(meetingId);
    expect([week.kind, week.sendOn, week.status]).toEqual(["week_before", "2027-02-18", "draft"]);
    expect([day.kind, day.sendOn, day.audience]).toEqual(["day_of", "2027-02-25", `rsvp-yes:${meetingId}`]);
    expect(day.body).toContain("https://rt.example.org/m/");

    // Drafts never send.
    const nineThirty = new Date("2027-02-18T14:30:00Z"); // 9:30 am in New York
    expect(await rem.sendDueReminders(nineThirty, mailer)).toMatchObject({ sent: 0 });

    // Approving, then editing, makes it a draft again; approve the edited one.
    expect(await rem.approveReminder(actor, week.id)).toMatchObject({ ok: true });
    expect(await rem.saveReminder(actor, week.id, { audience: "everyone", subject: "Roundtable next week", body: week.body, previewText: "See you there" })).toMatchObject({
      ok: true,
      message: expect.stringContaining("approving again"),
    });
    expect((await rem.getReminder(week.id))!.status).toBe("draft");
    expect(await rem.saveReminder(actor, week.id, { audience: "nobody", subject: "x", body: "y" })).toMatchObject({ ok: false });
    expect(await rem.approveReminder(actor, week.id)).toMatchObject({ ok: true });

    // Not the day before, not before 9, then once at 9:30, and not again.
    expect(await rem.sendDueReminders(new Date("2027-02-17T15:00:00Z"), mailer)).toMatchObject({ sent: 0, skipped: 1 });
    expect(await rem.sendDueReminders(new Date("2027-02-18T13:30:00Z"), mailer)).toMatchObject({ sent: 0, skipped: 1 });
    expect(await rem.sendDueReminders(nineThirty, mailer)).toMatchObject({ sent: 1, failed: 0 });
    expect(broadcasts.at(-1)).toMatchObject({ subject: "Roundtable next week", replyTo: "admin@example.com" });
    expect(await rem.sendDueReminders(new Date("2027-02-18T15:30:00Z"), mailer)).toMatchObject({ sent: 0 });
    expect((await rem.getReminder(week.id))!.status).toBe("sent");
    expect((await send.listAnnouncements())[0]).toMatchObject({ subject: "Roundtable next week", status: "sent" });
    expect(await rem.saveReminder(actor, week.id, { audience: "everyone", subject: "Changed", body: "x" })).toMatchObject({ ok: false });

    // The day-of reminder goes to whoever said yes; with nobody, it says so instead of sending.
    await rem.approveReminder(actor, day.id);
    expect(await rem.sendDueReminders(new Date("2027-02-25T14:10:00Z"), mailer)).toMatchObject({ sent: 0, failed: 1 });
    expect((await rem.getReminder(day.id))!).toMatchObject({ status: "failed", error: expect.stringContaining("Nobody in") });

    // An approval only counts while the approver is still an admin.
    await db.insert(schema.user).values({ id: "test-viewer", name: "Vic", email: "viewer@example.com", role: "viewer" });
    await db.update(schema.reminder).set({ status: "approved", approvedBy: "test-viewer", error: null }).where(eq(schema.reminder.id, day.id));
    expect(await rem.sendDueReminders(new Date("2027-02-25T14:20:00Z"), mailer)).toMatchObject({ failed: 1 });
    expect((await rem.getReminder(day.id))!.error).toContain("isn't an admin anymore");

    // The daily job also clears old rate-limit counters.
    await db.insert(schema.publicRateLimit).values({ key: "old:key", windowStart: new Date("2027-01-01T00:00:00Z"), count: 3 });
    await rem.sendDueReminders(new Date("2027-02-25T14:30:00Z"), mailer);
    expect((await db.select().from(schema.publicRateLimit).where(eq(schema.publicRateLimit.key, "old:key"))).length).toBe(0);

    expect(await rem.deleteReminder(actor, day.id)).toMatchObject({ ok: true });
    expect(await rem.deleteReminder(actor, week.id)).toMatchObject({ ok: false });
  });
});
