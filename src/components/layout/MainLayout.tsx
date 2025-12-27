import { ReactNode, useMemo, useState } from "react";
import Sidebar from "./Sidebar";
import { Bell, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import BackendStatusBanner from "@/components/BackendStatusBanner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useContracts, useEmployees, useSimCards } from "@/lib/backend";
import { useNavigate } from "react-router-dom";
import {
  buildContractResults,
  buildEmployeeResults,
  buildSearchQuery,
  buildSimResults,
} from "@/lib/searchUtils";

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
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

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

  const allResults = useMemo(
    () => [...contractResults, ...simResults, ...employeeResults],
    [contractResults, simResults, employeeResults],
  );

  const handleSelect = (target: { path: string; query: string }) => {
    setSearchOpen(false);
    setQuery(target.query);
    navigate(`${target.path}?q=${encodeURIComponent(target.query)}`);
  };

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      
      <main className="pl-64">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-6">
          <div className="flex items-center gap-4 flex-1">
            <Popover
              open={searchOpen && query.trim().length > 0}
              onOpenChange={(next) => setSearchOpen(next)}
            >
              <PopoverTrigger asChild>
                <div className="relative w-80">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Поиск по системе..."
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
                  </div>
                )}
              </PopoverContent>
            </Popover>
          </div>
          
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5 text-muted-foreground" />
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-destructive" />
            </Button>
          </div>
        </header>

        {/* Page content */}
        <div className="p-6">
          <BackendStatusBanner />
          {(title || actions) && (
            <div className="mb-6 flex items-start justify-between">
              <div>
                {title && <h1 className="page-header">{title}</h1>}
                {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
              </div>
              {actions && <div className="flex items-center gap-3">{actions}</div>}
            </div>
          )}
          
          <div className="animate-fade-in">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
};

export default MainLayout;
