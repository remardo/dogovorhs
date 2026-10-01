import React from "react";
import { Link, useSearchParams } from "react-router-dom";
import MainLayout from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, MoreHorizontal, Smartphone, Eye, Pencil, UserPlus, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import { useContracts, useEmployees, useExpenses, useInvoices, useSimCards, useSimHistory, type Expense, type SimCard } from "@/lib/backend";
import { expenseKindLabel, expenseTotal, isVoided } from "@/lib/expenseAccounting";
import { normalizePeriodKey, periodLabel } from "@/lib/servicePeriod";
import { filterSimCards, pickFirstOrNone } from "@/lib/simCardsUtils";
import { ErrorBlock, LoadingBlock, EmptyBlock } from "@/components/QueryState";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { toast } from "@/hooks/use-toast";

const NONE = "__none";

const normalizePhone = (value: string) => value.replace(/\D/g, "");
const canonicalPhone = (value: string) => {
  const normalized = normalizePhone(value);
  if (!normalized) return "";
  if (normalized.length === 11 && normalized.startsWith("7")) {
    return normalized.slice(1);
  }
  return normalized;
};
const phoneVariants = (value: string) => {
  const normalized = normalizePhone(value);
  if (!normalized) return [] as string[];
  if (normalized.length === 11 && normalized.startsWith("7")) {
    return [normalized, normalized.slice(1)];
  }
  if (normalized.length === 10) {
    return [normalized, `7${normalized}`];
  }
  return [normalized];
};

