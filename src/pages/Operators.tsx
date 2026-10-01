import React from "react";
import { Link, useSearchParams } from "react-router-dom";
import MainLayout from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Wifi, MoreHorizontal, Eye, Pencil, Trash2, Phone, Mail, FileText } from "lucide-react";
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
import { useOperators, useContracts, useExpenses } from "@/lib/backend";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { toast } from "@/hooks/use-toast";

const formSchema = z.object({
  name: z.string().min(2, "Введите название оператора"),
  type: z.string().min(2, "Укажите тип услуг"),
  manager: z.string().min(2, "Укажите контактное лицо"),
  phone: z.string().min(5, "Введите телефон"),
  email: z.string().email("Некорректный email"),
});

type FormValues = z.infer<typeof formSchema>;

const Operators = () => {
  const { items: operators, createOperator, updateOperator, deleteOperator } = useOperators();
  const [params,setParams]=useSearchParams();
  const {items:contracts}=useContracts();
  const {items:expenses}=useExpenses();
  const selected=operators.find(x=>x.id===params.get("id"));
  const [editingId,setEditingId]=React.useState<string|null>(null);
  const [open, setOpen] = React.useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      type: "Мобильная связь",
      manager: "",
      phone: "",
      email: "",
    },
  });

  const onSubmit = async (values: FormValues) => {
    try {
    if(editingId) await updateOperator({...values,id:editingId}); else await createOperator(values);
    setEditingId(null);
    toast({ title: "Оператор добавлен" });
    setOpen(false);
    form.reset({
      name: "",
      type: "Мобильная связь",
      manager: "",
      phone: "",
      email: "",
    });
    } catch(error) { toast({title:"Не сохранено",description:error instanceof Error ? error.message : String(error),variant:"destructive"}); }
  };

  return (
    <MainLayout
      title="Операторы связи"
      subtitle="Справочник операторов и контактных лиц"
      actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={()=>{setEditingId(null);form.reset();}}>
              <Plus className="h-4 w-4 mr-2" />
              Добавить оператора
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Новый оператор</DialogTitle>
              <DialogDescription>Сохраните оператора, чтобы использовать его в договорах и справочниках.</DialogDescription>
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
                        <Input placeholder="Напр. МТС" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Тип услуг</FormLabel>
                      <FormControl>
                        <Input placeholder="Мобильная связь, Интернет..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="manager"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Контактное лицо</FormLabel>
                      <FormControl>
                        <Input placeholder="Имя менеджера" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Телефон</FormLabel>
                      <FormControl>
                        <Input placeholder="+7 ..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="contact@operator.ru" {...field} />
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {operators.map((operator) => (
          <div key={operator.id} className="stat-card">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10">
                  <Wifi className="h-6 w-6 text-accent" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground"><Link className="hover:underline text-primary" to={`?id=${operator.id}`}>{operator.name}</Link></h3>
                  <p className="text-xs text-muted-foreground">{operator.type}</p>
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={()=>setParams({id:operator.id})}>
                      <Eye className="h-4 w-4 mr-2" />
                      Просмотр
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={()=>{setEditingId(operator.id);form.reset(operator);setOpen(true);}}>
                      <Pencil className="h-4 w-4 mr-2" />
                      Редактировать
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onSelect={() => {
                        if (window.confirm("Удалить оператора?")) {
                          deleteOperator(operator.id);
                          toast({ title: "Оператор удален" });
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Удалить
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
            </div>

            <div className="space-y-3 mb-4">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Менеджер:</span>
                <span className="font-medium">{operator.manager || "—"}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Phone className="h-4 w-4" />
                <span>{operator.phone || "—"}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Mail className="h-4 w-4" />
                <span>{operator.email || "—"}</span>
              </div>
            </div>

            <div className="flex items-center gap-6 pt-4 border-t border-border">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-lg font-semibold">{operator.contracts}</p>
                  <p className="text-xs text-muted-foreground">договоров</p>
                </div>
              </div>
              
              {operator.simCards > 0 && (
                <div>
                  <p className="text-lg font-semibold">{operator.simCards}</p>
                  <p className="text-xs text-muted-foreground">SIM-карт</p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <Dialog open={!!selected} onOpenChange={o=>{if(!o)setParams({});}}><DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>{selected?.name}</DialogTitle><DialogDescription>Договоры и расходы</DialogDescription></DialogHeader>{selected&&<div className="space-y-3"><p>Расходы за все периоды: {expenses.filter(e=>e.operator===selected.name&&e.kind!=="allocation"&&!e.voided&&e.status!=="draft").reduce((sum,e)=>sum+e.total,0).toLocaleString("ru-RU")} ₽</p>{contracts.filter(c=>c.operatorId===selected.id).map(c=><p key={c.id}><Link className="text-primary underline" to={`/contracts?id=${c.id}`}>{c.number} · {c.name || c.type}</Link></p>)}</div>}</DialogContent></Dialog>
    </MainLayout>
  );
};

export default Operators;
