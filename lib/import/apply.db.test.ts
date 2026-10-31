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
});