const formSchema = z.object({
  number: z.string().min(2, "Введите номер или идентификатор подключения"),
  iccid: z.string().optional(),
  type: z.string().min(2, "Укажите тип"),
  status: z.enum(["active", "blocked"]),
  companyId: z.string().min(1, "Выберите компанию").refine((v) => v !== NONE, "Выберите компанию"),
  operatorId: z.string().min(1, "Выберите оператора").refine((v) => v !== NONE, "Выберите оператора"),
  contractId: z.string().default(NONE),
  employeeId: z.string().default(NONE),
  tariffId: z.string().default(NONE),
  connectionAddress: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Не удалось сохранить";
}

const getStatusBadge = (status: string) => {
  switch (status) {
    case "active":
      return <span className="badge-active">Активен</span>;
    case "blocked":
      return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-destructive/15 text-destructive">Заблокирован</span>;
    default:
      return <span className="badge-inactive">{status}</span>;
  }
};

const SimCards = () => {
  const { items: simCards, companies, operators, employees, tariffs, isLoading, error, createSimCard, updateSimCard, assignSimCard, deleteSimCard } =
    useSimCards();
  const { items: expenses } = useExpenses({includeVoided:true});
  const { items: invoices } = useInvoices();
  const { items: contracts } = useContracts();
  const allEmployees = useEmployees();
  const [searchParams, setSearchParams] = useSearchParams();
  const [open, setOpen] = React.useState(false);
  const [editOpen, setEditOpen] = React.useState(false);
  const [editSim, setEditSim] = React.useState<SimCard | null>(null);
  const [search, setSearch] = React.useState(searchParams.get("q") ?? "");
  const [companyFilter, setCompanyFilter] = React.useState("all");
  const [operatorFilter, setOperatorFilter] = React.useState("all");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [typeFilter, setTypeFilter] = React.useState("all");
  const [viewTariffId, setViewTariffId] = React.useState(NONE);
  const [historyPeriod, setHistoryPeriod] = React.useState("__all");

  const idParam = searchParams.get("id");
  const viewSim = simCards.find((s) => s.id === idParam) ?? null;
  const { assignments: simAssignments, isLoading: assignmentsLoading } = useSimHistory(viewSim?.id);

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
    setHistoryPeriod("__all");
  };

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      number: "",
      iccid: "",
      type: "Голосовая",
      status: "active",
      companyId: pickFirstOrNone(companies, NONE),
      operatorId: pickFirstOrNone(operators, NONE),
      employeeId: NONE,
      tariffId: NONE,
    },
  });

  React.useEffect(() => {
    if ((form.getValues("companyId") === NONE || !form.getValues("companyId")) && companies[0]) {
      form.setValue("companyId", pickFirstOrNone(companies, NONE));
    }
    if ((form.getValues("operatorId") === NONE || !form.getValues("operatorId")) && operators[0]) {
      form.setValue("operatorId", pickFirstOrNone(operators, NONE));
    }
  }, [companies, operators, form]);

  React.useEffect(() => {
    setSearch(searchParams.get("q") ?? "");
    const presetCompany = searchParams.get("company");
    if (presetCompany) setCompanyFilter(presetCompany);
  }, [searchParams]);

  const onSubmit = async (values: FormValues) => {
    try {
      if (!values.companyId || values.companyId === NONE) {
        throw new Error("Выберите компанию");
      }
      if (!values.operatorId || values.operatorId === NONE) {
        throw new Error("Выберите оператора");
      }
      await createSimCard({
        ...values,
        contractId: values.contractId === NONE ? undefined : values.contractId,
        employeeId: values.employeeId === NONE ? undefined : values.employeeId,
        tariffId: values.tariffId === NONE ? undefined : values.tariffId,
      });
      toast({ title: "SIM-карта добавлена" });
      setOpen(false);
      form.reset({
        number: "",
        iccid: "",
        type: "Голосовая",
        status: "active",
        companyId: pickFirstOrNone(companies, NONE),
        operatorId: pickFirstOrNone(operators, NONE),
        employeeId: NONE,
        tariffId: NONE,
      });
    } catch (e) {
      toast({ title: "Не сохранено", description: errorMessage(e), variant: "destructive" });
    }
  };

  const editForm = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      number: "",
      iccid: "",
      type: "Голосовая",
      status: "active",
      companyId: companies[0]?.id ?? NONE,
      operatorId: operators[0]?.id ?? NONE,
      employeeId: NONE,
      tariffId: NONE,
    },
  });

  const openEdit = (sim: SimCard) => {
    setEditSim(sim);
    editForm.reset({
      number: sim.number,
      iccid: sim.iccid,
      type: sim.type,
      status: sim.status,
      companyId: sim.companyId || companies[0]?.id || "",
      operatorId: sim.operatorId || operators[0]?.id || "",
      contractId: sim.contractId ?? NONE,
      connectionAddress: sim.connectionAddress ?? "",
      employeeId: sim.employeeId ?? NONE,
      tariffId: sim.tariffId ?? NONE,
    });
    setEditOpen(true);
  };

  const onEditSubmit = async (values: FormValues) => {
    if (!editSim) return;
    try {
      await updateSimCard({
        ...editSim,
        ...values,
        companyId: values.companyId,
        operatorId: values.operatorId,
        contractId: values.contractId === NONE ? undefined : values.contractId,
        employeeId: values.employeeId === NONE ? undefined : values.employeeId,
        tariffId: values.tariffId === NONE ? undefined : values.tariffId,
      });
      toast({ title: "SIM-карта обновлена" });
      setEditOpen(false);
    } catch (e) {
      toast({ title: "Не сохранено", description: errorMessage(e), variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Удалить SIM-карту?")) return;
    try {
      await deleteSimCard(id);
      toast({ title: "SIM-карта удалена" });
    } catch (e) {
      toast({ title: "Не удалено", description: errorMessage(e), variant: "destructive" });
    }
  };

  const filteredSimCards = React.useMemo(
    () =>
      filterSimCards(simCards, {
        search,
        companyFilter,
        operatorFilter,
        statusFilter,
        typeFilter,
      }),
    [simCards, search, companyFilter, operatorFilter, statusFilter, typeFilter],
  );

  const expenseTotalsByPhone = React.useMemo(() => {
    const totals = new Map<string, number>();
    expenses.forEach((expense) => {
      if (isVoided(expense)) return;
      if (!expense.simNumber) return;
      const key = `${expense.companyId}:${expense.contractId ?? ""}:${canonicalPhone(expense.simNumber)}`;
      if (!key) return;
      totals.set(key, (totals.get(key) ?? 0) + expenseTotal(expense));
    });
    return totals;
  }, [expenses]);

  // History for the card: allocations by simCardId/number plus direct numbered
  // charges; parent charges are not added on top (no double count).
  const simExpenses = React.useMemo(() => {
    if (!viewSim) return [] as Expense[];
    const variants = phoneVariants(viewSim.number);
    return expenses.filter((expense) => {
      if (expense.simCardId && expense.simCardId === viewSim.id) return true;
      if (expense.companyId !== viewSim.companyId || (expense.contractId && expense.contractId !== viewSim.contractId) || !expense.simNumber || !variants.length) return false;
      const expenseVariants = phoneVariants(expense.simNumber);
      return expenseVariants.some((variant) => variants.includes(variant));
    });
  }, [expenses, viewSim]);

  const simHistoryPeriods = React.useMemo(() => {
    const set = new Set<string>();
    for (const e of simExpenses) {
      const k = e.periodKey?.trim() || normalizePeriodKey(e.month);
      if (k) set.add(k);
    }
    return [...set].sort();
  }, [simExpenses]);

  const scopedSimExpenses = React.useMemo(() => {
    if (historyPeriod === "__all") return simExpenses;
    return simExpenses.filter((e) => (e.periodKey?.trim() || normalizePeriodKey(e.month)) === historyPeriod);
  }, [simExpenses, historyPeriod]);

  const simHistoryTotal = React.useMemo(
    () => scopedSimExpenses.filter((e) => !isVoided(e)).reduce((s, e) => s + expenseTotal(e), 0),
    [scopedSimExpenses],
  );

  const viewContract = viewSim?.contractId ? contracts.find((c) => c.id === viewSim.contractId) ?? null : null;
  const viewEmployeeName = viewSim?.employeeId
    ? employees.find((e) => e.id === viewSim.employeeId)?.name ?? viewSim.employee ?? "—"
    : (viewSim?.employee || null);

  React.useEffect(() => {
    if (!viewSim) {
      setViewTariffId(NONE);
      return;
    }
    setViewTariffId(viewSim.tariffId ?? NONE);
  }, [viewSim]);

  const handleViewTariffChange = async (value: string) => {
    if (!viewSim) return;
    const tariffId = value === NONE ? undefined : value;
    const tariffName = tariffs.find((t) => t.id === value)?.name ?? "";
    const updated: SimCard = {
      ...viewSim,
      tariffId,
      tariff: tariffId ? tariffName : "",
    };
    setViewTariffId(value);
    try {
      await updateSimCard(updated);
      toast({ title: "Тариф обновлен" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось обновить тариф";
      toast({ title: message, variant: "destructive" });
    }
  };

  const invoiceById = React.useMemo(() => {
    const map = new Map(invoices.map((i) => [i.id, i]));
    return (id?: string) => (id ? map.get(id) : undefined);
  }, [invoices]);

  return (
    <MainLayout
      title="SIM-карты и номера"
      subtitle="Управление телефонными номерами и SIM-картами"
      actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Добавить SIM
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Новая SIM-карта</DialogTitle>
              <DialogDescription>Добавьте номер и привяжите его к компании и оператору.</DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form className="grid grid-cols-1 md:grid-cols-2 gap-4" onSubmit={form.handleSubmit(onSubmit)}>
                <FormField
                  control={form.control}
                  name="number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Номер телефона</FormLabel>
                      <FormControl>
                        <Input placeholder="+7 ..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="iccid"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>ICCID</FormLabel>
                      <FormControl>
                        <Input placeholder="8970..." {...field} />
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
                      <FormLabel>Тип</FormLabel>
                      <FormControl>
                        <Input placeholder="Голосовая, Интернет, M2M" {...field} />
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
                        <Select onValueChange={field.onChange} value={field.value}>
                          <SelectTrigger>
                            <SelectValue placeholder="Статус" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="active">Активен</SelectItem>
                            <SelectItem value="blocked">Заблокирован</SelectItem>
                          </SelectContent>
                        </Select>
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
                        <Select onValueChange={field.onChange} value={field.value || companies[0]?.id || ""}>
                          <SelectTrigger>
                            <SelectValue placeholder="Компания" />
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
                  name="operatorId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Оператор</FormLabel>
                      <FormControl>
                        <Select onValueChange={field.onChange} value={field.value || operators[0]?.id || ""}>
                          <SelectTrigger>
                            <SelectValue placeholder="Оператор" />
                          </SelectTrigger>
                          <SelectContent>
                            {operators.map((o) => (
                              <SelectItem key={o.id} value={o.id}>
                                {o.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField control={form.control} name="contractId" render={({field})=><FormItem><FormLabel>Договор</FormLabel><FormControl><select className="w-full rounded border bg-background p-2" {...field}><option value={NONE}>Не выбран</option>{contracts.filter(c=>c.companyId===form.watch("companyId")&&c.operatorId===form.watch("operatorId")).map(c=><option key={c.id} value={c.id}>{c.number}</option>)}</select></FormControl><FormMessage /></FormItem>} />
<FormField control={form.control} name="connectionAddress" render={({field})=><FormItem><FormLabel>Адрес подключения</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>} />
                <FormField
                  control={form.control}
                  name="employeeId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Сотрудник (опц.)</FormLabel>
                      <FormControl>
                        <Select onValueChange={field.onChange} value={field.value || NONE}>
                          <SelectTrigger>
                            <SelectValue placeholder="Не назначать" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE}>Не назначать</SelectItem>
                            {employees.map((e) => (
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
                  name="tariffId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Тариф (опц.)</FormLabel>
                      <FormControl>
                        <Select onValueChange={field.onChange} value={field.value || NONE}>
                          <SelectTrigger>
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
            placeholder="Поиск по номеру, ICCID, оператору..."
            aria-label="Поиск SIM-карт"
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

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40" aria-label="Фильтр по статусу">
            <SelectValue placeholder="Статус" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все статусы</SelectItem>
            <SelectItem value="active">Активен</SelectItem>
            <SelectItem value="blocked">Заблокирован</SelectItem>
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-40" aria-label="Фильтр по типу">
            <SelectValue placeholder="Тип" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все типы</SelectItem>
            {["Голосовая", "Интернет", "M2M", "IP-телефония"].map((t) => (
              <SelectItem key={t} value={t}>
                {t}
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
      </div>

      {isLoading ? (
        <LoadingBlock text="Загрузка SIM-карт…" />
      ) : error ? (
        <ErrorBlock message={error} />
      ) : filteredSimCards.length === 0 ? (
        <EmptyBlock text="SIM-карты не найдены" />
      ) : (
      <div className="stat-card p-0 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="data-table min-w-250">
          <thead>
            <tr>
              <th>Номер телефона</th>
              <th>Тип</th>
              <th>Статус</th>
              <th>Оператор</th>
              <th>Компания</th>
              <th>Сотрудник</th>
              <th>Тариф</th>
              <th>Начисления</th>
              <th className="w-12"><span className="sr-only">Действия</span></th>
            </tr>
          </thead>
          <tbody>
            {filteredSimCards.map((sim) => (
              <tr key={sim.id} className="cursor-pointer" onClick={() => openCard(sim.id)}>
                <td>
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10">
                      <Smartphone className="h-4 w-4 text-accent" />
                    </div>
                    <div>
                      <p className="font-medium">
                        <Link
                          to={`/sim-cards?id=${encodeURIComponent(sim.id)}`}
                          className="hover:underline focus-visible:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {sim.number}
                        </Link>
                      </p>
                      <p className="text-xs text-muted-foreground">{sim.iccid}</p>
                    </div>
                  </div>
                </td>
                <td>{sim.type}</td>
                <td>{getStatusBadge(sim.status)}</td>
                <td>{sim.operator}</td>
                <td>{sim.company}</td>
                <td>
                  {sim.employee ? (
                    <span>{sim.employee}</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td>
                  <span className="text-muted-foreground">{sim.tariff}</span>
                </td>
                <td className="font-medium">
                  {(expenseTotalsByPhone.get(`${sim.companyId}:${sim.contractId ?? ""}:${canonicalPhone(sim.number)}`) ?? 0).toLocaleString("ru-RU")} ₽
                </td>
                <td>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label={`Действия с номером ${sim.number}`}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => openCard(sim.id)}>
                        <Eye className="h-4 w-4 mr-2" />
                        Просмотр
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => openEdit(sim)}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Редактировать
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => openCard(sim.id)}>
                        <UserPlus className="h-4 w-4 mr-2" />
                        Назначить сотруднику
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onSelect={() => handleDelete(sim.id)}
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
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Просмотр SIM-карты</DialogTitle>
            <DialogDescription>Номер, договор, ответственный и начисления.</DialogDescription>
          </DialogHeader>
          {!viewSim ? (
            <EmptyBlock text={isLoading ? "Загрузка…" : "SIM-карта не найдена"} />
          ) : (
            <div className="space-y-6 text-sm">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Номер</span>
                  <span className="font-medium">{viewSim.number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">ICCID</span>
                  <span className="font-medium">{viewSim.iccid || "-"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Тип</span>
                  <span className="font-medium">{viewSim.type}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Статус</span>
                  <span className="font-medium">{viewSim.status === "active" ? "Активен" : "Заблокирован"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Компания</span>
                  <span className="font-medium">{viewSim.company}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Оператор</span>
                  <span className="font-medium">{viewSim.operator}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Договор</span>
                  <span className="font-medium">
                    {viewSim.contractId && viewContract ? (
                      <Link to={`/contracts?id=${encodeURIComponent(viewContract.id)}`} className="text-primary hover:underline">
                        {viewContract.number}
                      </Link>
                    ) : (
                      (viewSim.contractNumber || "—")
                    )}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Сотрудник</span>
                  <span className="font-medium">
                    {viewSim.employeeId ? (
                      <Link to={`/employees?id=${encodeURIComponent(viewSim.employeeId)}`} className="text-primary hover:underline">
                        {viewEmployeeName}
                      </Link>
                    ) : (
                      (viewEmployeeName || "—")
                    )}
                  </span>
                </div>
                {(viewSim.connectionAddress) && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Адрес подключения</span>
                    <span className="font-medium">{viewSim.connectionAddress}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Тариф</span>
                  <span className="font-medium w-56">
                    <Select value={viewTariffId} onValueChange={handleViewTariffChange}>
                      <SelectTrigger className="h-8" aria-label={`Тариф номера ${viewSim.number}`}>
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
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                <label className="block text-sm">Текущий сотрудник
                  <select className="block w-full rounded border bg-background p-2" value={viewSim.employeeId ?? NONE} onChange={async (e) => {
                    try { await assignSimCard(viewSim.id, e.target.value === NONE ? null : e.target.value, viewSim.contractId); }
                    catch (err) { toast({ title: "Назначение не сохранено", description: errorMessage(err), variant: "destructive" }); }
                  }}>
                    <option value={NONE}>Не назначен</option>
                    {allEmployees.filter(e => e.companyId === viewSim.companyId && e.status === "active").map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </label>
                <h3 className="font-medium">История назначений</h3>
                {assignmentsLoading ? <LoadingBlock /> : simAssignments.length ? simAssignments.map(a => <p key={a.id} className="text-sm">{allEmployees.find(e => e.id === a.employeeId)?.name ?? "Не назначен"} · {new Date(a.assignedAt).toLocaleDateString("ru-RU")} — {a.unassignedAt ? new Date(a.unassignedAt).toLocaleDateString("ru-RU") : "по настоящее время"}</p>) : <p className="text-sm text-muted-foreground">История назначений пока отсутствует.</p>}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-medium">Начисления по номеру</div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Строк: {scopedSimExpenses.length} · Итого: {simHistoryTotal.toLocaleString("ru-RU")} ₽</span>
                    {simHistoryPeriods.length > 0 && (
                      <Select value={historyPeriod} onValueChange={setHistoryPeriod}>
                        <SelectTrigger className="h-8 w-44" aria-label="Период начислений">
                          <SelectValue placeholder="Все периоды" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__all">Все периоды</SelectItem>
                          {simHistoryPeriods.map((k) => (
                            <SelectItem key={k} value={k}>
                              {periodLabel(k)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
                {scopedSimExpenses.length ? (
                  <div className="max-h-72 overflow-auto rounded-md border border-border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40 text-xs text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">Период</th>
                          <th className="px-3 py-2 text-left font-medium">Вид</th>
                          <th className="px-3 py-2 text-left font-medium">Тип</th>
                          <th className="px-3 py-2 text-right font-medium">Итого</th>
                          <th className="px-3 py-2 text-left font-medium">Документ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scopedSimExpenses.map((expense) => {
                          const inv = invoiceById(expense.invoiceId);
                          return (
                            <tr key={expense.id} className="border-t border-border">
                              <td className="px-3 py-2">{expense.periodKey || expense.month}</td>
                              <td className="px-3 py-2 text-muted-foreground">{expenseKindLabel(expense)}</td>
                              <td className="px-3 py-2">{expense.serviceCategory || expense.type}</td>
                              <td className="px-3 py-2 text-right font-medium">{expenseTotal(expense).toLocaleString("ru-RU")} ₽</td>
                              <td className="px-3 py-2">
                                {expense.invoiceId ? (
                                  <Link to={`/invoices?id=${encodeURIComponent(expense.invoiceId)}`} className="text-primary hover:underline">
                                    {inv ? inv.invoiceNo || "Счёт" : "Счёт"}
                                  </Link>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                    Начисления не найдены. Данные появятся после импорта детализации.
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Редактирование */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Редактировать SIM</DialogTitle>
            <DialogDescription>Измените данные SIM-карты.</DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form className="grid grid-cols-1 md:grid-cols-2 gap-4" onSubmit={editForm.handleSubmit(onEditSubmit)}>
              <FormField
                control={editForm.control}
                name="number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Номер телефона</FormLabel>
                    <FormControl>
                      <Input placeholder="+7 ..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="iccid"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ICCID</FormLabel>
                    <FormControl>
                      <Input placeholder="8970..." {...field} />
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
                    <FormLabel>Тип</FormLabel>
                    <FormControl>
                      <Input placeholder="Голосовая, Интернет, M2M" {...field} />
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
                          <SelectItem value="blocked">Заблокирован</SelectItem>
                        </SelectContent>
                      </Select>
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
                      <Select onValueChange={field.onChange} value={field.value || companies[0]?.id || ""}>
                        <SelectTrigger>
                          <SelectValue placeholder="Компания" />
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
                name="operatorId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Оператор</FormLabel>
                    <FormControl>
                      <Select onValueChange={field.onChange} value={field.value || operators[0]?.id || ""}>
                        <SelectTrigger>
                          <SelectValue placeholder="Оператор" />
                        </SelectTrigger>
                        <SelectContent>
                          {operators.map((o) => (
                            <SelectItem key={o.id} value={o.id}>
                              {o.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField control={editForm.control} name="contractId" render={({field})=><FormItem><FormLabel>Договор</FormLabel><FormControl><select className="w-full rounded border bg-background p-2" {...field}><option value={NONE}>Не выбран</option>{contracts.filter(c=>c.companyId===editForm.watch("companyId")&&c.operatorId===editForm.watch("operatorId")).map(c=><option key={c.id} value={c.id}>{c.number}</option>)}</select></FormControl><FormMessage /></FormItem>} />
<FormField control={editForm.control} name="connectionAddress" render={({field})=><FormItem><FormLabel>Адрес подключения</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>} />
              <FormField
                control={editForm.control}
                name="employeeId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Сотрудник (опц., «Не назначать» — снять)</FormLabel>
                    <FormControl>
                      <Select onValueChange={field.onChange} value={field.value || NONE}>
                        <SelectTrigger>
                          <SelectValue placeholder="Не назначать" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>Не назначать</SelectItem>
                          {employees.map((e) => (
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
                name="tariffId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Тариф (опц.)</FormLabel>
                    <FormControl>
                        <Select onValueChange={field.onChange} value={field.value || NONE}>
                          <SelectTrigger>
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

export default SimCards;
