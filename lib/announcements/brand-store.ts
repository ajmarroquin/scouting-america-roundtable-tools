import "server-only";
import { eq } from "drizzle-orm";
import { writeAudit } from "@/lib/audit";
import type { CurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { setting } from "@/lib/db/schema";
import { type Brand, brandSchema, readBrand } from "./brand";

const BRAND_SETTING = "announcements.brand";

export async function getBrand(): Promise<Brand> {
  const [row] = await db.select({ value: setting.value }).from(setting).where(eq(setting.key, BRAND_SETTING));
  return readBrand(row?.value);
}

export async function saveBrand(actor: CurrentUser, raw: unknown): Promise<{ ok: boolean; message: string }> {
  const parsed = brandSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the settings." };
  await db
    .insert(setting)
    .values({ key: BRAND_SETTING, value: parsed.data })
    .onConflictDoUpdate({ target: setting.key, set: { value: parsed.data } });
  await writeAudit(actor, "announcements.brand", { type: "setting", id: BRAND_SETTING }, { fromName: parsed.data.fromName });
  return { ok: true, message: "Saved. Announcements use these from now on." };
}
