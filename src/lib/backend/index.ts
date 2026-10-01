import { useCallback } from "react";
import { useMutation as useConvexMutation, useQuery as useConvexQuery } from "convex/react";
import type { Id, TableNames } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";
import { backendAvailable, convexClient } from "./client";

export type { Id };
export { api, backendAvailable, convexClient };

// NOTE on hooks rules: backendAvailable/convexClient are static module-level
// constants (build-time env). The demo-mode early return in each hook below
// therefore never changes hook order at runtime; each live branch is marked
// with a narrow eslint note instead of a file-wide disable.

export type DashboardCompany = {
  id: string;
  name: string;
  /** Active contracts (server counts status === "active"). */
  contracts: number;
  contractsTotal: number;
  simCards: number;
  employees: number;
  monthlyExpense: number;
};

export type DashboardContract = {
  id: string;
  number: string;
  company: string;
  operator: string;
  type: string;
  status: "active" | "closing" | "archived";
  monthlyFee: number;
  feeBasis?: string;
  dateBasis?: string;
  endDateBasis?: string;
  startDate?: string;
  endDate?: string;
  simCount?: number;
};

export type DashboardExpenseCompany = {
  companyId: string;
  company: string;
  amount: number;
};

export type DashboardExpensesByMonth = {
  month: string;
  periodKey: string;
  companies: DashboardExpenseCompany[];
};

export type DashboardServiceType = {
  name: string;
  value: number;
};

export type DashboardPeriod = {
  label: string;
  periodKey: string;
  total: number;
};

export type DashboardSummary = {
  /** Total for the selected scope (period total, or latest period when unscoped). */
  totalExpenses: number;
  scopedTotal: number;
  /** Active contracts only; see contractsTotal for all. */
  contracts: number;
  contractsTotal: number;
  simCards: number;
  employeesWithSim: number;
  month: string;
  periodKey: string;
};

export type DashboardData = {
  summary: DashboardSummary;
  periods: DashboardPeriod[];
  periodKeys: string[];
  months: string[];
  companies: DashboardCompany[];
  expensesByMonth: DashboardExpensesByMonth[];
  services: DashboardServiceType[];
  recentContracts: DashboardContract[];
};

export type DashboardArgs = {
  periodKey?: string;
  monthsLimit?: number;
  companyId?: string;
  contractId?: string;
};

export type ContractOption = { id: string; name: string };

export type Contract = {
  id: string;
  number: string;
  name?: string;
  companyId: string;
  company: string;
  operatorId: string;
  operator: string;
  type: string;
  serviceCategory?: string;
  normalizedNumber?: string;
  status: "active" | "closing" | "archived";
  archived?: boolean;
  startDate: string;
  endDate: string;
  monthlyFee: number;
  feeBasis?: string;
  dateBasis?: string;
  endDateBasis?: string;
  /** Legacy manual counter; computedSimCount is derived from SIM links. */
  simCount: number;
  computedSimCount?: number;
  responsibleEmployeeId?: string;
  responsibleEmployee?: string;
  /** Supported backend field for the service address. No other alias exists. */
  connectionAddress?: string;
  archiveReason?: string;
};

export type ContractHistory = {
  invoices: { id: string; kind: string; invoiceNo: string; month: string; periodKey?: string; total: number; voided: boolean }[];
  charges: { id: string; month: string; periodKey?: string; total: number; invoiceId?: string }[];
  simCards: { id: string; number: string }[];
  assignments: { id: string; simCardId: string; employeeId?: string; assignedAt: number; unassignedAt?: number }[];
};

export type Employee = {
  id: string;
  name: string;
  company: string;
  companyId?: string;
  department: string;
  position: string;
  status: "active" | "fired";
  /** Legacy manual counter; computedSimCount is derived from SIM links. */
  simCount: number;
  computedSimCount?: number;
  maxSim: number;
};

export type EmployeeHistory = {
  assignments: { id: string; simCardId: string; assignedAt: number; unassignedAt?: number }[];
  simCards: { id: string; number: string }[];
  expenses: { id: string; month: string; periodKey?: string; kind: string; total: number }[];
};

export type Operator = {
  id: string;
  name: string;
  type: string;
  manager: string;
  phone: string;
  email: string;
  contracts: number;
  simCards: number;
};

export type Company = {
  id: string;
  name: string;
  inn: string;
  kpp?: string;
  comment?: string;
  contracts: number;
  simCards: number;
  employees: number;
  monthlyExpense: number;
};

export type Tariff = {
  id: string;
  name: string;
  operatorId: string;
  operator: string;
  type: string;
  monthlyFee: number;
  feeBasis?: string;
  dateBasis?: string;
  endDateBasis?: string;
  dataLimitGb: number | null;
  minutes: number | null;
  sms: number | null;
  status: "active" | "archive";
  simCount: number;
};

export type Expense = {
  id: string;
  companyId: string;
  company: string;
  contract: string;
  contractId?: string;
  operator: string;
  month: string;
  periodKey: string;
  periodStart?: string;
  periodEnd?: string;
  multiMonth?: boolean;
  type: string;
  serviceCategory?: string;
  tariffId?: string;
  tariffName?: string;
  amount: number;
  vat: number;
  total: number;
  simNumber?: string;
  simCardId?: string;
  employeeId?: string;
  invoiceId?: string;
  parentExpenseId?: string;
  importId?: string;
  kind: "charge" | "allocation";
  documentKey?: string;
  voided?: boolean;
  voidReason?: string;
  status: "confirmed" | "draft" | "adjusted" | "cancelled";
  hasDocument: boolean;
  basis?: string;
  description?: string;
  sourcePage?: number;
  vatBasis?: string;
  serviceIdentifier?: string;
};

