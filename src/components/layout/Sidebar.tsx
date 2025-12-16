import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  FileText,
  Users,
  Smartphone,
  Building2,
  Wifi,
  CreditCard,
  Settings,
  ChevronDown,
  CircleDot,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface NavItemProps {
  to: string;
  icon: React.ReactNode;
  label: string;
  children?: { to: string; label: string }[];
}

const NavItem = ({ to, icon, label, children }: NavItemProps) => {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const isActive = location.pathname === to || children?.some(c => location.pathname === c.to);

  if (children) {
    return (
      <div>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "nav-item w-full justify-between",
            isActive && "nav-item-active"
          )}
        >
          <span className="flex items-center gap-3">
            {icon}
            {label}
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 transition-transform duration-200",
              isOpen && "rotate-180"
            )}
          />
        </button>
        {isOpen && (
          <div className="ml-9 mt-1 space-y-1">
            {children.map((child) => (
              <NavLink
                key={child.to}
                to={child.to}
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
      className={({ isActive }) =>
        cn("nav-item", isActive && "nav-item-active")
      }
    >
      {icon}
      {label}
    </NavLink>
  );
};

const Sidebar = () => {
  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 bg-sidebar border-r border-sidebar-border">
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className="flex h-16 items-center gap-3 px-5 border-b border-sidebar-border">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
            <Building2 className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-sidebar-foreground">Сфера</h1>
            <p className="text-xs text-sidebar-foreground/60">Учёт связи</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto scrollbar-thin px-3 py-4 space-y-1">
          <NavItem to="/" icon={<LayoutDashboard className="h-5 w-5" />} label="Дашборд" />
          
          <div className="pt-4 pb-2">
            <p className="px-3 text-xs font-medium text-sidebar-foreground/50 uppercase tracking-wider">
              Учёт
            </p>
          </div>
          
          <NavItem to="/contracts" icon={<FileText className="h-5 w-5" />} label="Договоры" />
          <NavItem to="/sim-cards" icon={<Smartphone className="h-5 w-5" />} label="SIM-карты" />
          <NavItem to="/employees" icon={<Users className="h-5 w-5" />} label="Сотрудники" />
          <NavItem to="/expenses" icon={<CreditCard className="h-5 w-5" />} label="Расходы" />

          <div className="pt-4 pb-2">
            <p className="px-3 text-xs font-medium text-sidebar-foreground/50 uppercase tracking-wider">
              Справочники
            </p>
          </div>
          
          <NavItem to="/companies" icon={<Building2 className="h-5 w-5" />} label="Компании" />
          <NavItem to="/operators" icon={<Wifi className="h-5 w-5" />} label="Операторы" />
          <NavItem to="/tariffs" icon={<CreditCard className="h-5 w-5" />} label="Тарифы" />

          <div className="pt-4 pb-2">
            <p className="px-3 text-xs font-medium text-sidebar-foreground/50 uppercase tracking-wider">
              Система
            </p>
          </div>
          
          <NavItem to="/settings" icon={<Settings className="h-5 w-5" />} label="Настройки" />
        </nav>

        {/* User */}
        <div className="border-t border-sidebar-border p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sidebar-accent text-sm font-medium text-sidebar-foreground">
              АИ
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">
                Администратор
              </p>
              <p className="text-xs text-sidebar-foreground/60 truncate">
                admin@sfera.ru
              </p>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
