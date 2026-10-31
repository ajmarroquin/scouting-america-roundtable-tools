import "server-only";
import { and, asc, count, eq, ne } from "drizzle-orm";
import { writeAudit } from "@/lib/audit";
import { isValidEmail, normalizeEmail } from "@/lib/auth/emails";
import { isRole, ROLE_LABELS, type Role } from "@/lib/auth/roles";
import type { CurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email/send";
import { appUrl, welcomeEmail } from "@/lib/email/welcome";
import { user } from "@/lib/db/schema";

export type UserRow = { id: string; name: string; email: string; role: Role; createdAt: Date };

export type Result = { ok: boolean; message: string };

export async function listUsers(): Promise<UserRow[]> {
  const rows = await db
    .select({ id: user.id, name: user.name, email: user.email, role: user.role, createdAt: user.createdAt })
    .from(user)
    .orderBy(asc(user.email));
  return rows.map((r) => ({ ...r, role: isRole(r.role) ? r.role : "viewer" }));
}

async function otherAdminCount(excludeId: string): Promise<number> {
  const [{ n }] = await db
    .select({ n: count() })
    .from(user)
    .where(and(eq(user.role, "admin"), ne(user.id, excludeId)));
  return n;
}

async function findUser(id: string) {
  const [row] = await db.select().from(user).where(eq(user.id, id));
  return row;
}

export async function addUser(
  actor: CurrentUser,
  input: { email: string; name: string; role: string; sendWelcome: boolean },
): Promise<Result> {
  const email = normalizeEmail(input.email);
  if (!isValidEmail(email)) return { ok: false, message: "Enter a valid email address." };
  if (!isRole(input.role)) return { ok: false, message: "Pick a role." };
  const name = input.name.trim().slice(0, 80) || email.split("@")[0];

  const [created] = await db
    .insert(user)
    .values({ id: crypto.randomUUID(), email, name, role: input.role })
    .onConflictDoNothing({ target: user.email })
    .returning({ id: user.id });
  if (!created) return { ok: false, message: `${email} already has access.` };

  await writeAudit(actor, "user.add", { type: "user", id: created.id }, { email, role: input.role, welcome: input.sendWelcome });
  const added = `Added ${email} as ${ROLE_LABELS[input.role]}.`;
  const url = appUrl(process.env);
  if (!input.sendWelcome) return { ok: true, message: `${added} Let them know to sign in at ${url}.` };
  try {
    await sendEmail({ to: email, ...welcomeEmail({ inviterName: actor.name || actor.email, role: input.role, appUrl: url, email }) });
    return { ok: true, message: `${added} A welcome email is on its way.` };
  } catch {
    return { ok: true, message: `${added} The welcome email didn't send, so let them know to sign in at ${url}.` };
  }
}

export async function renameUser(actor: CurrentUser, userId: string, rawName: string): Promise<Result> {
  const name = rawName.trim();
  if (!name) return { ok: false, message: "Enter a name." };
  if (name.length > 80) return { ok: false, message: "That name is too long." };
  const target = await findUser(userId);
  if (!target) return { ok: false, message: "That user no longer exists." };
  if (target.name === name) return { ok: true, message: "No change." };
  await db.update(user).set({ name }).where(eq(user.id, target.id));
  await writeAudit(actor, "user.rename", { type: "user", id: target.id }, { from: target.name, to: name });
  return { ok: true, message: `Renamed to ${name}.` };
}

export async function changeRole(actor: CurrentUser, userId: string, role: string): Promise<Result> {
  if (!isRole(role)) return { ok: false, message: "Pick a role." };
  const target = await findUser(userId);
  if (!target) return { ok: false, message: "That user no longer exists." };
  if (target.role === role) return { ok: true, message: "No change." };
  if (target.role === "admin" && (await otherAdminCount(target.id)) === 0) {
    return { ok: false, message: "This is the only admin. Make someone else an admin first." };
  }

  await db.update(user).set({ role }).where(eq(user.id, target.id));
  await writeAudit(actor, "user.role_change", { type: "user", id: target.id }, {
    email: target.email,
    from: target.role,
    to: role,
  });
  return { ok: true, message: `${target.email} is now ${ROLE_LABELS[role]}.` };
}

export async function removeUser(actor: CurrentUser, userId: string): Promise<Result> {
  if (userId === actor.id) return { ok: false, message: "You can't remove yourself." };
  const target = await findUser(userId);
  if (!target) return { ok: false, message: "That user no longer exists." };
  if (target.role === "admin" && (await otherAdminCount(target.id)) === 0) {
    return { ok: false, message: "This is the only admin. Make someone else an admin first." };
  }

  // Sessions cascade, so removal signs them out everywhere.
  await db.delete(user).where(eq(user.id, target.id));
  await writeAudit(actor, "user.remove", { type: "user", id: target.id }, {
    email: target.email,
    role: target.role,
  });
  return { ok: true, message: `Removed ${target.email}.` };
}
