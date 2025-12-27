import React from "react";
import MainLayout from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Filter, MoreHorizontal, Eye, Pencil, Smartphone, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import { useCompanies, useEmployeesWithMutations, useSimCards, type Employee } from "@/lib/backend";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { toast } from "@/hooks/use-toast";
import { useSearchParams } from "react-router-dom";

const formSchema = z.object({
  name: z.string().min(2, "Введите ФИО"),
  companyId: z.string().min(1, "Выберите компанию"),
  department: z.string().min(2, "Укажите подразделение"),
  position: z.string().min(2, "Укажите должность"),
  status: z.enum(["active", "fired"]),
  simCount: z.coerce.number().min(0, "Не может быть отрицательным"),
  maxSim: z.coerce.number().min(0, "Не может быть отрицательным"),
});

type FormValues = z.infer<typeof formSchema>;

const Employees = () => {
  const { items: employees, createEmployee, updateEmployee, deleteEmployee } = useEmployeesWithMutations();
  const { items: companies } = useCompanies();
  const { items: simCards, updateSimCard } = useSimCards();
  const [searchParams] = useSearchParams();
  const [open, setOpen] = React.useState(false);
  const [viewEmployee, setViewEmployee] = React.useState<Employee | null>(null);
  const [editEmployee, setEditEmployee] = React.useState<Employee | null>(null);
  const [editOpen, setEditOpen] = React.useState(false);
  const [assignSimId, setAssignSimId] = React.useState<string>("__none");
  const [search, setSearch] = React.useState(searchParams.get("q") ?? "");
  const [companyFilter, setCompanyFilter] = React.useState<string>("all");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      companyId: companies[0]?.id ?? "",
      department: "",
      position: "",
      status: "active",
      simCount: 0,
      maxSim: 20,
    },
  });

  const editForm = useForm<FormValues>({
    resolver: zodResolver(formSchema),
  });

  React.useEffect(() => {
    if (!form.getValues("companyId") && companies[0]) {
      form.setValue("companyId", companies[0].id);
    }
  }, [companies, form]);

  React.useEffect(() => {
    setSearch(searchParams.get("q") ?? "");
  }, [searchParams]);

  React.useEffect(() => {
    if (!editEmployee) return;
    editForm.reset({
      name: editEmployee.name,
      companyId: editEmployee.companyId || companies[0]?.id || "",
      department: editEmployee.department,
      position: editEmployee.position,
      status: editEmployee.status,
      simCount: editEmployee.simCount,
      maxSim: editEmployee.maxSim,
    });
  }, [editEmployee, editForm, companies]);

  const filteredEmployees = React.useMemo(() => {
    return employees.filter((employee) => {
      const matchesSearch =
        employee.name.toLowerCase().includes(search.toLowerCase()) ||
        employee.position.toLowerCase().includes(search.toLowerCase());
      const matchesCompany = companyFilter === "all" || employee.companyId === companyFilter;
      const matchesStatus = statusFilter === "all" || employee.status === statusFilter;
      return matchesSearch && matchesCompany && matchesStatus;
    });
  }, [employees, search, companyFilter, statusFilter]);

  const onSubmit = async (values: FormValues) => {
    await createEmployee({ ...values, company: "" });
    toast({ title: "Сотрудник добавлен" });
    setOpen(false);
    form.reset({
      name: "",
      companyId: companies[0]?.id ?? "",
      department: "",
      position: "",
      status: "active",
      simCount: 0,
      maxSim: 20,
    });
  };

  const onEditSubmit = async (values: FormValues) => {
    if (!editEmployee) return;
    await updateEmployee({
      ...editEmployee,
      ...values,
      company: editEmployee.company,
    });
    toast({ title: "Сотрудник обновлен" });
    setEditOpen(false);
  };

  return (
    <MainLayout
      title="Сотрудники"
      subtitle="Управление сотрудниками и привязкой SIM-карт"
      actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Добавить сотрудника
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Новый сотрудник</DialogTitle>
              <DialogDescription>Заполните данные для учета SIM-карт и договоров.</DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form className="grid grid-cols-1 md:grid-cols-2 gap-4" onSubmit={form.handleSubmit(onSubmit)}>
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>ФИО</FormLabel>
                      <FormControl>
                        <Input placeholder="Иванов Иван Иванович" {...field} />
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
                  name="department"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Подразделение</FormLabel>
                      <FormControl>
                        <Input placeholder="IT-отдел" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="position"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Должность</FormLabel>
                      <FormControl>
                        <Input placeholder="Системный администратор" {...field} />
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
                            <SelectItem value="active">Работает</SelectItem>
                            <SelectItem value="fired">Уволен</SelectItem>
                          </SelectContent>
                        </Select>
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
                      <FormLabel>SIM-карт</FormLabel>
                      <FormControl>
                        <Input type="number" min={0} step={1} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="maxSim"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Лимит SIM</FormLabel>
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
            placeholder="Поиск по ФИО или должности..."
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
            <SelectItem value="active">Работает</SelectItem>
            <SelectItem value="fired">Уволен</SelectItem>
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
              <th>Сотрудник</th>
              <th>Компания</th>
              <th>Подразделение</th>
              <th>Должность</th>
              <th>Статус</th>
              <th>SIM-карт</th>
              <th className="w-12"></th>
            </tr>
          </thead>
          <tbody>
            {filteredEmployees.map((employee) => (
              <tr key={employee.id}>
                <td>
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-sm font-medium">
                      {employee.name.split(" ").slice(0, 2).map((n) => n[0]).join("")}
                    </div>
                    <span className="font-medium">{employee.name}</span>
                  </div>
                </td>
                <td>{employee.company}</td>
                <td>{employee.department}</td>
                <td>
                  <span className="text-muted-foreground">{employee.position}</span>
                </td>
                <td>
                  <span className={employee.status === "active" ? "badge-active" : "badge-inactive"}>
                    {employee.status === "active" ? "Работает" : "Уволен"}
                  </span>
                </td>
                <td>
                  <div className="flex items-center gap-3 min-w-32">
                    <div className="flex-1">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-medium">{employee.simCount}</span>
                        <span className="text-muted-foreground">/ {employee.maxSim}</span>
                      </div>
                      <Progress value={(employee.simCount / employee.maxSim) * 100} className="h-1.5" />
                    </div>
                  </div>
                </td>
                <td>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setViewEmployee(employee)}>
                        <Eye className="h-4 w-4 mr-2" />
                        Просмотр
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => {
                          setEditEmployee(employee);
                          setEditOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4 mr-2" />
                        Редактировать
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => {
                          setViewEmployee(employee);
                        }}
                      >
                        <Smartphone className="h-4 w-4 mr-2" />
                        Управление SIM
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onSelect={() => {
                          if (window.confirm("Удалить сотрудника?")) {
                            deleteEmployee(employee.id);
                            toast({ title: "Сотрудник удален" });
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
      <Dialog open={!!viewEmployee} onOpenChange={(open) => !open && setViewEmployee(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Просмотр сотрудника</DialogTitle>
            <DialogDescription>Детали сотрудника и привязанные SIM.</DialogDescription>
          </DialogHeader>
          {viewEmployee && (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">ФИО</span>
                <span className="font-medium">{viewEmployee.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Компания</span>
                <span className="font-medium">{viewEmployee.company}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Подразделение</span>
                <span className="font-medium">{viewEmployee.department}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Должность</span>
                <span className="font-medium">{viewEmployee.position}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Статус</span>
                <span className="font-medium">
                  {viewEmployee.status === "active" ? "Работает" : "Уволен"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">SIM</span>
                <span className="font-medium">
                  {viewEmployee.simCount} / {viewEmployee.maxSim}
                </span>
              </div>

              <div className="pt-2">
                <p className="text-xs font-semibold text-muted-foreground mb-2">Привязанные SIM</p>
                <div className="space-y-2">
                  {simCards.filter((s) => s.employeeId === viewEmployee.id).length === 0 && (
                    <p className="text-sm text-muted-foreground">Нет привязанных SIM</p>
                  )}
                  {simCards
                    .filter((s) => s.employeeId === viewEmployee.id)
                    .map((sim) => (
                      <div
                        key={sim.id}
                        className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
                      >
                        <div>
                          <p className="font-medium">{sim.number}</p>
                          <p className="text-muted-foreground text-xs">{sim.operator}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            updateSimCard({
                              ...sim,
                              employeeId: undefined,
                              employee: "",
                            })
                          }
                        >
                          Отвязать
                        </Button>
                      </div>
                    ))}
                </div>
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">Назначить SIM</p>
                  {simCards.filter((s) => !s.employeeId && s.companyId === viewEmployee.companyId).length === 0 ? (
                    <p className="text-sm text-muted-foreground">Свободных SIM нет</p>
                  ) : (
                    <>
                      <Select value={assignSimId} onValueChange={setAssignSimId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Выберите SIM" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none">Не выбрано</SelectItem>
                          {simCards
                            .filter((s) => !s.employeeId && s.companyId === viewEmployee.companyId)
                            .map((sim) => (
                              <SelectItem key={sim.id} value={sim.id}>
                                {sim.number} · {sim.operator}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="default"
                        size="sm"
                        disabled={assignSimId === "__none"}
                        onClick={() => {
                          if (assignSimId === "__none") return;
                          const sim = simCards.find((s) => s.id === assignSimId);
                          if (!sim) return;
                          updateSimCard({
                            ...sim,
                            employeeId: viewEmployee.id,
                            employee: viewEmployee.name,
                          });
                          setAssignSimId("__none");
                        }}
                      >
                        Назначить
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Редактирование */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Редактировать сотрудника</DialogTitle>
            <DialogDescription>Обновите данные и сохраните.</DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form className="grid grid-cols-1 md:grid-cols-2 gap-4" onSubmit={editForm.handleSubmit(onEditSubmit)}>
              <FormField
                control={editForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>ФИО</FormLabel>
                    <FormControl>
                      <Input placeholder="Иванов Иван Иванович" {...field} />
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
                name="department"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Подразделение</FormLabel>
                    <FormControl>
                      <Input placeholder="IT-отдел" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="position"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Должность</FormLabel>
                    <FormControl>
                      <Input placeholder="Системный администратор" {...field} />
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
                          <SelectItem value="active">Работает</SelectItem>
                          <SelectItem value="fired">Уволен</SelectItem>
                        </SelectContent>
                      </Select>
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
                    <FormLabel>SIM-карт</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} step={1} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="maxSim"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Лимит SIM</FormLabel>
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

export default Employees;