export type ExpenseFilters = {
  periodKey?: string;
  month?: string;
  companyId?: string;
  contractId?: string;
  employeeId?: string;
  kind?: "charge" | "allocation";
  includeVoided?: boolean;
};

export type ExpenseSummary = {
  total: number;
  confirmed: number;
  draft: number;
  allocationTotal: number;
  chargesCount: number;
  allocationsCount: number;
  noDocs: number;
  totalCount: number;
};

export type SimCard = {
  id: string;
  number: string;
  normalizedNumber?: string;
  iccid: string;
  type: string;
  status: "active" | "blocked";
  operatorId: string;
  operator: string;
  companyId: string;
  company: string;
  contractId?: string;
  contractNumber?: string;
  employeeId?: string;
  employee?: string;
  tariffId?: string;
  tariff?: string;
  limit?: number;
  connectionAddress?: string;
};

export type SimHistory = {
  assignments: { id: string; employeeId?: string; contractId?: string; assignedAt: number; unassignedAt?: number; note: string }[];
  expenses: { id: string; month: string; periodKey?: string; kind: string; total: number; employeeId?: string }[];
};

export type Assignment = {
  id: string;
  simCardId: string;
  employeeId?: string;
  contractId?: string;
  assignedAt: number;
  unassignedAt?: number;
  note: string;
};

// Формы отдают частично заполненные значения (zod валидирует обязательные
// поля на уровне UI), поэтому входы create/update терпимы к undefined,
// а нормализация до серверного контракта — в одном месте, здесь.
export type CompanyInput = Partial<Pick<Company, "name" | "inn" | "kpp" | "comment">>;
export type ContractInput = Partial<
  Pick<
    Contract,
    | "number" | "name" | "companyId" | "operatorId" | "type" | "serviceCategory" | "status"
    | "startDate" | "endDate" | "monthlyFee" | "simCount"
  >
> & {
  responsibleEmployeeId?: string;
  connectionAddress?: string;
};
export type EmployeeInput = Partial<
  Pick<Employee, "name" | "companyId" | "company" | "department" | "position" | "status" | "simCount" | "maxSim">
>;
export type OperatorInput = Partial<Pick<Operator, "name" | "type" | "manager" | "phone" | "email">>;
export type TariffInput = Partial<
  Pick<Tariff, "name" | "operatorId" | "type" | "monthlyFee" | "dataLimitGb" | "minutes" | "sms" | "status">
>;
export type ExpenseInput = Partial<
  Pick<
    Expense,
    | "companyId" | "contract" | "contractId" | "operator" | "month" | "periodKey" | "periodStart" | "periodEnd"
    | "type" | "serviceCategory" | "amount" | "vat" | "total" | "simNumber" | "simCardId" | "employeeId"
    | "invoiceId" | "parentExpenseId" | "tariffId" | "tariffName" | "kind" | "status" | "hasDocument" | "basis"
  >
>;
export type SimCardInput = Partial<
  Pick<
    SimCard,
    | "number" | "iccid" | "type" | "status" | "companyId" | "operatorId" | "contractId"
    | "employeeId" | "tariffId" | "limit" | "connectionAddress"
  >
>;

export type QueryState = {
  isLoading: boolean;
  error: string | null;
};

function requireBackend(): void {
  if (!convexClient || !backendAvailable) {
    throw new Error("Бэкенд недоступен: проверьте VITE_CONVEX_URL и подключение.");
  }
}

function toOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function toId<T extends TableNames>(value: string | undefined, label: string): Id<T> {
  if (!value) throw new Error(label);
  return value as Id<T>;
}

const emptySummary: DashboardSummary = {
  totalExpenses: 0,
  scopedTotal: 0,
  contracts: 0,
  contractsTotal: 0,
  simCards: 0,
  employeesWithSim: 0,
  month: "текущий период",
  periodKey: "",
};

const emptyDashboard: DashboardData = {
  summary: emptySummary,
  periods: [],
  periodKeys: [],
  months: [],
  companies: [],
  expensesByMonth: [],
  services: [],
  recentContracts: [],
};

const noopRefresh = async () => {
  // Reactive Convex queries update automatically; kept for API compatibility.
};

function useNoopRefresh() {
  // Stable no-op refresh for reactive queries.
  return useCallback(() => noopRefresh(), []);
}

// ---------------------------------------------------------------------------
// Dashboard (server-scoped by periodKey; no client-side duplicate aggregation)
// ---------------------------------------------------------------------------

function useDashboardDataLive(args?: DashboardArgs): DashboardData & QueryState & { refresh: () => Promise<void> } {
  const data = useConvexQuery(api.dashboard.getSummary, {
    monthsLimit: 60,
    ...(args?.periodKey ? { periodKey: args.periodKey } : {}),
    ...(args?.companyId ? { companyId: args.companyId as Id<"companies"> } : {}),
    ...(args?.contractId ? { contractId: args.contractId as Id<"contracts"> } : {}),
  });
  const refresh = useNoopRefresh();
  if (data === undefined) {
    return { ...emptyDashboard, summary: { ...emptySummary }, isLoading: true, error: null, refresh };
  }
  return {
    summary: data.summary,
    periods: data.periods,
    periodKeys: data.periodKeys,
    months: data.months,
    companies: data.companies,
    expensesByMonth: data.expensesByMonth,
    services: data.services,
    recentContracts: data.recentContracts,
    isLoading: false,
    error: null,
    refresh,
  };
}

