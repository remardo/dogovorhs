import React from "react";
import MainLayout from "@/components/layout/MainLayout";
import StatCard from "@/components/dashboard/StatCard";
import CompanyCard from "@/components/dashboard/CompanyCard";
import ExpenseChart from "@/components/dashboard/ExpenseChart";
import ServiceTypeChart from "@/components/dashboard/ServiceTypeChart";
import RecentContracts from "@/components/dashboard/RecentContracts";
import { FileText, Smartphone, Users, CreditCard, CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useDashboardData } from "@/lib/backend";
import { addDays, format, isAfter, isWithinInterval } from "date-fns";
import type { DateRange } from "react-day-picker";

const Dashboard = () => {
  const dashboard = useDashboardData();
  const { summary, companies, expensesByMonth, services, recentContracts, months, periods = [] } = dashboard;

  const periodsWithDates =
    periods.length > 0
      ? periods
      : months.map((m, idx) => ({
          label: m,
          createdAt: addDays(new Date(), -idx * 30).getTime(),
        }));

  const [dateRange, setDateRange] = React.useState<DateRange | undefined>(() => {
    const latest = periodsWithDates[0]?.createdAt;
    if (!latest) return undefined;
    const d = new Date(latest);
    return { from: d, to: d };
  });

  const filteredPeriods = React.useMemo(() => {
    if (!dateRange?.from || !dateRange.to) return periodsWithDates;
    return periodsWithDates.filter((p) =>
      isWithinInterval(new Date(p.createdAt), { start: dateRange.from!, end: dateRange.to! }),
    );
  }, [dateRange, periodsWithDates]);

  const filteredExpenses = React.useMemo(() => {
    if (!filteredPeriods.length) return expensesByMonth;
    const allowed = new Set(filteredPeriods.map((p) => p.label));
    return expensesByMonth.filter((m) => allowed.has(m.month));
  }, [expensesByMonth, filteredPeriods]);

  const totalExpenses = React.useMemo(() => {
    if (!filteredExpenses.length) return summary.totalExpenses;
    return filteredExpenses.reduce(
      (sum, month) => sum + month.companies.reduce((s, c) => s + c.amount, 0),
      0,
    );
  }, [filteredExpenses, summary.totalExpenses]);

  const selectedLabel = React.useMemo(() => {
    if (!dateRange?.from || !dateRange.to) return filteredPeriods[0]?.label ?? summary.month;
    const fromStr = format(dateRange.from, "dd.MM.yyyy");
    const toStr = format(dateRange.to, "dd.MM.yyyy");
    return fromStr === toStr ? fromStr : `${fromStr} — ${toStr}`;
  }, [dateRange, filteredPeriods, summary.month]);

  return (
    <MainLayout
      title="Дашборд"
      subtitle="Обзор расходов на связь и интернет холдинга"
      actions={
        <div className="flex items-center gap-3">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-64 justify-start text-left font-normal">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {selectedLabel}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="p-0 w-auto" side="bottom" align="start" sideOffset={4}>
              <Calendar
                mode="range"
                numberOfMonths={2}
                selected={dateRange}
                onSelect={(range) => {
                  if (range?.from && range.to && isAfter(range.from, addDays(range.to, 365))) {
                    return;
                  }
                  setDateRange(range ?? undefined);
                }}
                defaultMonth={dateRange?.from ?? new Date()}
              />
              <div className="flex items-center justify-between px-4 pb-3 pt-2 text-xs text-muted-foreground">
                <span>От 1 дня до 1 года</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDateRange({ from: addDays(new Date(), -30), to: new Date() })}
                >
                  Последние 30 дней
                </Button>
              </div>
            </PopoverContent>
          </Popover>
          <Button>
            <CreditCard className="h-4 w-4 mr-2" />
            Внести расходы
          </Button>
        </div>
      }
    >
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="Всего расходов"
          value={`${totalExpenses.toLocaleString("ru-RU")} ₽`}
          subtitle={`за ${selectedLabel}`}
          icon={<CreditCard className="h-5 w-5" />}
          trend={{ value: 2.3, label: "к прошлому месяцу" }}
        />
        <StatCard
          title="Активных договоров"
          value={summary.contracts.toString()}
          icon={<FileText className="h-5 w-5" />}
          trend={{ value: 0 }}
        />
        <StatCard
          title="Активных SIM-карт"
          value={summary.simCards.toString()}
          icon={<Smartphone className="h-5 w-5" />}
          trend={{ value: 3.2, label: "к прошлому месяцу" }}
        />
        <StatCard
          title="Сотрудников с SIM"
          value={summary.employeesWithSim.toString()}
          icon={<Users className="h-5 w-5" />}
          trend={{ value: 1.5, label: "к прошлому месяцу" }}
        />
      </div>

      {/* Company Cards */}
      <div className="mb-6">
        <h2 className="section-header mb-4">Расходы по компаниям</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {companies.map((company) => (
            <CompanyCard key={company.id} {...company} />
          ))}
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2">
          <ExpenseChart data={filteredExpenses} />
        </div>
        <div>
          <ServiceTypeChart data={services} />
        </div>
      </div>

      {/* Recent Contracts */}
      <RecentContracts contracts={recentContracts} />
    </MainLayout>
  );
};

export default Dashboard;
