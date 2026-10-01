"use node";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { verifiedDocument } from "./_lib/verifiedSource";
import { sha256HexBytes } from "./_lib/contentHash";
import { requireAuthIfEnabled } from "./_lib/auth";
export const apply=action({args:{document:verifiedDocument,dryRun:v.boolean()},handler:async(ctx,args):Promise<{allocations:number;updates:number;total:number;unallocated:number}>=>{
  await requireAuthIfEnabled(ctx);
  const source=await ctx.runQuery(internal.sourceBackfill.source,{id:args.document.invoiceId});
  if(!source)throw new Error("Оригинал не найден");
  const blob=await ctx.storage.get(source.fileId);
  if(!blob||sha256HexBytes(new Uint8Array(await blob.arrayBuffer()))!==args.document.sha256)throw new Error("Оригинал не совпадает с проверенной копией");
  return await ctx.runMutation(internal.sourceBackfill.apply,args);
}});
