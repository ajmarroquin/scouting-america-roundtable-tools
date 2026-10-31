import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { writeAudit } from "@/lib/audit";
import type { CurrentUser } from "@/lib/auth/session";
import { unitRefSchema } from "@/lib/contacts/affiliation-input";
import { unitLabel } from "@/lib/contacts/format";
import { db } from "@/lib/db";
import { setting, unit } from "@/lib/db/schema";

export type Result = { ok: boolean; message: string; id?: string };

/** Adds a unit by hand. One that's already in the app (same type, number, and designation) is returned instead. */
export async function addUnit(
  actor: CurrentUser,
  raw: { type: string; number: number | string; genderAccepted: "B" | "G" | "F" | null },
): Promise<Result> {
  const parsed = unitRefSchema.safeParse({ kind: "new", ...raw });
  if (!parsed.success || parsed.data.kind !== "new") {
    return { ok: false, message: parsed.error?.issues[0]?.message ?? "Check the unit and try again." };
  }
  const u = parsed.data;
  const label = unitLabel(u);
  const [existing] = await db
    .select({ id: unit.id })
    .from(unit)
    .where(
      and(
        eq(unit.type, u.type),
        eq(unit.number, u.number),
        u.genderAccepted ? eq(unit.genderAccepted, u.genderAccepted) : isNull(unit.genderAccepted),
      ),
    );
  if (existing) return { ok: false, message: `${label} is already in the app.`, id: existing.id };
  const [district] = await db.select({ value: setting.value }).from(setting).where(eq(setting.key, "import.district"));
  const [row] = await db
    .insert(unit)
    .values({
      type: u.type,
      number: u.number,
      genderAccepted: u.genderAccepted,
      district: typeof district?.value === "string" ? district.value : null,
    })
    .returning({ id: unit.id });
  await writeAudit(actor, "unit.add", { type: "unit", id: row.id }, { label });
  return { ok: true, message: `Added ${label}.`, id: row.id };
}
