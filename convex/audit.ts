import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { requireAuthIfEnabled } from "./_lib/auth";
import { writeAudit } from "./_lib/audit";

export type AuditItem = {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  reason: string;
  details: string;
  createdAt: number;
};

export type AuditListResult = { items: AuditItem[]; totalCount: number };

export const list = query({
  args: {
    entityType: v.optional(v.string()),
    entityId: v.optional(v.string()),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  handler: async (
    ctx: QueryCtx,
    args: { entityType?: string; entityId?: string; limit?: number; offset?: number },
  ): Promise<AuditListResult> => {
    await requireAuthIfEnabled(ctx);
    const all = await ctx.db.query("auditEvents").order("desc").collect();
    const filtered = all.filter(
      (e) =>
        (!args.entityType || e.entityType === args.entityType) &&
        (!args.entityId || e.entityId === args.entityId),
    );
    const offset = Math.max(0, args.offset ?? 0);
    const limit = Math.max(1, Math.min(args.limit ?? 200, 2000));
    return {
      items: filtered.slice(offset, offset + limit).map((e) => ({
        id: `${e._id}`,
        entityType: e.entityType,
        entityId: e.entityId,
        action: e.action,
        reason: e.reason ?? "",
        details: e.details ?? "",
        createdAt: e.createdAt,
      })),
      totalCount: filtered.length,
    };
  },
});

export const record = mutation({
  args: {
    entityType: v.string(),
    entityId: v.string(),
    action: v.string(),
    reason: v.optional(v.string()),
    details: v.optional(v.string()),
  },
  handler: async (
    ctx: MutationCtx,
    args: { entityType: string; entityId: string; action: string; reason?: string; details?: string },
  ): Promise<{ ok: boolean; id: string }> => {
    await requireAuthIfEnabled(ctx);
    const id = await ctx.db.insert("auditEvents", { ...args, createdAt: Date.now() });
    return { ok: true, id: `${id}` };
  },
});

export async function logEvent(
  ctx: MutationCtx,
  event: { entityType: string; entityId: string; action: string; reason?: string; details?: unknown },
): Promise<void> {
  await writeAudit(ctx, event);
}
