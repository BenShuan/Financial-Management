import { db } from "../db/index.js";
import { auditEvents } from "../db/schema.js";
import type { AuthContext } from "../types.js";

interface AuditInput {
  actionType: string; // e.g. "transaction.created"
  entityType: string; // e.g. "transaction"
  entityId?: string;
  before?: unknown;
  after?: unknown;
}

/** Append-only audit trail for sensitive operations (docs/agent/06). Keep snapshots small. */
export async function emitAuditEvent(auth: AuthContext, input: AuditInput): Promise<void> {
  await db.insert(auditEvents).values({
    householdId: auth.householdId,
    actorUserId: auth.userId,
    actionType: input.actionType,
    entityType: input.entityType,
    entityId: input.entityId,
    beforeSnapshot: input.before ?? null,
    afterSnapshot: input.after ?? null,
  });
}
