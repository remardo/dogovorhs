import { useEffect, useState } from "react";
import { toast } from "@/components/ui/sonner";
import type { Id } from "../../../convex/_generated/dataModel";
import { backendAvailable, convexClient } from "./client";

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

export function useDashboardData(): DashboardData {
  const [data, setData] = useState<DashboardData>(emptyDashboard);

  useEffect(() => {
    if (!convexClient) {
      return;
    }

    let cancelled = false;

    const fetchData = async () => {
      try {
        const res = (await convexClient.query("dashboard:getSummary", {})) as Partial<DashboardData> | null;
        if (!cancelled && res) {
          setData({
            ...emptyDashboard,
            ...res,
            periods: res.periods ?? [],
            months: res.months ?? [],
            companies: res.companies ?? [],
            expensesByMonth: res.expensesByMonth ?? [],
            services: res.services ?? [],
            recentContracts: res.recentContracts ?? [],
            summary: { ...emptyDashboard.summary, ...(res.summary ?? {}) },
          });
        }
      } catch (error) {
        console.error("Failed to load dashboard data", error);
        setData(emptyDashboard);
      }
    };

    const poll = () => {
      if (document.visibilityState !== "visible") return;
      fetchData();
    };

    fetchData();
    const interval = window.setInterval(poll, 30_000);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        fetchData();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  return data;
}

export function useEmployees(): Employee[] {
  const [data, setData] = useState<Employee[]>([]);

  useEffect(() => {
    if (!convexClient) {
      return;
    }

    let cancelled = false;

    convexClient
      .query("employees:list", {})
      .then((res) => {
        if (!cancelled && res) {
          setData(res as Employee[]);
        }
      })
      .catch(() => {
        setData([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return data;
}
// Extended hook with creation and company IDs
export function useEmployeesWithMutations() {
  const [data, setData] = useState<Employee[]>([]);

  useEffect(() => {
    if (!convexClient) {
      return;
    }

    let cancelled = false;

    convexClient
      .query("employees:list", {})
      .then((res) => {
        if (!cancelled && res) {
          setData(res as Employee[]);
        }
      })
      .catch(() => {
        setData([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const createEmployee = async (payload: Omit<Employee, "id" | "company"> & { company: string }) => {
    if (!convexClient || !backendAvailable) {
      notifyBackendError();
      return;
    }

    try {
      await convexClient.mutation("employees:create", {
        name: payload.name,
        companyId: payload.companyId as Id<"companies">,
        department: payload.department,
        position: payload.position,
        status: payload.status,
        simCount: payload.simCount,
        maxSim: payload.maxSim,
      });
      const res = await convexClient.query("employees:list", {});
      setData(res as Employee[]);
    } catch (err) {
      console.warn("employees:create failed", err);
      notifyBackendError();
    }
  };

  const updateEmployee = async (payload: Employee) => {
    if (!convexClient || !backendAvailable) {
      notifyBackendError();
      return;
    }

    try {
      await convexClient.mutation("employees:update", {
        id: payload.id as Id<"employees">,
        name: payload.name,
        companyId: (payload.companyId || "") as Id<"companies">,
        department: payload.department,
        position: payload.position,
        status: payload.status,
        simCount: payload.simCount,
        maxSim: payload.maxSim,
      });
      const res = await convexClient.query("employees:list", {});
      setData(res as Employee[]);
    } catch (err) {
      console.warn("employees:update failed", err);
      notifyBackendError();
    }
  };

  const deleteEmployee = async (id: string) => {
    if (!convexClient || !backendAvailable) {
      notifyBackendError();
      return;
    }
    try {
      await convexClient.mutation("employees:remove", { id: id as Id<"employees"> });
      const res = await convexClient.query("employees:list", {});
      setData(res as Employee[]);
    } catch (err) {
      console.warn("employees:remove failed", err);
      notifyBackendError();
    }
  };

  return { items: data, createEmployee, updateEmployee, deleteEmployee };
}

export function useContracts() {
  const [data, setData] = useState<{
    items: Contract[];
    companies: ContractOption[];
    operators: ContractOption[];
  }>({
    items: [],
    companies: [],
    operators: [],
  });

  useEffect(() => {
    if (!convexClient) {
      return;
    }
    let cancelled = false;
    convexClient
      .query("contracts:list", {})
      .then((res) => {
        if (!cancelled && res) {
          setData(res as typeof data);
        }
      })
      .catch(() => {
        setData({ items: [], companies: [], operators: [] });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const createContract = async (payload: Omit<Contract, "id" | "company" | "operator">) => {
    if (!convexClient || !backendAvailable) {
      notifyBackendError();
      return;
    }

    try {
      await convexClient.mutation("contracts:create", {
        number: payload.number,
        name: payload.name,
        companyId: payload.companyId as Id<"companies">,
        operatorId: payload.operatorId as Id<"operators">,
        type: payload.type,
        status: payload.status,
        startDate: payload.startDate,
        endDate: payload.endDate,
        monthlyFee: payload.monthlyFee,
        simCount: payload.simCount,
      });
      const res = await convexClient.query("contracts:list", {});
      setData(res as typeof data);
    } catch (err) {
      console.warn("contracts:create failed", err);
      notifyBackendError();
    }
  };

  const updateContract = async (payload: Contract) => {
    if (!convexClient || !backendAvailable) {
      notifyBackendError();
      return;
    }

    try {
      await convexClient.mutation("contracts:update", {
        id: payload.id as Id<"contracts">,
        number: payload.number,
        name: payload.name,
        companyId: payload.companyId as Id<"companies">,
        operatorId: payload.operatorId as Id<"operators">,
        type: payload.type,
        status: payload.status,
        startDate: payload.startDate,
        endDate: payload.endDate,
        monthlyFee: payload.monthlyFee,
        simCount: payload.simCount,
      });
      const res = await convexClient.query("contracts:list", {});
      setData(res as typeof data);
    } catch (err) {
      console.warn("contracts:update failed", err);
      notifyBackendError();
    }
  };

  const deleteContract = async (id: string) => {
    if (!convexClient || !backendAvailable) {
      notifyBackendError();
      return;
    }

    try {
      await convexClient.mutation("contracts:remove", {
        id: id as Id<"contracts">,
      });
      const res = await convexClient.query("contracts:list", {});
      setData(res as typeof data);
    } catch (err) {
      console.warn("contracts:remove failed", err);
      notifyBackendError();
    }
  };

  return { ...data, createContract, updateContract, deleteContract };
}

export function useOperators() {
  const [items, setItems] = useState<Operator[]>([]);

  useEffect(() => {
    if (!convexClient) {
      return;
    }
    let cancelled = false;
    convexClient
      .query("operators:list", {})
      .then((res) => {
        if (!cancelled && res) {
          setItems(res as Operator[]);
        }
      })
      .catch(() => {
        setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const createOperator = async (payload: Omit<Operator, "id" | "contracts" | "simCards">) => {
    if (!convexClient || !backendAvailable) {
      notifyBackendError();
      return;
    }

    try {
      await convexClient.mutation("operators:create", {
        name: payload.name,
        type: payload.type,
        manager: payload.manager,
        phone: payload.phone,
        email: payload.email,
      });
      const res = await convexClient.query("operators:list", {});
      setItems(res as Operator[]);
    } catch (err) {
      console.warn("operators:create failed", err);
      notifyBackendError();
    }
  };

  const deleteOperator = async (id: string) => {
    if (!convexClient || !backendAvailable) {
      notifyBackendError();
      return;
    }
    try {
      await convexClient.mutation("operators:remove", { id: id as Id<"operators"> });
      const res = await convexClient.query("operators:list", {});
      setItems(res as Operator[]);
    } catch (err) {
      console.warn("operators:remove failed", err);
      notifyBackendError();
    }
  };

  return { items, createOperator, deleteOperator };
}

export function useCompanies() {
  const [items, setItems] = useState<Company[]>([]);

  useEffect(() => {
    if (!convexClient) {
      return;
    }
    let cancelled = false;
    convexClient
      .query("companies:list", {})
      .then((res) => {
        if (!cancelled && res) {
          setItems(res as Company[]);
        }
      })
      .catch(() => {
        setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const createCompany = async (payload: Omit<Company, "id" | "contracts" | "simCards" | "employees" | "monthlyExpense">) => {
    if (!convexClient || !backendAvailable) {
      notifyBackendError();
      return;
    }

    try {
      await convexClient.mutation("companies:create", {
        name: payload.name,
        inn: payload.inn,
        kpp: payload.kpp,
        comment: payload.comment,
      });
      const res = await convexClient.query("companies:list", {});
      setItems(res as Company[]);
    } catch (err) {
      console.warn("companies:create failed", err);
      notifyBackendError();
    }
  };

  const deleteCompany = async (id: string) => {
    if (!convexClient || !backendAvailable) {
      notifyBackendError();
      return;
    }
    try {
      await convexClient.mutation("companies:remove", { id: id as Id<"companies"> });
      const res = await convexClient.query("companies:list", {});
      setItems(res as Company[]);
    } catch (err) {
      console.warn("companies:remove failed", err);
      notifyBackendError();
    }
  };

  return { items, createCompany, deleteCompany };
}

export function useTariffs() {
  const [data, setData] = useState<{
    items: Tariff[];
    operators: ContractOption[];
  }>({
    items: [],
    operators: [],
  });

  useEffect(() => {
    if (!convexClient) {
      return;
    }
    let cancelled = false;
    convexClient
      .query("tariffs:list", {})
      .then((res) => {
        if (!cancelled && res) {
          setData(res as typeof data);
        }
      })
      .catch(() => {
        setData({ items: [], operators: [] });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const createTariff = async (payload: Omit<Tariff, "id" | "operator">) => {
    if (!convexClient || !backendAvailable) {
      notifyBackendError();
      return;
    }

    try {
      await convexClient.mutation("tariffs:create", {
        name: payload.name,
        operatorId: payload.operatorId as Id<"operators">,
        monthlyFee: payload.monthlyFee,
        dataLimitGb: payload.dataLimitGb ?? undefined,
        minutes: payload.minutes ?? undefined,
        sms: payload.sms ?? undefined,
        status: payload.status,
      });
      const res = await convexClient.query("tariffs:list", {});
      setData(res as typeof data);
    } catch (err) {
      console.warn("tariffs:create failed", err);
      notifyBackendError();
    }
  };

  const updateTariff = async (payload: Tariff) => {
    if (!convexClient || !backendAvailable) {
      notifyBackendError();
      return;
    }

    try {
      await convexClient.mutation("tariffs:update", {
        id: payload.id as Id<"tariffs">,
        name: payload.name,
        operatorId: payload.operatorId as Id<"operators">,
        monthlyFee: payload.monthlyFee,
        dataLimitGb: payload.dataLimitGb ?? undefined,
        minutes: payload.minutes ?? undefined,
        sms: payload.sms ?? undefined,
        status: payload.status,
      });
      const res = await convexClient.query("tariffs:list", {});
      setData(res as typeof data);
    } catch (err) {
      console.warn("tariffs:update failed", err);
      notifyBackendError();
    }
  };

  const deleteTariff = async (id: string) => {
    if (!convexClient || !backendAvailable) {
      notifyBackendError();
      return;
    }
    try {
      await convexClient.mutation("tariffs:remove", { id: id as Id<"tariffs"> });
      const res = await convexClient.query("tariffs:list", {});
      setData(res as typeof data);
    } catch (err) {
      console.warn("tariffs:remove failed", err);
      notifyBackendError();
    }
  };

  return { ...data, createTariff, updateTariff, deleteTariff };
}

export function useExpenses() {
  const [data, setData] = useState<{ items: Expense[]; companies: ContractOption[]; summary: { total: number; confirmed: number; draft: number; noDocs: number } }>({
    items: [],
    companies: [],
    summary: {
      total: 0,
      confirmed: 0,
      draft: 0,
      noDocs: 0,
    },
  });

  useEffect(() => {
    if (!convexClient) return;
    let cancelled = false;
    convexClient
      .query("expenses:list", {})
      .then((res) => {
        if (!cancelled && res) setData(res as typeof data);
      })
      .catch(() => {
        setData({
          items: [],
          companies: [],
          summary: { total: 0, confirmed: 0, draft: 0, noDocs: 0 },
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshExpenses = async () => {
    if (!convexClient || !backendAvailable) return;
    try {
      const res = await convexClient.query("expenses:list", {});
      setData(res as typeof data);
    } catch (err) {
      console.warn("expenses:list refresh failed", err);
      notifyBackendError();
    }
  };

  const createExpense = async (payload: Omit<Expense, "id" | "company" | "total"> & { total?: number }) => {
    if (!convexClient || !backendAvailable) {
      notifyBackendError();
      return;
    }

    try {
      await convexClient.mutation("expenses:create", {
        companyId: payload.companyId as Id<"companies">,
        contract: payload.contract,
        operator: payload.operator,
        month: payload.month,
        type: payload.type,
        amount: payload.amount,
        vat: payload.vat,
        total: payload.total ?? payload.amount + payload.vat,
        simNumber: payload.simNumber,
        status: payload.status,
        hasDocument: payload.hasDocument,
      });
      const res = await convexClient.query("expenses:list", {});
      setData(res as typeof data);
    } catch (err) {
      console.warn("expenses:create failed", err);
      notifyBackendError();
    }
  };

  const updateExpense = async (payload: Expense) => {
    if (!convexClient || !backendAvailable) {
      notifyBackendError();
      return;
    }

    try {
      await convexClient.mutation("expenses:update", {
        id: payload.id as Id<"expenses">,
        companyId: payload.companyId as Id<"companies">,
        contract: payload.contract,
        operator: payload.operator,
        month: payload.month,
        type: payload.type,
        amount: payload.amount,
        vat: payload.vat,
        total: payload.total,
        simNumber: payload.simNumber,
        status: payload.status,
        hasDocument: payload.hasDocument,
      });
      const res = await convexClient.query("expenses:list", {});
      setData(res as typeof data);
    } catch (err) {
      console.warn("expenses:update failed", err);
      notifyBackendError();
    }
  };

  const deleteExpense = async (id: string) => {
    if (!convexClient || !backendAvailable) {
      notifyBackendError();
      return;
    }

    try {
      await convexClient.mutation("expenses:remove", { id: id as Id<"expenses"> });
      const res = await convexClient.query("expenses:list", {});
      setData(res as typeof data);
    } catch (err) {
      console.warn("expenses:remove failed", err);
      notifyBackendError();
    }
  };

  return { ...data, refreshExpenses, createExpense, updateExpense, deleteExpense };
}

export function useSimCards() {
  const [data, setData] = useState<{
    items: SimCard[];
    companies: ContractOption[];
    operators: ContractOption[];
    employees: ContractOption[];
    tariffs: ContractOption[];
  }>({
    items: [],
    companies: [],
    operators: [],
    employees: [],
    tariffs: [],
  });

  useEffect(() => {
    if (!convexClient) return;
    let cancelled = false;
    convexClient
      .query("simCards:list", {})
      .then((res) => {
        if (!cancelled && res) setData(res as typeof data);
      })
      .catch(() => {
        setData({
          items: [],
          companies: [],
          operators: [],
          employees: [],
          tariffs: [],
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const createSimCard = async (payload: Omit<SimCard, "id" | "company" | "operator" | "employee" | "tariff">) => {
    if (!convexClient || !backendAvailable) {
      notifyBackendError();
      return;
    }

    try {
      await convexClient.mutation("simCards:create", {
        number: payload.number,
        iccid: payload.iccid,
        type: payload.type,
        companyId: payload.companyId as Id<"companies">,
        operatorId: payload.operatorId as Id<"operators">,
        employeeId: payload.employeeId ? (payload.employeeId as Id<"employees">) : undefined,
        tariffId: payload.tariffId ? (payload.tariffId as Id<"tariffs">) : undefined,
        status: payload.status,
        limit: payload.limit,
      });
      const res = await convexClient.query("simCards:list", {});
      setData(res as typeof data);
    } catch (err) {
      console.warn("simCards:create failed", err);
      notifyBackendError();
    }
  };

  const updateSimCard = async (payload: SimCard) => {
    if (!convexClient || !backendAvailable) {
      notifyBackendError();
      return;
    }

    try {
      await convexClient.mutation("simCards:update", {
        id: payload.id as Id<"simCards">,
        number: payload.number,
        iccid: payload.iccid,
        type: payload.type,
        companyId: payload.companyId as Id<"companies">,
        operatorId: payload.operatorId as Id<"operators">,
        employeeId: payload.employeeId ? (payload.employeeId as Id<"employees">) : undefined,
        tariffId: payload.tariffId ? (payload.tariffId as Id<"tariffs">) : undefined,
        status: payload.status,
        limit: payload.limit,
      });
      const res = await convexClient.query("simCards:list", {});
      setData(res as typeof data);
    } catch (err) {
      console.warn("simCards:update failed", err);
      notifyBackendError();
    }
  };

  const deleteSimCard = async (id: string) => {
    if (!convexClient || !backendAvailable) {
      notifyBackendError();
      return;
    }
    try {
      await convexClient.mutation("simCards:remove", { id: id as Id<"simCards"> });
      const res = await convexClient.query("simCards:list", {});
      setData(res as typeof data);
    } catch (err) {
      console.warn("simCards:remove failed", err);
      notifyBackendError();
    }
  };

  return { ...data, createSimCard, updateSimCard, deleteSimCard };
}
