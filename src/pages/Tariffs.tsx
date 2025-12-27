import React from "react";
import MainLayout from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Filter, MoreHorizontal, CreditCard, Eye, Pencil, Archive, Trash2 } from "lucide-react";
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
import { useTariffs } from "@/lib/backend";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { toast } from "@/hooks/use-toast";

const formSchema = z.object({
  name: z.string().min(2, "Введите название тарифа"),
  operatorId: z.string().min(1, "Выберите оператора"),
  type: z.string().min(2, "Укажите тип"),
  monthlyFee: z.coerce.number().min(0, "Сумма не может быть отрицательной"),
  dataLimitGb: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : null))
    .refine((v) => v === null || !Number.isNaN(v), "Введите число или оставьте пустым"),
  minutes: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : null))
    .refine((v) => v === null || !Number.isNaN(v), "Введите число или оставьте пустым"),
  sms: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : null))
    .refine((v) => v === null || !Number.isNaN(v), "Введите число или оставьте пустым"),
  status: z.enum(["active", "archive"]),
});

type FormValues = z.infer<typeof formSchema>;

const Tariffs = () => {
  const { items: tariffs, operators, createTariff, updateTariff, deleteTariff } = useTariffs();
  const [open, setOpen] = React.useState(false);
  const [editOpen, setEditOpen] = React.useState(false);
  const [editTariff, setEditTariff] = React.useState<(typeof tariffs)[number] | null>(null);
  const [search, setSearch] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState("all");
  const [statusFilter, setStatusFilter] = React.useState("all");

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      operatorId: operators[0]?.id ?? "",
      type: "Мобильная связь",
      monthlyFee: 0,
      dataLimitGb: null,
      minutes: null,
      sms: null,
      status: "active",
    },
  });

  React.useEffect(() => {
    if (!form.getValues("operatorId") && operators[0]) {
      form.setValue("operatorId", operators[0].id);
    }
  }, [form, operators]);

  const onSubmit = async (values: FormValues) => {
    await createTariff({
      id: "",
      operator: "",
      simCount: 0,
      ...values,
      dataLimitGb: values.dataLimitGb ?? null,
      minutes: values.minutes ?? null,
      sms: values.sms ?? null,
    });
    toast({ title: "Тариф добавлен" });
    setOpen(false);
    form.reset({
      name: "",
      operatorId: operators[0]?.id ?? "",
      type: "Мобильная связь",
      monthlyFee: 0,
      dataLimitGb: null,
      minutes: null,
      sms: null,
      status: "active",
    });
  };

  const editForm = useForm<FormValues>({
    resolver: zodResolver(formSchema),
  });

  React.useEffect(() => {
    if (!editTariff) return;
    editForm.reset({
      name: editTariff.name,
      operatorId: editTariff.operatorId,
      type: editTariff.type,
      monthlyFee: editTariff.monthlyFee,
      dataLimitGb: editTariff.dataLimitGb,
      minutes: editTariff.minutes,
      sms: editTariff.sms,
      status: editTariff.status,
    });
  }, [editTariff, editForm]);

  const onEditSubmit = async (values: FormValues) => {
    if (!editTariff) return;
    await updateTariff({
      ...editTariff,
      ...values,
      dataLimitGb: values.dataLimitGb ?? null,
      minutes: values.minutes ?? null,
      sms: values.sms ?? null,
    });
    toast({ title: "Тариф обновлен" });
    setEditOpen(false);
  };

  const filteredTariffs = React.useMemo(() => {
    return tariffs.filter((t) => {
      const matchesSearch =
        t.name.toLowerCase().includes(search.toLowerCase()) ||
        t.operator.toLowerCase().includes(search.toLowerCase());
      const matchesType = typeFilter === "all" || t.type === typeFilter;
      const matchesStatus = statusFilter === "all" || t.status === statusFilter;
      return matchesSearch && matchesType && matchesStatus;
    });
  }, [tariffs, search, typeFilter, statusFilter]);

  return (
    <MainLayout
      title="Тарифные планы"
      subtitle="Справочник тарифов операторов связи"
      actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Добавить тариф
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Новый тариф</DialogTitle>
              <DialogDescription>Добавьте тариф, чтобы привязывать его к SIM и договорам.</DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form className="grid grid-cols-1 md:grid-cols-2 gap-4" onSubmit={form.handleSubmit(onSubmit)}>
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Название</FormLabel>
                      <FormControl>
                        <Input placeholder="Корпоративный Безлимит" {...field} />
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
                        <Select onValueChange={field.onChange} value={field.value}>
                          <SelectTrigger>
                            <SelectValue placeholder="Выберите оператора" />
                          </SelectTrigger>
                          <SelectContent>
                            {operators.map((op) => (
                              <SelectItem key={op.id} value={op.id}>
                                {op.name}
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
                      <FormLabel>Тип</FormLabel>
                      <FormControl>
                        <Input placeholder="Мобильная связь, Интернет, M2M..." {...field} />
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
                        <Input type="number" min={0} step={50} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="dataLimitGb"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Интернет, ГБ (пусто — нет)</FormLabel>
                      <FormControl>
                        <Input placeholder="Напр. 30" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="minutes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Минуты (пусто — нет)</FormLabel>
                      <FormControl>
                        <Input placeholder="Напр. 500" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="sms"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>SMS (пусто — нет)</FormLabel>
                      <FormControl>
                        <Input placeholder="Напр. 100" {...field} />
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
                            <SelectItem value="archive">Архив</SelectItem>
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
            placeholder="Поиск по названию или оператору..."
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Тип" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все типы</SelectItem>
            {[...new Set(tariffs.map((t) => t.type))].map((t) => (
              <SelectItem key={t} value={t}>
                {t}
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
            <SelectItem value="archive">Архив</SelectItem>
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
              <th>Название</th>
              <th>Оператор</th>
              <th>Тип</th>
              <th>Абонплата</th>
              <th>Минуты</th>
              <th>Интернет</th>
              <th>SMS</th>
              <th>Статус</th>
              <th>Номеров</th>
              <th className="w-12"></th>
            </tr>
          </thead>
          <tbody>
            {filteredTariffs.map((tariff) => (
              <tr key={tariff.id}>
                <td>
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                      <CreditCard className="h-4 w-4 text-primary" />
                    </div>
                    <span className="font-medium">{tariff.name}</span>
                  </div>
                </td>
                <td className="text-sm text-muted-foreground">{tariff.operator}</td>
                <td>
                  <span className="text-muted-foreground">{tariff.type}</span>
                </td>
                <td className="font-medium">{tariff.monthlyFee.toLocaleString("ru-RU")} ₽</td>
                <td>{tariff.minutes ?? "—"}</td>
                <td>{tariff.dataLimitGb ? `${tariff.dataLimitGb} ГБ` : "—"}</td>
                <td>{tariff.sms ?? "—"}</td>
                <td>
                  <span className={tariff.status === "active" ? "badge-active" : "badge-inactive"}>
                    {tariff.status === "active" ? "Активен" : "Архив"}
                  </span>
                </td>
                <td>{tariff.simCount}</td>
                <td>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem>
                        <Eye className="h-4 w-4 mr-2" />
                        Просмотр
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => {
                          setEditTariff(tariff);
                          setEditOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4 mr-2" />
                        Редактировать
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <Archive className="h-4 w-4 mr-2" />
                        В архив
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onSelect={() => {
                          if (window.confirm("Удалить тариф?")) {
                            deleteTariff(tariff.id);
                            toast({ title: "Тариф удален" });
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

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Редактировать тариф</DialogTitle>
            <DialogDescription>Измените параметры тарифа.</DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form className="grid grid-cols-1 md:grid-cols-2 gap-4" onSubmit={editForm.handleSubmit(onEditSubmit)}>
              <FormField
                control={editForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Название</FormLabel>
                    <FormControl>
                      <Input placeholder="Корпоративный Безлимит" {...field} />
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
                          {operators.map((op) => (
                            <SelectItem key={op.id} value={op.id}>
                              {op.name}
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
                    <FormLabel>Тип</FormLabel>
                    <FormControl>
                      <Input placeholder="Мобильная связь, Интернет, M2M..." {...field} />
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
                      <Input type="number" min={0} step={50} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="dataLimitGb"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Интернет, ГБ (пусто - нет)</FormLabel>
                    <FormControl>
                      <Input placeholder="Напр. 30" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="minutes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Минуты (пусто - нет)</FormLabel>
                    <FormControl>
                      <Input placeholder="Напр. 500" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="sms"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>SMS (пусто - нет)</FormLabel>
                    <FormControl>
                      <Input placeholder="Напр. 100" {...field} />
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
                          <SelectItem value="archive">Архив</SelectItem>
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

export default Tariffs;
