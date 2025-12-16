import type { QueryCtx, MutationCtx } from "../_generated/server";
import { REQUIRE_AUTH } from "./flags";

type HasAuth = { auth: QueryCtx["auth"] | MutationCtx["auth"] };

export async function requireUserIdentity(ctx: HasAuth) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Требуется авторизация");
  }
  return identity;
}

export async function requireAuthIfEnabled(ctx: HasAuth) {
  if (!REQUIRE_AUTH) return null;
  return await requireUserIdentity(ctx);
}
