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
});
