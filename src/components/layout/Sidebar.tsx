import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  FileText,
  Users,
  Smartphone,
  Building2,
  Wifi,
  CreditCard,
  Receipt,
  Settings,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useBackendHealth } from "@/lib/backend";

interface NavItemProps {
  to: string;
  icon: React.ReactNode;
  label: string;
  collapsed?: boolean;
  onNavigate?: () => void;
  children?: { to: string; label: string }[];
}

const NavItem = ({ to, icon, label, collapsed, onNavigate, children }: NavItemProps) => {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const isActive = location.pathname === to || children?.some(c => location.pathname === c.to);

  if (children) {
    return (
      <div>
        <button
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          aria-label={label}
          className={cn(
            "nav-item w-full justify-between",
            isActive && "nav-item-active"
          )}
        >
          <span className="flex items-center gap-3">
            {icon}
            {!collapsed && label}
          </span>
          {!collapsed && (
            <ChevronDown
              className={cn(
                "h-4 w-4 transition-transform duration-200",
                isOpen && "rotate-180"
              )}
            />
          )}
        </button>
        {isOpen && !collapsed && (
          <div className="ml-9 mt-1 space-y-1">
            {children.map((child) => (
              <NavLink
                key={child.to}
                to={child.to}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors",
                    isActive && "text-sidebar-foreground bg-sidebar-accent"
                  )
                }
              >
                <CircleDot className="h-2 w-2" />
                {child.label}
              </NavLink>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <NavLink
      to={to}
      onClick={onNavigate}
      aria-label={label}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        cn("nav-item", isActive && "nav-item-active", collapsed && "justify-center px-0")
      }
    >
      {icon}
      {!collapsed && label}
    </NavLink>
  );
};

type SidebarProps = {
  open?: boolean;
  onClose?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
};

const Sidebar = ({ open, onClose, collapsed, onToggleCollapse }: SidebarProps) => {
  const health = useBackendHealth();
  const statusText =
    health.status === "online"
      ? "Подключено"
      : health.status === "demo"
        ? "Демо-режим"
        : health.status === "offline"
          ? "Нет связи"
          : "Проверка…";

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        className={cn(
          "fixed left-0 top-0 z-50 h-screen bg-sidebar border-r border-sidebar-border transition-all duration-200",
          collapsed ? "md:w-20" : "md:w-64",
          "w-64",
          open ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        )}
        aria-label="Основная навигация"
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center gap-3 px-5 border-b border-sidebar-border">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary">
              <Building2 className="h-5 w-5 text-primary-foreground" />
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <h1 className="text-base font-semibold text-sidebar-foreground">Сфера</h1>
                <p className="text-xs text-sidebar-foreground/60">Учёт связи</p>
              </div>
            )}
            <div className="ml-auto flex items-center gap-1">
              {onToggleCollapse && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="hidden h-8 w-8 text-sidebar-foreground/70 hover:text-sidebar-foreground md:inline-flex"
                  aria-label={collapsed ? "Развернуть меню" : "Свернуть меню"}
                  onClick={onToggleCollapse}
                >
                  {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-sidebar-foreground/70 hover:text-sidebar-foreground md:hidden"
                aria-label="Закрыть меню"
                onClick={onClose}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto scrollbar-thin px-3 py-4 space-y-1">
            <NavItem to="/" icon={<LayoutDashboard className="h-5 w-5 shrink-0" />} label="Дашборд" collapsed={collapsed} onNavigate={onClose} />

            {!collapsed && (
              <div className="pt-4 pb-2">
                <p className="px-3 text-xs font-medium text-sidebar-foreground/50 uppercase tracking-wider">
                  Учёт
                </p>
              </div>
            )}

            <NavItem to="/contracts" icon={<FileText className="h-5 w-5 shrink-0" />} label="Договоры" collapsed={collapsed} onNavigate={onClose} />
            <NavItem to="/sim-cards" icon={<Smartphone className="h-5 w-5 shrink-0" />} label="SIM-карты" collapsed={collapsed} onNavigate={onClose} />
            <NavItem to="/employees" icon={<Users className="h-5 w-5 shrink-0" />} label="Сотрудники" collapsed={collapsed} onNavigate={onClose} />
            <NavItem to="/expenses" icon={<CreditCard className="h-5 w-5 shrink-0" />} label="Расходы" collapsed={collapsed} onNavigate={onClose} />
            <NavItem to="/invoices" icon={<Receipt className="h-5 w-5 shrink-0" />} label="Счета" collapsed={collapsed} onNavigate={onClose} />

            {!collapsed && (
              <div className="pt-4 pb-2">
                <p className="px-3 text-xs font-medium text-sidebar-foreground/50 uppercase tracking-wider">
                  Справочники
                </p>
              </div>
            )}

            <NavItem to="/companies" icon={<Building2 className="h-5 w-5 shrink-0" />} label="Компании" collapsed={collapsed} onNavigate={onClose} />
            <NavItem to="/operators" icon={<Wifi className="h-5 w-5 shrink-0" />} label="Операторы" collapsed={collapsed} onNavigate={onClose} />
            <NavItem to="/tariffs" icon={<CreditCard className="h-5 w-5 shrink-0" />} label="Тарифы" collapsed={collapsed} onNavigate={onClose} />

            {!collapsed && (
              <div className="pt-4 pb-2">
                <p className="px-3 text-xs font-medium text-sidebar-foreground/50 uppercase tracking-wider">
                  Система
                </p>
              </div>
            )}

            <NavItem to="/settings" icon={<Settings className="h-5 w-5 shrink-0" />} label="Настройки" collapsed={collapsed} onNavigate={onClose} />
          </nav>

          {/* Connection status (honest: no fictitious user) */}
          <div className="border-t border-sidebar-border p-4">
            {!collapsed ? (
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "h-2.5 w-2.5 shrink-0 rounded-full",
                    health.status === "online" && "bg-green-500",
                    health.status === "demo" && "bg-yellow-500",
                    health.status === "offline" && "bg-red-500",
                    health.status === "checking" && "bg-gray-400",
                  )}
                  aria-hidden="true"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-sidebar-foreground truncate">{statusText}</p>
                  <p className="text-xs text-sidebar-foreground/60 truncate">Локальный доступ</p>
                </div>
              </div>
            ) : (
              <div className="flex justify-center">
                <span
                  className={cn(
                    "h-2.5 w-2.5 rounded-full",
                    health.status === "online" && "bg-green-500",
                    health.status === "demo" && "bg-yellow-500",
                    health.status === "offline" && "bg-red-500",
                    health.status === "checking" && "bg-gray-400",
                  )}
                  title={statusText}
                />
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
