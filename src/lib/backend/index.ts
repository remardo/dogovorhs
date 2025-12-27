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

function notifyDemoMode() {
  notifyFallbackOnce("backend-demo", "Демо-режим", "Бэкенд не подключен. Изменения сохраняются только локально.");
}

function notifyBackendError() {
  notifyFallbackOnce("backend-offline", "Нет связи с бэкендом", "Изменения сохранены локально и не попадут в Convex.");
}

const demoDashboard: DashboardData = {
  summary: {
    totalExpenses: 589000,
    contracts: 24,
    simCards: 186,
    employeesWithSim: 142,
    month: "декабрь 2024",
  },
  months: ["декабрь 2024", "ноябрь 2024", "октябрь 2024"],
  companies: [
    { id: "1", name: "Холдинг Сфера", contracts: 12, simCards: 95, employees: 78, monthlyExpense: 265000 },
    { id: "2", name: "Инкасс Коллект", contracts: 8, simCards: 64, employees: 48, monthlyExpense: 148000 },
    { id: "3", name: "МКК ФК", contracts: 4, simCards: 27, employees: 16, monthlyExpense: 76000 },
  ],
  expensesByMonth: [
    {
      month: "Июл",
      companies: [
        { companyId: "1", company: "Холдинг Сфера", amount: 245000 },
        { companyId: "2", company: "Инкасс Коллект", amount: 128000 },
        { companyId: "3", company: "МКК ФК", amount: 67000 },
      ],
    },
    {
      month: "Авг",
      companies: [
        { companyId: "1", company: "Холдинг Сфера", amount: 252000 },
        { companyId: "2", company: "Инкасс Коллект", amount: 135000 },
        { companyId: "3", company: "МКК ФК", amount: 72000 },
      ],
    },
    {
      month: "Сен",
      companies: [
        { companyId: "1", company: "Холдинг Сфера", amount: 248000 },
        { companyId: "2", company: "Инкасс Коллект", amount: 142000 },
        { companyId: "3", company: "МКК ФК", amount: 69000 },
      ],
    },
    {
      month: "Окт",
      companies: [
        { companyId: "1", company: "Холдинг Сфера", amount: 261000 },
        { companyId: "2", company: "Инкасс Коллект", amount: 138000 },
        { companyId: "3", company: "МКК ФК", amount: 74000 },
      ],
    },
    {
      month: "Ноя",
      companies: [
        { companyId: "1", company: "Холдинг Сфера", amount: 258000 },
        { companyId: "2", company: "Инкасс Коллект", amount: 145000 },
        { companyId: "3", company: "МКК ФК", amount: 71000 },
      ],
    },
    {
      month: "Дек",
      companies: [
        { companyId: "1", company: "Холдинг Сфера", amount: 265000 },
        { companyId: "2", company: "Инкасс Коллект", amount: 148000 },
        { companyId: "3", company: "МКК ФК", amount: 76000 },
      ],
    },
  ],
  services: [
    { name: "Мобильная связь", value: 385000 },
    { name: "Интернет (офис)", value: 124000 },
    { name: "IP-телефония", value: 52000 },
    { name: "VPN/каналы", value: 28000 },
  ],
  recentContracts: [
    {
      id: "1",
      number: "МТС-2024/001",
      company: "Холдинг Сфера",
      operator: "МТС",
      type: "Мобильная связь",
      status: "active",
      monthlyFee: 125000,
      startDate: "01.01.2024",
      endDate: "Бессрочный",
      simCount: 45,
    },
    {
      id: "2",
      number: "РТК-2024/015",
      company: "Инкасс Коллект",
      operator: "Ростелеком",
      type: "Интернет (офис)",
      status: "active",
      monthlyFee: 48000,
      startDate: "15.03.2024",
      endDate: "14.03.2025",
      simCount: 0,
    },
    {
      id: "3",
      number: "БЛН-2024/008",
      company: "МКК ФК",
      operator: "Билайн",
      type: "Мобильная связь",
      status: "active",
      monthlyFee: 32000,
      startDate: "01.02.2024",
      endDate: "Бессрочный",
      simCount: 18,
    },
    {
      id: "4",
      number: "МГФ-2024/003",
      company: "Холдинг Сфера",
      operator: "Мегафон",
      type: "VPN / канал связи",
      status: "closing",
      monthlyFee: 28000,
      startDate: "01.06.2023",
      endDate: "31.12.2024",
      simCount: 0,
    },
  ],
};

