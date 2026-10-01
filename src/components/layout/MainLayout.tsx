import { ReactNode, useMemo, useState } from "react";
import Sidebar from "./Sidebar";
import { Menu, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import BackendStatusBanner from "@/components/BackendStatusBanner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useContracts, useEmployees, useExpenses, useSimCards } from "@/lib/backend";
import { useNavigate } from "react-router-dom";
import {
  buildContractResults,
  buildEmployeeResults,
  buildExpenseResults,
  buildSearchQuery,
  buildSimResults,
} from "@/lib/searchUtils";
import { cn } from "@/lib/utils";

interface MainLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
}

const MainLayout = ({ children, title, subtitle, actions }: MainLayoutProps) => {
  const navigate = useNavigate();
  const { items: contracts } = useContracts();
  const { items: simCards } = useSimCards();
  const employees = useEmployees();
  const { items: expenses } = useExpenses();
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const searchQuery = useMemo(() => buildSearchQuery(query), [query]);
  const contractResults = useMemo(
    () => buildContractResults(contracts, searchQuery),
    [contracts, searchQuery],
  );
  const simResults = useMemo(() => buildSimResults(simCards, searchQuery), [simCards, searchQuery]);
  const employeeResults = useMemo(
    () => buildEmployeeResults(employees, searchQuery),
    [employees, searchQuery],
  );
  const expenseResults = useMemo(
    () => buildExpenseResults(expenses, searchQuery),
    [expenses, searchQuery],
  );

  const allResults = useMemo(
    () => [...contractResults, ...simResults, ...employeeResults, ...expenseResults],
    [contractResults, simResults, employeeResults, expenseResults],
  );

  const handleSelect = (target: { id: string; path: string }) => {
    setSearchOpen(false);
    setQuery("");
    navigate(`${target.path}?id=${encodeURIComponent(target.id)}`);
  };

  return (
    <div className="min-h-screen bg-background">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} collapsed={collapsed} onToggleCollapse={() => setCollapsed((v) => !v)} />

      <main className={cn(!collapsed && "md:pl-64", collapsed && "md:pl-20")}>
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-2 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 md:px-6">
          <div className="flex items-center gap-2 md:gap-4 flex-1 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden shrink-0"
              aria-label="Открыть меню"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <Popover
              open={searchOpen && query.trim().length > 0}
              onOpenChange={(next) => setSearchOpen(next)}
            >
              <PopoverTrigger asChild>
                <div className="relative w-full max-w-80">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Поиск по системе..."
                    aria-label="Поиск по системе"
                    className="pl-10 bg-muted/50 border-0 focus-visible:ring-1"
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      if (!searchOpen) setSearchOpen(true);
                    }}
                    onFocus={() => setSearchOpen(true)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && allResults.length > 0) {
                        handleSelect(allResults[0]);
                      }
                    }}
                  />
                </div>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                side="bottom"
                sideOffset={8}
                className="w-[min(520px,90vw)] p-2"
                onOpenAutoFocus={(event) => event.preventDefault()}
                onCloseAutoFocus={(event) => event.preventDefault()}
              >
                {allResults.length === 0 ? (
                  <div className="px-3 py-4 text-sm text-muted-foreground">
                    Ничего не найдено
                  </div>
                ) : (
                  <div className="space-y-3">
                    {contractResults.length > 0 && (
                      <div className="space-y-1">
                        <div className="px-2 text-xs font-medium uppercase text-muted-foreground">
                          Договоры
                        </div>
                        <div className="space-y-1">
                          {contractResults.map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => handleSelect(item)}
                              className="w-full rounded-md px-2 py-2 text-left text-sm transition hover:bg-muted"
                            >
                              <div className="font-medium">{item.label}</div>
                              <div className="text-xs text-muted-foreground">{item.sublabel}</div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {simResults.length > 0 && (
                      <div className="space-y-1">
                        <div className="px-2 text-xs font-medium uppercase text-muted-foreground">
                          SIM-карты
                        </div>
                        <div className="space-y-1">
                          {simResults.map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => handleSelect(item)}
                              className="w-full rounded-md px-2 py-2 text-left text-sm transition hover:bg-muted"
                            >
                              <div className="font-medium">{item.label}</div>
                              <div className="text-xs text-muted-foreground">{item.sublabel}</div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {employeeResults.length > 0 && (
                      <div className="space-y-1">
                        <div className="px-2 text-xs font-medium uppercase text-muted-foreground">
                          Сотрудники
                        </div>
                        <div className="space-y-1">
                          {employeeResults.map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => handleSelect(item)}
                              className="w-full rounded-md px-2 py-2 text-left text-sm transition hover:bg-muted"
                            >
                              <div className="font-medium">{item.label}</div>
                              <div className="text-xs text-muted-foreground">{item.sublabel}</div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {expenseResults.length > 0 && (
                      <div className="space-y-1">
                        <div className="px-2 text-xs font-medium uppercase text-muted-foreground">
                          Расходы
                        </div>
                        <div className="space-y-1">
                          {expenseResults.map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => handleSelect(item)}
                              className="w-full rounded-md px-2 py-2 text-left text-sm transition hover:bg-muted"
                            >
                              <div className="font-medium">{item.label}</div>
                              <div className="text-xs text-muted-foreground">{item.sublabel}</div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </PopoverContent>
            </Popover>
          </div>
        </header>

        {/* Page content */}
        <div className="p-4 md:p-6">
          <BackendStatusBanner />
          {(title || actions) && (
            <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
              <div>
                {title && <h1 className="page-header">{title}</h1>}
                {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
              </div>
              {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
            </div>
          )}

          <div className="animate-fade-in">{children}</div>
        </div>
      </main>
    </div>
  );
};

export default MainLayout;
