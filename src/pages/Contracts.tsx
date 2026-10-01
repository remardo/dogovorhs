import React, { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import MainLayout from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, MoreHorizontal, FileText, Eye, Pencil, Trash2, Archive } from "lucide-react";
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
import {
  useContracts,
  useEmployees,
  useExpenses,
  useInvoices,
  useSimCards,
  type Contract,
  type SimCard,
} from "@/lib/backend";
import { expenseTotal, isAllocation, isVoided } from "@/lib/expenseAccounting";
import { ErrorBlock, LoadingBlock, EmptyBlock } from "@/components/QueryState";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { toast } from "@/hooks/use-toast";

const NONE = "__none";

const STABLE_CATEGORIES = ["Мобильная связь", "Интернет", "Телефония"];

const formSchema = z.object({
  number: z.string().min(3, "Введите номер договора"),
  name: z.string().optional(),
  companyId: z.string().min(1, "Выберите компанию"),
  operatorId: z.string().min(1, "Выберите оператора"),
  type: z.string().min(2, "Укажите категорию"),
  status: z.enum(["active", "closing", "archived"]),
  startDate: z.string().min(4, "Укажите дату начала"),
  endDate: z.string().min(1, "Укажите дату окончания или 'Бессрочный'"),
  monthlyFee: z.coerce.number().min(0, "Сумма не может быть отрицательной"),
  simCount: z.coerce.number().min(0, "Количество SIM не может быть отрицательным"),
  responsibleEmployeeId: z.string().optional(),
  connectionAddress: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Не удалось сохранить";
}

const Contracts = () => {
  const { items: contracts, companies, operators, isLoading, error, createContract, updateContract, archiveContract, deleteContract } = useContracts();
  const { items: simCards, tariffs, updateSimCard } = useSimCards();
  const { items: expenses } = useExpenses({includeVoided:true});
  const { items: invoices } = useInvoices();
  const employees = useEmployees();
  const [searchParams, setSearchParams] = useSearchParams();
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveReason, setArchiveReason] = useState("");
  const [editContract, setEditContract] = useState<Contract | null>(null);
  const [archiveContractItem, setArchiveContractItem] = useState<Contract | null>(null);
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [operatorFilter, setOperatorFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const idParam = searchParams.get("id");
  const viewContract = contracts.find((c) => c.id === idParam) ?? null;

  const openCard = (id: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("id", id);
      return next;
    }, { replace: true });
  };
  const closeCard = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("id");
      return next;
    }, { replace: true });
  };

  const categoryOptions = React.useMemo(() => {
    const set = new Set<string>(STABLE_CATEGORIES);
    for (const c of contracts) {
      const cat = (c.serviceCategory ?? c.type)?.trim();
      if (cat) set.add(cat);
    }
    return [...set];
  }, [contracts]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      number: "",
      name: "",
      companyId: companies[0]?.id ?? "",
      operatorId: operators[0]?.id ?? "",
      type: "Мобильная связь",
      status: "active",
      startDate: "",
      endDate: "Бессрочный",
      monthlyFee: 0,
      simCount: 0,
      responsibleEmployeeId: NONE,
      connectionAddress: "",
    },
  });

  const editForm = useForm<FormValues>({
    resolver: zodResolver(formSchema),
  });

  // Подхватываем опции после загрузки.
  const companyId = form.watch("companyId");
  const operatorId = form.watch("operatorId");
  const editCompanyId = editForm.watch("companyId");

  useEffect(() => {
    if (!companyId && companies[0]) {
      form.setValue("companyId", companies[0].id);
    }
    if (!operatorId && operators[0]) {
      form.setValue("operatorId", operators[0].id);
    }
  }, [companyId, companies, form, operatorId, operators]);

  useEffect(() => {
    setSearch(searchParams.get("q") ?? "");
    const presetCompany = searchParams.get("company");
    if (presetCompany) setCompanyFilter(presetCompany);
  }, [searchParams]);

  const onSubmit = async (values: FormValues) => {
    try {
      await createContract({
        ...values,
        serviceCategory: values.type,
        responsibleEmployeeId: values.responsibleEmployeeId === NONE ? undefined : values.responsibleEmployeeId,
      });
      toast({ title: "Договор сохранен" });
      setOpen(false);
      form.reset();
    } catch (e) {
      toast({ title: "Не сохранено", description: errorMessage(e), variant: "destructive" });
    }
  };

  const onEditSubmit = async (values: FormValues) => {
    if (!editContract) return;
    try {
      await updateContract({
        ...editContract,
        ...values,
        serviceCategory: values.type,
        company: editContract.company,
        operator: editContract.operator,
        responsibleEmployeeId: values.responsibleEmployeeId === NONE ? undefined : values.responsibleEmployeeId,
      });
      toast({ title: "Договор обновлен" });
      setEditOpen(false);
    } catch (e) {
      toast({ title: "Не сохранено", description: errorMessage(e), variant: "destructive" });
    }
  };

  const openEdit = (contract: Contract) => {
    setEditContract(contract);
    editForm.reset({
      number: contract.number,
      name: contract.name ?? "",
      companyId: contract.companyId,
      operatorId: contract.operatorId,
      type: contract.serviceCategory ?? contract.type,
      status: contract.status,
      startDate: contract.startDate || "",
      endDate: contract.endDate || "",
      monthlyFee: contract.monthlyFee,
      simCount: contract.simCount,
      responsibleEmployeeId: contract.responsibleEmployeeId ?? NONE,
      connectionAddress: contract.connectionAddress ?? "",
    });
    setEditOpen(true);
  };

  const handleArchive = async () => {
    if (!archiveContractItem) return;
    try {
      await archiveContract(archiveContractItem.id, archiveReason);
      toast({ title: "Договор архивирован" });
      setArchiveOpen(false);
      setArchiveReason("");
      setArchiveContractItem(null);
    } catch (e) {
      toast({ title: "Не архивировано", description: errorMessage(e), variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Удалить договор? Используемые договоры удалять нельзя — сервер отклонит.")) return;
    try {
      await deleteContract(id);
      toast({ title: "Договор удален" });
    } catch (e) {
      toast({ title: "Не удалено", description: errorMessage(e), variant: "destructive" });
    }
  };

  const filteredContracts = React.useMemo(() => {
    return contracts.filter((c) => {
      const matchesSearch =
        c.number.toLowerCase().includes(search.toLowerCase()) ||
        c.type.toLowerCase().includes(search.toLowerCase()) ||
        (c.name ?? "").toLowerCase().includes(search.toLowerCase());
      const matchesCompany = companyFilter === "all" || c.companyId === companyFilter;
      const matchesOperator = operatorFilter === "all" || c.operatorId === operatorFilter;
      const matchesStatus = statusFilter === "all" || c.status === statusFilter;
      return matchesSearch && matchesCompany && matchesOperator && matchesStatus;
    });
  }, [contracts, search, companyFilter, operatorFilter, statusFilter]);

  const handleSimTariffChange = async (sim: SimCard, value: string) => {
    try {
      const tariffId = value === NONE ? undefined : value;
      const tariffName = tariffs.find((t) => t.id === value)?.name ?? "";
      await updateSimCard({
        ...sim,
        tariffId,
        tariff: tariffId ? tariffName : "",
      });
      toast({ title: "Тариф SIM обновлен" });
    } catch (e) {
      toast({ title: "Не обновлено", description: errorMessage(e), variant: "destructive" });
    }
  };

  // SIM: explicit contractId match first; legacy rows (no contractId) fall back
  // to company+operator match and are labelled as such.
  const { contractSimCards, simFallback } = React.useMemo(() => {
    if (!viewContract) return { contractSimCards: [] as SimCard[], simFallback: false };
    const direct = simCards.filter((sim) => sim.contractId === viewContract.id);
    if (direct.length > 0) return { contractSimCards: direct, simFallback: false };
    return {
      contractSimCards: simCards.filter(
        (sim) => !sim.contractId && sim.companyId === viewContract.companyId && sim.operatorId === viewContract.operatorId,
      ),
      simFallback: true,
    };
  }, [simCards, viewContract]);

  // Linked rows for this contract: charges (document totals) separate from
  // allocation detail rows (per-number slices) to avoid any double count.
  const contractExpenses = React.useMemo(() => {
    if (!viewContract) return [];
    return expenses.filter((e) =>
      e.contractId ? e.contractId === viewContract.id : e.contract === viewContract.number && e.companyId===viewContract.companyId && e.operator===viewContract.operator,
    );
  }, [expenses, viewContract]);
  const contractCharges = React.useMemo(
    () => contractExpenses.filter((e) => !isAllocation(e)),
    [contractExpenses],
  );
  const contractAllocations = React.useMemo(
    () => contractExpenses.filter((e) => isAllocation(e)),
    [contractExpenses],
  );
  const contractChargesTotal = React.useMemo(
    () => contractCharges.filter((e) => !isVoided(e)).reduce((s, e) => s + expenseTotal(e), 0),
    [contractCharges],
  );
  const contractAllocTotal = React.useMemo(
    () => contractAllocations.filter((e) => !isVoided(e)).reduce((s, e) => s + expenseTotal(e), 0),
    [contractAllocations],
  );

  const contractInvoices = React.useMemo(() => {
    if (!viewContract) return [];
    return invoices.filter((inv) =>
      inv.contractId ? inv.contractId === viewContract.id : inv.contractNumber === viewContract.number && inv.companyId===viewContract.companyId && inv.operator===viewContract.operator,
    );
  }, [invoices, viewContract]);

  const responsibleName = viewContract?.responsibleEmployeeId
    ? employees.find((e) => e.id === viewContract.responsibleEmployeeId)?.name ?? viewContract.responsibleEmployee ?? "—"
    : (viewContract?.responsibleEmployee ?? null);

  const editEmployees = employees.filter((e) => !editCompanyId || e.companyId === editCompanyId);
  const createEmployees = employees.filter((e) => !companyId || e.companyId === companyId);

  return (
    <MainLayout
      title="Договоры связи"
      subtitle="Управление договорами с операторами связи"
      actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Добавить договор
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Новый договор</DialogTitle>
              <DialogDescription>Заполните данные договора, чтобы добавить его в систему.</DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form className="grid grid-cols-1 md:grid-cols-2 gap-4" onSubmit={form.handleSubmit(onSubmit)}>
              <FormField
                control={form.control}
                name="number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Номер договора</FormLabel>
                    <FormControl>
                      <Input placeholder="Напр. МТС-2025/001" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Название (для интернета)</FormLabel>
                    <FormControl>
                      <Input placeholder="Канал 100 Мбит, офис 1" {...field} />
                    </FormControl>
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
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <SelectTrigger>
                            <SelectValue placeholder="Выберите компанию" />
                          </SelectTrigger>
                          <SelectContent>
                            {companies.map((company) => (
                              <SelectItem key={company.id} value={company.id}>
                                {company.name}
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
                  name="operatorId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Оператор</FormLabel>
                      <FormControl>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <SelectTrigger>
                            <SelectValue placeholder="Выберите оператора" />
                          </SelectTrigger>
                          <SelectContent>
                            {operators.map((operator) => (
                              <SelectItem key={operator.id} value={operator.id}>
                                {operator.name}
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
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Категория услуги</FormLabel>
                      <FormControl>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <SelectTrigger>
                            <SelectValue placeholder="Категория" />
                          </SelectTrigger>
                          <SelectContent>
                            {categoryOptions.map((cat) => (
                              <SelectItem key={cat} value={cat}>
                                {cat}
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
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Статус</FormLabel>
                      <FormControl>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <SelectTrigger>
                            <SelectValue placeholder="Статус" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="active">Активен</SelectItem>
                            <SelectItem value="closing">На расторжении</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="responsibleEmployeeId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ответственный (опц.)</FormLabel>
                      <FormControl>
                        <Select onValueChange={field.onChange} value={field.value ?? NONE}>
                          <SelectTrigger>
                            <SelectValue placeholder="Не назначен" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE}>Не назначен</SelectItem>
                            {createEmployees.map((e) => (
                              <SelectItem key={e.id} value={e.id}>
                                {e.name}
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
                  name="connectionAddress"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Адрес подключения (опц.)</FormLabel>
                      <FormControl>
                        <Input placeholder="Офис, адрес канала" {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="startDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Начало действия</FormLabel>
                      <FormControl>
                        <Input placeholder="01.01.2025" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="endDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Окончание</FormLabel>
                      <FormControl>
                        <Input placeholder="Бессрочный" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="monthlyFee"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Абонплата, ₽/мес</FormLabel>
                      <FormControl>
                        <Input type="number" min={0} step={100} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="simCount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Количество SIM</FormLabel>
                      <FormControl>
                        <Input type="number" min={0} step={1} {...field} />
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
      }
    >
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <div className="relative flex-1 min-w-52 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Поиск по номеру/типу..."
            aria-label="Поиск договоров"
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <Select value={companyFilter} onValueChange={setCompanyFilter}>
          <SelectTrigger className="w-48" aria-label="Фильтр по компании">
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

        <Select value={operatorFilter} onValueChange={setOperatorFilter}>
          <SelectTrigger className="w-48" aria-label="Фильтр по оператору">
            <SelectValue placeholder="Оператор" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все операторы</SelectItem>
            {operators.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40" aria-label="Фильтр по статусу">
            <SelectValue placeholder="Статус" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все статусы</SelectItem>
            <SelectItem value="active">Активен</SelectItem>
            <SelectItem value="closing">На расторжении</SelectItem>
            <SelectItem value="closed">Закрыт</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <LoadingBlock text="Загрузка договоров…" />
      ) : error ? (
        <ErrorBlock message={error} />
      ) : filteredContracts.length === 0 ? (
        <EmptyBlock text="Договоры не найдены" />
      ) : (
      <div className="stat-card p-0 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="data-table min-w-250">
          <thead>
            <tr>
              <th>Номер договора</th>
              <th>Название</th>
              <th>Компания</th>
              <th>Оператор</th>
              <th>Тип</th>
              <th>Статус</th>
              <th>Действует до</th>
              <th>Абонплата</th>
              <th>SIM</th>
              <th className="w-12"><span className="sr-only">Действия</span></th>
            </tr>
          </thead>
          <tbody>
            {filteredContracts.map((contract) => (
              <tr
                key={contract.id}
                className="cursor-pointer"
                onClick={() => openCard(contract.id)}
              >
                <td>
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                      <FileText className="h-4 w-4 text-primary" />
                    </div>
                    <Link
                      to={`/contracts?id=${encodeURIComponent(contract.id)}`}
                      className="font-medium hover:underline focus-visible:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {contract.number}
                    </Link>
                  </div>
                </td>
                <td>{contract.name || "-"}</td>
                <td>{contract.company}</td>
                <td>{contract.operator}</td>
                <td>
                  <span className="text-muted-foreground">{contract.type}</span>
                </td>
                <td>
                  <span className={contract.status === "active" ? "badge-active" : contract.status === "archived" ? "badge-inactive" : "badge-warning"}>
                    {contract.status === "active" ? "Активен" : contract.status === "archived" ? "В архиве" : "Расторжение"}
                  </span>
                </td>
                <td>{contract.endDate}</td>
                <td className="font-medium">{contract.monthlyFee.toLocaleString("ru-RU")} ₽{contract.feeBasis === "invoiceEstimate" && <span className="block text-xs text-muted-foreground">по счёту, не фиксированная абонплата</span>}</td>
                <td title={contract.simCount !== (contract.computedSimCount ?? contract.simCount) ? `Учётный счётчик: ${contract.simCount}` : undefined}>
                  {(contract.computedSimCount ?? contract.simCount) > 0 ? (contract.computedSimCount ?? contract.simCount) : "-"}
                </td>
                <td>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label={`Действия с договором ${contract.number}`}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => openCard(contract.id)}>
                        <Eye className="h-4 w-4 mr-2" />
                        Просмотр
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => openEdit(contract)}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Редактировать
                      </DropdownMenuItem>
                      {contract.status !== "archived" && (
                        <DropdownMenuItem
                          onSelect={() => {
                            setArchiveContractItem(contract);
                            setArchiveReason("");
                            setArchiveOpen(true);
                          }}
                        >
                          <Archive className="h-4 w-4 mr-2" />
                          Архивировать
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onSelect={() => handleDelete(contract.id)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Удалить
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
      )}

      {/* Просмотр */}
      <Dialog open={idParam !== null} onOpenChange={(open) => !open && closeCard()}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Просмотр договора</DialogTitle>
            <DialogDescription>Условия, подключения, счета и начисления.</DialogDescription>
          </DialogHeader>
          {!viewContract ? (
            <EmptyBlock text={isLoading ? "Загрузка…" : "Договор не найден"} />
          ) : (
            <div className="space-y-6 text-sm">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Номер</span>
                  <span className="font-medium">{viewContract.number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Название</span>
                  <span className="font-medium">{viewContract.name || "-"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Компания</span>
                  <span className="font-medium">{viewContract.company}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Оператор</span>
                  <span className="font-medium">{viewContract.operator}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Категория</span>
                  <span className="font-medium">{viewContract.serviceCategory || viewContract.type}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Статус</span>
                  <span className="font-medium">
                    {viewContract.status === "active" ? "Активен" : viewContract.status === "archived" ? `В архиве${viewContract.archiveReason ? ` (${viewContract.archiveReason})` : ""}` : "На расторжении"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Начало</span>
                  <span className="font-medium">{viewContract.dateBasis === "unknown" ? "Не подтверждена договором" : viewContract.startDate || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Окончание</span>
                  <span className="font-medium">{viewContract.endDateBasis === "unknown" ? "Не подтверждена договором" : viewContract.endDate || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Абонплата</span>
                  <span className="font-medium">{viewContract.monthlyFee.toLocaleString("ru-RU")} ₽{viewContract.feeBasis === "invoiceEstimate" && <span className="block text-xs text-muted-foreground">сумма счёта; фиксированная абонплата не установлена</span>}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Начислено (без детализации)</span>
                  <span className="font-medium">{contractChargesTotal.toLocaleString("ru-RU")} ₽</span>
                </div>
                {responsibleName && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Ответственный</span>
                    <span className="font-medium">{responsibleName}</span>
                  </div>
                )}
                {viewContract.connectionAddress && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Адрес подключения</span>
                    <span className="font-medium">{viewContract.connectionAddress}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">SIM по связям</span>
                  <span className="font-medium">{viewContract.computedSimCount ?? "—"}</span>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">Подключенные SIM-карты</div>
                  <div className="text-xs text-muted-foreground">Найдено: {contractSimCards.length}</div>
                </div>
                {simFallback && contractSimCards.length > 0 && (
                  <div className="text-xs text-muted-foreground">
                    Прямая связь SIM → договор ещё не заполнена: показаны номера той же компании и оператора.
                  </div>
                )}
                {contractSimCards.length ? (
                  <div className="max-h-72 overflow-auto rounded-md border border-border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40 text-xs text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">Номер</th>
                          <th className="px-3 py-2 text-left font-medium">Тариф</th>
                          <th className="px-3 py-2 text-left font-medium">Статус</th>
                          <th className="px-3 py-2 text-left font-medium">Сотрудник</th>
                        </tr>
                      </thead>
                      <tbody>
                        {contractSimCards.map((sim) => (
                          <tr key={sim.id} className="border-t border-border">
                            <td className="px-3 py-2">
                              <Link to={`/sim-cards?id=${encodeURIComponent(sim.id)}`} className="hover:underline focus-visible:underline">
                                {sim.number}
                              </Link>
                            </td>
                            <td className="px-3 py-2">
                              <Select
                                value={sim.tariffId ?? NONE}
                                onValueChange={(value) => handleSimTariffChange(sim, value)}
                              >
                                <SelectTrigger className="h-8" aria-label={`Тариф номера ${sim.number}`}>
                                  <SelectValue placeholder="Без тарифа" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value={NONE}>Без тарифа</SelectItem>
                                  {tariffs.map((t) => (
                                    <SelectItem key={t.id} value={t.id}>
                                      {t.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="px-3 py-2">
                              {sim.status === "active" ? "Активна" : "Заблокирована"}
                            </td>
                            <td className="px-3 py-2">{sim.employee || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                    SIM-карты не найдены для этого договора.
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">Счета по договору</div>
                  <div className="text-xs text-muted-foreground">Найдено: {contractInvoices.length}</div>
                </div>
                {contractInvoices.length ? (
                  <div className="max-h-72 overflow-auto rounded-md border border-border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40 text-xs text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">Счёт</th>
                          <th className="px-3 py-2 text-left font-medium">Период</th>
                          <th className="px-3 py-2 text-right font-medium">Сумма</th>
                          <th className="px-3 py-2 text-left font-medium">Файл</th>
                        </tr>
                      </thead>
                      <tbody>
                        {contractInvoices.map((inv) => (
                          <tr key={inv.id} className="border-t border-border">
                            <td className="px-3 py-2">
                              <Link to={`/invoices?id=${encodeURIComponent(inv.id)}`} className="hover:underline focus-visible:underline">
                                {inv.invoiceNo || inv.fileName}
                              </Link>
                              <div className="text-xs text-muted-foreground">{inv.kind === "detail" ? "Детализация" : "Счёт"}</div>
                            </td>
                            <td className="px-3 py-2">{inv.month || `${inv.periodStart} — ${inv.periodEnd}`}</td>
                            <td className="px-3 py-2 text-right font-medium">{inv.total.toLocaleString("ru-RU")} ₽</td>
                            <td className="px-3 py-2">
                              {inv.fileUrl ? (
                                <a href={inv.fileUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                                  Открыть
                                </a>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                    Счета не привязаны к договору.
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">Начисления по договору (стоимость услуг)</div>
                  <div className="text-xs text-muted-foreground">
                    Строк: {contractCharges.length} · Итого: {contractChargesTotal.toLocaleString("ru-RU")} ₽
                  </div>
                </div>
                {contractCharges.length ? (
                  <div className="max-h-72 overflow-auto rounded-md border border-border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40 text-xs text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">Период</th>
                          <th className="px-3 py-2 text-left font-medium">Тип</th>
                          <th className="px-3 py-2 text-right font-medium">Итого</th>
                          <th className="px-3 py-2 text-left font-medium">Документ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {contractCharges.map((e) => (
                          <tr key={e.id} className="border-t border-border">
                            <td className="px-3 py-2">{e.periodKey || e.month}</td>
                            <td className="px-3 py-2">{e.serviceCategory || e.type}</td>
                            <td className="px-3 py-2 text-right font-medium">{expenseTotal(e).toLocaleString("ru-RU")} ₽</td>
                            <td className="px-3 py-2">
                              {e.invoiceId ? (
                                <Link to={`/invoices?id=${encodeURIComponent(e.invoiceId)}`} className="text-primary hover:underline">
                                  Счёт
                                </Link>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                    Начислений нет.
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">Распределение по номерам (детализация, в итог не входит)</div>
                  <div className="text-xs text-muted-foreground">
                    Строк: {contractAllocations.length} · Итого: {contractAllocTotal.toLocaleString("ru-RU")} ₽
                  </div>
                </div>
                {contractAllocations.length ? (
                  <div className="max-h-72 overflow-auto rounded-md border border-border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40 text-xs text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">Период</th>
                          <th className="px-3 py-2 text-left font-medium">Номер</th>
                          <th className="px-3 py-2 text-right font-medium">Итого</th>
                          <th className="px-3 py-2 text-left font-medium">Документ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {contractAllocations.map((e) => (
                          <tr key={e.id} className="border-t border-border">
                            <td className="px-3 py-2">{e.periodKey || e.month}</td>
                            <td className="px-3 py-2">
                              {e.simCardId ? (
                                <Link to={`/sim-cards?id=${encodeURIComponent(e.simCardId)}`} className="text-primary hover:underline">
                                  {e.simNumber || "Номер"}
                                </Link>
                              ) : (
                                (e.simNumber || "—")
                              )}
                            </td>
                            <td className="px-3 py-2 text-right font-medium">{expenseTotal(e).toLocaleString("ru-RU")} ₽</td>
                            <td className="px-3 py-2">
                              {e.invoiceId ? (
                                <Link to={`/invoices?id=${encodeURIComponent(e.invoiceId)}`} className="text-primary hover:underline">
                                  Счёт
                                </Link>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                    Детализации нет.
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      {/* Архивирование */}
      <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Архивировать договор</DialogTitle>
            <DialogDescription>
              {archiveContractItem ? `Договор ${archiveContractItem.number} будет переведён в архив. История и документы сохраняются.` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              placeholder="Причина архивирования (обязательно)"
              aria-label="Причина архивирования"
              value={archiveReason}
              onChange={(e) => setArchiveReason(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setArchiveOpen(false)}>
              Отмена
            </Button>
            <Button onClick={handleArchive}>Архивировать</Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* Редактирование */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Редактировать договор</DialogTitle>
            <DialogDescription>Измените поля и сохраните.</DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form className="grid grid-cols-1 md:grid-cols-2 gap-4" onSubmit={editForm.handleSubmit(onEditSubmit)}>
              <FormField
                control={editForm.control}
                name="number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Номер договора</FormLabel>
                    <FormControl>
                      <Input placeholder="Напр. МТС-2025/001" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Название (для интернета)</FormLabel>
                    <FormControl>
                      <Input placeholder="Канал 100 Мбит, офис 1" {...field} />
                    </FormControl>
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
                          {companies.map((company) => (
                            <SelectItem key={company.id} value={company.id}>
                              {company.name}
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
                name="operatorId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Оператор</FormLabel>
                    <FormControl>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger>
                          <SelectValue placeholder="Выберите оператора" />
                        </SelectTrigger>
                        <SelectContent>
                          {operators.map((operator) => (
                            <SelectItem key={operator.id} value={operator.id}>
                              {operator.name}
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
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Категория услуги</FormLabel>
                    <FormControl>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger>
                          <SelectValue placeholder="Категория" />
                        </SelectTrigger>
                        <SelectContent>
                          {categoryOptions.map((cat) => (
                            <SelectItem key={cat} value={cat}>
                              {cat}
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
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Статус</FormLabel>
                    <FormControl>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger>
                          <SelectValue placeholder="Статус" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Активен</SelectItem>
                          <SelectItem value="closing">На расторжении</SelectItem>
                          <SelectItem value="archived">В архиве</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="responsibleEmployeeId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ответственный (опц.)</FormLabel>
                    <FormControl>
                      <Select onValueChange={field.onChange} value={field.value ?? NONE}>
                        <SelectTrigger>
                          <SelectValue placeholder="Не назначен" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>Не назначен</SelectItem>
                          {editEmployees.map((e) => (
                            <SelectItem key={e.id} value={e.id}>
                              {e.name}
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
                name="connectionAddress"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Адрес подключения (опц.)</FormLabel>
                    <FormControl>
                      <Input placeholder="Офис, адрес канала" {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Начало действия</FormLabel>
                    <FormControl>
                      <Input placeholder="01.01.2025" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="endDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Окончание</FormLabel>
                    <FormControl>
                      <Input placeholder="Бессрочный" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="monthlyFee"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Абонплата, ₽/мес</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} step={100} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="simCount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Количество SIM</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} step={1} {...field} />
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

export default Contracts;
