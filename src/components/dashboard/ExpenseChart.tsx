import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { DashboardExpensesByMonth } from "@/lib/backend";

type Props = {
  data: DashboardExpensesByMonth[];
};

const ExpenseChart = ({ data }: Props) => {
  const allCompanies = data.flatMap((m) => m.companies);
  const uniqueCompanies = Array.from(new Map(allCompanies.map((c) => [c.companyId, c])).values());

  const chartData = data.map((row) => {
    const base: Record<string, number | string> = { month: row.month };
    row.companies.forEach((c) => {
      base[c.companyId] = c.amount;
    });
    return base;
  });

  return (
    <div className="stat-card">
      <h3 className="section-header mb-4">Расходы на связь по месяцам</h3>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis
              dataKey="month"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
              tickFormatter={(value) => `${(value / 1000).toFixed(0)}к`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
              }}
              labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600, marginBottom: "4px" }}
              formatter={(value: number) => [`${value.toLocaleString("ru-RU")} ₽`, ""]}
            />
            <Legend
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ paddingTop: "16px" }}
              formatter={(value) => uniqueCompanies.find((c) => c.companyId === value)?.company ?? value}
            />
            {uniqueCompanies.map((company, index) => (
              <Bar
                key={company.companyId}
                dataKey={company.companyId}
                name={company.company}
                fill={`hsl(var(--chart-${(index % 5) + 1}))`}
                radius={[4, 4, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default ExpenseChart;
