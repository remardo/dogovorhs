import { Building2, FileText, Smartphone, Users } from "lucide-react";
import { cn } from "@/lib/utils";

interface CompanyCardProps {
  name: string;
  contracts: number;
  simCards: number;
  employees: number;
  monthlyExpense: number;
  className?: string;
}

const CompanyCard = ({ 
  name, 
  contracts, 
  simCards, 
  employees, 
  monthlyExpense,
  className 
}: CompanyCardProps) => {
  return (
    <div className={cn("stat-card", className)}>
      <div className="flex items-center gap-3 mb-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Building2 className="h-5 w-5 text-primary" />
        </div>
        <h3 className="font-semibold text-foreground">{name}</h3>
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-lg font-semibold">{contracts}</p>
            <p className="text-xs text-muted-foreground">договоров</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-lg font-semibold">{simCards}</p>
            <p className="text-xs text-muted-foreground">SIM-карт</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-lg font-semibold">{employees}</p>
            <p className="text-xs text-muted-foreground">сотрудников</p>
          </div>
        </div>
        
        <div>
          <p className="text-lg font-semibold">{monthlyExpense.toLocaleString('ru-RU')} ₽</p>
          <p className="text-xs text-muted-foreground">расходы/мес</p>
        </div>
      </div>
    </div>
  );
};

export default CompanyCard;
