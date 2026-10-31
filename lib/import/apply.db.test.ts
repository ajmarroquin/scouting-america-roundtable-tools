import { readFileSync } from "node:fs";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { beforeAll, describe, expect, it } from "vitest";
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
});
