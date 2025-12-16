import MainLayout from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { User, Bell, Shield, Database, Save } from "lucide-react";

const Settings = () => {
  return (
    <MainLayout
      title="Настройки"
      subtitle="Параметры системы и пользователя"
    >
      <div className="max-w-3xl space-y-8">
        {/* Profile Section */}
        <div className="stat-card">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <User className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="section-header">Профиль</h3>
              <p className="text-sm text-muted-foreground">Информация о пользователе</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="name">ФИО</Label>
              <Input id="name" defaultValue="Администратор Иван" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" defaultValue="admin@sfera.ru" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Телефон</Label>
              <Input id="phone" defaultValue="+7 (495) 123-45-67" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Роль</Label>
              <Input id="role" defaultValue="Администратор системы" disabled />
            </div>
          </div>
        </div>

        {/* Notifications Section */}
        <div className="stat-card">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
              <Bell className="h-5 w-5 text-accent" />
            </div>
            <div>
              <h3 className="section-header">Уведомления</h3>
              <p className="text-sm text-muted-foreground">Настройки оповещений</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Превышение лимитов</p>
                <p className="text-sm text-muted-foreground">Уведомления при превышении лимитов по номерам</p>
              </div>
              <Switch defaultChecked />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Окончание договоров</p>
                <p className="text-sm text-muted-foreground">Напоминания об истекающих договорах</p>
              </div>
              <Switch defaultChecked />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Еженедельный отчёт</p>
                <p className="text-sm text-muted-foreground">Сводка расходов по email</p>
              </div>
              <Switch />
            </div>
          </div>
        </div>

        {/* Security Section */}
        <div className="stat-card">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10">
              <Shield className="h-5 w-5 text-warning" />
            </div>
            <div>
              <h3 className="section-header">Безопасность</h3>
              <p className="text-sm text-muted-foreground">Параметры доступа</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="current-password">Текущий пароль</Label>
                <Input id="current-password" type="password" />
              </div>
              <div></div>
              <div className="space-y-2">
                <Label htmlFor="new-password">Новый пароль</Label>
                <Input id="new-password" type="password" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Подтвердите пароль</Label>
                <Input id="confirm-password" type="password" />
              </div>
            </div>
          </div>
        </div>

        {/* System Section */}
        <div className="stat-card">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <Database className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <h3 className="section-header">Система</h3>
              <p className="text-sm text-muted-foreground">Системные параметры</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Логирование изменений</p>
                <p className="text-sm text-muted-foreground">Запись всех изменений в журнал</p>
              </div>
              <Switch defaultChecked />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Лимит SIM на сотрудника</p>
                <p className="text-sm text-muted-foreground">Максимальное количество номеров на одного сотрудника</p>
              </div>
              <Input className="w-20 text-center" type="number" defaultValue="20" />
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <Button>
            <Save className="h-4 w-4 mr-2" />
            Сохранить изменения
          </Button>
        </div>
      </div>
    </MainLayout>
  );
};

export default Settings;
