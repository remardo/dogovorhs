import { useCallback, useEffect, useState } from "react";
import { toast } from "@/components/ui/sonner";
import type { Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";
import { backendAvailable, convexClient } from "./client";

export type { Id };
export { api, backendAvailable, convexClient };

export type DashboardCompany = {
  id: string;
  name: string;
  contracts: number;
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
  status: "active" | "closing";
  monthlyFee: number;
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
  companies: DashboardExpenseCompany[];
};

export type DashboardServiceType = {
  name: string;
  value: number;
};

export type DashboardData = {
  summary: {
    totalExpenses: number;
    contracts: number;
    simCards: number;
    employeesWithSim: number;
    month: string;
  };
  periods?: { label: string; createdAt: number }[];
  months: string[];
  companies: DashboardCompany[];
  expensesByMonth: DashboardExpensesByMonth[];
  services: DashboardServiceType[];
  recentContracts: DashboardContract[];
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
  status: "active" | "closing";
  startDate: string;
  endDate: string;
  monthlyFee: number;
  simCount: number;
};

export type Employee = {
  id: string;
  name: string;
  company: string;
  companyId?: string;
  department: string;
  position: string;
  status: "active" | "fired";
  simCount: number;
  maxSim: number;
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
  operator: string;
  month: string;
  type: string;
  amount: number;
  vat: number;
  total: number;
  simNumber?: string;
  importId?: string;
  status: "confirmed" | "draft" | "adjusted";
  hasDocument: boolean;
};

export type SimCard = {
  id: string;
  number: string;
  iccid: string;
  type: string;
  status: "active" | "blocked";
  operatorId: string;
  operator: string;
  companyId: string;
  company: string;
  employeeId?: string;
  employee?: string;
  tariffId?: string;
  tariff?: string;
  limit?: number;
};

// Формы отдают частично заполненные значения (zod валидирует обязательные
// поля на уровне UI), поэтому входы create/update терпимы к undefined,
// а нормализация до серверного контракта — в одном месте, здесь.
export type CompanyInput = Partial<Pick<Company, "name" | "inn" | "kpp" | "comment">>;
export type ContractInput = Partial<
  Pick<
    Contract,
    "number" | "name" | "companyId" | "operatorId" | "type" | "status" | "startDate" | "endDate" | "monthlyFee" | "simCount"
  >
>;
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
    | "companyId"
    | "contract"
    | "operator"
    | "month"
    | "type"
    | "amount"
    | "vat"
    | "total"
    | "simNumber"
    | "status"
    | "hasDocument"
  >
>;
export type SimCardInput = Partial<
  Pick<
    SimCard,
    "number" | "iccid" | "type" | "status" | "companyId" | "operatorId" | "employeeId" | "tariffId" | "limit"
  >
>;

export type QueryState = {
  isLoading: boolean;
  error: string | null;
};

const fallbackNotices = new Set<string>();

function notifyFallbackOnce(key: string, title: string, description: string) {
  if (typeof window === "undefined") return;
  if (fallbackNotices.has(key)) return;
  fallbackNotices.add(key);
  toast(title, { description });
}

function notifyBackendError() {
  notifyFallbackOnce("backend-offline", "Нет связи с бэкендом", "Данные недоступны. Проверьте подключение.");
}

function notifyValidation(message: string) {
  toast(message);
}

function toOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function requireClient(): boolean {
  if (!convexClient || !backendAvailable) {
    notifyBackendError();
    return false;
  }
  return true;
}

const emptyDashboard: DashboardData = {
  summary: {
    totalExpenses: 0,
    contracts: 0,
    simCards: 0,
    employeesWithSim: 0,
    month: "текущий период",
  },
  periods: [],
  months: [],
  companies: [],
  expensesByMonth: [],
  services: [],
  recentContracts: [],
};

type Loader<T> = () => Promise<T>;

function useConvexQuery<T>(empty: T, load: Loader<T>, options?: { pollMs?: number }): {
  data: T;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
} {
  const [data, setData] = useState<T>(empty);
  const [isLoading, setIsLoading] = useState(() => Boolean(convexClient));
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!convexClient) return;
    setIsLoading(true);
    try {
      const res = await load();
      setData(res ?? empty);
      setError(null);
    } catch (err) {
      console.error("Failed to load backend data", err);
      setData(empty);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [empty, load]);

  useEffect(() => {
    if (!convexClient) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    load()
      .then((res) => {
        if (cancelled) return;
        setData(res ?? empty);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error("Failed to load backend data", err);
        setData(empty);
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    if (!options?.pollMs) {
      return () => {
        cancelled = true;
      };
    }
    const poll = () => {
      if (document.visibilityState !== "visible") return;
      refresh();
    };
    const interval = window.setInterval(poll, options.pollMs);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [empty, load, options?.pollMs, refresh]);

  return { data, isLoading, error, refresh };
}

async function mutateAndRefresh(mutation: () => Promise<unknown>, refresh: () => Promise<void>, label: string) {
  if (!requireClient()) return;
  try {
    await mutation();
    await refresh();
  } catch (err) {
    console.warn(`${label} failed`, err);
    notifyBackendError();
  }
}

export function useDashboardData(): DashboardData & QueryState & { refresh: () => Promise<void> } {
  const { data, isLoading, error, refresh } = useConvexQuery(
    emptyDashboard,
    () => convexClient!.query(api.dashboard.getSummary, {}),
    { pollMs: 30_000 },
  );
  return { ...data, isLoading, error, refresh };
}

export function useEmployees(): Employee[] {
  const { items } = useEmployeesWithMutations();
  return items;
}

function normalizeEmployeePayload(payload: EmployeeInput) {
  const name = payload.name?.trim() ?? "";
  const companyId = payload.companyId ?? "";
  if (!name || !companyId) {
    notifyValidation("Заполните ФИО и компанию");
    return null;
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

// Extended hook with creation and company IDs
export function useEmployeesWithMutations() {
  const { data, isLoading, error, refresh } = useConvexQuery<Employee[]>([], () =>
    convexClient!.query(api.employees.list, {}),
  );

  const createEmployee = async (payload: EmployeeInput) => {
    const normalized = normalizeEmployeePayload(payload);
    if (!normalized) return;
    await mutateAndRefresh(
      () => convexClient!.mutation(api.employees.create, normalized),
      refresh,
      "employees:create",
    );
  };

  const updateEmployee = async (payload: Employee) => {
    const normalized = normalizeEmployeePayload(payload);
    if (!normalized) return;
    await mutateAndRefresh(
      () =>
        convexClient!.mutation(api.employees.update, {
          id: payload.id as Id<"employees">,
          ...normalized,
        }),
      refresh,
      "employees:update",
    );
  };

  const deleteEmployee = async (id: string) => {
    if (!id) {
      notifyValidation("Нет идентификатора сотрудника");
      return;
    }
    await mutateAndRefresh(
      () => convexClient!.mutation(api.employees.remove, { id: id as Id<"employees"> }),
      refresh,
      "employees:remove",
    );
  };

  return { items: data, isLoading, error, refresh, createEmployee, updateEmployee, deleteEmployee };
}

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
    notifyValidation("Заполните номер, компанию и оператора");
    return null;
  }
  return {
    number,
    name: toOptional(payload.name),
    companyId: companyId as Id<"companies">,
    operatorId: operatorId as Id<"operators">,
    type: payload.type?.trim() || "Мобильная связь",
    status: payload.status ?? "active",
    startDate: payload.startDate ?? "",
    endDate: payload.endDate ?? "",
    monthlyFee: payload.monthlyFee ?? 0,
    simCount: payload.simCount ?? 0,
  };
}

export function useContracts() {
  const { data, isLoading, error, refresh } = useConvexQuery(emptyContracts, () =>
    convexClient!.query(api.contracts.list, {}),
  );

  const createContract = async (payload: ContractInput) => {
    const normalized = normalizeContractPayload(payload);
    if (!normalized) return;
    await mutateAndRefresh(() => convexClient!.mutation(api.contracts.create, normalized), refresh, "contracts:create");
  };

  const updateContract = async (payload: Contract) => {
    const normalized = normalizeContractPayload(payload);
    if (!normalized) return;
    await mutateAndRefresh(
      () =>
        convexClient!.mutation(api.contracts.update, {
          id: payload.id as Id<"contracts">,
          ...normalized,
        }),
      refresh,
      "contracts:update",
    );
  };

  const deleteContract = async (id: string) => {
    if (!id) {
      notifyValidation("Нет идентификатора договора");
      return;
    }
    await mutateAndRefresh(
      () =>
        convexClient!.mutation(api.contracts.remove, {
          id: id as Id<"contracts">,
        }),
      refresh,
      "contracts:remove",
    );
  };

  return { ...data, isLoading, error, refresh, createContract, updateContract, deleteContract };
}

function normalizeOperatorPayload(payload: OperatorInput) {
  const name = payload.name?.trim() ?? "";
  if (!name) {
    notifyValidation("Введите название оператора");
    return null;
  }
  return {
    name,
    type: toOptional(payload.type),
    manager: toOptional(payload.manager),
    phone: toOptional(payload.phone),
    email: toOptional(payload.email),
  };
}

export function useOperators() {
  const { data, isLoading, error, refresh } = useConvexQuery<Operator[]>([], () =>
    convexClient!.query(api.operators.list, {}),
  );

  const createOperator = async (payload: OperatorInput) => {
    const normalized = normalizeOperatorPayload(payload);
    if (!normalized) return;
    await mutateAndRefresh(() => convexClient!.mutation(api.operators.create, normalized), refresh, "operators:create");
  };

  const deleteOperator = async (id: string) => {
    if (!id) {
      notifyValidation("Нет идентификатора оператора");
      return;
    }
    await mutateAndRefresh(
      () => convexClient!.mutation(api.operators.remove, { id: id as Id<"operators"> }),
      refresh,
      "operators:remove",
    );
  };

  return { items: data, isLoading, error, refresh, createOperator, deleteOperator };
}

function normalizeCompanyPayload(payload: CompanyInput) {
  const name = payload.name?.trim() ?? "";
  if (!name) {
    notifyValidation("Введите название компании");
    return null;
  }
  return {
    name,
    inn: toOptional(payload.inn),
    kpp: toOptional(payload.kpp),
    comment: toOptional(payload.comment),
  };
}

export function useCompanies() {
  const { data, isLoading, error, refresh } = useConvexQuery<Company[]>([], () =>
    convexClient!.query(api.companies.list, {}),
  );

  const createCompany = async (payload: CompanyInput) => {
    const normalized = normalizeCompanyPayload(payload);
    if (!normalized) return;
    await mutateAndRefresh(() => convexClient!.mutation(api.companies.create, normalized), refresh, "companies:create");
  };

  const deleteCompany = async (id: string) => {
    if (!id) {
      notifyValidation("Нет идентификатора компании");
      return;
    }
    await mutateAndRefresh(
      () => convexClient!.mutation(api.companies.remove, { id: id as Id<"companies"> }),
      refresh,
      "companies:remove",
    );
  };

  return { items: data, isLoading, error, refresh, createCompany, deleteCompany };
}

type TariffsData = {
  items: Tariff[];
  operators: ContractOption[];
};

const emptyTariffs: TariffsData = { items: [], operators: [] };

function normalizeTariffPayload(payload: TariffInput) {
  const name = payload.name?.trim() ?? "";
  const operatorId = payload.operatorId ?? "";
  if (!name || !operatorId) {
    notifyValidation("Заполните название тарифа и оператора");
    return null;
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

export function useTariffs() {
  const { data, isLoading, error, refresh } = useConvexQuery(emptyTariffs, () =>
    convexClient!.query(api.tariffs.list, {}),
  );

  const createTariff = async (payload: TariffInput) => {
    const normalized = normalizeTariffPayload(payload);
    if (!normalized) return;
    await mutateAndRefresh(() => convexClient!.mutation(api.tariffs.create, normalized), refresh, "tariffs:create");
  };

  const updateTariff = async (payload: Tariff) => {
    const normalized = normalizeTariffPayload(payload);
    if (!normalized) return;
    await mutateAndRefresh(
      () =>
        convexClient!.mutation(api.tariffs.update, {
          id: payload.id as Id<"tariffs">,
          ...normalized,
        }),
      refresh,
      "tariffs:update",
    );
  };

  const deleteTariff = async (id: string) => {
    if (!id) {
      notifyValidation("Нет идентификатора тарифа");
      return;
    }
    await mutateAndRefresh(
      () => convexClient!.mutation(api.tariffs.remove, { id: id as Id<"tariffs"> }),
      refresh,
      "tariffs:remove",
    );
  };

  return { ...data, isLoading, error, refresh, createTariff, updateTariff, deleteTariff };
}

type ExpensesData = {
  items: Expense[];
  companies: ContractOption[];
  summary: { total: number; confirmed: number; draft: number; noDocs: number };
};

const emptyExpenses: ExpensesData = {
  items: [],
  companies: [],
  summary: { total: 0, confirmed: 0, draft: 0, noDocs: 0 },
};

function normalizeExpensePayload(payload: ExpenseInput) {
  const companyId = payload.companyId ?? "";
  const month = payload.month?.trim() ?? "";
  const type = payload.type?.trim() ?? "";
  if (!companyId || !month || !type) {
    notifyValidation("Заполните компанию, период и тип расхода");
    return null;
  }
  const amount = payload.amount ?? 0;
  const vat = payload.vat ?? 0;
  return {
    companyId: companyId as Id<"companies">,
    contract: toOptional(payload.contract),
    operator: toOptional(payload.operator),
    month,
    type,
    amount,
    vat,
    total: payload.total ?? amount + vat,
    simNumber: toOptional(payload.simNumber),
    status: payload.status ?? "draft",
    hasDocument: payload.hasDocument ?? false,
  };
}

export function useExpenses() {
  const { data, isLoading, error, refresh } = useConvexQuery(emptyExpenses, () =>
    convexClient!.query(api.expenses.list, {}),
  );

  const refreshExpenses = refresh;

  const createExpense = async (payload: ExpenseInput) => {
    const normalized = normalizeExpensePayload(payload);
    if (!normalized) return;
    await mutateAndRefresh(() => convexClient!.mutation(api.expenses.create, normalized), refresh, "expenses:create");
  };

  const updateExpense = async (payload: Expense) => {
    const normalized = normalizeExpensePayload(payload);
    if (!normalized) return;
    await mutateAndRefresh(
      () =>
        convexClient!.mutation(api.expenses.update, {
          id: payload.id as Id<"expenses">,
          ...normalized,
        }),
      refresh,
      "expenses:update",
    );
  };

  const deleteExpense = async (id: string) => {
    if (!id) {
      notifyValidation("Нет идентификатора расхода");
      return;
    }
    await mutateAndRefresh(
      () => convexClient!.mutation(api.expenses.remove, { id: id as Id<"expenses"> }),
      refresh,
      "expenses:remove",
    );
  };

  return { ...data, isLoading, error, refreshExpenses, refresh, createExpense, updateExpense, deleteExpense };
}

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
  contractNumber: string;
  contractId?: string;
  contract: string;
  companyId?: string;
  company: string;
  amount: number;
  vat: number;
  total: number;
  status: "draft" | "matched";
  expenseId?: string;
  note: string;
  createdAt: number;
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
  summary: { total: number; matched: number; draft: number };
};

const emptyInvoices: InvoicesData = {
  items: [],
  companies: [],
  contracts: [],
  summary: { total: 0, matched: 0, draft: 0 },
};

export function useInvoices() {
  const { data, isLoading, error, refresh } = useConvexQuery(emptyInvoices, () =>
    convexClient!.query(api.invoices.list, {}),
  );

  const updateInvoice = async (payload: {
    id: string;
    contractId?: string;
    contractNumber?: string;
    companyId?: string;
    note?: string;
  }) => {
    if (!requireClient()) return;
    await mutateAndRefresh(
      () =>
        convexClient!.mutation(api.invoices.update, {
          id: payload.id as Id<"invoices">,
          ...(payload.contractId ? { contractId: payload.contractId as Id<"contracts"> } : {}),
          ...(payload.contractNumber !== undefined ? { contractNumber: payload.contractNumber } : {}),
          ...(payload.companyId ? { companyId: payload.companyId as Id<"companies"> } : {}),
          ...(payload.note !== undefined ? { note: payload.note } : {}),
        }),
      refresh,
      "invoices:update",
    );
  };

  const deleteInvoice = async (id: string) => {
    if (!id) {
      notifyValidation("Нет идентификатора счёта");
      return;
    }
    await mutateAndRefresh(
      () => convexClient!.mutation(api.invoices.remove, { id: id as Id<"invoices"> }),
      refresh,
      "invoices:remove",
    );
  };

  return { ...data, isLoading, error, refresh, updateInvoice, deleteInvoice };
}

type SimCardsData = {
  items: SimCard[];
  companies: ContractOption[];
  operators: ContractOption[];
  employees: ContractOption[];
  tariffs: ContractOption[];
};

const emptySimCards: SimCardsData = { items: [], companies: [], operators: [], employees: [], tariffs: [] };

const NONE_OPTION = "__none";

function normalizeSimCardPayload(payload: SimCardInput) {
  const number = payload.number?.trim() ?? "";
  const companyId = payload.companyId && payload.companyId !== NONE_OPTION ? payload.companyId : "";
  const operatorId = payload.operatorId && payload.operatorId !== NONE_OPTION ? payload.operatorId : "";
  if (!number || !companyId || !operatorId) {
    notifyValidation("Заполните номер, компанию и оператора");
    return null;
  }
  const employeeId =
    payload.employeeId && payload.employeeId !== NONE_OPTION
      ? (payload.employeeId as Id<"employees">)
      : undefined;
  const tariffId =
    payload.tariffId && payload.tariffId !== NONE_OPTION ? (payload.tariffId as Id<"tariffs">) : undefined;
  return {
    number,
    iccid: toOptional(payload.iccid),
    type: toOptional(payload.type),
    companyId: companyId as Id<"companies">,
    operatorId: operatorId as Id<"operators">,
    employeeId,
    tariffId,
    status: payload.status ?? "active",
    limit: payload.limit,
  };
}

export function useSimCards() {
  const { data, isLoading, error, refresh } = useConvexQuery(emptySimCards, () =>
    convexClient!.query(api.simCards.list, {}),
  );

  const createSimCard = async (payload: SimCardInput) => {
    const normalized = normalizeSimCardPayload(payload);
    if (!normalized) return;
    await mutateAndRefresh(() => convexClient!.mutation(api.simCards.create, normalized), refresh, "simCards:create");
  };

  const updateSimCard = async (payload: SimCard) => {
    const normalized = normalizeSimCardPayload(payload);
    if (!normalized) return;
    await mutateAndRefresh(
      () =>
        convexClient!.mutation(api.simCards.update, {
          id: payload.id as Id<"simCards">,
          ...normalized,
        }),
      refresh,
      "simCards:update",
    );
  };

  const deleteSimCard = async (id: string) => {
    if (!id) {
      notifyValidation("Нет идентификатора SIM-карты");
      return;
    }
    await mutateAndRefresh(
      () => convexClient!.mutation(api.simCards.remove, { id: id as Id<"simCards"> }),
      refresh,
      "simCards:remove",
    );
  };

  return { ...data, isLoading, error, refresh, createSimCard, updateSimCard, deleteSimCard };
}
