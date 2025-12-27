import React from "react";
import MainLayout from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Filter, MoreHorizontal, Receipt, Eye, Pencil, Upload, Trash2, CalendarIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { convexClient, useCompanies, useContracts, useExpenses, useOperators, type Expense } from "@/lib/backend";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { toast } from "@/hooks/use-toast";
import type { DateRange } from "react-day-picker";
import { addDays, format } from "date-fns";

const formSchema = z.object({
  contract: z.string().optional(),
  companyId: z.string().min(1, "Выберите компанию"),
  operator: z.string().optional(),
  month: z.string().min(2, "Укажите период"),
  type: z.string().min(2, "Укажите тип расхода"),
  amount: z.coerce.number().min(0, "Не может быть отрицательным"),
  vat: z.coerce.number().min(0, "Не может быть отрицательным"),
});

type FormValues = z.infer<typeof formSchema>;

type ImportPreview = {
  importId: string;
  fileName: string;
  totals: {
    rows: number;
    contractsMissing: number;
    simCardsMissing: number;
    tariffsMissing: number;
    vatMismatches: number;
    totalAmount: number;
    totalVat: number;
    totalTotal: number;
  };
  missingContracts: {
    contractNumber: string;
    rowsCount: number;
    periodStart: string;
    periodEnd: string;
  }[];
  missingSimCards: {
    phone: string;
    contractNumber: string;
    tariffName: string;
  }[];
  missingTariffs: {
    operatorId: string;
    operatorName: string;
    contractNumber: string;
    tariffName: string;
  }[];
  rows: {
    rowIndex: number;
    phone: string;
    contractNumber: string;
    tariffName: string;
    periodStart: string;
    periodEnd: string;
    month: string;
    amount: number;
    vat: number;
    total: number;
    tariffFee: number;
    vatMismatch: boolean;
    isVatOnly: boolean;
  }[];
};

type ImportHistoryItem = {
  _id: string;
  fileName: string;
  status: string;
  createdAt: number;
  appliedAt?: number;
  previewSummary?: {
    rows: number;
    contractsMissing: number;
    simCardsMissing: number;
    tariffsMissing: number;
    vatMismatches?: number;
    totalAmount: number;
    totalVat: number;
    totalTotal: number;
  };
  appliedSummary?: {
    expensesCreated: number;
    simCardsCreated: number;
    tariffsCreated: number;
    contractsCreated: number;
  };
};

type ContractResolutionState = {
  contractNumber: string;
  companyMode: "existing" | "create";
  companyId?: string;
  companyName?: string;
  companyInn?: string;
  companyKpp?: string;
  companyComment?: string;
  operatorMode: "existing" | "create";
  operatorId?: string;
  operatorName?: string;
  operatorType?: string;
  operatorManager?: string;
  operatorPhone?: string;
  operatorEmail?: string;
  type: string;
  status: "active" | "closing";
  startDate: string;
  endDate: string;
  monthlyFee: number;
  simCount: number;
  forceCreate?: boolean;
};

type CompanyConflict = {
  contractNumber: string;
  name: string;
  suggestions: { id: string; name: string }[];
};

type SimAction = "create" | "skip";

