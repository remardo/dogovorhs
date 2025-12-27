import { describe, expect, it } from "vitest";
import type { Contract, Employee, SimCard } from "@/lib/backend";
import {
  buildContractResults,
  buildEmployeeResults,
  buildSearchQuery,
  buildSimResults,
} from "@/lib/searchUtils";

const contracts: Contract[] = [
  {
    id: "c1",
    number: "MTS-2025/001",
    name: "Офис 1",
    companyId: "company-1",
    company: "Холдинг Сфера",
    operatorId: "op-1",
    operator: "МТС",
    type: "Мобильная связь",
    status: "active",
    startDate: "01.01.2025",
    endDate: "Бессрочный",
    monthlyFee: 1000,
    simCount: 12,
  },
  {
    id: "c2",
    number: "RTK-2024/015",
    name: "Канал 100 Мбит",
    companyId: "company-2",
    company: "Инкасс Коллект",
    operatorId: "op-2",
    operator: "Ростелеком",
    type: "Интернет",
    status: "active",
    startDate: "01.01.2024",
    endDate: "31.12.2024",
    monthlyFee: 4000,
    simCount: 0,
  },
];

const simCards: SimCard[] = [
  {
    id: "s1",
    number: "+7 (999) 123-45-67",
    iccid: "8970119900001234567",
    type: "Голосовая",
    status: "active",
    operatorId: "op-1",
    operator: "МТС",
    companyId: "company-1",
    company: "Холдинг Сфера",
    employeeId: "e1",
    employee: "Иванов Иван",
    tariffId: "t1",
    tariff: "Корпоративный",
  },
  {
    id: "s2",
    number: "79005553535",
    iccid: "8970119900007654321",
    type: "Интернет",
    status: "active",
    operatorId: "op-3",
    operator: "Мегафон",
    companyId: "company-2",
    company: "Инкасс Коллект",
    employeeId: undefined,
    employee: "",
    tariffId: undefined,
    tariff: "",
  },
];

const employees: Employee[] = [
  {
    id: "e1",
    name: "Иванов Иван",
    company: "Холдинг Сфера",
    companyId: "company-1",
    department: "IT",
    position: "Сисадмин",
    status: "active",
    simCount: 1,
    maxSim: 10,
  },
  {
    id: "e2",
    name: "Петров Петр",
    company: "Инкасс Коллект",
    companyId: "company-2",
    department: "Бухгалтерия",
    position: "Бухгалтер",
    status: "active",
    simCount: 0,
    maxSim: 10,
  },
];

describe("searchUtils", () => {
  it("buildSearchQuery normalizes input and extracts digits", () => {
    const query = buildSearchQuery("  +7 (999) 123-45-67 ");
    expect(query.normalized).toBe("+7 (999) 123-45-67");
    expect(query.digits).toBe("79991234567");
  });

  it("filters contracts by text fields", () => {
    const query = buildSearchQuery("ростелеком");
    const results = buildContractResults(contracts, query);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("c2");
  });

  it("filters contracts by digits in contract number", () => {
    const query = buildSearchQuery("2025");
    const results = buildContractResults(contracts, query);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("c1");
  });

  it("filters sim cards by digits or iccid", () => {
    const query = buildSearchQuery("1234567");
    const results = buildSimResults(simCards, query);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("s1");

    const byIccid = buildSimResults(simCards, buildSearchQuery("7654321"));
    expect(byIccid).toHaveLength(1);
    expect(byIccid[0].id).toBe("s2");
  });

  it("filters employees by name and position", () => {
    const byName = buildEmployeeResults(employees, buildSearchQuery("иванов"));
    expect(byName).toHaveLength(1);
    expect(byName[0].id).toBe("e1");

    const byPosition = buildEmployeeResults(employees, buildSearchQuery("бухгалтер"));
    expect(byPosition).toHaveLength(1);
    expect(byPosition[0].id).toBe("e2");
  });

  it("returns empty results for empty query", () => {
    const query = buildSearchQuery("   ");
    expect(buildContractResults(contracts, query)).toHaveLength(0);
    expect(buildSimResults(simCards, query)).toHaveLength(0);
    expect(buildEmployeeResults(employees, query)).toHaveLength(0);
  });
});
