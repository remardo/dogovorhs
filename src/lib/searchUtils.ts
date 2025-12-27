import type { Contract, Employee, SimCard } from "@/lib/backend";

export type SearchQuery = {
  raw: string;
  normalized: string;
  digits: string;
};

export type SearchResult = {
  id: string;
  label: string;
  sublabel: string;
  path: "/contracts" | "/sim-cards" | "/employees";
  query: string;
  kind: "contract" | "sim" | "employee";
};

export const buildSearchQuery = (input: string): SearchQuery => {
  const raw = input ?? "";
  return {
    raw,
    normalized: raw.trim().toLowerCase(),
    digits: raw.replace(/\D/g, ""),
  };
};

const hasText = (query: SearchQuery) => query.normalized.length > 0;
const hasDigits = (query: SearchQuery) => query.digits.length > 0;

const matchesText = (value: string, query: SearchQuery) =>
  hasText(query) && value.toLowerCase().includes(query.normalized);

const matchesDigits = (value: string, query: SearchQuery) =>
  hasDigits(query) && value.replace(/\D/g, "").includes(query.digits);

export const buildContractResults = (contracts: Contract[], query: SearchQuery, limit = 6): SearchResult[] => {
  if (!hasText(query) && !hasDigits(query)) return [];
  return contracts
    .filter(
      (contract) =>
        matchesText(contract.number, query) ||
        matchesText(contract.name ?? "", query) ||
        matchesText(contract.company, query) ||
        matchesText(contract.operator, query) ||
        matchesText(contract.type, query) ||
        matchesDigits(contract.number, query),
    )
    .slice(0, limit)
    .map((contract) => ({
      id: contract.id,
      label: contract.number + (contract.name ? ` · ${contract.name}` : ""),
      sublabel: `${contract.company} · ${contract.operator}`,
      path: "/contracts",
      query: contract.number,
      kind: "contract",
    }));
};

export const buildSimResults = (simCards: SimCard[], query: SearchQuery, limit = 6): SearchResult[] => {
  if (!hasText(query) && !hasDigits(query)) return [];
  return simCards
    .filter(
      (sim) =>
        matchesText(sim.number, query) ||
        matchesDigits(sim.number, query) ||
        matchesDigits(sim.iccid, query) ||
        matchesText(sim.company, query) ||
        matchesText(sim.operator, query) ||
        matchesText(sim.employee ?? "", query) ||
        matchesText(sim.tariff ?? "", query) ||
        matchesText(sim.type, query),
    )
    .slice(0, limit)
    .map((sim) => ({
      id: sim.id,
      label: sim.number,
      sublabel: `${sim.company} · ${sim.operator}`,
      path: "/sim-cards",
      query: sim.number,
      kind: "sim",
    }));
};

export const buildEmployeeResults = (employees: Employee[], query: SearchQuery, limit = 6): SearchResult[] => {
  if (!hasText(query)) return [];
  return employees
    .filter(
      (employee) =>
        matchesText(employee.name, query) ||
        matchesText(employee.company, query) ||
        matchesText(employee.department, query) ||
        matchesText(employee.position, query),
    )
    .slice(0, limit)
    .map((employee) => ({
      id: employee.id,
      label: employee.name,
      sublabel: `${employee.company} · ${employee.position}`,
      path: "/employees",
      query: employee.name,
      kind: "employee",
    }));
};
