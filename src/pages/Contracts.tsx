import React, { useState, useEffect } from "react";
import MainLayout from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Filter, MoreHorizontal, FileText, Eye, Pencil, Trash2 } from "lucide-react";
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
import { useContracts, type Contract } from "@/lib/backend";
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

const formSchema = z.object({
  number: z.string().min(3, "Введите номер договора"),
  companyId: z.string().min(1, "Выберите компанию"),
  operatorId: z.string().min(1, "Выберите оператора"),
  type: z.string().min(2, "Укажите тип"),
  status: z.enum(["active", "closing"]),
  startDate: z.string().min(4, "Укажите дату начала"),
  endDate: z.string().min(1, "Укажите дату окончания или 'Бессрочный'"),
  monthlyFee: z.coerce.number().min(0, "Сумма не может быть отрицательной"),
  simCount: z.coerce.number().min(0, "Количество SIM не может быть отрицательным"),
});

type FormValues = z.infer<typeof formSchema>;

const Contracts = () => {
  const { items: contracts, companies, operators, createContract, updateContract, deleteContract } = useContracts();
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [viewContract, setViewContract] = useState<Contract | null>(null);
  const [editContract, setEditContract] = useState<Contract | null>(null);
  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [operatorFilter, setOperatorFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      number: "",
      companyId: companies[0]?.id ?? "",
      operatorId: operators[0]?.id ?? "",
      type: "Мобильная связь",
      status: "active",
      startDate: "",
      endDate: "Бессрочный",
      monthlyFee: 0,
      simCount: 0,
    },
  });

  const editForm = useForm<FormValues>({
    resolver: zodResolver(formSchema),
  });

  // Подхватываем опции после загрузки.
  const companyId = form.watch("companyId");
  const operatorId = form.watch("operatorId");

  useEffect(() => {
    if (!companyId && companies[0]) {
      form.setValue("companyId", companies[0].id);
    }
    if (!operatorId && operators[0]) {
      form.setValue("operatorId", operators[0].id);
    }
  }, [companyId, companies, form, operatorId, operators]);

  const onSubmit = async (values: FormValues) => {
    await createContract(values);
    toast({ title: "Договор сохранен" });
    setOpen(false);
    form.reset();
  };

  const onEditSubmit = async (values: FormValues) => {
    if (!editContract) return;
    await updateContract({
      ...editContract,
      ...values,
      company: editContract.company,
      operator: editContract.operator,
    });
    toast({ title: "Договор обновлен" });
    setEditOpen(false);
  };

  const filteredContracts = React.useMemo(() => {
    return contracts.filter((c) => {
      const matchesSearch =
        c.number.toLowerCase().includes(search.toLowerCase()) ||
        c.type.toLowerCase().includes(search.toLowerCase());
      const matchesCompany = companyFilter === "all" || c.companyId === companyFilter;
      const matchesOperator = operatorFilter === "all" || c.operatorId === operatorFilter;
      const matchesStatus = statusFilter === "all" || c.status === statusFilter;
      return matchesSearch && matchesCompany && matchesOperator && matchesStatus;
    });
  }, [contracts, search, companyFilter, operatorFilter, statusFilter]);

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
                      <FormLabel>Тип услуги</FormLabel>
                      <FormControl>
                        <Input placeholder="Мобильная связь, Интернет, VPN..." {...field} />
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
      <div className="flex items-center gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Поиск по номеру/типу..."
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

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Статус" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все статусы</SelectItem>
            <SelectItem value="active">Активен</SelectItem>
            <SelectItem value="closing">На расторжении</SelectItem>
            <SelectItem value="closed">Закрыт</SelectItem>
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
              <th>Номер договора</th>
              <th>Компания</th>
              <th>Оператор</th>
              <th>Тип</th>
              <th>Статус</th>
              <th>Действует до</th>
              <th>Абонплата</th>
              <th>SIM</th>
              <th className="w-12"></th>
            </tr>
          </thead>
          <tbody>
            {filteredContracts.map((contract) => (
              <tr key={contract.id}>
                <td>
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                      <FileText className="h-4 w-4 text-primary" />
                    </div>
                    <span className="font-medium">{contract.number}</span>
                  </div>
                </td>
                <td>{contract.company}</td>
                <td>{contract.operator}</td>
                <td>
                  <span className="text-muted-foreground">{contract.type}</span>
                </td>
                <td>
                  <span className={contract.status === "active" ? "badge-active" : "badge-warning"}>
                    {contract.status === "active" ? "Активен" : "Расторжение"}
                  </span>
                </td>
                <td>{contract.endDate}</td>
                <td className="font-medium">{contract.monthlyFee.toLocaleString("ru-RU")} ₽</td>
                <td>{contract.simCount > 0 ? contract.simCount : "-"}</td>
                <td>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setViewContract(contract)}>
                        <Eye className="h-4 w-4 mr-2" />
                        Просмотр
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => {
                          setEditContract(contract);
                          editForm.reset({
                            number: contract.number,
                            companyId: contract.companyId,
                            operatorId: contract.operatorId,
                            type: contract.type,
                            status: contract.status,
                            startDate: contract.startDate || "",
                            endDate: contract.endDate || "",
                            monthlyFee: contract.monthlyFee,
                            simCount: contract.simCount,
                          });
                          setEditOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4 mr-2" />
                        Редактировать
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onSelect={() => {
                          if (window.confirm("Удалить договор?")) {
                            deleteContract(contract.id);
                            toast({ title: "Договор удален" });
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
      <Dialog open={!!viewContract} onOpenChange={(open) => !open && setViewContract(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Просмотр договора</DialogTitle>
            <DialogDescription>Информация по договору.</DialogDescription>
          </DialogHeader>
          {viewContract && (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Номер</span>
                <span className="font-medium">{viewContract.number}</span>
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
                <span className="text-muted-foreground">Тип</span>
                <span className="font-medium">{viewContract.type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Статус</span>
                <span className="font-medium">
                  {viewContract.status === "active" ? "Активен" : "На расторжении"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Начало</span>
                <span className="font-medium">{viewContract.startDate || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Окончание</span>
                <span className="font-medium">{viewContract.endDate || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Абонплата</span>
                <span className="font-medium">{viewContract.monthlyFee.toLocaleString("ru-RU")} ₽</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">SIM</span>
                <span className="font-medium">{viewContract.simCount}</span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Редактирование */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl">
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
                    <FormLabel>Тип услуги</FormLabel>
                    <FormControl>
                      <Input placeholder="Мобильная связь, Интернет, VPN..." {...field} />
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
                        </SelectContent>
                      </Select>
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
