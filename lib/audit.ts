import "server-only";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";

type Actor = { id: string; email: string } | null;

export async function writeAudit(
  actor: Actor,
  action: string,
  target: { type: string; id?: string | null },
  detail?: Record<string, unknown>,
): Promise<void> {
  await db.insert(auditLog).values({
    actorId: actor?.id ?? null,
    actorEmail: actor?.email ?? null,
    action,
    targetType: target.type,
    targetId: target.id ?? null,
    detail,
  });
}
