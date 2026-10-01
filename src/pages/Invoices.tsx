import React from "react";
import { Link, useSearchParams } from "react-router-dom";
import MainLayout from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Upload, Trash2, ExternalLink, Link2, FileText } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  api,
  convexClient,
  useInvoices,
  useOperators,
  useExpenses,
  type Id,
  type InvoicePreview,
} from "@/lib/backend";
import { extractPdfText } from "@/lib/pdfText";
import { toast } from "@/hooks/use-toast";

type PendingPreview = {
  key: string;
  fileName: string;
  fileId: string;
  preview: InvoicePreview;
  operator: string;
  contractId: string;
  companyId: string;
  serviceType: string;
  busy: boolean;
  kind: "invoice" | "detail";
};

const SERVICE_TYPES = ["Мобильная связь", "Интернет", "Телефония", "Прочее"];

const Invoices = () => {
  const [params, setParams] = useSearchParams();
  const { items: expenses } = useExpenses({ includeVoided: true });
  const { items: invoices, contracts, summary, updateInvoice, deleteInvoice, refresh } = useInvoices();
  const { items: operators } = useOperators();
  const selected = invoices.find(i => i.id === params.get("id"));
  const [search, setSearch] = React.useState(params.get("q") ?? "");
  const [open, setOpen] = React.useState(false);
  const [files, setFiles] = React.useState<File[]>([]);
  const [defaultOperator, setDefaultOperator] = React.useState("__auto");
  const [uploading, setUploading] = React.useState(false);
  const [pending, setPending] = React.useState<PendingPreview[]>([]);
  const [linkingId, setLinkingId] = React.useState<string | null>(null);
  const [linkContract, setLinkContract] = React.useState("__none");

  const uploadAndPreview = async () => {
    if (!convexClient) {
      toast({ title: "Бэкенд недоступен", description: "Подключите Convex и повторите попытку." });
      return;
    }
    if (!files.length) {
      toast({ title: "Выберите файлы", description: "Нужны PDF счетов." });
      return;
    }
    setUploading(true);
    try {

      for (const file of files) {
        const { uploadUrl } = await convexClient.mutation(api.billingImports.requestUpload, {});
        const uploadResponse = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type || "application/pdf" },
          body: file,
        });
        if (!uploadResponse.ok) throw new Error(`Не удалось загрузить ${file.name}`);
        const { storageId } = (await uploadResponse.json()) as { storageId: Id<"_storage"> };
        const text = await extractPdfText(file);
        const preview = (await convexClient.action(api.invoiceActions.previewText, {
          fileId: storageId,
          fileName: file.name,
          text,
        })) as InvoicePreview;
        setPending(prev => [...prev, {
          key: `${file.name}-${storageId}`,
          fileName: file.name,
          fileId: String(storageId),
          preview,
          operator:
            defaultOperator !== "__auto"
              ? operators.find((o) => o.id === defaultOperator)?.name ?? ""
              : preview.suggested.operator,
          contractId: preview.suggested.contractId ?? "__none",
          companyId: preview.suggested.companyId ?? "__none",
          serviceType: preview.suggested.serviceType ?? "Прочее",
          kind: /детализац|расшифровк/i.test(file.name) ? "detail" : "invoice",
          busy: false,
        }]);
      }
      setFiles([]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ошибка загрузки";
      toast({ title: "Загрузка не выполнена", description: message });
    } finally {
      setUploading(false);
    }
  };

  const patchPending = (key: string, patch: Partial<PendingPreview>) => {
    setPending((prev) => prev.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  };

  const applyPending = async (item: PendingPreview) => {
    if (!convexClient) return;
    patchPending(item.key, { busy: true });
    try {
      const p = item.preview.parsed;
      const result = await convexClient.action(api.invoiceActions.apply, {
        fileId: item.fileId as Id<"_storage">,
        fileName: item.fileName,
        operator: item.operator,
        kind: item.kind,
        invoiceNo: p.invoiceNo,
        invoiceDate: p.invoiceDate,
        periodStart: p.periodStart,
        periodEnd: p.periodEnd,
        month: p.month,
        contractNumber: p.contractNumber,
        ...(item.contractId !== "__none" ? { contractId: item.contractId as Id<"contracts"> } : {}),
        ...(item.companyId !== "__none" ? { companyId: item.companyId as Id<"companies"> } : {}),
        amount: p.amount,
        vat: p.vat,
        total: p.total,
        ...(p.notes.length ? { note: p.notes.join("; ") } : {}),
        serviceType: item.serviceType,
        ...(p.vatRate !== undefined ? { vatRate: p.vatRate } : {}),
        ...(p.serviceTotal !== undefined ? { serviceTotal: p.serviceTotal } : {}),
        ...(p.vatBasis ? { vatBasis: p.vatBasis } : {}),
      });
      setPending((prev) => prev.filter((x) => x.key !== item.key));
      await refresh();
      toast({ title: result.status === "needs_review" ? "Документ сохранён, начисление требует сверки" : "Счёт загружен" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ошибка применения";
      toast({ title: "Не применён", description: message });
      patchPending(item.key, { busy: false });
    }
  };

  const startLink = (invoiceId: string, current?: string) => {
    setLinkingId(invoiceId);
    setLinkContract(current ?? "__none");
  };

  const confirmLink = async () => {
    try {
    if (!linkingId || linkContract === "__none") {
      setLinkingId(null);
      return;
    }
    await updateInvoice({ id: linkingId, contractId: linkContract });
    toast({ title: "Счёт соотнесён с договором" });
    setLinkingId(null);
    } catch(error) { toast({title:"Не сохранено",description:error instanceof Error ? error.message : String(error),variant:"destructive"}); }
  };

  return (
    <MainLayout
      title="Счета"
      subtitle="Загрузка счетов операторов и соотнесение с договорами"
      actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Загрузить счета
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Загрузка счетов</DialogTitle>
              <DialogDescription>
                PDF счетов распознаются автоматически, договор подбирается по номеру. Проверьте и примените.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  type="file"
                  accept=".pdf"
                  multiple
                  onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                />
                <Select value={defaultOperator} onValueChange={setDefaultOperator}>
                  <SelectTrigger className="sm:w-56">
                    <SelectValue placeholder="Оператор" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__auto">Определить автоматически</SelectItem>
                    {operators.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={uploadAndPreview} disabled={uploading || !files.length}>
                  <Upload className="h-4 w-4 mr-2" />
                  {uploading ? "Загрузка..." : "Распознать"}
                </Button>
              </div>

              {pending.map((item) => (
                <div key={item.key} className="rounded-lg border border-border p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      {item.fileName}
                    </div>
                    <Button size="sm" disabled={item.busy} onClick={() => applyPending(item)}>
                      {item.busy ? "Применение..." : "Применить"}
                    </Button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="text-sm">Вид документа<select className="block w-full rounded border bg-background p-2" value={item.kind} onChange={e => patchPending(item.key, {kind: e.target.value as "invoice" | "detail"})}><option value="invoice">Счёт с начислением</option><option value="detail">Детализация без нового начисления</option></select></label>
                    {(["invoiceNo", "invoiceDate", "contractNumber", "periodStart", "periodEnd", "month"] as const).map(field => <label key={field} className="text-sm">{{invoiceNo:"Номер счёта",invoiceDate:"Дата счёта",contractNumber:"Номер договора",periodStart:"Начало услуг",periodEnd:"Окончание услуг",month:"Период"}[field]}<Input value={item.preview.parsed[field]} onChange={e => patchPending(item.key, {preview:{...item.preview,parsed:{...item.preview.parsed,[field]:e.target.value}}})} /></label>)}
                    {(["amount", "vat", "total"] as const).map(field => <label key={field} className="text-sm">{{amount:"Без НДС",vat:"НДС",total:"Всего по документу"}[field]}<Input type="number" step="0.01" min="0" value={item.preview.parsed[field]} onChange={e => patchPending(item.key, {preview:{...item.preview,parsed:{...item.preview.parsed,[field]:Number(e.target.value)}}})} /></label>)}
                  </div>
                  <div className="grid gap-2 text-sm md:grid-cols-4">
                    <div>
                      <span className="text-muted-foreground">Счёт: </span>
                      {item.preview.parsed.invoiceNo || "—"} от {item.preview.parsed.invoiceDate || "—"}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Период: </span>
                      {item.preview.parsed.periodStart || "—"} — {item.preview.parsed.periodEnd || "—"}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Сумма: </span>
                      {item.preview.parsed.total.toLocaleString("ru-RU")} ₽ (НДС{" "}
                      {item.preview.parsed.vat.toLocaleString("ru-RU")})
                    </div>
                    <div>
                      <span className="text-muted-foreground">Абонент: </span>
                      {item.preview.parsed.subscriber || "—"}
                    </div>
                  </div>
                  {item.preview.existingExpense && (
                    <div className="text-sm text-amber-600">
                      Похожий расход уже есть ({item.preview.existingExpense.total.toLocaleString("ru-RU")} ₽) —
                      применение привяжет счёт к нему.
                    </div>
                  )}
                  {item.preview.parsed.notes.length > 0 && (
                    <div className="text-xs text-muted-foreground">
                      {item.preview.parsed.notes.join("; ")}
                    </div>
                  )}
                  <div className="grid gap-2 md:grid-cols-3">
                    <Input
                      placeholder="Оператор"
                      value={item.operator}
                      onChange={(e) => patchPending(item.key, { operator: e.target.value })}
                    />
                    <Select
                      value={item.contractId}
                      onValueChange={(v) => patchPending(item.key, { contractId: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Договор" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">
                          Без договора{item.preview.suggested.contractNumber ? ` (${item.preview.suggested.contractNumber})` : ""}
                        </SelectItem>
                        {contracts.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={item.serviceType}
                      onValueChange={(v) => patchPending(item.key, { serviceType: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Тип услуги" />
                      </SelectTrigger>
                      <SelectContent>
                        {SERVICE_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="stat-card">
          <p className="text-sm text-muted-foreground">Сумма счетов</p>
          <p className="text-2xl font-semibold">{summary.total.toLocaleString("ru-RU")} ₽</p>
        </div>
        <div className="stat-card">
          <p className="text-sm text-muted-foreground">Соотнесено</p>
          <p className="text-2xl font-semibold">{summary.matched}</p>
        </div>
        <div className="stat-card">
          <p className="text-sm text-muted-foreground">Черновики</p>
          <p className="text-2xl font-semibold">{summary.draft}</p>
        </div>
      </div>

      <Input aria-label="Поиск счетов" placeholder="Поиск по номеру, файлу, договору, компании" value={search} onChange={e => setSearch(e.target.value)} className="mb-4" />
      <div className="rounded-lg border border-border overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Счёт</th>
              <th className="px-3 py-2 text-left font-medium">Оператор</th>
              <th className="px-3 py-2 text-left font-medium">Компания / Договор</th>
              <th className="px-3 py-2 text-left font-medium">Период</th>
              <th className="px-3 py-2 text-right font-medium">Сумма</th>
              <th className="px-3 py-2 text-left font-medium">Статус</th>
              <th className="px-3 py-2 text-right font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {invoices.filter(i => `${i.invoiceNo} ${i.fileName} ${i.contractNumber} ${i.company}`.toLowerCase().includes(search.toLowerCase())).map((inv) => (
              <tr key={inv.id} className="border-t border-border">
                <td className="px-3 py-2">
                  <Link className="font-medium text-primary hover:underline" to={`?id=${encodeURIComponent(inv.id)}`}>{inv.invoiceNo || inv.fileName}</Link>
                  <div className="text-xs text-muted-foreground">
                    {inv.invoiceDate || ""} · {inv.fileName}
                  </div>
                </td>
                <td className="px-3 py-2">{inv.operator || "—"}</td>
                <td className="px-3 py-2">
                  <div>{inv.company || "—"}</div>
                  <div className="text-xs text-muted-foreground">{inv.contract || inv.contractNumber || "—"}</div>
                </td>
                <td className="px-3 py-2">{inv.month || `${inv.periodStart} — ${inv.periodEnd}`}</td>
                <td className="px-3 py-2 text-right">{inv.total.toLocaleString("ru-RU")} ₽</td>
                <td className="px-3 py-2">
                  {inv.status === "void" ? <span className="badge-inactive">Аннулирован</span> : inv.status === "matched" ? (
                    <span className="badge-active">Соотнесён</span>
                  ) : (
                    <span className="badge-inactive">Черновик</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1">
                    {inv.fileUrl && (
                      <Button variant="ghost" size="icon" asChild>
                        <a href={inv.fileUrl} target="_blank" rel="noreferrer">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => startLink(inv.id, inv.contractId)}>
                      <Link2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (window.confirm("Аннулировать счёт? Оригинал и история сохранятся.")) {
                          deleteInvoice(inv.id).then(() => toast({ title: "Счёт аннулирован" })).catch(error => toast({ title: "Не аннулирован", description: String(error), variant: "destructive" }));
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!invoices.length && <div className="p-6 text-sm text-muted-foreground">Счета не загружены</div>}
      </div>

      <Dialog open={!!selected} onOpenChange={o => {if(!o){const next=new URLSearchParams(params);next.delete("id");setParams(next);}}}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>Счёт {selected?.invoiceNo}</DialogTitle><DialogDescription>Оригинал, начисление и детализация за период</DialogDescription></DialogHeader>
        {selected && <div className="space-y-4"><p>{selected.company} · {selected.operator} · {selected.periodStart} — {selected.periodEnd}</p>
          <p>По документу: {selected.total.toLocaleString("ru-RU")} ₽ · Услуги: {selected.chargeTotal.toLocaleString("ru-RU")} ₽ · Распределено: {selected.allocatedTotal.toLocaleString("ru-RU")} ₽ · Не распределено: {selected.unallocated.toLocaleString("ru-RU")} ₽</p>
          {selected.openingBalance !== undefined && <p>Входящий остаток: {selected.openingBalance.toLocaleString("ru-RU")} ₽ · Платежи: {selected.payments?.toLocaleString("ru-RU")} ₽ · К оплате: {(selected.amountDue ?? selected.total).toLocaleString("ru-RU")} ₽</p>}
          {selected.fileUrl && <a className="text-primary underline" href={selected.fileUrl} target="_blank" rel="noreferrer">Открыть оригинал PDF</a>}
          {selected.contractId && <p><Link className="text-primary underline" to={`/contracts?id=${selected.contractId}`}>Договор {selected.contractNumber}</Link></p>}
          {selected.chargeId && <p><Link className="text-primary underline" to={`/expenses?id=${selected.chargeId}`}>Начисление и история изменений</Link></p>}
          <div className="space-y-2">{expenses.filter(e => e.kind === "allocation" && (e.invoiceId === selected.id || e.parentExpenseId === selected.chargeId)).map(e => <div key={e.id} className="rounded border p-3 text-sm"><Link className="text-primary underline" to={`/expenses?id=${e.id}`}>{e.simNumber || "Услуга"}</Link> · {e.total.toLocaleString("ru-RU")} ₽<p>{e.description || e.type}</p><p className="text-muted-foreground">{e.vatBasis === "allocatedFromDocumentVat" ? "НДС распределён пропорционально исходной сумме из налога документа" : e.vatBasis === "netOnlyVatUnallocated" ? "Без НДС; налог остаётся в начислении" : e.vatBasis === "grossOnlyTaxNotSplit" ? "Включая НДС; налог по строке отдельно не указан" : ""} · Страница {e.sourcePage ?? "—"}</p>{e.simCardId && <Link className="text-primary underline" to={`/sim-cards?id=${e.simCardId}`}>История номера / подключения</Link>}</div>)}</div>
        </div>}</DialogContent>
      </Dialog>
      <Dialog open={linkingId !== null} onOpenChange={(o) => !o && setLinkingId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Соотнести с договором</DialogTitle>
            <DialogDescription>Выберите договор — создастся/привяжется расход с документом.</DialogDescription>
          </DialogHeader>
          <Select value={linkContract} onValueChange={setLinkContract}>
            <SelectTrigger>
              <SelectValue placeholder="Договор" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">Не выбрано</SelectItem>
              {contracts.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setLinkingId(null)}>
              Отмена
            </Button>
            <Button onClick={confirmLink}>Сохранить</Button>
          </div>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
};

export default Invoices;
