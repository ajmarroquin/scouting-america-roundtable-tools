import "server-only";
import { db, type Tx } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";

type Actor = { id: string; email: string } | null;

export async function writeAudit(
  actor: Actor,
  action: string,
  target: { type: string; id?: string | null },
  detail?: Record<string, unknown>,
  executor: typeof db | Tx = db,
): Promise<void> {
  await executor.insert(auditLog).values({
    actorId: actor?.id ?? null,
    actorEmail: actor?.email ?? null,
    action,
    targetType: target.type,
    targetId: target.id ?? null,
    detail,
  });
}
