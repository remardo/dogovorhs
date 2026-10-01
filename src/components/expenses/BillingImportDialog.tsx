import { extractPdfText } from "@/lib/pdfText";
import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Trash2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "@/hooks/use-toast";
import { api, convexClient, type ContractOption, type Id } from "@/lib/backend";
import type {
  CompanyConflict,
  ContractResolutionState,
  ImportHistoryItem,
  ImportPreview,
  SimAction,
} from "./importTypes";

type BillingImportDialogProps = {
  companies: ContractOption[];
  operators: ContractOption[];
  onApplied: () => Promise<void> | void;
  onClose: () => void;
};

const BillingImportDialog = ({ companies, operators, onApplied, onClose }: BillingImportDialogProps) => {
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
      const rows = await convexClient.query(api.billingImports.list, { limit: 20 });
      setImportHistory(
        rows.map((item) => ({
          _id: String(item._id),
          fileName: item.fileName,
          status: item.status,
          createdAt: item.createdAt,
          appliedAt: item.appliedAt,
          previewSummary: item.previewSummary,
          appliedSummary: item.appliedSummary,
        })),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось загрузить историю импорта";
      toast({ title: message, variant: "destructive" });
    } finally {
      setImportHistoryBusy(false);
    }
  }, []);

  React.useEffect(() => {
    loadImportHistory();
  }, [loadImportHistory]);

  const handleDeleteImport = async (id: string) => {
    if (!convexClient) return;
    if (!window.confirm("Удалить импорт и файл?")) return;
    try {
      await convexClient.mutation(api.billingImports.remove, { id: id as Id<"billingImports"> });
      await loadImportHistory();
      await onApplied();
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
      const { uploadUrl } = await convexClient.mutation(api.billingImports.requestUpload, {});
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
      const { storageId } = (await uploadResponse.json()) as { storageId: Id<"_storage"> };
      const saved = await convexClient.mutation(api.billingImports.saveUpload, {
        fileId: storageId,
        fileName: importFile.name,
      });
      setImportId(String(saved.importId));
      const preview = importFile.name.toLowerCase().endsWith(".pdf")
        ? await convexClient.action(api.billingImportActions.previewDetailText, {id:saved.importId as Id<"billingImports">,text:await extractPdfText(importFile)})
        : await convexClient.action(api.billingImportActions.preview, {id:saved.importId as Id<"billingImports">});
      const sanitizedRows = preview.rows.map((row) => ({
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
      setImportPreview({
        importId: String(preview.importId),
        fileName: preview.fileName,
        totals: preview.totals,
        missingContracts: preview.missingContracts,
        missingSimCards: preview.missingSimCards,
        missingTariffs: preview.missingTariffs,
        rows: sanitizedRows,
      });
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
        id: importId as Id<"billingImports">,
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
              ? { mode: "existing" as const, id: item.companyId as Id<"companies"> }
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
              ? { mode: "existing" as const, id: item.operatorId as Id<"operators"> }
              : {
                  mode: "create" as const,
                  name: item.operatorName || "",
                  type: item.operatorType || undefined,
                  manager: item.operatorManager || undefined,
                  phone: item.operatorPhone || undefined,
                  email: item.operatorEmail || undefined,
                },
          name: item.name || undefined,
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
          operatorId: item.operatorId as Id<"operators">,
          tariffName: item.tariffName,
          monthlyFee: tariffOverrides[`${item.operatorId}:${item.tariffName}`] || undefined,
        })),
      };
      const result = await convexClient.action(api.billingImportActions.apply, payload);
      if (result?.status === "needs_confirmation") {
        setCompanyConflicts((result.companyConflicts ?? []) as CompanyConflict[]);
        toast({ title: "Нужно подтвердить компании", description: "Выберите существующую или создайте новую." });
        return;
      }
      if (result?.status === "missing_contracts") {
        toast({ title: "Не хватает договоров", description: "Заполните данные для всех договоров." });
        return;
      }
      toast({ title: "Импорт применен", description: "Данные добавлены в расходы." });
      await onApplied();
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ошибка применения импорта";
      toast({ title: "Импорт не применен", description: message });
    } finally {
      setImportBusy(false);
    }
  };

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
        name: "",
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
    <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
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
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
              <Button onClick={handleImportPreview} disabled={importBusy || !importFile}>
                {importBusy ? "Загрузка..." : "Предпросмотр"}
              </Button>
              {importFile && (
                <span className="text-xs text-muted-foreground sm:max-w-[260px] truncate">
                  {importFile.name}
                </span>
              )}
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
                <thead className="bg-muted/40 text-xs text-muted-foreground sticky top-0 z-10">
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
                        <Input
                          placeholder="Название договора (для интернета)"
                          value={item.name ?? ""}
                          onChange={(event) =>
                            updateResolution(item.contractNumber, (prev) => ({
                              ...prev,
                              name: event.target.value,
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
            <Button variant="outline" onClick={onClose}>
              Закрыть
            </Button>
            <Button onClick={handleImportApply} disabled={!canApplyImport || importBusy}>
              {importBusy ? "Применение..." : "Применить"}
            </Button>
          </div>
        )}
      </div>
    </DialogContent>
  );
};

export default BillingImportDialog;
