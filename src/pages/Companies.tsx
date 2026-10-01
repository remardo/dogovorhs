import React from "react";
import { Link, useSearchParams } from "react-router-dom";
import MainLayout from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Building2, MoreHorizontal, Eye, Pencil, Trash2, FileText, Smartphone, Users } from "lucide-react";
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
import { useCompanies, useContracts, useExpenses } from "@/lib/backend";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { toast } from "@/hooks/use-toast";

const formSchema = z.object({
  name: z.string().min(2, "Введите название"),
  inn: z.string().min(5, "Введите ИНН"),
  kpp: z.string().optional(),
  comment: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

const Companies = () => {
  const { items: companies, createCompany, updateCompany, deleteCompany } = useCompanies();
  const [params,setParams]=useSearchParams();
  const {items:contracts}=useContracts();
  const {items:expenses}=useExpenses();
  const selected=companies.find(x=>x.id===params.get("id"));
  const [editingId,setEditingId]=React.useState<string|null>(null);
  const [open, setOpen] = React.useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      inn: "",
      kpp: "",
      comment: "",
    },
  });

  const onSubmit = async (values: FormValues) => {
    try {
    if(editingId) await updateCompany({...values,id:editingId}); else await createCompany(values);
    setEditingId(null);
    toast({ title: "Компания добавлена" });
    setOpen(false);
    form.reset({ name: "", inn: "", kpp: "", comment: "" });
    } catch(error) { toast({title:"Не сохранено",description:error instanceof Error ? error.message : String(error),variant:"destructive"}); }
  };

  return (
    <MainLayout
      title="Компании"
      subtitle="Юридические лица холдинга"
      actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={()=>{setEditingId(null);form.reset();}}>
              <Plus className="h-4 w-4 mr-2" />
              Добавить компанию
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Новая компания</DialogTitle>
              <DialogDescription>Добавьте юрлицо, чтобы привязывать договора, SIM и сотрудников.</DialogDescription>
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
                        <Input placeholder="ООО “Холдинг Сфера”" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="inn"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>ИНН</FormLabel>
                      <FormControl>
                        <Input placeholder="7701234567" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="kpp"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>КПП</FormLabel>
                      <FormControl>
                        <Input placeholder="770101001" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="comment"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Комментарий</FormLabel>
                      <FormControl>
                        <Input placeholder="Головная компания, договоры на связи" {...field} />
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
        {companies.map((company) => (
          <div key={company.id} className="stat-card">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                  <Building2 className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground"><Link className="hover:underline text-primary" to={`?id=${company.id}`}>{company.name}</Link></h3>
                  <p className="text-xs text-muted-foreground">ИНН: {company.inn || "—"}</p>
                  {company.kpp ? <p className="text-xs text-muted-foreground">КПП: {company.kpp}</p> : null}
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={()=>setParams({id:company.id})}>
                      <Eye className="h-4 w-4 mr-2" />
                      Просмотр
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={()=>{setEditingId(company.id);form.reset(company);setOpen(true);}}>
                      <Pencil className="h-4 w-4 mr-2" />
                      Редактировать
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onSelect={() => {
                        if (window.confirm("Удалить компанию?")) {
                          deleteCompany(company.id);
                          toast({ title: "Компания удалена" });
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Удалить
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
            </div>

            <p className="text-sm text-muted-foreground mb-4">{company.comment || "—"}</p>

            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-lg font-semibold">{company.contracts}</p>
                  <p className="text-xs text-muted-foreground">договоров</p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <Smartphone className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-lg font-semibold">{company.simCards}</p>
                  <p className="text-xs text-muted-foreground">SIM-карт</p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-lg font-semibold">{company.employees}</p>
                  <p className="text-xs text-muted-foreground">сотрудников</p>
                </div>
              </div>
              
              <div>
                <p className="text-lg font-semibold">{company.monthlyExpense.toLocaleString("ru-RU")} ₽</p>
                <p className="text-xs text-muted-foreground">расходы/мес</p>
              </div>
            </div>
          </div>
        ))}
      </div>
      <Dialog open={!!selected} onOpenChange={o=>{if(!o)setParams({});}}><DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>{selected?.name}</DialogTitle><DialogDescription>Договоры и расходы</DialogDescription></DialogHeader>{selected&&<div className="space-y-3"><p>Расходы за все периоды: {expenses.filter(e=>e.companyId===selected.id&&e.kind!=="allocation"&&!e.voided&&e.status!=="draft").reduce((sum,e)=>sum+e.total,0).toLocaleString("ru-RU")} ₽</p>{contracts.filter(c=>c.companyId===selected.id).map(c=><p key={c.id}><Link className="text-primary underline" to={`/contracts?id=${c.id}`}>{c.number} · {c.name || c.type}</Link></p>)}</div>}</DialogContent></Dialog>
    </MainLayout>
  );
};

export default Companies;
