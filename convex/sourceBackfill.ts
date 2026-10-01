import { internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { v, type Infer } from "convex/values";
import { verifiedDocument } from "./_lib/verifiedSource";
import { roundMoney, toPeriodKey, validatePeriodRange, isMultiMonthRange } from "./_lib/accounting";
import { monthLabelFromPeriod } from "./_lib/invoiceParser";
import { writeAudit } from "./_lib/audit";

export const source = internalQuery({args:{id:v.id("invoices")},handler:async(ctx,{id})=>await ctx.db.get(id)});

// ponytail: one reviewed document per transaction; avoids partial document imports.
export async function applyVerifiedCore(ctx: MutationCtx, d: Infer<typeof verifiedDocument>, dryRun: boolean) {
  const invoice = await ctx.db.get(d.invoiceId);
  if (!invoice || invoice.voided || invoice.total !== d.expectedTotal) throw new Error("Исходный счёт изменён после сверки");
  if (!/^[a-f0-9]{64}$/.test(d.sha256)) throw new Error("Некорректный SHA256 оригинала");
  validatePeriodRange(d.periodStart,d.periodEnd);
  const parent = d.parentInvoiceId ? await ctx.db.get(d.parentInvoiceId) : invoice;
  if (!parent || parent.kind !== "invoice" || parent.companyId !== invoice.companyId || parent.contractId !== invoice.contractId) throw new Error("Детализация не соответствует счёту");
  const charge = parent.expenseId ? await ctx.db.get(parent.expenseId) : null;
  const contract = invoice.contractId ? await ctx.db.get(invoice.contractId) : null;
  if (!charge || !contract || charge.companyId !== contract.companyId || charge.kind === "allocation" || charge.voided) throw new Error("Нет подтверждённого начисления и договора");
  if(d.expectedContractFee !== undefined && contract.monthlyFee !== d.expectedContractFee) throw new Error("Абонплата договора изменена после сверки");
  if(d.expectedContractStartDate !== undefined && contract.startDate !== d.expectedContractStartDate && contract.startDate !== d.contractStartDate) throw new Error("Дата договора изменена после сверки");
  if(d.parentInvoiceId && (parent.periodStart!==d.periodStart || parent.periodEnd!==d.periodEnd)) throw new Error("Период детализации не совпадает с начислением");
  if (charge.total !== parent.total && charge.total !== d.serviceTotal) throw new Error("Начисление изменено после сверки");
  const explicitTax=d.serviceAmount!==undefined && d.serviceVat!==undefined;
  if ((d.serviceAmount!==undefined || d.serviceVat!==undefined) && (!explicitTax || !Number.isFinite(d.serviceAmount) || !Number.isFinite(d.serviceVat) || d.serviceAmount!<0 || d.serviceVat!<0 || roundMoney(d.serviceAmount!+d.serviceVat!)!==d.serviceTotal)) throw new Error("Не сходятся подтверждённые суммы услуг и НДС");
  if (d.serviceTotal !== parent.total && d.vatRate === undefined && !explicitTax) throw new Error("Не указаны подтверждённые суммы или ставка НДС");
  for(const r of d.rows){
    if(r.periodStart || r.periodEnd){
      validatePeriodRange(r.periodStart??d.periodStart,r.periodEnd??d.periodEnd);
      if((r.periodStart??d.periodStart)<d.periodStart || (r.periodEnd??d.periodEnd)>d.periodEnd) throw new Error("Период строки вне периода документа");
    }
  }
  // Original net values stay intact; document VAT is allocated proportionally.
  const netSum=roundMoney(d.rows.filter(r=>r.basis==="net").reduce((s,r)=>s+r.value,0));
  let remainingVat=parent.vat;
  const netRows=d.rows.filter(r=>r.basis==="net");
  const rows=d.rows.map(r=>{
    let vat=r.basis==="net" && parent.amount>0 ? roundMoney(r.value*parent.vat/parent.amount) : 0;
    if(r.basis==="net" && parent.amount>0 && netSum===parent.amount){
      if(r===netRows.at(-1))vat=roundMoney(remainingVat);
      remainingVat=roundMoney(remainingVat-vat);
    }
    return {...r,net:r.value,vat,value:roundMoney(r.value+vat)};
  });
  const total = roundMoney(rows.reduce((s,r)=>s+r.value,0));
  if (!Number.isFinite(total) || total > d.serviceTotal + .001 || d.rows.some(r=>r.value<0 || !Number.isFinite(r.value) || !Number.isInteger(r.sourcePage) || r.sourcePage<1 || !r.evidence.trim() || !r.description.trim())) throw new Error("Детализация не прошла сверку суммы / источника");
  const expenses = await ctx.db.query("expenses").withIndex("by_parent",q=>q.eq("parentExpenseId",charge._id)).collect();
  const keys = rows.map((r,i)=>`${d.sha256}:${r.sourcePage}:${r.number}:${r.serviceIdentifier}:${i}`);
  const existingKeys = new Set(expenses.map(e=>e.sourceRowKey));
  const pending = rows.map((r,i)=>({...r,key:keys[i]})).filter(r=>!existingKeys.has(r.key));
  const existingTotal = expenses.filter(e=>!e.voided && e.status!=="cancelled").reduce((s,e)=>s+(e.total??e.amount+(e.vat??0)),0);
  if (roundMoney(existingTotal+pending.reduce((s,r)=>s+r.value,0)) > d.serviceTotal) throw new Error("Начисление уже распределено другим источником");
  const periodKey=toPeriodKey(d.periodEnd), month=monthLabelFromPeriod(d.periodEnd);
  const category=d.serviceCategory??contract.serviceCategory??contract.type;
  const invoicePatch: Partial<Doc<"invoices">>={contentSha256:d.sha256,fileHash:d.sha256,periodStart:d.periodStart,periodEnd:d.periodEnd,periodKey,month,multiMonth:isMultiMonthRange(d.periodStart,d.periodEnd),vatRate:d.vatRate};
  if (!d.parentInvoiceId) Object.assign(invoicePatch,{serviceTotal:d.serviceTotal,amountDue:d.amountDue??invoice.total,openingBalance:d.openingBalance,payments:d.payments});
  else invoicePatch.expenseId=charge._id;
  const amount=explicitTax?d.serviceAmount!:d.serviceTotal===parent.total?charge.amount:roundMoney(d.serviceTotal/(1+(d.vatRate??0)/100));
  const chargePatch: Partial<Doc<"expenses">>={kind:"charge",contractId:contract._id,invoiceId:parent._id,periodStart:d.periodStart,periodEnd:d.periodEnd,periodKey,month,multiMonth:isMultiMonthRange(d.periodStart,d.periodEnd),serviceCategory:category,type:category,amount,vat:roundMoney(d.serviceTotal-amount),total:d.serviceTotal};
  if (d.serviceTotal!==parent.total) Object.assign(chargePatch,{basis:"Стоимость услуг за период, отдельно от остатка и суммы к оплате",vatBasis:explicitTax?"explicit":"computedFromInvoiceRate"});
  const contractPatch:Partial<Doc<"contracts">>={feeBasis:"invoiceEstimate",dateBasis:d.contractStartDate || contract.dateBasis==="originalDocument" ? "originalDocument":"unknown",endDateBasis:"unknown",sourceInvoiceId:parent._id,serviceCategory:category,type:category};
  if(d.contractStartDate)contractPatch.startDate=d.contractStartDate;
  const changed=(prev:object,patch:object)=>Object.entries(patch).some(([key,value])=>Reflect.get(prev,key)!==value);
  const updates=[changed(invoice,invoicePatch),changed(charge,chargePatch),changed(contract,contractPatch)].filter(Boolean).length;
  if(dryRun)return {allocations:pending.length,updates,total,unallocated:roundMoney(d.serviceTotal-existingTotal-pending.reduce((s,r)=>s+r.value,0))};
  if(changed(invoice,invoicePatch))await ctx.db.patch(invoice._id,invoicePatch);
  if(changed(charge,chargePatch))await ctx.db.patch(charge._id,chargePatch);
  if(changed(contract,contractPatch))await ctx.db.patch(contract._id,contractPatch);
  const sims=await ctx.db.query("simCards").withIndex("by_contract",q=>q.eq("contractId",contract._id)).collect();
  for(const r of pending){
    let sim=sims.find(s=>s.number===r.number);
    if(r.number&&!sim){
      const resourceKind=r.resourceKind??(category==="Интернет"?"connection":/^7?9\d{9}$/.test(r.number)?"mobile":"service");
      const id=await ctx.db.insert("simCards",{number:r.number,normalizedNumber:r.number,companyId:contract.companyId,operatorId:contract.operatorId,contractId:contract._id,status:"active",type:category,resourceKind,connectionAddress:r.address,iccid:r.iccid,createdAt:Date.now()});
      sim=(await ctx.db.get(id))??undefined;if(sim)sims.push(sim);
    }
    const vatBasis=r.basis==="net"?"allocatedFromDocumentVat":"grossOnlyTaxNotSplit";
    const rowStart=r.periodStart??d.periodStart,rowEnd=r.periodEnd??d.periodEnd;
    await ctx.db.insert("expenses",{companyId:contract.companyId,contractId:contract._id,contract:contract.number,operator:invoice.operator,type:category,serviceCategory:category,kind:"allocation",parentExpenseId:charge._id,invoiceId:invoice._id,simCardId:sim?._id,simNumber:r.number||undefined,amount:r.net,vat:r.vat,total:r.value,vatBasis,month:monthLabelFromPeriod(rowEnd),periodKey:toPeriodKey(rowEnd),periodStart:rowStart,periodEnd:rowEnd,multiMonth:isMultiMonthRange(rowStart,rowEnd),status:"confirmed",hasDocument:true,description:r.description,sourcePage:r.sourcePage,sourceRowKey:r.key,serviceIdentifier:r.serviceIdentifier||undefined,basis:r.evidence,createdAt:Date.now()});
  }
  if(pending.length||updates)await writeAudit(ctx,{entityType:"invoice",entityId:`${invoice._id}`,action:"verified_original_backfill",reason:"Сверка оригинала PDF",details:{sha256:d.sha256,rows:pending.length,updates}});
  return {allocations:pending.length,updates,total,unallocated:roundMoney(d.serviceTotal-existingTotal-pending.reduce((s,r)=>s+r.value,0))};
}
export const apply=internalMutation({args:{document:verifiedDocument,dryRun:v.boolean()},handler:async(ctx,args)=>applyVerifiedCore(ctx,args.document,args.dryRun)});