const demoEmployees: Employee[] = [
  {
    id: "1",
    name: "Иванов Иван Иванович",
    company: "Холдинг Сфера",
    department: "IT-отдел",
    position: "Системный администратор",
    status: "active",
    simCount: 3,
    maxSim: 20,
  },
  {
    id: "2",
    name: "Петров Петр Петрович",
    company: "Холдинг Сфера",
    department: "Отдел продаж",
    position: "Менеджер по продажам",
    status: "active",
    simCount: 2,
    maxSim: 20,
  },
  {
    id: "3",
    name: "Сидорова Анна Сергеевна",
    company: "Инкасс Коллект",
    department: "Финансовый отдел",
    position: "Главный бухгалтер",
    status: "active",
    simCount: 1,
    maxSim: 20,
  },
  {
    id: "4",
    name: "Козлов Дмитрий Александрович",
    company: "МКК ФК",
    department: "Отдел разработки",
    position: "Ведущий разработчик",
    status: "active",
    simCount: 4,
    maxSim: 20,
  },
  {
    id: "5",
    name: "Новикова Елена Владимировна",
    company: "Холдинг Сфера",
    department: "HR-отдел",
    position: "HR-менеджер",
    status: "fired",
    simCount: 0,
    maxSim: 20,
  },
  {
    id: "6",
    name: "Морозов Алексей Николаевич",
    company: "Инкасс Коллект",
    department: "Инкассация",
    position: "Старший инкассатор",
    status: "active",
    simCount: 5,
    maxSim: 20,
  },
];

const demoContracts: Contract[] = demoDashboard.recentContracts.map((c) => ({
  id: c.id,
  number: c.number,
  companyId: "demo-company",
  company: c.company,
  operatorId: "demo-operator",
  operator: c.operator,
  type: c.type,
  status: c.status,
  startDate: c.startDate ?? "",
  endDate: c.endDate ?? "Бессрочный",
  monthlyFee: c.monthlyFee,
  simCount: c.simCount ?? 0,
}));

const demoOperators: Operator[] = [
  {
    id: "1",
    name: "МТС",
    type: "Мобильная связь",
    contracts: 5,
    simCards: 78,
    manager: "Петрова Анна",
    phone: "+7 (495) 123-00-00",
    email: "corp@mts.ru",
  },
  {
    id: "2",
    name: "Билайн",
    type: "Мобильная связь",
    contracts: 3,
    simCards: 42,
    manager: "Сидоров Игорь",
    phone: "+7 (495) 234-00-00",
    email: "business@beeline.ru",
  },
  {
    id: "3",
    name: "Мегафон",
    type: "Мобильная связь",
    contracts: 2,
    simCards: 25,
    manager: "Козлова Мария",
    phone: "+7 (495) 345-00-00",
    email: "corp@megafon.ru",
  },
  {
    id: "4",
    name: "Ростелеком",
    type: "Интернет / IP-телефония",
    contracts: 6,
    simCards: 0,
    manager: "Иванова Елена",
    phone: "+7 (495) 567-00-00",
    email: "corporate@rt.ru",
  },
];

const demoCompanies: Company[] = [
  {
    id: "1",
    name: "Холдинг Сфера",
    inn: "7701234567",
    kpp: "770101001",
    comment: "Головная компания холдинга",
    contracts: 12,
    simCards: 95,
    employees: 78,
    monthlyExpense: 265000,
  },
  {
    id: "2",
    name: "Инкасс Коллект",
    inn: "7702345678",
    kpp: "770201001",
    comment: "Инкассаторские услуги",
    contracts: 8,
    simCards: 64,
    employees: 48,
    monthlyExpense: 148000,
  },
  {
    id: "3",
    name: "МКК ФК",
    inn: "7703456789",
    kpp: "770301001",
    comment: "Микрофинансовая компания",
    contracts: 4,
    simCards: 27,
    employees: 16,
    monthlyExpense: 76000,
  },
];

const demoTariffs: Tariff[] = [
  {
    id: "1",
    name: "Корпоративный Безлимит",
    operatorId: "demo-operator-1",
    operator: "МТС",
    type: "Мобильная связь",
    monthlyFee: 1500,
    dataLimitGb: null,
    minutes: 9999,
    sms: 100,
    status: "active",
    simCount: 45,
  },
  {
    id: "2",
    name: "Интернет 30 ГБ",
    operatorId: "demo-operator-1",
    operator: "МТС",
    type: "Мобильный интернет",
    monthlyFee: 800,
    dataLimitGb: 30,
    minutes: null,
    sms: null,
    status: "active",
    simCount: 28,
  },
  {
    id: "3",
    name: "Бизнес 500",
    operatorId: "demo-operator-2",
    operator: "Билайн",
    type: "Мобильная связь",
    monthlyFee: 990,
    dataLimitGb: 15,
    minutes: 500,
    sms: 50,
    status: "active",
    simCount: 35,
  },
];

