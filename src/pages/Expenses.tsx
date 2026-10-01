import React from "react";
import { Link, useSearchParams } from "react-router-dom";
import MainLayout from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, MoreHorizontal, Receipt, Eye, Pencil, Upload, Trash2, CalendarIcon } from "lucide-react";
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
import { useCompanies, useContracts, useExpenses, useInvoices, useOperators, type Expense } from "@/lib/backend";
import BillingImportDialog from "@/components/expenses/BillingImportDialog";
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


const Expenses = () => {
  const [params, setParams] = useSearchParams();
  const { items: invoices } = useInvoices();
  const [kindFilter, setKindFilter] = React.useState("charge");
  const { items: expenses, refreshExpenses, createExpense, updateExpense, voidExpense } = useExpenses({includeVoided:true});
  const { items: companies } = useCompanies();
  const { items: contracts } = useContracts();
  const { items: operators } = useOperators();
  const [open, setOpen] = React.useState(false);
  const [viewExpenseId,setViewExpenseId]=React.useState<string|null>(null);
  const viewExpense=expenses.find(x=>x.id===(params.get("id") ?? viewExpenseId)) ?? null;
  const setViewExpense=(item:Expense|null)=>setViewExpenseId(item?.id??null);
  const [editExpense, setEditExpense] = React.useState<Expense | null>(null);
  const [editOpen, setEditOpen] = React.useState(false);
  const [search, setSearch] = React.useState(params.get("q") ?? "");
  const [companyFilter, setCompanyFilter] = React.useState(params.get("company") ?? "all");
  const [periodFilter, setPeriodFilter] = React.useState("all");
  const [contractSelect, setContractSelect] = React.useState("__custom");
  const [editContractSelect, setEditContractSelect] = React.useState("__custom");
  const [importOpen, setImportOpen] = React.useState(false);
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

  const form = useForm<FormValues>({    resolver: zodResolver(formSchema),
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
    try {
    form.setValue("month", formatRange(createRange));
    await createExpense({
      ...values,
      contractId: contractSelect !== "__custom" ? contractSelect : undefined,
      basis: "Ручной ввод",
      total: values.amount + values.vat,
      status: "draft",
      hasDocument: false,
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
    } catch(error) { toast({title:"Не сохранено",description:error instanceof Error ? error.message : String(error),variant:"destructive"}); }
  };

  const editForm = useForm<FormValues>({
    resolver: zodResolver(formSchema),
  });

  React.useEffect(() => {
    if (!editExpense) return;
    const matched = contracts.find((c) => c.id === editExpense.contractId || (c.number === editExpense.contract && c.companyId === editExpense.companyId && c.operator === editExpense.operator));
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



  const onEditSubmit = async (values: FormValues) => {
    try {
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
    } catch(error) { toast({title:"Не сохранено",description:error instanceof Error ? error.message : String(error),variant:"destructive"}); }
  };

  const filteredExpenses = React.useMemo(() => {
    return expenses.filter((exp) => {
      const matchesSearch =
        (exp.contract || "").toLowerCase().includes(search.toLowerCase()) ||
        exp.type.toLowerCase().includes(search.toLowerCase()) ||
        exp.operator.toLowerCase().includes(search.toLowerCase());
      const matchesCompany = companyFilter === "all" || exp.companyId === companyFilter;
      const matchesPeriod = periodFilter === "all" || exp.month === periodFilter;
      return matchesSearch && matchesCompany && matchesPeriod && (kindFilter === "all" || (kindFilter === "void" ? exp.voided : !exp.voided && exp.kind === kindFilter));
    });
  }, [expenses, search, companyFilter, periodFilter, kindFilter]);

  const contractNameByNumber = React.useMemo(() => {
    const map = new Map<string, string>();
    contracts.forEach((contract) => {
      if (contract.number) {
        map.set(contract.number, contract.name || "");
      }
    });
    return map;
  }, [contracts]);

  const filteredSummary = React.useMemo(() => {
    return filteredExpenses.reduce(
      (acc, item) => {
        if (item.kind !== "allocation" && !item.voided && item.status !== "cancelled" && item.status !== "draft") acc.total += item.total;
        return acc;
      },
      { total: 0 },
    );
  }, [filteredExpenses]);


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
            <BillingImportDialog
              companies={companies}
              operators={operators}
              onApplied={refreshExpenses}
              onClose={() => setImportOpen(false)}
            />
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

      <label className="block text-sm my-4">Показывать<select className="ml-3 rounded border bg-background p-2" value={kindFilter} onChange={e=>setKindFilter(e.target.value)}><option value="charge">Начисления</option><option value="allocation">Детализация по номерам и услугам</option><option value="all">Начисления и детализация</option><option value="void">Аннулированные записи</option></select></label>
      {/* Table */}
      <div className="stat-card p-0 overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>SIM/Услуга</th>
              <th>Компания</th>
              <th>Оператор</th>
              <th>Период</th>
              <th>Сумма (с НДС)</th>
              <th className="w-12"></th>
            </tr>
          </thead>
          <tbody>
            {filteredExpenses.map((expense) => {
              const isMobile = expense.type.toLowerCase().includes("мобиль");
              const contractName = expense.contract ? contractNameByNumber.get(expense.contract) : "";
              const primaryLabel = expense.simNumber || (isMobile ? "-" : contractName || "-");
              return (
              <tr
                key={expense.id}
                className="cursor-pointer"
                onClick={() => {setViewExpense(expense);setParams({id:expense.id});}}
              >
                <td>
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-warning/10">
                      <Receipt className="h-4 w-4 text-warning" />
                    </div>
                    <Link className="font-medium text-primary hover:underline" to={`?id=${expense.id}`}>{primaryLabel === "-" ? expense.contract || expense.type : primaryLabel}</Link>
                  </div>
                </td>
                <td>{expense.company}</td>
                <td>{expense.operator || "-"}</td>
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
                          if (window.confirm("Аннулировать расход? История и оригинал сохранятся.")) {
                            voidExpense(expense.id, "Аннулирование из реестра").catch(error=>toast({title:"Не аннулировано",description:String(error),variant:"destructive"}));
                            toast({ title: "Расход аннулирован" });
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
      <Dialog open={!!viewExpense} onOpenChange={(open) => !open && (setViewExpense(null),setParams(prev => {const next=new URLSearchParams(prev);next.delete("id");return next;}))}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Просмотр расхода</DialogTitle>
            <DialogDescription>Начисление, основание и детализация расходов.</DialogDescription>
          </DialogHeader>
          {viewExpense && (
            <div className="space-y-3 text-sm">
              <p>{viewExpense.kind === "allocation" ? "Строка детализации (уже включена в начисление)" : "Начисление"} · {viewExpense.voided ? "Аннулировано" : viewExpense.status}</p>
              <p>{viewExpense.description}</p><p className="text-muted-foreground">{viewExpense.vatBasis === "netOnlyVatUnallocated" ? "Сумма без НДС; налог остаётся в начислении" : viewExpense.vatBasis === "grossOnlyTaxNotSplit" ? "Сумма с НДС; разбивка налога в оригинале не указана" : viewExpense.vatBasis === "computedFromInvoiceRate" ? "НДС вычислен по ставке документа" : ""}</p>
              {viewExpense.invoiceId && <p><Link className="text-primary underline" to={`/invoices?id=${viewExpense.invoiceId}`}>Счёт и оригинал PDF</Link> · Страница {viewExpense.sourcePage ?? "—"}</p>}
              {invoices.find(i=>i.id===viewExpense.invoiceId)?.fileUrl && <p><a className="text-primary underline" target="_blank" rel="noreferrer" href={`${invoices.find(i=>i.id===viewExpense.invoiceId)?.fileUrl}#page=${viewExpense.sourcePage ?? 1}`}>Открыть страницу оригинала</a></p>}
              {viewExpense.contractId && <p><Link className="text-primary underline" to={`/contracts?id=${viewExpense.contractId}`}>История договора</Link></p>}
              {viewExpense.simCardId && <p><Link className="text-primary underline" to={`/sim-cards?id=${viewExpense.simCardId}`}>История номера / подключения</Link></p>}
              {viewExpense.parentExpenseId && <p><Link className="text-primary underline" to={`?id=${viewExpense.parentExpenseId}`}>Начисление-основание</Link></p>}
              <p>{viewExpense.basis}</p>
              {expenses.filter(e=>e.parentExpenseId===viewExpense.id).map(e=><p key={e.id}><Link className="text-primary underline" to={`?id=${e.id}`}>{e.simNumber || e.description || e.type} · {e.total.toLocaleString("ru-RU")} ₽</Link></p>)}
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
