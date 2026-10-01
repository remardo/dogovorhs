import React from "react";
import { Link } from "react-router-dom";
import MainLayout from "@/components/layout/MainLayout";
import StatCard from "@/components/dashboard/StatCard";
import CompanyCard from "@/components/dashboard/CompanyCard";
import ExpenseChart from "@/components/dashboard/ExpenseChart";
import ServiceTypeChart from "@/components/dashboard/ServiceTypeChart";
import RecentContracts from "@/components/dashboard/RecentContracts";
import { ErrorBlock, LoadingBlock } from "@/components/QueryState";
import { FileText, Smartphone, Users, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDashboardData } from "@/lib/backend";
import { periodLabel } from "@/lib/servicePeriod";

const ALL_PERIODS = "__all";

const Dashboard = () => {
  // Full range for the period selector; scoped query drives totals, company
  // cards and charts (server aggregates charges only, calendrically sorted).
  const full = useDashboardData({ monthsLimit: 0 });
  const [effectivePeriod, setPeriod] = React.useState(ALL_PERIODS);
  const scoped = useDashboardData(
    effectivePeriod !== ALL_PERIODS && effectivePeriod ? { periodKey: effectivePeriod, monthsLimit: 0 } : { monthsLimit: 0 },
  );

  const selectedLabel = effectivePeriod !== ALL_PERIODS && effectivePeriod ? periodLabel(effectivePeriod) : "все периоды";
  const isLoading = full.isLoading || scoped.isLoading;
  const hasScopeData = scoped.expensesByMonth.some((m) => m.companies.length > 0);

  return (
    <MainLayout
      title="Дашборд"
      subtitle="Обзор расходов на связь и интернет холдинга"
      actions={
        <div className="flex flex-wrap items-center gap-3">
          <Select value={effectivePeriod || ALL_PERIODS} onValueChange={(v) => setPeriod(v)}>
            <SelectTrigger className="w-56" aria-label="Период услуг">
              <SelectValue placeholder="Период услуг" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_PERIODS}>Все периоды</SelectItem>
              {full.periodKeys.map((k) => (
                <SelectItem key={k} value={k}>
                  {periodLabel(k)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button asChild>
            <Link to="/expenses">
              <CreditCard className="h-4 w-4 mr-2" />
              Внести расходы
            </Link>
          </Button>
        </div>
      }
    >
      {isLoading ? (
        <LoadingBlock text="Загрузка сводки…" />
      ) : scoped.error ?? full.error ? (
        <ErrorBlock message={(scoped.error ?? full.error) as string} />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard
              title="Всего расходов"
              value={`${scoped.summary.scopedTotal.toLocaleString("ru-RU")} ₽`}
              subtitle={`за ${selectedLabel} (начисления)`}
              icon={<CreditCard className="h-5 w-5" />}
            />
            <StatCard
              title="Активных договоров"
              value={scoped.summary.contracts.toString()}
              subtitle={`всего: ${scoped.summary.contractsTotal}`}
              icon={<FileText className="h-5 w-5" />}
            />
            <StatCard
              title="Номеров и подключений"
              value={scoped.summary.simCards.toString()}
              icon={<Smartphone className="h-5 w-5" />}
            />
            <StatCard
              title="Сотрудников с SIM"
              value={scoped.summary.employeesWithSim.toString()}
              subtitle="по фактическим назначениям"
              icon={<Users className="h-5 w-5" />}
            />
          </div>

          <div className="mb-6">
            <h2 className="section-header mb-4">Расходы по компаниям — {selectedLabel}</h2>
            {scoped.companies.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                Нет компаний
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {scoped.companies.map((company) => (
                  <CompanyCard key={company.id} {...company} />
                ))}
              </div>
            )}
          </div>

          {!hasScopeData ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground mb-6">
              Нет начислений за {selectedLabel}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
              <div className="lg:col-span-2">
                <ExpenseChart data={scoped.expensesByMonth} />
              </div>
              <div>
                <ServiceTypeChart data={scoped.services} />
              </div>
            </div>
          )}

          <RecentContracts contracts={full.recentContracts} />
        </>
      )}
    </MainLayout>
  );
};

export default Dashboard;