const demoExpenses: Expense[] = [
  {
    id: "1",
    companyId: "demo-company-1",
    company: "Холдинг Сфера",
    contract: "МТС-2024/001",
    operator: "МТС",
    month: "Ноябрь 2024",
    type: "Мобильная связь",
    amount: 125340,
    vat: 20890,
    total: 146230,
    status: "confirmed",
    hasDocument: true,
  },
  {
    id: "2",
    companyId: "demo-company-2",
    company: "Инкасс Коллект",
    contract: "РТК-2024/015",
    operator: "Ростелеком",
    month: "Ноябрь 2024",
    type: "Интернет (офис)",
    amount: 48000,
    vat: 8000,
    total: 56000,
    status: "confirmed",
    hasDocument: true,
  },
  {
    id: "3",
    companyId: "demo-company-3",
    company: "МКК ФК",
    contract: "БЛН-2024/008",
    operator: "Билайн",
    month: "Ноябрь 2024",
    type: "Мобильная связь",
    amount: 32450,
    vat: 5408,
    total: 37858,
    status: "draft",
    hasDocument: false,
  },
];

const demoSimCards: SimCard[] = [
  {
    id: "1",
    number: "+7 (495) 123-45-67",
    iccid: "8970119900001234567",
    type: "Голосовая",
    status: "active",
    operatorId: "demo-operator-1",
    operator: "МТС",
    companyId: "demo-company-1",
    company: "Холдинг Сфера",
    employeeId: "1",
    employee: "Иванов И.И.",
    tariffId: "1",
    tariff: "Корпоративный Безлимит",
    limit: 5000,
  },
  {
    id: "2",
    number: "+7 (495) 234-56-78",
    iccid: "8970119900002345678",
    type: "Интернет",
    status: "active",
    operatorId: "demo-operator-1",
    operator: "МТС",
    companyId: "demo-company-1",
    company: "Холдинг Сфера",
    employeeId: "2",
    employee: "Петров П.П.",
    tariffId: "2",
    tariff: "Интернет 30 ГБ",
    limit: 3000,
  },
  {
    id: "3",
    number: "+7 (495) 345-67-89",
    iccid: "8970119900003456789",
    type: "Голосовая",
    status: "blocked",
    operatorId: "demo-operator-3",
    operator: "Мегафон",
    companyId: "demo-company-1",
    company: "Холдинг Сфера",
    employee: "Сидоров С.С.",
    limit: 4000,
  },
];

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
  const [data, setData] = useState<DashboardData>(backendAvailable ? emptyDashboard : demoDashboard);

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
  const [data, setData] = useState<Employee[]>(demoEmployees);

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
        setData(demoEmployees);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return data;
}
// Extended hook with creation and company IDs
export function useEmployeesWithMutations() {
  const [data, setData] = useState<Employee[]>(demoEmployees);

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
        setData((prev) => prev);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const createEmployee = async (payload: Omit<Employee, "id" | "company"> & { company: string }) => {
    const addLocal = () => {
      const newItem: Employee = {
        ...payload,
        id: crypto.randomUUID(),
      };
      setData((prev) => [newItem, ...prev]);
    };

    if (!convexClient || !backendAvailable) {
      notifyDemoMode();
      addLocal();
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
      console.warn("employees:create fallback to local demo data", err);
      notifyBackendError();
      addLocal();
    }
  };

  const updateEmployee = async (payload: Employee) => {
    const addLocal = () => {
      setData((prev) => prev.map((e) => (e.id === payload.id ? payload : e)));
    };

    if (!convexClient || !backendAvailable) {
      notifyDemoMode();
      addLocal();
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
      console.warn("employees:update fallback to local demo data", err);
      notifyBackendError();
      addLocal();
    }
  };

  const deleteEmployee = async (id: string) => {
    const removeLocal = () => setData((prev) => prev.filter((e) => e.id !== id));
    if (!convexClient || !backendAvailable) {
      notifyDemoMode();
      removeLocal();
      return;
    }
    try {
      await convexClient.mutation("employees:remove", { id: id as Id<"employees"> });
      const res = await convexClient.query("employees:list", {});
      setData(res as Employee[]);
    } catch (err) {
      console.warn("employees:remove fallback to local demo data", err);
      notifyBackendError();
      removeLocal();
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
    items: demoContracts,
    companies: [
      { id: "demo-company-1", name: "Холдинг Сфера" },
      { id: "demo-company-2", name: "Инкасс Коллект" },
      { id: "demo-company-3", name: "МКК ФК" },
    ],
    operators: [
      { id: "demo-operator-1", name: "МТС" },
      { id: "demo-operator-2", name: "Билайн" },
      { id: "demo-operator-3", name: "Мегафон" },
      { id: "demo-operator-4", name: "Ростелеком" },
    ],
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
        setData((prev) => prev);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const createContract = async (payload: Omit<Contract, "id" | "company" | "operator">) => {
    const fallbackAdd = () => {
      const companyName = data.companies.find((c) => c.id === payload.companyId)?.name ?? "Компания";
      const operatorName = data.operators.find((o) => o.id === payload.operatorId)?.name ?? "Оператор";
      const newItem: Contract = {
        ...payload,
        company: companyName,
        operator: operatorName,
        id: crypto.randomUUID(),
      };
      setData((prev) => ({ ...prev, items: [newItem, ...prev.items] }));
    };

    if (!convexClient || !backendAvailable) {
      notifyDemoMode();
      fallbackAdd();
      return;
    }

    try {
      await convexClient.mutation("contracts:create", {
        number: payload.number,
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
      // Если Convex недоступен или ошибка валидации (например, демо-ID), падаем в демо-режим
      console.warn("contracts:create fallback to local demo data", err);
      notifyBackendError();
      fallbackAdd();
    }
  };

  const updateContract = async (payload: Contract) => {
    const addLocal = () => {
      setData((prev) => ({
        ...prev,
        items: prev.items.map((c) => (c.id === payload.id ? payload : c)),
      }));
    };

    if (!convexClient || !backendAvailable) {
      notifyDemoMode();
      addLocal();
      return;
    }

    try {
      await convexClient.mutation("contracts:update", {
        id: payload.id as Id<"contracts">,
        number: payload.number,
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
      console.warn("contracts:update fallback to local demo data", err);
      notifyBackendError();
      addLocal();
    }
  };

  const deleteContract = async (id: string) => {
    const removeLocal = () => {
      setData((prev) => ({ ...prev, items: prev.items.filter((c) => c.id !== id) }));
    };

    if (!convexClient || !backendAvailable) {
      notifyDemoMode();
      removeLocal();
      return;
    }

    try {
      await convexClient.mutation("contracts:remove", {
        id: id as Id<"contracts">,
      });
      const res = await convexClient.query("contracts:list", {});
      setData(res as typeof data);
    } catch (err) {
      console.warn("contracts:remove fallback to local demo data", err);
      notifyBackendError();
      removeLocal();
    }
  };

  return { ...data, createContract, updateContract, deleteContract };
}

export function useOperators() {
  const [items, setItems] = useState<Operator[]>(demoOperators);

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
        setItems((prev) => prev);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const createOperator = async (payload: Omit<Operator, "id" | "contracts" | "simCards">) => {
    const addLocal = () => {
      const newItem: Operator = { ...payload, id: crypto.randomUUID(), contracts: 0, simCards: 0 };
      setItems((prev) => [newItem, ...prev]);
    };

    if (!convexClient || !backendAvailable) {
      notifyDemoMode();
      addLocal();
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
      console.warn("operators:create fallback to local demo data", err);
      notifyBackendError();
      addLocal();
    }
  };

  const deleteOperator = async (id: string) => {
    const removeLocal = () => setItems((prev) => prev.filter((o) => o.id !== id));
    if (!convexClient || !backendAvailable) {
      notifyDemoMode();
      removeLocal();
      return;
    }
    try {
      await convexClient.mutation("operators:remove", { id: id as Id<"operators"> });
      const res = await convexClient.query("operators:list", {});
      setItems(res as Operator[]);
    } catch (err) {
      console.warn("operators:remove fallback to local demo data", err);
      notifyBackendError();
      removeLocal();
    }
  };

  return { items, createOperator, deleteOperator };
}

export function useCompanies() {
  const [items, setItems] = useState<Company[]>(demoCompanies);

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
        setItems((prev) => prev);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const createCompany = async (payload: Omit<Company, "id" | "contracts" | "simCards" | "employees" | "monthlyExpense">) => {
    const addLocal = () => {
      const newItem: Company = {
        ...payload,
        id: crypto.randomUUID(),
        contracts: 0,
        simCards: 0,
        employees: 0,
        monthlyExpense: 0,
      };
      setItems((prev) => [newItem, ...prev]);
    };

    if (!convexClient || !backendAvailable) {
      notifyDemoMode();
      addLocal();
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
      console.warn("companies:create fallback to local demo data", err);
      notifyBackendError();
      addLocal();
    }
  };

  const deleteCompany = async (id: string) => {
    const removeLocal = () => setItems((prev) => prev.filter((c) => c.id !== id));
    if (!convexClient || !backendAvailable) {
      notifyDemoMode();
      removeLocal();
      return;
    }
    try {
      await convexClient.mutation("companies:remove", { id: id as Id<"companies"> });
      const res = await convexClient.query("companies:list", {});
      setItems(res as Company[]);
    } catch (err) {
      console.warn("companies:remove fallback to local demo data", err);
      notifyBackendError();
      removeLocal();
    }
  };

  return { items, createCompany, deleteCompany };
}

export function useTariffs() {
  const [data, setData] = useState<{
    items: Tariff[];
    operators: ContractOption[];
  }>({
    items: demoTariffs,
    operators: demoOperators.map((o) => ({ id: o.id, name: o.name })),
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
        setData((prev) => prev);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const createTariff = async (payload: Omit<Tariff, "id" | "operator">) => {
    const addLocal = () => {
      const operatorName = data.operators.find((o) => o.id === payload.operatorId)?.name ?? "Оператор";
      const newItem: Tariff = { ...payload, id: crypto.randomUUID(), operator: operatorName };
      setData((prev) => ({ ...prev, items: [newItem, ...prev.items] }));
    };

    if (!convexClient || !backendAvailable) {
      notifyDemoMode();
      addLocal();
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
      console.warn("tariffs:create fallback to local demo data", err);
      notifyBackendError();
      addLocal();
    }
  };

  const deleteTariff = async (id: string) => {
    const removeLocal = () => setData((prev) => ({ ...prev, items: prev.items.filter((t) => t.id !== id) }));
    if (!convexClient || !backendAvailable) {
      notifyDemoMode();
      removeLocal();
      return;
    }
    try {
      await convexClient.mutation("tariffs:remove", { id: id as Id<"tariffs"> });
      const res = await convexClient.query("tariffs:list", {});
      setData(res as typeof data);
    } catch (err) {
      console.warn("tariffs:remove fallback to local demo data", err);
      notifyBackendError();
      removeLocal();
    }
  };

  return { ...data, createTariff, deleteTariff };
}

export function useExpenses() {
  const [data, setData] = useState<{ items: Expense[]; companies: ContractOption[]; summary: { total: number; confirmed: number; draft: number; noDocs: number } }>({
    items: demoExpenses,
    companies: demoCompanies.map((c) => ({ id: c.id, name: c.name })),
    summary: {
      total: demoExpenses.reduce((s, e) => s + e.total, 0),
      confirmed: demoExpenses.filter((e) => e.status === "confirmed").reduce((s, e) => s + e.total, 0),
      draft: demoExpenses.filter((e) => e.status === "draft").reduce((s, e) => s + e.total, 0),
      noDocs: demoExpenses.filter((e) => !e.hasDocument).length,
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
        setData((prev) => prev);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const createExpense = async (payload: Omit<Expense, "id" | "company" | "total"> & { total?: number }) => {
    const addLocal = () => {
      const companyName = data.companies.find((c) => c.id === payload.companyId)?.name ?? "Компания";
      const total = payload.total ?? payload.amount + payload.vat;
      const newItem: Expense = { ...payload, company: companyName, id: crypto.randomUUID(), total };
      setData((prev) => {
        const items = [newItem, ...prev.items];
        const summary = {
          total: items.reduce((s, e) => s + e.total, 0),
          confirmed: items.filter((e) => e.status === "confirmed").reduce((s, e) => s + e.total, 0),
          draft: items.filter((e) => e.status === "draft").reduce((s, e) => s + e.total, 0),
          noDocs: items.filter((e) => !e.hasDocument).length,
        };
        return { ...prev, items, summary };
      });
    };

    if (!convexClient || !backendAvailable) {
      notifyDemoMode();
      addLocal();
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
      console.warn("expenses:create fallback to local demo data", err);
      notifyBackendError();
      addLocal();
    }
  };

  const updateExpense = async (payload: Expense) => {
    const addLocal = () => {
      setData((prev) => {
        const items = prev.items.map((e) => (e.id === payload.id ? payload : e));
        const summary = {
          total: items.reduce((s, e) => s + e.total, 0),
          confirmed: items.filter((e) => e.status === "confirmed").reduce((s, e) => s + e.total, 0),
          draft: items.filter((e) => e.status === "draft").reduce((s, e) => s + e.total, 0),
          noDocs: items.filter((e) => !e.hasDocument).length,
        };
        return { ...prev, items, summary };
      });
    };

    if (!convexClient || !backendAvailable) {
      notifyDemoMode();
      addLocal();
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
      console.warn("expenses:update fallback to local demo data", err);
      notifyBackendError();
      addLocal();
    }
  };

  const deleteExpense = async (id: string) => {
    const removeLocal = () => {
      setData((prev) => {
        const items = prev.items.filter((e) => e.id !== id);
        const summary = {
          total: items.reduce((s, e) => s + e.total, 0),
          confirmed: items.filter((e) => e.status === "confirmed").reduce((s, e) => s + e.total, 0),
          draft: items.filter((e) => e.status === "draft").reduce((s, e) => s + e.total, 0),
          noDocs: items.filter((e) => !e.hasDocument).length,
        };
        return { ...prev, items, summary };
      });
    };

    if (!convexClient || !backendAvailable) {
      notifyDemoMode();
      removeLocal();
      return;
    }

    try {
      await convexClient.mutation("expenses:remove", { id: id as Id<"expenses"> });
      const res = await convexClient.query("expenses:list", {});
      setData(res as typeof data);
    } catch (err) {
      console.warn("expenses:remove fallback to local demo data", err);
      notifyBackendError();
      removeLocal();
    }
  };

  return { ...data, createExpense, updateExpense, deleteExpense };
}

export function useSimCards() {
  const [data, setData] = useState<{
    items: SimCard[];
    companies: ContractOption[];
    operators: ContractOption[];
    employees: ContractOption[];
    tariffs: ContractOption[];
  }>({
    items: demoSimCards,
    companies: demoCompanies.map((c) => ({ id: c.id, name: c.name })),
    operators: demoOperators.map((o) => ({ id: o.id, name: o.name })),
    employees: demoEmployees.map((e) => ({ id: e.id, name: e.name })),
    tariffs: demoTariffs.map((t) => ({ id: t.id, name: t.name })),
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
        setData((prev) => prev);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const createSimCard = async (payload: Omit<SimCard, "id" | "company" | "operator" | "employee" | "tariff">) => {
    const addLocal = () => {
      const company = data.companies.find((c) => c.id === payload.companyId)?.name ?? "Компания";
      const operator = data.operators.find((o) => o.id === payload.operatorId)?.name ?? "Оператор";
      const employee = payload.employeeId
        ? data.employees.find((e) => e.id === payload.employeeId)?.name ?? ""
        : "";
      const tariff = payload.tariffId ? data.tariffs.find((t) => t.id === payload.tariffId)?.name ?? "" : "";
      const newItem: SimCard = { ...payload, company, operator, employee, tariff, id: crypto.randomUUID() };
      setData((prev) => ({ ...prev, items: [newItem, ...prev.items] }));
    };

    if (!convexClient || !backendAvailable) {
      notifyDemoMode();
      addLocal();
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
      console.warn("simCards:create fallback to local demo data", err);
      notifyBackendError();
      addLocal();
    }
  };

  const updateSimCard = async (payload: SimCard) => {
    const addLocal = () => {
      setData((prev) => ({
        ...prev,
        items: prev.items.map((s) => (s.id === payload.id ? payload : s)),
      }));
    };

    if (!convexClient || !backendAvailable) {
      notifyDemoMode();
      addLocal();
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
      console.warn("simCards:update fallback to local demo data", err);
      notifyBackendError();
      addLocal();
    }
  };

  const deleteSimCard = async (id: string) => {
    const removeLocal = () => setData((prev) => ({ ...prev, items: prev.items.filter((s) => s.id !== id) }));
    if (!convexClient || !backendAvailable) {
      notifyDemoMode();
      removeLocal();
      return;
    }
    try {
      await convexClient.mutation("simCards:remove", { id: id as Id<"simCards"> });
      const res = await convexClient.query("simCards:list", {});
      setData(res as typeof data);
    } catch (err) {
      console.warn("simCards:remove fallback to local demo data", err);
      notifyBackendError();
      removeLocal();
    }
  };

  return { ...data, createSimCard, updateSimCard, deleteSimCard };
}