export function useDashboardData(args?: DashboardArgs): DashboardData & QueryState & { refresh: () => Promise<void> } {
  if (!convexClient) {
    return { ...emptyDashboard, summary: { ...emptySummary }, isLoading: false, error: null, refresh: noopRefresh };
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks -- static demo-mode branch, hook order never changes at runtime
  return useDashboardDataLive(args);
}

// ---------------------------------------------------------------------------
// Employees
// ---------------------------------------------------------------------------

function normalizeEmployeePayload(payload: EmployeeInput) {
  const name = payload.name?.trim() ?? "";
  const companyId = payload.companyId ?? "";
  if (!name || !companyId) {
    throw new Error("Заполните ФИО и компанию");
  }
  if (payload.status !== undefined && payload.status !== "active" && payload.status !== "fired") {
    throw new Error("Некорректный статус сотрудника");
  }
  return {
    name,
    companyId: companyId as Id<"companies">,
    department: payload.department?.trim() ?? "",
    position: payload.position?.trim() ?? "",
    status: payload.status ?? "active",
    simCount: payload.simCount ?? 0,
    maxSim: payload.maxSim ?? 0,
  };
}

function useEmployeesWithMutationsLive() {
  const data = useConvexQuery(api.employees.list, {});
  const createMut = useConvexMutation(api.employees.create);
  const updateMut = useConvexMutation(api.employees.update);
  const removeMut = useConvexMutation(api.employees.remove);
  const refresh = useNoopRefresh();

  const createEmployee = async (payload: EmployeeInput) => {
    const normalized = normalizeEmployeePayload(payload);
    await createMut(normalized);
  };

  const updateEmployee = async (payload: Employee) => {
    const normalized = normalizeEmployeePayload(payload);
    await updateMut({ id: toId<"employees">(payload.id, "Нет идентификатора сотрудника"), ...normalized });
  };

  const deleteEmployee = async (id: string) => {
    await removeMut({ id: toId<"employees">(id, "Нет идентификатора сотрудника") });
  };

  return {
    items: data?.map((e) => ({ ...e, companyId: `${e.companyId}` })) ?? [],
    isLoading: data === undefined,
    error: null as string | null,
    refresh,
    createEmployee,
    updateEmployee,
    deleteEmployee,
  };
}

export function useEmployeesWithMutations() {
  if (!convexClient) {
    return {
      items: [] as Employee[],
      isLoading: false,
      error: null as string | null,
      refresh: noopRefresh,
      createEmployee: async () => {
        requireBackend();
      },
      updateEmployee: async () => {
        requireBackend();
      },
      deleteEmployee: async () => {
        requireBackend();
      },
    };
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks -- static demo-mode branch, hook order never changes at runtime
  return useEmployeesWithMutationsLive();
}

export function useEmployees(): Employee[] {
  const { items } = useEmployeesWithMutations();
  return items;
}

export function useEmployeeHistory(id?: string, periodKey?: string) {
  if (!convexClient) {
    return { assignments: [], simCards: [], expenses: [], isLoading: false };
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks -- static demo-mode branch, hook order never changes at runtime
  return useEmployeeHistoryLive(id, periodKey);
}

function useEmployeeHistoryLive(id: string | undefined, periodKey?: string): EmployeeHistory & { isLoading: boolean } {
  const data = useConvexQuery(api.employees.getWithHistory, id ? {
    id: id as Id<"employees">,
    ...(periodKey ? { periodKey } : {}),
  } : "skip");
  if (data === undefined || data === null) {
    return { assignments: [], simCards: [], expenses: [], isLoading: true };
  }
  return { ...data, isLoading: false };
}

// ---------------------------------------------------------------------------
// Contracts
// ---------------------------------------------------------------------------

type ContractsData = {
  items: Contract[];
  companies: ContractOption[];
  operators: ContractOption[];
};

const emptyContracts: ContractsData = { items: [], companies: [], operators: [] };

function normalizeContractPayload(payload: ContractInput) {
  const number = payload.number?.trim() ?? "";
  const companyId = payload.companyId ?? "";
  const operatorId = payload.operatorId ?? "";
  if (!number || !companyId || !operatorId) {
    throw new Error("Заполните номер, компанию и оператора");
  }
  if (
    payload.status !== undefined &&
    payload.status !== "active" &&
    payload.status !== "closing" &&
    payload.status !== "archived"
  ) {
    throw new Error("Некорректный статус договора");
  }
  return {
    number,
    name: toOptional(payload.name),
    companyId: companyId as Id<"companies">,
    operatorId: operatorId as Id<"operators">,
    type: payload.type?.trim() || "Мобильная связь",
    serviceCategory: toOptional(payload.serviceCategory),
    status: payload.status ?? "active",
    startDate: payload.startDate ?? "",
    endDate: payload.endDate ?? "",
    monthlyFee: payload.monthlyFee ?? 0,
    simCount: payload.simCount ?? 0,
    ...(payload.responsibleEmployeeId?.trim()
      ? { responsibleEmployeeId: payload.responsibleEmployeeId as Id<"employees"> }
      : {}),
    ...(toOptional(payload.connectionAddress) ? { connectionAddress: toOptional(payload.connectionAddress) } : {}),
  };
}

function useContractsLive() {
  const data = useConvexQuery(api.contracts.list, {});
  const createMut = useConvexMutation(api.contracts.create);
  const updateMut = useConvexMutation(api.contracts.update);
  const archiveMut = useConvexMutation(api.contracts.archive);
  const removeMut = useConvexMutation(api.contracts.remove);
  const refresh = useNoopRefresh();

  const createContract = async (payload: ContractInput) => {
    const normalized = normalizeContractPayload(payload);
    await createMut(normalized);
  };

  const updateContract = async (payload: Contract) => {
    const normalized = normalizeContractPayload(payload);
    await updateMut({ id: toId<"contracts">(payload.id, "Нет идентификатора договора"), ...normalized });
  };

  const archiveContract = async (id: string, reason: string) => {
    if (!reason.trim()) throw new Error("Причина архивирования обязательна");
    await archiveMut({ id: toId<"contracts">(id, "Нет идентификатора договора"), reason });
  };

  const deleteContract = async (id: string) => {
    await removeMut({ id: toId<"contracts">(id, "Нет идентификатора договора") });
  };

  return {
    items: data?.items.map((c) => ({
      ...c,
      companyId: `${c.companyId}`,
      operatorId: `${c.operatorId}`,
    })) ?? [],
    companies: data?.companies ?? [],
    operators: data?.operators ?? [],
    isLoading: data === undefined,
    error: null as string | null,
    refresh,
    createContract,
    updateContract,
    archiveContract,
    deleteContract,
  };
}

export function useContracts() {
  if (!convexClient) {
    return {
      ...emptyContracts,
      isLoading: false,
      error: null as string | null,
      refresh: noopRefresh,
      createContract: async () => {
        requireBackend();
      },
      updateContract: async () => {
        requireBackend();
      },
      archiveContract: async () => {
        requireBackend();
      },
      deleteContract: async () => {
        requireBackend();
      },
    };
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks -- static demo-mode branch, hook order never changes at runtime
  return useContractsLive();
}

export function useContractHistory(id?: string) {
  if (!convexClient) {
    return { invoices: [], charges: [], simCards: [], assignments: [], isLoading: false };
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks -- static demo-mode branch, hook order never changes at runtime
  return useContractHistoryLive(id);
}

function useContractHistoryLive(id: string | undefined): ContractHistory & { isLoading: boolean } {
  const data = useConvexQuery(api.contracts.getWithHistory, id ? { id: id as Id<"contracts"> } : "skip");
  if (data === undefined || data === null) {
    return { invoices: [], charges: [], simCards: [], assignments: [], isLoading: true };
  }
  return { ...data, isLoading: false };
}

// ---------------------------------------------------------------------------
// Operators (server exposes create/remove only; edit is wired when available)
// ---------------------------------------------------------------------------

function normalizeOperatorPayload(payload: OperatorInput) {
  const name = payload.name?.trim() ?? "";
  if (!name) {
    throw new Error("Введите название оператора");
  }
  return {
    name,
    type: toOptional(payload.type),
    manager: toOptional(payload.manager),
    phone: toOptional(payload.phone),
    email: toOptional(payload.email),
  };
}

function useOperatorsLive() {
  const data = useConvexQuery(api.operators.list, {});
  const createMut = useConvexMutation(api.operators.create);
  const updateMut = useConvexMutation(api.operators.update);
  const removeMut = useConvexMutation(api.operators.remove);
  const refresh = useNoopRefresh();

  const createOperator = async (payload: OperatorInput) => {
    const normalized = normalizeOperatorPayload(payload);
    await createMut(normalized);
  };

  const updateOperator = async (payload: OperatorInput & {id:string}) => { await updateMut({id:payload.id as Id<"operators">,...normalizeOperatorPayload(payload)}); };

  const deleteOperator = async (id: string) => {
    await removeMut({ id: toId<"operators">(id, "Нет идентификатора оператора") });
  };

  return {
    items: data ?? [],
    isLoading: data === undefined,
    error: null as string | null,
    refresh,
    createOperator,
    updateOperator,
    deleteOperator,
  };
}

export function useOperators() {
  if (!convexClient) {
    return {
      items: [] as Operator[],
      isLoading: false,
      error: null as string | null,
      refresh: noopRefresh,
      createOperator: async () => {
        requireBackend();
      },
      updateOperator: async (payload: OperatorInput & {id:string}) => { void payload; requireBackend(); },
      deleteOperator: async () => {
        requireBackend();
      },
    };
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks -- static demo-mode branch, hook order never changes at runtime
  return useOperatorsLive();
}

// ---------------------------------------------------------------------------
// Companies (server exposes create/remove only; edit is wired when available)
// ---------------------------------------------------------------------------

function normalizeCompanyPayload(payload: CompanyInput) {
  const name = payload.name?.trim() ?? "";
  if (!name) {
    throw new Error("Введите название компании");
  }
  return {
    name,
    inn: toOptional(payload.inn),
    kpp: toOptional(payload.kpp),
    comment: toOptional(payload.comment),
  };
}

function useCompaniesLive() {
  const data = useConvexQuery(api.companies.list, {});
  const createMut = useConvexMutation(api.companies.create);
  const updateMut = useConvexMutation(api.companies.update);
  const removeMut = useConvexMutation(api.companies.remove);
  const refresh = useNoopRefresh();

  const createCompany = async (payload: CompanyInput) => {
    const normalized = normalizeCompanyPayload(payload);
    await createMut(normalized);
  };

  const updateCompany = async (payload: CompanyInput & {id:string}) => { await updateMut({id:payload.id as Id<"companies">,...normalizeCompanyPayload(payload)}); };

  const deleteCompany = async (id: string) => {
    await removeMut({ id: toId<"companies">(id, "Нет идентификатора компании") });
  };

  return {
    items: data ?? [],
    isLoading: data === undefined,
    error: null as string | null,
    refresh,
    createCompany,
    updateCompany,
    deleteCompany,
  };
}

export function useCompanies() {
  if (!convexClient) {
    return {
      items: [] as Company[],
      isLoading: false,
      error: null as string | null,
      refresh: noopRefresh,
      createCompany: async () => {
        requireBackend();
      },
      updateCompany: async (payload: CompanyInput & {id:string}) => { void payload; requireBackend(); },
      deleteCompany: async () => {
        requireBackend();
      },
    };
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks -- static demo-mode branch, hook order never changes at runtime
  return useCompaniesLive();
}

// ---------------------------------------------------------------------------
// Tariffs
// ---------------------------------------------------------------------------

type TariffsData = {
  items: Tariff[];
  operators: ContractOption[];
};

const emptyTariffs: TariffsData = { items: [], operators: [] };

function normalizeTariffPayload(payload: TariffInput) {
  const name = payload.name?.trim() ?? "";
  const operatorId = payload.operatorId ?? "";
  if (!name || !operatorId) {
    throw new Error("Заполните название тарифа и оператора");
  }
  if (payload.status !== undefined && payload.status !== "active" && payload.status !== "archive") {
    throw new Error("Некорректный статус тарифа");
  }
  return {
    name,
    operatorId: operatorId as Id<"operators">,
    monthlyFee: payload.monthlyFee ?? 0,
    dataLimitGb: payload.dataLimitGb ?? undefined,
    minutes: payload.minutes ?? undefined,
    sms: payload.sms ?? undefined,
    status: payload.status ?? "active",
  };
}

function useTariffsLive() {
  const data = useConvexQuery(api.tariffs.list, {});
  const createMut = useConvexMutation(api.tariffs.create);
  const updateMut = useConvexMutation(api.tariffs.update);
  const removeMut = useConvexMutation(api.tariffs.remove);
  const refresh = useNoopRefresh();

  const createTariff = async (payload: TariffInput) => {
    const normalized = normalizeTariffPayload(payload);
    await createMut(normalized);
  };

  const updateTariff = async (payload: Tariff) => {
    const normalized = normalizeTariffPayload(payload);
    await updateMut({ id: toId<"tariffs">(payload.id, "Нет идентификатора тарифа"), ...normalized });
  };

  const deleteTariff = async (id: string) => {
    await removeMut({ id: toId<"tariffs">(id, "Нет идентификатора тарифа") });
  };

  return {
    items: data?.items.map((t) => ({ ...t, operatorId: `${t.operatorId}` })) ?? [],
    operators: data?.operators ?? [],
    isLoading: data === undefined,
    error: null as string | null,
    refresh,
    createTariff,
    updateTariff,
    deleteTariff,
  };
}

export function useTariffs() {
  if (!convexClient) {
    return {
      ...emptyTariffs,
      isLoading: false,
      error: null as string | null,
      refresh: noopRefresh,
      createTariff: async () => {
        requireBackend();
      },
      updateTariff: async () => {
        requireBackend();
      },
      deleteTariff: async () => {
        requireBackend();
      },
    };
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks -- static demo-mode branch, hook order never changes at runtime
  return useTariffsLive();
}

// ---------------------------------------------------------------------------
// Expenses (charges + allocations; summaries count charges only)
// ---------------------------------------------------------------------------

type ExpensesData = {
  items: Expense[];
  companies: ContractOption[];
  summary: ExpenseSummary;
};

const emptyExpenseSummary: ExpenseSummary = {
  total: 0,
  confirmed: 0,
  draft: 0,
  allocationTotal: 0,
  chargesCount: 0,
  allocationsCount: 0,
  noDocs: 0,
  totalCount: 0,
};

const emptyExpenses: ExpensesData = {
  items: [],
  companies: [],
  summary: emptyExpenseSummary,
};

function normalizeExpensePayload(payload: ExpenseInput) {
  const companyId = payload.companyId ?? "";
  const month = payload.month?.trim() ?? "";
  const type = payload.type?.trim() ?? "";
  if (!companyId || !month || !type) {
    throw new Error("Заполните компанию, период и тип расхода");
  }
  if (
    payload.status !== undefined &&
    payload.status !== "confirmed" &&
    payload.status !== "draft" &&
    payload.status !== "adjusted"
  ) {
    throw new Error("Некорректный статус расхода");
  }
  if (payload.kind !== undefined && payload.kind !== "charge" && payload.kind !== "allocation") {
    throw new Error("Некорректный вид расхода");
  }
  const amount = payload.amount ?? 0;
  const vat = payload.vat ?? 0;
  return {
    companyId: companyId as Id<"companies">,
    contract: toOptional(payload.contract),
    contractId: payload.contractId ? (payload.contractId as Id<"contracts">) : undefined,
    operator: toOptional(payload.operator),
    month,
    periodKey: toOptional(payload.periodKey),
    periodStart: toOptional(payload.periodStart),
    periodEnd: toOptional(payload.periodEnd),
    type,
    serviceCategory: toOptional(payload.serviceCategory),
    amount,
    vat,
    total: payload.total ?? amount + vat,
    simNumber: toOptional(payload.simNumber),
    simCardId: payload.simCardId ? (payload.simCardId as Id<"simCards">) : undefined,
    employeeId: payload.employeeId ? (payload.employeeId as Id<"employees">) : undefined,
    invoiceId: payload.invoiceId ? (payload.invoiceId as Id<"invoices">) : undefined,
    parentExpenseId: payload.parentExpenseId ? (payload.parentExpenseId as Id<"expenses">) : undefined,
    tariffId: payload.tariffId ? (payload.tariffId as Id<"tariffs">) : undefined,
    tariffName: toOptional(payload.tariffName),
    kind: payload.kind ?? undefined,
    status: payload.status ?? "draft",
    hasDocument: payload.hasDocument ?? false,
    basis: toOptional(payload.basis),
  };
}

function useExpensesLive(filters?: ExpenseFilters) {
  const data = useConvexQuery(api.expenses.list, {
    ...(filters?.periodKey ? { periodKey: filters.periodKey } : {}),
    ...(filters?.month ? { month: filters.month } : {}),
    ...(filters?.companyId ? { companyId: filters.companyId as Id<"companies"> } : {}),
    ...(filters?.contractId ? { contractId: filters.contractId as Id<"contracts"> } : {}),
    ...(filters?.employeeId ? { employeeId: filters.employeeId as Id<"employees"> } : {}),
    ...(filters?.kind ? { kind: filters.kind } : {}),
    ...(filters?.includeVoided ? { includeVoided: true } : {}),
  });
  const createMut = useConvexMutation(api.expenses.create);
  const updateMut = useConvexMutation(api.expenses.update);
  const removeMut = useConvexMutation(api.expenses.remove);
  const voidMut = useConvexMutation(api.expenses.voidExpense);
  const refresh = useNoopRefresh();

  const createExpense = async (payload: ExpenseInput) => {
    const normalized = normalizeExpensePayload(payload);
    await createMut(normalized);
  };

  const updateExpense = async (payload: Expense) => {
    const normalized = normalizeExpensePayload(payload);
    await updateMut({ id: toId<"expenses">(payload.id, "Нет идентификатора расхода"), ...normalized });
  };

  const deleteExpense = async (id: string) => {
    await removeMut({ id: toId<"expenses">(id, "Нет идентификатора расхода") });
  };

  const voidExpense = async (id: string, reason: string) => {
    if (!reason.trim()) throw new Error("Причина аннулирования обязательна");
    await voidMut({ id: toId<"expenses">(id, "Нет идентификатора расхода"), reason });
  };

  return {
    items: data?.items.map((e) => ({ ...e, companyId: `${e.companyId}` })) ?? [],
    companies: data?.companies ?? [],
    summary: data?.summary ?? { ...emptyExpenseSummary },
    isLoading: data === undefined,
    error: null as string | null,
    refreshExpenses: refresh,
    refresh,
    createExpense,
    updateExpense,
    deleteExpense,
    voidExpense,
  };
}

export function useExpenses(filters?: ExpenseFilters) {
  if (!convexClient) {
    return {
      ...emptyExpenses,
      summary: { ...emptyExpenseSummary },
      isLoading: false,
      error: null as string | null,
      refreshExpenses: noopRefresh,
      refresh: noopRefresh,
      createExpense: async () => {
        requireBackend();
      },
      updateExpense: async () => {
        requireBackend();
      },
      deleteExpense: async () => {
        requireBackend();
      },
      voidExpense: async () => {
        requireBackend();
      },
    };
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks -- static demo-mode branch, hook order never changes at runtime
  return useExpensesLive(filters);
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

export type Invoice = {
  id: string;
  fileName: string;
  fileUrl: string | null;
  operator: string;
  kind: "invoice" | "detail";
  invoiceNo: string;
  invoiceDate: string;
  periodStart: string;
  periodEnd: string;
  month: string;
  periodKey: string;
  multiMonth?: boolean;
  contractNumber: string;
  contractId?: string;
  contract: string;
  companyId?: string;
  company: string;
  /** Original document amounts (payable). Never summed as service expenses. */
  amount: number;
  vat: number;
  total: number;
  /** Optional corrected service total / amount due (shown when the backend provides them). */
  serviceTotal?: number;
  amountDue?: number;
  openingBalance?: number;
  payments?: number;
  status: "draft" | "matched" | "void";
  expenseId?: string;
  chargeId?: string;
  chargeTotal: number;
  allocatedTotal: number;
  unallocated: number;
  allocationsCount: number;
  identityKey?: string;
  documentKey?: string;
  contentSha256?: string;
  fingerprint?: string;
  fileHash?: string;
  voided: boolean;
  voidReason: string;
  appliedAt?: number;
  note: string;
  createdAt: number;
};

export type InvoiceReconciliation = {
  invoiceId: string;
  kind: "invoice" | "detail";
  voided: boolean;
  chargeId?: string;
  chargeTotal: number;
  allocations: { id: string; total: number; simNumber: string; employeeId?: string; contractId?: string }[];
  allocatedTotal: number;
  unallocated: number;
  matched: boolean;
};

export type InvoicePreview = {
  parsed: {
    invoiceNo: string;
    invoiceDate: string;
    periodStart: string;
    periodEnd: string;
    contractNumber: string;
    accountNumber: string;
    subscriber: string;
    subscriberInn: string;
    amount: number;
    vat: number;
    total: number;
    /** Optional corrected service total / amount due (shown when the parser provides them). */
    serviceTotal?: number;
    vatRate?: number;
    vatBasis?: string;
    amountDue?: number;
  openingBalance?: number;
  payments?: number;
    notes: string[];
    month: string;
  };
  suggested: {
    operator: string;
    contractId?: string;
    contractNumber: string;
    companyId?: string;
  };
  existingExpense?: { id: string; total: number };
};

type InvoicesData = {
  items: Invoice[];
  companies: ContractOption[];
  contracts: { id: string; name: string }[];
  summary: { total: number; matched: number; draft: number; voided: number };
  activeCount: number;
};

const emptyInvoices: InvoicesData = {
  items: [],
  companies: [],
  contracts: [],
  summary: { total: 0, matched: 0, draft: 0, voided: 0 },
  activeCount: 0,
};

function useInvoicesLive() {
  const data = useConvexQuery(api.invoices.list, {});
  const updateMut = useConvexMutation(api.invoices.update);
  const rebindMut = useConvexMutation(api.invoices.rebind);
  const voidMut = useConvexMutation(api.invoices.voidInvoice);
  const removeMut = useConvexMutation(api.invoices.remove);
  const refresh = useNoopRefresh();

  const updateInvoice = async (payload: {
    id: string;
    contractId?: string;
    contractNumber?: string;
    companyId?: string;
    note?: string;
  }) => {
    requireBackend();
    await updateMut({
      id: toId<"invoices">(payload.id, "Нет идентификатора счёта"),
      ...(payload.contractId ? { contractId: payload.contractId as Id<"contracts"> } : {}),
      ...(payload.contractNumber !== undefined ? { contractNumber: payload.contractNumber } : {}),
      ...(payload.companyId ? { companyId: payload.companyId as Id<"companies"> } : {}),
      ...(payload.note !== undefined ? { note: payload.note } : {}),
    });
  };

  const rebindInvoice = async (payload: {
    id: string;
    contractId?: string;
    companyId?: string;
    contractNumber?: string;
    force?: boolean;
    note?: string;
  }) => {
    requireBackend();
    await rebindMut({
      id: toId<"invoices">(payload.id, "Нет идентификатора счёта"),
      ...(payload.contractId ? { contractId: payload.contractId as Id<"contracts"> } : {}),
      ...(payload.companyId ? { companyId: payload.companyId as Id<"companies"> } : {}),
      ...(payload.contractNumber !== undefined ? { contractNumber: payload.contractNumber } : {}),
      ...(payload.force !== undefined ? { force: payload.force } : {}),
      ...(payload.note !== undefined ? { note: payload.note } : {}),
    });
  };

  const voidInvoice = async (id: string, reason: string) => {
    if (!reason.trim()) throw new Error("Причина аннулирования обязательна");
    requireBackend();
    await voidMut({ id: toId<"invoices">(id, "Нет идентификатора счёта"), reason });
  };

  const deleteInvoice = async (id: string) => {
    requireBackend();
    await removeMut({ id: toId<"invoices">(id, "Нет идентификатора счёта") });
  };

  return {
    items: data?.items.map((i) => ({
      ...i,
      contractId: i.contractId ? `${i.contractId}` : undefined,
      companyId: i.companyId ? `${i.companyId}` : undefined,
      expenseId: i.expenseId ? `${i.expenseId}` : undefined,
      chargeId: i.chargeId ? `${i.chargeId}` : undefined,
    })) ?? [],
    companies: data?.companies ?? [],
    contracts: data?.contracts ?? [],
    summary: data?.summary ?? { total: 0, matched: 0, draft: 0, voided: 0 },
    activeCount: data?.activeCount ?? 0,
    isLoading: data === undefined,
    error: null as string | null,
    refresh,
    updateInvoice,
    rebindInvoice,
    voidInvoice,
    deleteInvoice,
  };
}

export function useInvoices() {
  if (!convexClient) {
    return {
      ...emptyInvoices,
      summary: { total: 0, matched: 0, draft: 0, voided: 0 },
      isLoading: false,
      error: null as string | null,
      refresh: noopRefresh,
      updateInvoice: async () => {
        requireBackend();
      },
      rebindInvoice: async () => {
        requireBackend();
      },
      voidInvoice: async () => {
        requireBackend();
      },
      deleteInvoice: async () => {
        requireBackend();
      },
    };
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks -- static demo-mode branch, hook order never changes at runtime
  return useInvoicesLive();
}

export function useInvoiceReconciliation(id?: string) {
  if (!convexClient) {
    return { reconciliation: null as InvoiceReconciliation | null, isLoading: false };
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks -- static demo-mode branch, hook order never changes at runtime
  return useInvoiceReconciliationLive(id);
}

function useInvoiceReconciliationLive(id: string | undefined) {
  const data = useConvexQuery(api.invoices.getReconciliation, id ? { id: id as Id<"invoices"> } : "skip");
  if (data === undefined) {
    return { reconciliation: null as InvoiceReconciliation | null, isLoading: true };
  }
  return { reconciliation: data, isLoading: false };
}

// ---------------------------------------------------------------------------
// SIM cards (explicit contract link; nullable assign/unassign; history)
// ---------------------------------------------------------------------------

type SimCardsData = {
  items: SimCard[];
  companies: ContractOption[];
  operators: ContractOption[];
  employees: ContractOption[];
  tariffs: ContractOption[];
  contracts: ContractOption[];
};

const emptySimCards: SimCardsData = { items: [], companies: [], operators: [], employees: [], tariffs: [], contracts: [] };

const NONE_OPTION = "__none";

function normalizeSimCardPayload(payload: SimCardInput) {
  const number = payload.number?.trim() ?? "";
  const companyId = payload.companyId && payload.companyId !== NONE_OPTION ? payload.companyId : "";
  const operatorId = payload.operatorId && payload.operatorId !== NONE_OPTION ? payload.operatorId : "";
  if (!number || !companyId || !operatorId) {
    throw new Error("Заполните номер, компанию и оператора");
  }
  if (payload.status !== undefined && payload.status !== "active" && payload.status !== "blocked") {
    throw new Error("Некорректный статус SIM-карты");
  }
  return {
    number,
    iccid: toOptional(payload.iccid),
    type: toOptional(payload.type),
    companyId: companyId as Id<"companies">,
    operatorId: operatorId as Id<"operators">,
    contractId:
      payload.contractId && payload.contractId !== NONE_OPTION
        ? (payload.contractId as Id<"contracts">)
        : undefined,
    employeeId:
      payload.employeeId && payload.employeeId !== NONE_OPTION
        ? (payload.employeeId as Id<"employees">)
        : undefined,
    tariffId:
      payload.tariffId && payload.tariffId !== NONE_OPTION ? (payload.tariffId as Id<"tariffs">) : undefined,
    status: payload.status ?? "active",
    limit: payload.limit,
    connectionAddress: toOptional(payload.connectionAddress),
  };
}

function useSimCardsLive() {
  const data = useConvexQuery(api.simCards.list, {});
  const createMut = useConvexMutation(api.simCards.create);
  const updateMut = useConvexMutation(api.simCards.update);
  const assignMut = useConvexMutation(api.simCards.assign);
  const removeMut = useConvexMutation(api.simCards.remove);
  const refresh = useNoopRefresh();

  const createSimCard = async (payload: SimCardInput) => {
    const normalized = normalizeSimCardPayload(payload);
    await createMut(normalized);
  };

  const updateSimCard = async (payload: SimCard) => {
    const normalized = normalizeSimCardPayload(payload);
    await updateMut({ id: toId<"simCards">(payload.id, "Нет идентификатора SIM-карты"), ...normalized });
  };

  /** Explicit assign/unassign: employeeId null removes the link (no undefined ambiguity). */
  const assignSimCard = async (id: string, employeeId: string | null, contractId?: string) => {
    await assignMut({
      id: toId<"simCards">(id, "Нет идентификатора SIM-карты"),
      employeeId: employeeId ? (employeeId as Id<"employees">) : null,
      ...(contractId ? { contractId: contractId as Id<"contracts"> } : {}),
    });
  };

  const deleteSimCard = async (id: string) => {
    await removeMut({ id: toId<"simCards">(id, "Нет идентификатора SIM-карты") });
  };

  return {
    items: data?.items.map((s) => ({
      ...s,
      companyId: `${s.companyId}`,
      operatorId: `${s.operatorId}`,
      contractId: s.contractId ? `${s.contractId}` : undefined,
      employeeId: s.employeeId ? `${s.employeeId}` : undefined,
      tariffId: s.tariffId ? `${s.tariffId}` : undefined,
    })) ?? [],
    companies: data?.companies ?? [],
    operators: data?.operators ?? [],
    employees: data?.employees ?? [],
    tariffs: data?.tariffs ?? [],
    contracts: data?.contracts ?? [],
    isLoading: data === undefined,
    error: null as string | null,
    refresh,
    createSimCard,
    updateSimCard,
    assignSimCard,
    deleteSimCard,
  };
}

export function useSimCards() {
  if (!convexClient) {
    return {
      ...emptySimCards,
      isLoading: false,
      error: null as string | null,
      refresh: noopRefresh,
      createSimCard: async () => {
        requireBackend();
      },
      updateSimCard: async () => {
        requireBackend();
      },
      assignSimCard: async () => {
        requireBackend();
      },
      deleteSimCard: async () => {
        requireBackend();
      },
    };
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks -- static demo-mode branch, hook order never changes at runtime
  return useSimCardsLive();
}

export function useSimHistory(id?: string, periodKey?: string) {
  if (!convexClient) {
    return { assignments: [], expenses: [], isLoading: false };
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks -- static demo-mode branch, hook order never changes at runtime
  return useSimHistoryLive(id, periodKey);
}

function useSimHistoryLive(id: string | undefined, periodKey?: string): SimHistory & { isLoading: boolean } {
  const data = useConvexQuery(api.simCards.getHistory, id ? {
    id: id as Id<"simCards">,
    ...(periodKey ? { periodKey } : {}),
  } : "skip");
  if (data === undefined || data === null) {
    return { assignments: [], expenses: [], isLoading: true };
  }
  return {
    assignments: data.assignments.map((a) => ({
      ...a,
      employeeId: a.employeeId ? `${a.employeeId}` : undefined,
      contractId: a.contractId ? `${a.contractId}` : undefined,
    })),
    expenses: data.expenses.map((e) => ({
      ...e,
      employeeId: e.employeeId ? `${e.employeeId}` : undefined,
    })),
    isLoading: false,
  };
}

export function useSimAssignmentHistory(simCardId?: string) {
  if (!convexClient || !simCardId) {
    return { items: [] as Assignment[], isLoading: false };
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks -- static demo-mode branch, hook order never changes at runtime
  return useSimAssignmentHistoryLive(simCardId);
}

function useSimAssignmentHistoryLive(simCardId: string) {
  const data = useConvexQuery(api.simAssignments.historyBySim, { simCardId: simCardId as Id<"simCards"> });
  if (data === undefined) {
    return { items: [] as Assignment[], isLoading: true };
  }
  return {
    items: data.map((a) => ({
      ...a,
      simCardId: `${a.simCardId}`,
      employeeId: a.employeeId ? `${a.employeeId}` : undefined,
      contractId: a.contractId ? `${a.contractId}` : undefined,
    })),
    isLoading: false,
  };
}

export function useEmployeeAssignmentHistory(employeeId?: string) {
  if (!convexClient || !employeeId) {
    return { items: [] as Assignment[], isLoading: false };
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks -- static demo-mode branch, hook order never changes at runtime
  return useEmployeeAssignmentHistoryLive(employeeId);
}

function useEmployeeAssignmentHistoryLive(employeeId: string) {
  const data = useConvexQuery(api.simAssignments.historyByEmployee, {
    employeeId: employeeId as Id<"employees">,
  });
  if (data === undefined) {
    return { items: [] as Assignment[], isLoading: true };
  }
  return {
    items: data.map((a) => ({
      ...a,
      simCardId: `${a.simCardId}`,
      contractId: a.contractId ? `${a.contractId}` : undefined,
    })),
    isLoading: false,
  };
}
