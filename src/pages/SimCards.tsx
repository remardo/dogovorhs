import React from "react";
import MainLayout from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Filter, MoreHorizontal, Smartphone, Eye, Pencil, UserPlus, Trash2 } from "lucide-react";
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
import { useExpenses, useSimCards, type Expense, type SimCard } from "@/lib/backend";
import { filterSimCards, pickFirstOrNone } from "@/lib/simCardsUtils";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { toast } from "@/hooks/use-toast";

const NONE = "__none";

const formSchema = z.object({
  number: z.string().min(5, "Введите номер"),
  iccid: z.string().optional(),
  type: z.string().min(2, "Укажите тип"),
  status: z.enum(["active", "blocked"]),
  companyId: z.string().min(1, "Выберите компанию").refine((v) => v !== NONE, "Выберите компанию"),
  operatorId: z.string().min(1, "Выберите оператора").refine((v) => v !== NONE, "Выберите оператора"),
  employeeId: z.string().default(NONE),
  tariffId: z.string().default(NONE),
});

type FormValues = z.infer<typeof formSchema>;

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
  const { items: simCards, companies, operators, employees, tariffs, createSimCard, updateSimCard, deleteSimCard } =
    useSimCards();
  const { items: expenses } = useExpenses();
  const [open, setOpen] = React.useState(false);
  const [editOpen, setEditOpen] = React.useState(false);
  const [viewSim, setViewSim] = React.useState<SimCard | null>(null);
  const [editSim, setEditSim] = React.useState<SimCard | null>(null);
  const [search, setSearch] = React.useState("");
  const [companyFilter, setCompanyFilter] = React.useState("all");
  const [operatorFilter, setOperatorFilter] = React.useState("all");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [typeFilter, setTypeFilter] = React.useState("all");

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

  const onSubmit = async (values: FormValues) => {
    if (!values.companyId || values.companyId === NONE) {
      toast({ title: "Выберите компанию", variant: "destructive" });
      return;
    }
    if (!values.operatorId || values.operatorId === NONE) {
      toast({ title: "Выберите оператора", variant: "destructive" });
      return;
    }
    await createSimCard({
      id: "",
      company: "",
      operator: "",
      employee: "",
      tariff: "",
      ...values,
      companyId: values.companyId,
      operatorId: values.operatorId,
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

  const onEditSubmit = async (values: FormValues) => {
    if (!editSim) return;
    await updateSimCard({
      ...editSim,
      ...values,
      companyId: values.companyId,
      operatorId: values.operatorId,
      employeeId: values.employeeId === NONE ? undefined : values.employeeId,
      tariffId: values.tariffId === NONE ? undefined : values.tariffId,
    });
    toast({ title: "SIM-карта обновлена" });
    setEditOpen(false);
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

  const expenseTotalsByPhone = React.useMemo(() => {
    const totals = new Map<string, number>();
    expenses.forEach((expense) => {
      if (!expense.simNumber) return;
      const key = canonicalPhone(expense.simNumber);
      if (!key) return;
      totals.set(key, (totals.get(key) ?? 0) + expense.total);
    });
    return totals;
  }, [expenses]);

  const simExpenses = React.useMemo(() => {
    if (!viewSim) return [] as Expense[];
    const variants = phoneVariants(viewSim.number);
    if (!variants.length) return [] as Expense[];
    return expenses.filter((expense) => {
      if (!expense.simNumber) return false;
      const expenseVariants = phoneVariants(expense.simNumber);
      return expenseVariants.some((variant) => variants.includes(variant));
    });
  }, [expenses, viewSim]);

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
          <DialogContent className="max-w-2xl">
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
      <div className="flex items-center gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Поиск по номеру, ICCID, оператору..."
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        
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

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Статус" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все статусы</SelectItem>
            <SelectItem value="active">Активен</SelectItem>
            <SelectItem value="blocked">Заблокирован</SelectItem>
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-40">
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
          <SelectTrigger className="w-48">
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

        <Button variant="outline" size="icon">
          <Filter className="h-4 w-4" />
        </Button>
      </div>

      {/* Table */}
      <div className="stat-card p-0 overflow-hidden">
        <table className="data-table">
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
              <th className="w-12"></th>
            </tr>
          </thead>
          <tbody>
            {filteredSimCards.map((sim) => (
              <tr key={sim.id} className="cursor-pointer" onClick={() => setViewSim(sim)}>
                <td>
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10">
                      <Smartphone className="h-4 w-4 text-accent" />
                    </div>
                    <div>
                      <p className="font-medium">{sim.number}</p>
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
                  {(expenseTotalsByPhone.get(canonicalPhone(sim.number)) ?? 0).toLocaleString("ru-RU")} RUB
                </td>
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
                      <DropdownMenuItem onSelect={() => setViewSim(sim)}>
                        <Eye className="h-4 w-4 mr-2" />
                        Просмотр
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => {
                          setEditSim(sim);
                          editForm.reset({
                            number: sim.number,
                            iccid: sim.iccid,
                            type: sim.type,
                            status: sim.status,
                            companyId: sim.companyId || companies[0]?.id || "",
                            operatorId: sim.operatorId || operators[0]?.id || "",
                            employeeId: sim.employeeId ?? NONE,
                            tariffId: sim.tariffId ?? NONE,
                          });
                          setEditOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4 mr-2" />
                        Редактировать
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem>
                        <UserPlus className="h-4 w-4 mr-2" />
                        Назначить сотруднику
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onSelect={() => {
                          if (window.confirm("Удалить SIM-карту?")) {
                            deleteSimCard(sim.id);
                            toast({ title: "SIM-карта удалена" });
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
            ))}
          </tbody>
        </table>
      </div>

      {/* Просмотр */}
      <Dialog open={!!viewSim} onOpenChange={(open) => !open && setViewSim(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Просмотр SIM-карты</DialogTitle>
            <DialogDescription>Информация по SIM.</DialogDescription>
          </DialogHeader>
          {viewSim && (
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
                  <span className="text-muted-foreground">Сотрудник</span>
                  <span className="font-medium">{viewSim.employee || "-"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Тариф</span>
                  <span className="font-medium">{viewSim.tariff || "-"}</span>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">Начисления по номеру</div>
                  <div className="text-xs text-muted-foreground">Строк: {simExpenses.length}</div>
                </div>
                {simExpenses.length ? (
                  <div className="max-h-72 overflow-auto rounded-md border border-border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40 text-xs text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">Период</th>
                          <th className="px-3 py-2 text-left font-medium">Тип</th>
                          <th className="px-3 py-2 text-left font-medium">Сумма</th>
                          <th className="px-3 py-2 text-left font-medium">НДС</th>
                          <th className="px-3 py-2 text-left font-medium">Итого</th>
                        </tr>
                      </thead>
                      <tbody>
                        {simExpenses.map((expense) => (
                          <tr key={expense.id} className="border-t border-border">
                            <td className="px-3 py-2">{expense.month}</td>
                            <td className="px-3 py-2">{expense.type}</td>
                            <td className="px-3 py-2">{expense.amount.toLocaleString("ru-RU")} ₽</td>
                            <td className="px-3 py-2 text-muted-foreground">{expense.vat.toLocaleString("ru-RU")} ₽</td>
                            <td className="px-3 py-2 font-medium">{expense.total.toLocaleString("ru-RU")} ₽</td>
                          </tr>
                        ))}
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
        <DialogContent className="max-w-2xl">
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
              <FormField
                control={editForm.control}
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
