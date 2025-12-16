import type { SimCard } from "./backend";

export type SimCardFilters = {
  search: string;
  companyFilter: string;
  operatorFilter: string;
  statusFilter: string;
  typeFilter: string;
};

const normalize = (value: string) => value.trim().toLowerCase();

export function filterSimCards(simCards: SimCard[], filters: SimCardFilters) {
  const search = normalize(filters.search);

  return simCards.filter((sim) => {
    const matchesSearch =
      !search ||
      normalize(sim.number).includes(search) ||
      normalize(sim.iccid).includes(search) ||
      normalize(sim.operator).includes(search);

    const matchesCompany = filters.companyFilter === "all" || sim.companyId === filters.companyFilter;
    const matchesOperator = filters.operatorFilter === "all" || sim.operatorId === filters.operatorFilter;
    const matchesStatus = filters.statusFilter === "all" || sim.status === filters.statusFilter;
    const matchesType = filters.typeFilter === "all" || sim.type === filters.typeFilter;

    return matchesSearch && matchesCompany && matchesOperator && matchesStatus && matchesType;
  });
}

export function pickFirstOrNone<T extends { id: string }>(items: T[], noneValue: string) {
  return items[0]?.id ?? noneValue;
}
