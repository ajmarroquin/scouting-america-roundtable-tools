import "server-only";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { appTimeZone } from "@/lib/attendance/queries";
import { todayIn } from "@/lib/attendance/year";
import { writeAudit } from "@/lib/audit";
import type { CurrentUser } from "@/lib/auth/session";
import { db, type Tx } from "@/lib/db";
import { setting, unit } from "@/lib/db/schema";
import { type ListedUnit, planUnitList, type UnitListPlan } from "./unit-list";

export const UNIT_LIST_SETTING = "units.list";

/** Saved with each loaded list, so coverage knows which units count and as of when. */
export type UnitListInfo = { asOf: string; district: string; fileName: string | null; units: number; loadedAt: string };

const listedUnitSchema = z.object({
  type: z.enum(["Pack", "Troop", "Crew", "Ship", "Post", "Club"]),
  number: z.number().int().min(0).max(99999),
  genderAccepted: z.enum(["B", "G", "F"]).nullable(),
  district: z.string().trim().max(120),
  subdistrict: z.string().trim().max(80).nullable(),
  youth: z.number().int().min(0).max(100000),
  adults: z.number().int().min(0).max(100000),
});

export const unitListPayloadSchema = z.object({
  fileName: z.string().trim().max(200).nullable(),
  asOf: z.iso.date().nullable(),
  district: z.string().trim().min(1, "Pick a district.").max(120),
  units: z.array(listedUnitSchema).min(1, "No units to load.").max(2000),
});

export type UnitListPayload = z.input<typeof unitListPayloadSchema>;

export type UnitListCounts = { matched: number; changed: number; created: number; skipped: number; counted: number };

async function plan(tx: Tx | typeof db, district: string, units: ListedUnit[]): Promise<UnitListPlan> {
  const existing = await tx
    .select({ id: unit.id, type: unit.type, number: unit.number, genderAccepted: unit.genderAccepted })
    .from(unit)
    .where(or(eq(unit.district, district), isNull(unit.district)));
  return planUnitList(existing, units);
}

function countsOf(p: UnitListPlan): UnitListCounts {
  const all = [...p.matched.map((m) => m.unit), ...p.changed.map((c) => c.unit), ...p.created];
  return {
    matched: p.matched.length,
    changed: p.changed.length,
    created: p.created.length,
    skipped: p.skipped.length,
    counted: all.filter((u) => u.youth + u.adults > 0).length,
  };
}

/** What loading the list would do, for the confirm step. */
export async function previewUnitList(raw: UnitListPayload) {
  const parsed = unitListPayloadSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, message: parsed.error.issues[0]?.message ?? "Check the file." };
  const p = await plan(db, parsed.data.district, filterDistrict(parsed.data));
  return {
    ok: true as const,
    counts: countsOf(p),
    changed: p.changed.map((c) => ({ from: c.from, unit: c.unit })),
    created: p.created,
    skipped: p.skipped,
  };
}

function filterDistrict(input: z.output<typeof unitListPayloadSchema>): ListedUnit[] {
  return input.units.filter((u) => !u.district || u.district === input.district);
}

export async function loadUnitList(
  actor: CurrentUser,
  raw: UnitListPayload,
): Promise<{ ok: true; message: string; counts: UnitListCounts } | { ok: false; message: string }> {
  const parsed = unitListPayloadSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the file." };
  const input = parsed.data;
  const units = filterDistrict(input);
  if (!units.length) return { ok: false, message: `The list has no units in ${input.district}.` };
  const asOf = input.asOf ?? todayIn(appTimeZone());

  const counts = await db.transaction(async (tx) => {
    // One import at a time, shared with roster and attendance imports.
    await tx.execute(sql`select pg_advisory_xact_lock(662030)`);
    const p = await plan(tx, input.district, units);
    const fields = (u: ListedUnit) => ({
      listedOn: asOf,
      youthCount: u.youth,
      adultCount: u.adults,
      subdistrict: u.subdistrict,
    });
    for (const m of p.matched) {
      await tx
        .update(unit)
        .set({ ...fields(m.unit), district: sql`coalesce(${unit.district}, ${input.district})` })
        .where(eq(unit.id, m.id));
    }
    for (const c of p.changed) {
      await tx
        .update(unit)
        .set({ ...fields(c.unit), genderAccepted: c.unit.genderAccepted, district: sql`coalesce(${unit.district}, ${input.district})` })
        .where(eq(unit.id, c.id));
    }
    if (p.created.length) {
      await tx
        .insert(unit)
        .values(
          p.created.map((u) => ({
            type: u.type,
            number: u.number,
            genderAccepted: u.genderAccepted,
            district: input.district,
            ...fields(u),
          })),
        )
        .onConflictDoNothing();
    }
    const result = countsOf(p);
    const info: UnitListInfo = {
      asOf,
      district: input.district,
      fileName: input.fileName,
      units: result.counted,
      loadedAt: new Date().toISOString(),
    };
    await tx
      .insert(setting)
      .values({ key: UNIT_LIST_SETTING, value: info })
      .onConflictDoUpdate({ target: setting.key, set: { value: info } });
    await writeAudit(actor, "units.list", { type: "unit" }, { asOf, district: input.district, fileName: input.fileName, ...result }, tx);
    return result;
  });

  const parts = [
    `${counts.counted} units count toward coverage`,
    counts.created ? `${counts.created} added` : null,
    counts.changed ? `${counts.changed} changed designation` : null,
    counts.skipped ? `${counts.skipped} with no members left out` : null,
  ].filter(Boolean);
  return { ok: true, message: `Loaded the unit list: ${parts.join(", ")}.`, counts };
}

export async function unitListInfo(): Promise<UnitListInfo | null> {
  const [row] = await db.select({ value: setting.value }).from(setting).where(eq(setting.key, UNIT_LIST_SETTING));
  return (row?.value as UnitListInfo | undefined) ?? null;
}

/**
 * The units coverage is measured against: those on the latest unit list with at
 * least one member. Before any list is loaded, the active units from the roster.
 */
export async function countedUnitIds(): Promise<{ ids: string[]; source: "list" | "roster"; asOf: string | null }> {
  const info = await unitListInfo();
  if (info) {
    const rows = await db
      .select({ id: unit.id })
      .from(unit)
      .where(
        and(
          eq(unit.listedOn, info.asOf),
          eq(unit.district, info.district),
          sql`coalesce(${unit.youthCount}, 0) + coalesce(${unit.adultCount}, 0) > 0`,
        ),
      );
    return { ids: rows.map((r) => r.id), source: "list", asOf: info.asOf };
  }
  const [district] = await db.select({ value: setting.value }).from(setting).where(eq(setting.key, "import.district"));
  const rows = await db
    .select({ id: unit.id })
    .from(unit)
    .where(
      and(
        eq(unit.active, true),
        typeof district?.value === "string" ? eq(unit.district, district.value) : undefined,
      ),
    );
  return { ids: rows.map((r) => r.id), source: "roster", asOf: null };
}

/** The district picked at the last roster import, to preselect. */
export async function savedDistrict(): Promise<string | null> {
  const [row] = await db.select({ value: setting.value }).from(setting).where(eq(setting.key, "import.district"));
  return typeof row?.value === "string" ? row.value : null;
}
