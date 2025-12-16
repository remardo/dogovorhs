import React from "react";
import MainLayout from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Filter, MoreHorizontal, Receipt, Eye, Pencil, Upload, Check, Trash2, CalendarIcon } from "lucide-react";
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
import { useExpenses, useCompanies, useContracts, type Expense } from "@/lib/backend";
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
  status: z.enum(["confirmed", "draft", "adjusted"]),
  hasDocument: z.boolean().default(false),
});

type FormValues = z.infer<typeof formSchema>;

const getStatusBadge = (status: string) => {
  switch (status) {
    case "confirmed":
      return <span className="badge-active">Подтверждён</span>;
    case "draft":
      return <span className="badge-inactive">Черновик</span>;
    case "adjusted":
      return <span className="badge-warning">Скорректирован</span>;
    default:
      return <span className="badge-inactive">{status}</span>;
  }
};

const Expenses = () => {
  const { items: expenses, createExpense, updateExpense, deleteExpense } = useExpenses();
  const { items: companies } = useCompanies();
  const { items: contracts } = useContracts();
  const [open, setOpen] = React.useState(false);
  const [viewExpense, setViewExpense] = React.useState<Expense | null>(null);
  const [editExpense, setEditExpense] = React.useState<Expense | null>(null);
  const [editOpen, setEditOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [companyFilter, setCompanyFilter] = React.useState("all");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [periodFilter, setPeriodFilter] = React.useState("all");
  const [contractSelect, setContractSelect] = React.useState("__custom");
  const [editContractSelect, setEditContractSelect] = React.useState("__custom");
  const today = React.useMemo(() => new Date(), []);
  const defaultRange: DateRange = { from: today, to: today };
  const [createRange, setCreateRange] = React.useState<DateRange | undefined>(defaultRange);
  const [editRange, setEditRange] = React.useState<DateRange | undefined>(defaultRange);

  const formatRange = (range?: DateRange, fallback = "Выберите период") => {
    if (!range?.from) return fallback;
    const fromStr = format(range.from, "dd.MM.yyyy");
    if (!range.to) return fromStr;
    const toStr = format(range.to, "dd.MM.yyyy");
    return fromStr === toStr ? fromStr : `${fromStr} — ${toStr}`;
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
      status: "draft",
      hasDocument: false,
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
      status: "draft",
      hasDocument: false,
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
      status: editExpense.status,
      hasDocument: editExpense.hasDocument,
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

  const onEditSubmit = async (values: FormValues) => {
    if (!editExpense) return;
    editForm.setValue("month", formatRange(editRange, editExpense.month));
    await updateExpense({
      ...editExpense,
      ...values,
      total: values.amount + values.vat,
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
      const matchesStatus = statusFilter === "all" || exp.status === statusFilter;
      const matchesPeriod = periodFilter === "all" || exp.month === periodFilter;
      return matchesSearch && matchesCompany && matchesStatus && matchesPeriod;
    });
  }, [expenses, search, companyFilter, statusFilter, periodFilter]);

  const filteredSummary = React.useMemo(() => {
    return filteredExpenses.reduce(
      (acc, item) => {
        acc.total += item.total;
        if (item.status === "confirmed") acc.confirmed += item.total;
        if (item.status === "draft") acc.draft += item.total;
        if (!item.hasDocument) acc.noDocs += 1;
        return acc;
      },
      { total: 0, confirmed: 0, draft: 0, noDocs: 0 },
    );
  }, [filteredExpenses]);

  return (
    <MainLayout
      title="Фактические расходы"
      subtitle="Учёт ежемесячных расходов по договорам"
      actions={
        <div className="flex gap-3">
          <Button variant="outline">
            <Upload className="h-4 w-4 mr-2" />
            Импорт
          </Button>
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
                        <FormLabel>Сумма без НДС, ₽</FormLabel>
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
                        <FormLabel>НДС, ₽</FormLabel>
                        <FormControl>
                          <Input type="number" min={0} step={100} {...field} />
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
                              <SelectItem value="confirmed">Подтверждён</SelectItem>
                              <SelectItem value="draft">Черновик</SelectItem>
                              <SelectItem value="adjusted">Скорректирован</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="hasDocument"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Документ</FormLabel>
                        <FormControl>
                          <Select onValueChange={(v) => field.onChange(v === "yes")} value={field.value ? "yes" : "no"}>
                            <SelectTrigger>
                              <SelectValue placeholder="Есть документ?" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="yes">Есть</SelectItem>
                              <SelectItem value="no">Нет</SelectItem>
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

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Статус" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все статусы</SelectItem>
            <SelectItem value="confirmed">Подтверждён</SelectItem>
            <SelectItem value="draft">Черновик</SelectItem>
            <SelectItem value="adjusted">Скорректирован</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="outline" size="icon">
          <Filter className="h-4 w-4" />
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="stat-card">
          <p className="stat-label">Всего за период</p>
          <p className="stat-value">{filteredSummary.total.toLocaleString("ru-RU")} ₽</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Подтверждено</p>
          <p className="stat-value text-success">{filteredSummary.confirmed.toLocaleString("ru-RU")} ₽</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Черновики</p>
          <p className="stat-value text-muted-foreground">{filteredSummary.draft.toLocaleString("ru-RU")} ₽</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Без документов</p>
          <p className="stat-value text-warning">{filteredSummary.noDocs}</p>
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
              <th>Период</th>
              <th>Сумма без НДС</th>
              <th>НДС</th>
              <th>Итого</th>
              <th>Статус</th>
              <th>Документ</th>
              <th className="w-12"></th>
            </tr>
          </thead>
          <tbody>
            {filteredExpenses.map((expense) => (
              <tr key={expense.id}>
                <td>
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-warning/10">
                      <Receipt className="h-4 w-4 text-warning" />
                    </div>
                    <span className="font-medium">{expense.contract || "—"}</span>
                  </div>
                </td>
                <td>{expense.company}</td>
                <td>{expense.operator || "—"}</td>
                <td>{expense.month}</td>
                <td>{expense.amount.toLocaleString("ru-RU")} ₽</td>
                <td className="text-muted-foreground">{expense.vat.toLocaleString("ru-RU")} ₽</td>
                <td className="font-medium">{expense.total.toLocaleString("ru-RU")} ₽</td>
                <td>{getStatusBadge(expense.status)}</td>
                <td>
                  {expense.hasDocument ? (
                    <Check className="h-4 w-4 text-success" />
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </td>
                <td>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
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
                        <DropdownMenuItem>
                          <Upload className="h-4 w-4 mr-2" />
                        Загрузить документ
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
            ))}
          </tbody>
        </table>
      </div>

      {/* Просмотр */}
      <Dialog open={!!viewExpense} onOpenChange={(open) => !open && setViewExpense(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Просмотр расхода</DialogTitle>
            <DialogDescription>Детали расхода.</DialogDescription>
          </DialogHeader>
          {viewExpense && (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Договор</span>
                <span className="font-medium">{viewExpense.contract || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Компания</span>
                <span className="font-medium">{viewExpense.company}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Оператор</span>
                <span className="font-medium">{viewExpense.operator || "—"}</span>
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
                <span className="font-medium">{viewExpense.amount.toLocaleString("ru-RU")} ₽</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">НДС</span>
                <span className="font-medium">{viewExpense.vat.toLocaleString("ru-RU")} ₽</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Итого</span>
                <span className="font-medium">{viewExpense.total.toLocaleString("ru-RU")} ₽</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Статус</span>
                <span className="font-medium">
                  {viewExpense.status === "confirmed"
                    ? "Подтверждён"
                    : viewExpense.status === "draft"
                      ? "Черновик"
                      : "Скорректирован"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Документ</span>
                <span className="font-medium">{viewExpense.hasDocument ? "Да" : "Нет"}</span>
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
                    <FormLabel>Сумма без НДС, ₽</FormLabel>
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
                    <FormLabel>НДС, ₽</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} step={100} {...field} />
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
                          <SelectItem value="confirmed">Подтверждён</SelectItem>
                          <SelectItem value="draft">Черновик</SelectItem>
                          <SelectItem value="adjusted">Скорректирован</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="hasDocument"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Документ</FormLabel>
                    <FormControl>
                      <Select onValueChange={(v) => field.onChange(v === "yes")} value={field.value ? "yes" : "no"}>
                        <SelectTrigger>
                          <SelectValue placeholder="Есть документ?" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="yes">Есть</SelectItem>
                          <SelectItem value="no">Нет</SelectItem>
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

export default Expenses;
