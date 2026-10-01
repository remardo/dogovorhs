import type { MutationCtx } from "../_generated/server";

/** Append-only audit helper usable from any mutation. */
export async function writeAudit(
  ctx: MutationCtx,
  event: {
    entityType: string;
    entityId: string;
    action: string;
    reason?: string;
    details?: unknown;
  },
): Promise<void> {
  await ctx.db.insert("auditEvents", {
    entityType: event.entityType,
    entityId: event.entityId,
    action: event.action,
    reason: event.reason,
    details: event.details === undefined ? undefined : JSON.stringify(event.details).slice(0, 4000),
    createdAt: Date.now(),
  });
}
