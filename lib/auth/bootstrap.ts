import "server-only";
import { count, eq } from "drizzle-orm";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { normalizeEmail, parseEmailList } from "./emails";

/**
 * Sign-up is disabled, so the very first admin has to come from somewhere.
 * If an email listed in BOOTSTRAP_ADMIN_EMAILS asks for a code while no admin
 * exists yet, create it as an admin. Once any admin exists this does nothing.
 */
export async function ensureBootstrapAdmin(rawEmail: unknown): Promise<void> {
  if (typeof rawEmail !== "string") return;
  const email = normalizeEmail(rawEmail);
  if (!parseEmailList(process.env.BOOTSTRAP_ADMIN_EMAILS).includes(email)) return;

  const [{ admins }] = await db
    .select({ admins: count() })
    .from(user)
    .where(eq(user.role, "admin"));
  if (admins > 0) return;

  const [created] = await db
    .insert(user)
    .values({ id: crypto.randomUUID(), email, name: email.split("@")[0], role: "admin" })
    .onConflictDoUpdate({ target: user.email, set: { role: "admin" } })
    .returning({ id: user.id });

  await writeAudit(null, "user.bootstrap_admin", { type: "user", id: created.id }, { email });
}
