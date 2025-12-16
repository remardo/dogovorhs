import { FileText, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import type { DashboardContract } from "@/lib/backend";

type Props = {
  contracts: DashboardContract[];
};

const RecentContracts = ({ contracts }: Props) => {
  return (
    <div className="stat-card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="section-header">Последние договоры</h3>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/contracts" className="flex items-center gap-1 text-sm text-primary">
            Все договоры
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
      
      <div className="space-y-3">
        {contracts.map((contract) => (
          <div
            key={contract.id}
            className="flex items-center gap-4 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium text-foreground">{contract.number}</p>
                <span className={contract.status === "active" ? "badge-active" : "badge-warning"}>
                  {contract.status === "active" ? "Активен" : "Расторжение"}
                </span>
              </div>
              <p className="text-sm text-muted-foreground truncate">
                {contract.company} · {contract.operator} · {contract.type}
              </p>
            </div>
            
            <p className="text-sm font-medium text-foreground whitespace-nowrap">
              {(contract.monthlyFee ?? 0).toLocaleString("ru-RU")} ₽/мес
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RecentContracts;