const Expenses = () => {
  const { items: expenses, createExpense, updateExpense, deleteExpense } = useExpenses();
  const { items: companies } = useCompanies();
  const { items: contracts } = useContracts();
  const { items: operators } = useOperators();
  const [open, setOpen] = React.useState(false);
  const [viewExpense, setViewExpense] = React.useState<Expense | null>(null);
  const [editExpense, setEditExpense] = React.useState<Expense | null>(null);
  const [editOpen, setEditOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [companyFilter, setCompanyFilter] = React.useState("all");
  const [periodFilter, setPeriodFilter] = React.useState("all");
  const [contractSelect, setContractSelect] = React.useState("__custom");
  const [editContractSelect, setEditContractSelect] = React.useState("__custom");
  const [importOpen, setImportOpen] = React.useState(false);
  const [importBusy, setImportBusy] = React.useState(false);
  const [importFile, setImportFile] = React.useState<File | null>(null);
  const [importPreview, setImportPreview] = React.useState<ImportPreview | null>(null);
  const [importId, setImportId] = React.useState<string | null>(null);
  const [importRows, setImportRows] = React.useState<ImportPreview["rows"]>([]);
  const [importHistory, setImportHistory] = React.useState<ImportHistoryItem[]>([]);
  const [importHistoryBusy, setImportHistoryBusy] = React.useState(false);
  const [contractResolutions, setContractResolutions] = React.useState<ContractResolutionState[]>([]);
  const [simActionMap, setSimActionMap] = React.useState<Record<string, SimAction>>({});
  const [tariffOverrides, setTariffOverrides] = React.useState<Record<string, number>>({});
  const [companyConflicts, setCompanyConflicts] = React.useState<CompanyConflict[] | null>(null);
  const today = React.useMemo(() => new Date(), []);
  const defaultRange: DateRange = { from: today, to: today };
  const [createRange, setCreateRange] = React.useState<DateRange | undefined>(defaultRange);
  const [editRange, setEditRange] = React.useState<DateRange | undefined>(defaultRange);

  const formatRange = (range?: DateRange, fallback = "Выберите период") => {
    if (!range?.from) return fallback;
    const fromStr = format(range.from, "dd.MM.yyyy");
    if (!range.to) return fromStr;
    const toStr = format(range.to, "dd.MM.yyyy");
    return fromStr === toStr ? fromStr : `${fromStr} - ${toStr}`;
  };

  const formatDateTime = (value?: number) => (value ? format(new Date(value), "dd.MM.yyyy HH:mm") : "-");

  const updateResolution = (contractNumber: string, updater: (item: ContractResolutionState) => ContractResolutionState) => {
    setContractResolutions((prev) =>
      prev.map((item) => (item.contractNumber === contractNumber ? updater(item) : item)),
    );
  };

  const loadImportHistory = React.useCallback(async () => {
    if (!convexClient) return;
    setImportHistoryBusy(true);
    try {
      const items = (await convexClient.query("billingImports:list", { limit: 20 })) as ImportHistoryItem[];
      setImportHistory(items);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось загрузить историю импорта";
      toast({ title: message, variant: "destructive" });
    } finally {
      setImportHistoryBusy(false);
    }
  }, [convexClient, toast]);

  const handleDeleteImport = async (id: string) => {
    if (!convexClient) return;
    if (!window.confirm("Удалить импорт и файл?")) return;
    try {
      await convexClient.mutation("billingImports:remove", { id });
      await loadImportHistory();
      toast({ title: "Импорт удален" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось удалить импорт";
      toast({ title: message, variant: "destructive" });
    }
  };

  const handleImportPreview = async () => {
    if (!convexClient) {
      toast({ title: "Бэкенд недоступен", description: "Подключите Convex и повторите попытку." });
      return;
    }
    if (!importFile) {
      toast({ title: "Выберите файл", description: "Нужен XLS/XLSX/CSV файл детализации." });
      return;
    }
    setImportBusy(true);
    try {
      const { uploadUrl } = await convexClient.mutation("billingImports:requestUpload", {});
      const uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          "Content-Type": importFile.type || "application/octet-stream",
        },
        body: importFile,
      });
      if (!uploadResponse.ok) {
        throw new Error("Не удалось загрузить файл");
      }
      const { storageId } = await uploadResponse.json();
      const saved = await convexClient.mutation("billingImports:saveUpload", {
        fileId: storageId,
        fileName: importFile.name,
      });
      setImportId(saved.importId as string);
      const preview = await convexClient.action("billingImportActions:preview", { id: saved.importId });
      setImportPreview(preview as ImportPreview);
      const sanitizedRows = (preview as ImportPreview).rows.map((row) => ({
        rowIndex: row.rowIndex,
        phone: row.phone,
        contractNumber: row.contractNumber,
        tariffName: row.tariffName,
        periodStart: row.periodStart,
        periodEnd: row.periodEnd,
        month: row.month,
        amount: row.amount,
        vat: row.vat,
        total: row.total,
        tariffFee: row.tariffFee,
        vatMismatch: row.vatMismatch,
        isVatOnly: row.isVatOnly,
      }));
      setImportRows(sanitizedRows);
      setCompanyConflicts(null);
      await loadImportHistory();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ошибка импорта";
      toast({ title: "Импорт не выполнен", description: message });
    } finally {
      setImportBusy(false);
    }
  };

  const handleImportApply = async () => {
    if (!convexClient || !importId || !importPreview) return;
    setImportBusy(true);
    try {
      const payload = {
        id: importId,
        rows: importRows.map((row) => ({
          rowIndex: row.rowIndex,
          phone: row.phone,
          contractNumber: row.contractNumber,
          tariffName: row.tariffName,
          periodStart: row.periodStart,
          periodEnd: row.periodEnd,
          month: row.month,
          amount: row.amount,
          vat: row.vat,
          total: row.total,
          tariffFee: row.tariffFee,
          vatMismatch: row.vatMismatch,
          isVatOnly: row.isVatOnly,
        })),
        contractResolutions: contractResolutions.map((item) => ({
          contractNumber: item.contractNumber,
          company:
            item.companyMode === "existing"
              ? { mode: "existing" as const, id: item.companyId }
              : {
                  mode: "create" as const,
                  name: item.companyName || "",
                  inn: item.companyInn || undefined,
                  kpp: item.companyKpp || undefined,
                  comment: item.companyComment || undefined,
                  forceCreate: item.forceCreate || false,
                },
          operator:
            item.operatorMode === "existing"
              ? { mode: "existing" as const, id: item.operatorId }
              : {
                  mode: "create" as const,
                  name: item.operatorName || "",
                  type: item.operatorType || undefined,
                  manager: item.operatorManager || undefined,
                  phone: item.operatorPhone || undefined,
                  email: item.operatorEmail || undefined,
                },
          type: item.type,
          status: item.status,
          startDate: item.startDate,
          endDate: item.endDate,
          monthlyFee: item.monthlyFee,
          simCount: item.simCount,
        })),
        simCardActions: importPreview.missingSimCards.map((item) => ({
          phone: item.phone,
          action: simActionMap[item.phone] ?? "create",
        })),
        tariffOverrides: importPreview.missingTariffs.map((item) => ({
          operatorId: item.operatorId,
          tariffName: item.tariffName,
          monthlyFee: tariffOverrides[`${item.operatorId}:${item.tariffName}`] || undefined,
        })),
      };
      const result = await convexClient.action("billingImportActions:apply", payload);
      if (result?.status === "needs_confirmation") {
        setCompanyConflicts(result.companyConflicts as CompanyConflict[]);
        toast({ title: "Нужно подтвердить компании", description: "Выберите существующую или создайте новую." });
        return;
      }
      if (result?.status === "missing_contracts") {
        toast({ title: "Не хватает договоров", description: "Заполните данные для всех договоров." });
        return;
      }
      toast({ title: "Импорт применен", description: "Данные добавлены в расходы." });
      setImportOpen(false);
      await loadImportHistory();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ошибка применения импорта";
      toast({ title: "Импорт не применен", description: message });
    } finally {
      setImportBusy(false);
    }
  };

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      contract: "",
      companyId: companies[0]?.id ?? "",
      operator: "",
      month: formatRange(defaultRange),
      type: "Мобильная связь",
      amount: 0,
      vat: 0,
    },
  });

  React.useEffect(() => {
    if (!form.getValues("companyId") && companies[0]) {
      form.setValue("companyId", companies[0].id);
    }
  }, [companies, form]);

  React.useEffect(() => {
    if (contracts.length && contractSelect !== "__custom") {
      const selected = contracts.find((c) => c.id === contractSelect);
      if (selected) {
        form.setValue("contract", selected.number);
        form.setValue("companyId", selected.companyId);
        form.setValue("operator", selected.operator);
      }
    }
  }, [contractSelect, contracts, form]);

  const onSubmit = async (values: FormValues) => {
    form.setValue("month", formatRange(createRange));
    await createExpense({
      ...values,
      total: values.amount + values.vat,
      status: "draft",
      hasDocument: false,
      company: "",
      id: "",
    });
    toast({ title: "Расход добавлен" });
    setOpen(false);
    form.reset({
      contract: "",
      companyId: companies[0]?.id ?? "",
      operator: "",
      month: formatRange(defaultRange),
      type: "Мобильная связь",
      amount: 0,
      vat: 0,
    });
  };

  const editForm = useForm<FormValues>({
    resolver: zodResolver(formSchema),
  });

  React.useEffect(() => {
    if (!editExpense) return;
    const matched = contracts.find((c) => c.number === editExpense.contract);
    setEditContractSelect(matched ? matched.id : "__custom");
    editForm.reset({
      contract: editExpense.contract,
      companyId: editExpense.companyId,
      operator: editExpense.operator,
      month: editExpense.month,
      type: editExpense.type,
      amount: editExpense.amount,
      vat: editExpense.vat,
    });
  }, [editExpense, editForm, contracts]);

  React.useEffect(() => {
    if (editContractSelect !== "__custom" && contracts.length) {
      const selected = contracts.find((c) => c.id === editContractSelect);
      if (selected) {
        editForm.setValue("contract", selected.number);
        editForm.setValue("companyId", selected.companyId);
        editForm.setValue("operator", selected.operator);
      }
    }
  }, [editContractSelect, contracts, editForm]);

  React.useEffect(() => {
    if (!importOpen) {
      setImportFile(null);
      setImportPreview(null);
      setImportId(null);
      setImportRows([]);
      setContractResolutions([]);
      setSimActionMap({});
      setTariffOverrides({});
      setCompanyConflicts(null);
      setImportHistory([]);
      return;
    }
    loadImportHistory();
  }, [importOpen, loadImportHistory]);

  React.useEffect(() => {
    if (!importPreview) return;
    const defaultCompanyId = companies[0]?.id ?? "";
    const defaultOperatorId = operators[0]?.id ?? "";
    setContractResolutions(
      importPreview.missingContracts.map((item) => ({
        contractNumber: item.contractNumber,
        companyMode: companies.length ? "existing" : "create",
        companyId: companies.length ? defaultCompanyId : "",
        companyName: "",
        companyInn: "",
        companyKpp: "",
        companyComment: "",
        operatorMode: operators.length ? "existing" : "create",
        operatorId: operators.length ? defaultOperatorId : "",
        operatorName: "",
        operatorType: "",
        operatorManager: "",
        operatorPhone: "",
        operatorEmail: "",
        type: "Мобильная связь",
        status: "active",
        startDate: item.periodStart || "",
        endDate: item.periodEnd || "",
        monthlyFee: 0,
        simCount: 0,
      })),
    );

    const actions: Record<string, SimAction> = {};
    importPreview.missingSimCards.forEach((item) => {
      actions[item.phone] = "create";
    });
    setSimActionMap(actions);

    const overrides: Record<string, number> = {};
    importPreview.missingTariffs.forEach((item) => {
      overrides[`${item.operatorId}:${item.tariffName}`] = 0;
    });
    setTariffOverrides(overrides);
  }, [importPreview, companies, operators]);

  const handleImportRowChange = (
    rowIndex: number,
    field: "amount" | "vat" | "total",
    value: number,
  ) => {
    setImportRows((prev) =>
      prev.map((row) => (row.rowIndex === rowIndex ? { ...row, [field]: value } : row)),
    );
  };

  const importTotals = React.useMemo(() => {
    if (!importRows.length) return null;
    return importRows.reduce(
      (acc, row) => {
        acc.amount += row.amount;
        acc.vat += row.vat;
        acc.total += row.total;
        acc.vatMismatches += row.vatMismatch ? 1 : 0;
        return acc;
      },
      { amount: 0, vat: 0, total: 0, vatMismatches: 0 },
    );
  }, [importRows]);

  const onEditSubmit = async (values: FormValues) => {
    if (!editExpense) return;
    editForm.setValue("month", formatRange(editRange, editExpense.month));
    await updateExpense({
      ...editExpense,
      ...values,
      total: values.amount + values.vat,
      status: editExpense.status,
      hasDocument: editExpense.hasDocument,
    });
    toast({ title: "Расход обновлен" });
    setEditOpen(false);
  };

  const filteredExpenses = React.useMemo(() => {
    return expenses.filter((exp) => {
      const matchesSearch =
        (exp.contract || "").toLowerCase().includes(search.toLowerCase()) ||
        exp.type.toLowerCase().includes(search.toLowerCase()) ||
        exp.operator.toLowerCase().includes(search.toLowerCase());
      const matchesCompany = companyFilter === "all" || exp.companyId === companyFilter;
      const matchesPeriod = periodFilter === "all" || exp.month === periodFilter;
      return matchesSearch && matchesCompany && matchesPeriod;
    });
  }, [expenses, search, companyFilter, periodFilter]);

  const filteredSummary = React.useMemo(() => {
    return filteredExpenses.reduce(
      (acc, item) => {
        acc.total += item.total;
        return acc;
      },
      { total: 0 },
    );
  }, [filteredExpenses]);

  const canApplyImport = React.useMemo(() => {
    if (!importPreview) return false;
    if (importPreview.missingContracts.length !== contractResolutions.length) return false;
    return contractResolutions.every((item) => {
      const companyOk =
        item.companyMode === "existing" ? Boolean(item.companyId) : Boolean(item.companyName?.trim());
      const operatorOk =
        item.operatorMode === "existing" ? Boolean(item.operatorId) : Boolean(item.operatorName?.trim());
      const contractOk = Boolean(item.type.trim()) && Boolean(item.startDate.trim()) && Boolean(item.endDate.trim());
      return companyOk && operatorOk && contractOk;
    });
  }, [importPreview, contractResolutions]);

  return (
    <MainLayout
      title="Фактические расходы"
      subtitle="Учёт ежемесячных расходов по договорам"
      actions={
        <div className="flex gap-3">
          <Dialog open={importOpen} onOpenChange={setImportOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Upload className="h-4 w-4 mr-2" />
                Импорт
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-5xl">
              <DialogHeader>
                <DialogTitle>Импорт расходов</DialogTitle>
                <DialogDescription>Загрузите XLS/XLSX/CSV и подтвердите данные перед применением.</DialogDescription>
              </DialogHeader>

              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-3">
                    <Input
                      type="file"
                      accept=".xls,.xlsx,.csv"
                      onChange={(event) => setImportFile(event.target.files?.[0] ?? null)}
                    />
                    <div className="flex items-center gap-2">
                      <Button onClick={handleImportPreview} disabled={importBusy || !importFile}>
                        {importBusy ? "Загрузка..." : "Предпросмотр"}
                      </Button>
                      {importFile && <span className="text-xs text-muted-foreground">{importFile.name}</span>}
                    </div>
                  </div>

                  {importPreview && (
                    <div className="rounded-lg border border-border bg-muted/20 p-4 text-sm">
                      <div className="font-medium">Итоги файла</div>
                      <div className="mt-2 space-y-1 text-muted-foreground">
                        <div>Строк: {importPreview.totals.rows}</div>
                        <div>
                          Сумма без НДС: {(importTotals?.amount ?? importPreview.totals.totalAmount).toLocaleString("ru-RU")} RUB
                        </div>
                        <div>
                          НДС: {(importTotals?.vat ?? importPreview.totals.totalVat).toLocaleString("ru-RU")} RUB
                        </div>
                        <div>
                          Итого: {(importTotals?.total ?? importPreview.totals.totalTotal).toLocaleString("ru-RU")} RUB
                        </div>
                        <div>
                          Проверка НДС: {(importTotals?.vatMismatches ?? importPreview.totals.vatMismatches)} ошибок
                        </div>
                        <div>Нет договоров: {importPreview.totals.contractsMissing}</div>
                        <div>Нет SIM: {importPreview.totals.simCardsMissing}</div>
                        <div>Нет тарифов: {importPreview.totals.tariffsMissing}</div>
                      </div>
                    </div>
                  )}
                </div>

                {importRows.length ? (
                  <div className="rounded-lg border border-border bg-muted/10 p-4 text-sm">
                    <div className="flex items-center justify-between">
                      <div className="font-medium">Распознанные строки</div>
                      <div className="text-xs text-muted-foreground">Редактируйте суммы при необходимости</div>
                    </div>
                    <div className="mt-3 max-h-72 overflow-auto rounded-md border border-border">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/40 text-xs text-muted-foreground sticky top-0">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium">№</th>
                            <th className="px-3 py-2 text-left font-medium">Договор</th>
                            <th className="px-3 py-2 text-left font-medium">Номер</th>
                            <th className="px-3 py-2 text-left font-medium">Тариф</th>
                            <th className="px-3 py-2 text-left font-medium">Период</th>
                            <th className="px-3 py-2 text-left font-medium">Сумма</th>
                            <th className="px-3 py-2 text-left font-medium">НДС</th>
                            <th className="px-3 py-2 text-left font-medium">Итого</th>
                          </tr>
                        </thead>
                        <tbody>
                          {importRows.map((row) => (
                            <tr key={row.rowIndex} className="border-t border-border">
                              <td className="px-3 py-2">{row.rowIndex}</td>
                              <td className="px-3 py-2">{row.contractNumber}</td>
                              <td className="px-3 py-2">{row.phone || "-"}</td>
                              <td className="px-3 py-2">{row.tariffName || "-"}</td>
                              <td className="px-3 py-2">{row.month}</td>
                              <td className="px-3 py-2">
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={row.amount}
                                  onChange={(event) =>
                                    handleImportRowChange(
                                      row.rowIndex,
                                      "amount",
                                      Number(event.target.value) || 0,
                                    )
                                  }
                                />
                              </td>
                              <td className="px-3 py-2">
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={row.vat}
                                  onChange={(event) =>
                                    handleImportRowChange(
                                      row.rowIndex,
                                      "vat",
                                      Number(event.target.value) || 0,
                                    )
                                  }
                                />
                              </td>
                              <td className="px-3 py-2">
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={row.total}
                                  onChange={(event) =>
                                    handleImportRowChange(
                                      row.rowIndex,
                                      "total",
                                      Number(event.target.value) || 0,
                                    )
                                  }
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}

                <div className="rounded-lg border border-border bg-muted/10 p-4 text-sm">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">История импортов</div>
                    {importHistoryBusy && <span className="text-xs text-muted-foreground">Загрузка...</span>}
                  </div>
                  {importHistory.length ? (
                    <div className="mt-3 overflow-auto rounded-md border border-border">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/40 text-xs text-muted-foreground">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium">Файл</th>
                            <th className="px-3 py-2 text-left font-medium">Статус</th>
                            <th className="px-3 py-2 text-left font-medium">Создан</th>
                            <th className="px-3 py-2 text-left font-medium">Применен</th>
                            <th className="px-3 py-2 text-left font-medium">Строки</th>
                            <th className="px-3 py-2 text-right font-medium"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {importHistory.map((item) => (
                            <tr key={item._id} className="border-t border-border">
                              <td className="px-3 py-2">{item.fileName}</td>
                              <td className="px-3 py-2">{item.status}</td>
                              <td className="px-3 py-2">{formatDateTime(item.createdAt)}</td>
                              <td className="px-3 py-2">{formatDateTime(item.appliedAt)}</td>
                              <td className="px-3 py-2">{item.previewSummary?.rows ?? "-"}</td>
                              <td className="px-3 py-2 text-right">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleDeleteImport(item._id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="mt-3 text-muted-foreground">История пуста</div>
                  )}
                </div>

                {companyConflicts?.length ? (
                  <div className="rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm">
                    <div className="font-medium">Похожие компании</div>
                    <div className="mt-2 space-y-3">
                      {companyConflicts.map((conflict) => (
                        <div key={conflict.contractNumber} className="space-y-2">
                          <div className="text-muted-foreground">
                            Договор {conflict.contractNumber}: найдено похожее название «{conflict.name}».
                          </div>
                          <Select
                            value={
                              contractResolutions.find((r) => r.contractNumber === conflict.contractNumber)?.companyMode ===
                              "existing"
                                ? contractResolutions.find((r) => r.contractNumber === conflict.contractNumber)?.companyId ??
                                  ""
                                : "__new"
                            }
                            onValueChange={(value) => {
                              updateResolution(conflict.contractNumber, (item) => ({
                                ...item,
                                companyMode: value === "__new" ? "create" : "existing",
                                companyId: value === "__new" ? "" : value,
                                forceCreate: value === "__new",
                              }));
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Выберите компанию" />
                            </SelectTrigger>
                            <SelectContent>
                              {conflict.suggestions.map((s) => (
                                <SelectItem key={s.id} value={s.id}>
                                  Объединить с: {s.name}
                                </SelectItem>
                              ))}
                              <SelectItem value="__new">Создать новую компанию</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {importPreview && (
                  <div className="space-y-6">
                    {importPreview.missingContracts.length ? (
                      <div className="space-y-4">
                        <div className="text-sm font-medium">Договоры (нужно заполнить)</div>
                        <div className="space-y-4">
                          {contractResolutions.map((item) => (
                            <div key={item.contractNumber} className="rounded-lg border border-border p-4">
                              <div className="mb-4 text-sm font-medium">Договор {item.contractNumber}</div>
                              <div className="grid gap-3 md:grid-cols-2">
                                <div className="space-y-2">
                                  <div className="text-xs text-muted-foreground">Компания</div>
                                  <Select
                                    value={item.companyMode === "existing" ? item.companyId ?? "" : "__new"}
                                    onValueChange={(value) =>
                                      updateResolution(item.contractNumber, (prev) => ({
                                        ...prev,
                                        companyMode: value === "__new" ? "create" : "existing",
                                        companyId: value === "__new" ? "" : value,
                                        forceCreate: false,
                                      }))
                                    }
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Компания" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {companies.map((company) => (
                                        <SelectItem key={company.id} value={company.id}>
                                          {company.name}
                                        </SelectItem>
                                      ))}
                                      <SelectItem value="__new">Создать новую</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  {item.companyMode === "create" && (
                                    <div className="space-y-2">
                                      <Input
                                        placeholder="Название компании"
                                        value={item.companyName ?? ""}
                                        onChange={(event) =>
                                          updateResolution(item.contractNumber, (prev) => ({
                                            ...prev,
                                            companyName: event.target.value,
                                          }))
                                        }
                                      />
                                      <div className="grid gap-2 md:grid-cols-2">
                                        <Input
                                          placeholder="ИНН"
                                          value={item.companyInn ?? ""}
                                          onChange={(event) =>
                                            updateResolution(item.contractNumber, (prev) => ({
                                              ...prev,
                                              companyInn: event.target.value,
                                            }))
                                          }
                                        />
                                        <Input
                                          placeholder="КПП"
                                          value={item.companyKpp ?? ""}
                                          onChange={(event) =>
                                            updateResolution(item.contractNumber, (prev) => ({
                                              ...prev,
                                              companyKpp: event.target.value,
                                            }))
                                          }
                                        />
                                      </div>
                                      <Input
                                        placeholder="Комментарий"
                                        value={item.companyComment ?? ""}
                                        onChange={(event) =>
                                          updateResolution(item.contractNumber, (prev) => ({
                                            ...prev,
                                            companyComment: event.target.value,
                                          }))
                                        }
                                      />
                                    </div>
                                  )}
                                </div>

                                <div className="space-y-2">
                                  <div className="text-xs text-muted-foreground">Оператор</div>
                                  <Select
                                    value={item.operatorMode === "existing" ? item.operatorId ?? "" : "__new"}
                                    onValueChange={(value) =>
                                      updateResolution(item.contractNumber, (prev) => ({
                                        ...prev,
                                        operatorMode: value === "__new" ? "create" : "existing",
                                        operatorId: value === "__new" ? "" : value,
                                      }))
                                    }
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Оператор" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {operators.map((operator) => (
                                        <SelectItem key={operator.id} value={operator.id}>
                                          {operator.name}
                                        </SelectItem>
                                      ))}
                                      <SelectItem value="__new">Создать нового</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  {item.operatorMode === "create" && (
                                    <div className="space-y-2">
                                      <Input
                                        placeholder="Название оператора"
                                        value={item.operatorName ?? ""}
                                        onChange={(event) =>
                                          updateResolution(item.contractNumber, (prev) => ({
                                            ...prev,
                                            operatorName: event.target.value,
                                          }))
                                        }
                                      />
                                      <Input
                                        placeholder="Тип"
                                        value={item.operatorType ?? ""}
                                        onChange={(event) =>
                                          updateResolution(item.contractNumber, (prev) => ({
                                            ...prev,
                                            operatorType: event.target.value,
                                          }))
                                        }
                                      />
                                      <Input
                                        placeholder="Менеджер"
                                        value={item.operatorManager ?? ""}
                                        onChange={(event) =>
                                          updateResolution(item.contractNumber, (prev) => ({
                                            ...prev,
                                            operatorManager: event.target.value,
                                          }))
                                        }
                                      />
                                      <div className="grid gap-2 md:grid-cols-2">
                                        <Input
                                          placeholder="Телефон"
                                          value={item.operatorPhone ?? ""}
                                          onChange={(event) =>
                                            updateResolution(item.contractNumber, (prev) => ({
                                              ...prev,
                                              operatorPhone: event.target.value,
                                            }))
                                          }
                                        />
                                        <Input
                                          placeholder="Email"
                                          value={item.operatorEmail ?? ""}
                                          onChange={(event) =>
                                            updateResolution(item.contractNumber, (prev) => ({
                                              ...prev,
                                              operatorEmail: event.target.value,
                                            }))
                                          }
                                        />
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className="mt-4 grid gap-3 md:grid-cols-2">
                                <Input
                                  placeholder="Тип договора"
                                  value={item.type}
                                  onChange={(event) =>
                                    updateResolution(item.contractNumber, (prev) => ({
                                      ...prev,
                                      type: event.target.value,
                                    }))
                                  }
                                />
                                <Select
                                  value={item.status}
                                  onValueChange={(value) =>
                                    updateResolution(item.contractNumber, (prev) => ({
                                      ...prev,
                                      status: value as "active" | "closing",
                                    }))
                                  }
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Статус" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="active">Активен</SelectItem>
                                    <SelectItem value="closing">Закрывается</SelectItem>
                                  </SelectContent>
                                </Select>
                                <Input
                                  placeholder="Дата начала"
                                  value={item.startDate}
                                  onChange={(event) =>
                                    updateResolution(item.contractNumber, (prev) => ({
                                      ...prev,
                                      startDate: event.target.value,
                                    }))
                                  }
                                />
                                <Input
                                  placeholder="Дата окончания"
                                  value={item.endDate}
                                  onChange={(event) =>
                                    updateResolution(item.contractNumber, (prev) => ({
                                      ...prev,
                                      endDate: event.target.value,
                                    }))
                                  }
                                />
                                <Input
                                  type="number"
                                  min={0}
                                  step={100}
                                  placeholder="Абонентская плата"
                                  value={item.monthlyFee}
                                  onChange={(event) =>
                                    updateResolution(item.contractNumber, (prev) => ({
                                      ...prev,
                                      monthlyFee: Number(event.target.value),
                                    }))
                                  }
                                />
                                <Input
                                  type="number"
                                  min={0}
                                  step={1}
                                  placeholder="Кол-во SIM"
                                  value={item.simCount}
                                  onChange={(event) =>
                                    updateResolution(item.contractNumber, (prev) => ({
                                      ...prev,
                                      simCount: Number(event.target.value),
                                    }))
                                  }
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {importPreview.missingSimCards.length ? (
                      <div className="space-y-3">
                        <div className="text-sm font-medium">SIM-карты (нет в базе)</div>
                        <div className="grid gap-2 md:grid-cols-2">
                          {importPreview.missingSimCards.map((item) => (
                            <div key={item.phone} className="flex items-center justify-between rounded border border-border p-2 text-sm">
                              <div>
                                <div className="font-medium">{item.phone}</div>
                                <div className="text-xs text-muted-foreground">{item.tariffName || "без тарифа"}</div>
                              </div>
                              <Select
                                value={simActionMap[item.phone] ?? "create"}
                                onValueChange={(value) =>
                                  setSimActionMap((prev) => ({ ...prev, [item.phone]: value as SimAction }))
                                }
                              >
                                <SelectTrigger className="w-32">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="create">Добавить</SelectItem>
                                  <SelectItem value="skip">Пропустить</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {importPreview.missingTariffs.length ? (
                      <div className="space-y-3">
                        <div className="text-sm font-medium">Тарифы (нет в базе)</div>
                        <div className="grid gap-2 md:grid-cols-2">
                          {importPreview.missingTariffs.map((item) => (
                            <div key={`${item.operatorId}:${item.tariffName}`} className="rounded border border-border p-3 text-sm">
                              <div className="font-medium">{item.tariffName}</div>
                              <div className="text-xs text-muted-foreground">{item.operatorName}</div>
                              <Input
                                className="mt-2"
                                type="number"
                                min={0}
                                step={100}
                                placeholder="Абонентская плата (опционально)"
                                value={tariffOverrides[`${item.operatorId}:${item.tariffName}`] ?? 0}
                                onChange={(event) =>
                                  setTariffOverrides((prev) => ({
                                    ...prev,
                                    [`${item.operatorId}:${item.tariffName}`]: Number(event.target.value),
                                  }))
                                }
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}

                {importPreview && (
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setImportOpen(false)}>
                      Закрыть
                    </Button>
                    <Button onClick={handleImportApply} disabled={!canApplyImport || importBusy}>
                      {importBusy ? "Применение..." : "Применить"}
                    </Button>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Внести расходы
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Новый расход</DialogTitle>
                <DialogDescription>Добавьте сумму за выбранный период и договор.</DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form className="grid grid-cols-1 md:grid-cols-2 gap-4" onSubmit={form.handleSubmit(onSubmit)}>
                  <FormField
                    control={form.control}
                    name="contract"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Договор</FormLabel>
                        <FormControl>
                          <Select
                            value={contractSelect}
                            onValueChange={(value) => {
                              setContractSelect(value);
                              if (value === "__custom") {
                                field.onChange("");
                                return;
                              }
                              const selected = contracts.find((c) => c.id === value);
                              if (selected) {
                                field.onChange(selected.number);
                                form.setValue("companyId", selected.companyId);
                                form.setValue("operator", selected.operator);
                              }
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Выберите договор или введите" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__custom">Свободный ввод</SelectItem>
                              {contracts.map((c) => (
                                <SelectItem key={c.id} value={c.id}>
                                  {c.number} · {c.company}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormControl>
                        {contractSelect === "__custom" ? (
                          <Input
                            className="mt-2"
                            placeholder="МТС-2025/001"
                            value={field.value || ""}
                            onChange={field.onChange}
                          />
                        ) : null}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="companyId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Компания</FormLabel>
                        <FormControl>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <SelectTrigger>
                              <SelectValue placeholder="Выберите компанию" />
                            </SelectTrigger>
                            <SelectContent>
                              {companies.map((c) => (
                                <SelectItem key={c.id} value={c.id}>
                                  {c.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="operator"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Оператор</FormLabel>
                        <FormControl>
                          <Input placeholder="МТС, Билайн..." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                <FormField
                  control={form.control}
                  name="month"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Период</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className="w-full justify-start text-left font-normal"
                            onClick={(e) => e.preventDefault()}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {formatRange(createRange)}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="range"
                            numberOfMonths={2}
                            selected={createRange}
                            onSelect={(range) => {
                              if (!range?.from) return;
                              // Ограничение до 1 года
                              const to = range.to ?? range.from;
                              const maxTo = addDays(range.from, 365);
                              const clampedRange: DateRange = {
                                from: range.from,
                                to: to > maxTo ? maxTo : to,
                              };
                              setCreateRange(clampedRange);
                              field.onChange(formatRange(clampedRange));
                            }}
                            defaultMonth={createRange?.from ?? today}
                          />
                          <div className="flex items-center justify-between px-4 pb-3 pt-2 text-xs text-muted-foreground">
                            <span>От 1 дня до 1 года</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const preset: DateRange = { from: addDays(today, -30), to: today };
                                setCreateRange(preset);
                                field.onChange(formatRange(preset));
                              }}
                            >
                              Последние 30 дней
                            </Button>
                          </div>
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                  <FormField
                    control={form.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Тип расхода</FormLabel>
                        <FormControl>
                          <Input placeholder="Мобильная связь, Интернет..." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="amount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Сумма без НДС, RUB</FormLabel>
                        <FormControl>
                          <Input type="number" min={0} step={100} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="vat"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>НДС, RUB</FormLabel>
                        <FormControl>
                          <Input type="number" min={0} step={100} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="md:col-span-2 flex justify-end gap-2 pt-2">
                    <Button variant="outline" type="button" onClick={() => setOpen(false)}>
                      Отмена
                    </Button>
                    <Button type="submit">Сохранить</Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      }
    >
      {/* Filters */}
      <div className="flex items-center gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Поиск по договору, оператору..."
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        
        <Select value={periodFilter} onValueChange={setPeriodFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Период" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все периоды</SelectItem>
            {[...new Set(expenses.map((e) => e.month))].map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={companyFilter} onValueChange={setCompanyFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Компания" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все компании</SelectItem>
            {companies.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button variant="outline" size="icon">
          <Filter className="h-4 w-4" />
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="stat-card">
          <p className="stat-label">Всего за период</p>
          <p className="stat-value">{filteredSummary.total.toLocaleString("ru-RU")} RUB</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Строк расходов</p>
          <p className="stat-value">{filteredExpenses.length}</p>
        </div>
      </div>

      {/* Table */}
      <div className="stat-card p-0 overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th>Договор</th>
              <th>Компания</th>
              <th>Оператор</th>
              <th>SIM</th>
              <th>Период</th>
              <th>Сумма (с НДС)</th>
              <th className="w-12"></th>
            </tr>
          </thead>
          <tbody>
            {filteredExpenses.map((expense) => {
              return (
              <tr
                key={expense.id}
                className="cursor-pointer"
                onClick={() => setViewExpense(expense)}
              >
                <td>
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-warning/10">
                      <Receipt className="h-4 w-4 text-warning" />
                    </div>
                    <span className="font-medium">{expense.contract || "-"}</span>
                  </div>
                </td>
                <td>{expense.company}</td>
                <td>{expense.operator || "-"}</td>
                <td>{expense.simNumber || "-"}</td>
                <td>{expense.month}</td>
                <td className="font-medium">{expense.total.toLocaleString("ru-RU")} RUB</td>
                <td>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setViewExpense(expense)}>
                          <Eye className="h-4 w-4 mr-2" />
                          Просмотр
                        </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => {
                          setEditExpense(expense);
                          setEditOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4 mr-2" />
                        Редактировать
                      </DropdownMenuItem>
                        <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onSelect={() => {
                          if (window.confirm("Удалить расход?")) {
                            deleteExpense(expense.id);
                            toast({ title: "Расход удален" });
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Удалить
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            );
            })}
          </tbody>
        </table>
      </div>

      {/* Просмотр */}
      <Dialog open={!!viewExpense} onOpenChange={(open) => !open && setViewExpense(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Просмотр расхода</DialogTitle>
            <DialogDescription>Исходные данные по расходу.</DialogDescription>
          </DialogHeader>
          {viewExpense && (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Договор</span>
                <span className="font-medium">{viewExpense.contract || "-"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Компания</span>
                <span className="font-medium">{viewExpense.company}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Оператор</span>
                <span className="font-medium">{viewExpense.operator || "-"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">SIM</span>
                <span className="font-medium">{viewExpense.simNumber || "-"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Период</span>
                <span className="font-medium">{viewExpense.month}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Тип</span>
                <span className="font-medium">{viewExpense.type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Сумма без НДС</span>
                <span className="font-medium">{viewExpense.amount.toLocaleString("ru-RU")} RUB</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">НДС</span>
                <span className="font-medium">{viewExpense.vat.toLocaleString("ru-RU")} RUB</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Итого</span>
                <span className="font-medium">{viewExpense.total.toLocaleString("ru-RU")} RUB</span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Редактирование */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Редактировать расход</DialogTitle>
            <DialogDescription>Обновите данные и сохраните.</DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form className="grid grid-cols-1 md:grid-cols-2 gap-4" onSubmit={editForm.handleSubmit(onEditSubmit)}>
              <FormField
                control={editForm.control}
                name="contract"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Договор</FormLabel>
                    <FormControl>
                      <Select
                        value={editContractSelect}
                        onValueChange={(value) => {
                          setEditContractSelect(value);
                          if (value === "__custom") {
                            field.onChange("");
                            return;
                          }
                          const selected = contracts.find((c) => c.id === value);
                          if (selected) {
                            field.onChange(selected.number);
                            editForm.setValue("companyId", selected.companyId);
                            editForm.setValue("operator", selected.operator);
                          }
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Выберите договор или введите" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__custom">Свободный ввод</SelectItem>
                          {contracts.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.number} · {c.company}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormControl>
                    {editContractSelect === "__custom" ? (
                      <Input
                        className="mt-2"
                        placeholder="МТС-2025/001"
                        value={field.value || ""}
                        onChange={field.onChange}
                      />
                    ) : null}
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="companyId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Компания</FormLabel>
                    <FormControl>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger>
                          <SelectValue placeholder="Выберите компанию" />
                        </SelectTrigger>
                        <SelectContent>
                          {companies.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="operator"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Оператор</FormLabel>
                    <FormControl>
                      <Input placeholder="МТС, Билайн..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
                <FormField
                  control={editForm.control}
                  name="month"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Период</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className="w-full justify-start text-left font-normal"
                            onClick={(e) => e.preventDefault()}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {formatRange(editRange, editExpense?.month ?? "Выберите период")}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="range"
                            numberOfMonths={2}
                            selected={editRange}
                            onSelect={(range) => {
                              if (!range?.from) return;
                              const to = range.to ?? range.from;
                              const maxTo = addDays(range.from, 365);
                              const clampedRange: DateRange = {
                                from: range.from,
                                to: to > maxTo ? maxTo : to,
                              };
                              setEditRange(clampedRange);
                              field.onChange(formatRange(clampedRange));
                            }}
                            defaultMonth={editRange?.from ?? today}
                          />
                          <div className="flex items-center justify-between px-4 pb-3 pt-2 text-xs text-muted-foreground">
                            <span>От 1 дня до 1 года</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const preset: DateRange = { from: addDays(today, -30), to: today };
                                setEditRange(preset);
                                field.onChange(formatRange(preset));
                              }}
                            >
                              Последние 30 дней
                            </Button>
                          </div>
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              <FormField
                control={editForm.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Тип расхода</FormLabel>
                    <FormControl>
                      <Input placeholder="Мобильная связь, Интернет..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Сумма без НДС, RUB</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} step={100} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="vat"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>НДС, RUB</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} step={100} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="md:col-span-2 flex justify-end gap-2 pt-2">
                <Button variant="outline" type="button" onClick={() => setEditOpen(false)}>
                  Отмена
                </Button>
                <Button type="submit">Сохранить</Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
};

export default Expenses;
