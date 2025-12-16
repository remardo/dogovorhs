import { describe, expect, it } from "vitest";
import type { SimCard } from "@/lib/backend";
import { filterSimCards } from "@/lib/simCardsUtils";

describe("filterSimCards", () => {
  const base: SimCard[] = [
    {
      id: "1",
      number: "+7 900 111-22-33",
      iccid: "8970123400001",
      type: "Голосовая",
      status: "active",
      operatorId: "op1",
      operator: "МТС",
      companyId: "c1",
      company: "Сфера",
      employeeId: "e1",
      employee: "Анна",
      tariffId: "t1",
      tariff: "Smart",
      limit: 1000,
    },
    {
      id: "2",
      number: "+7 900 222-33-44",
      iccid: "8970123400002",
      type: "Интернет",
      status: "blocked",
      operatorId: "op2",
      operator: "Билайн",
      companyId: "c2",
      company: "Инкасс",
      employeeId: undefined,
      employee: undefined,
      tariffId: undefined,
      tariff: undefined,
      limit: undefined,
    },
  ];

  it("matches by search across number, iccid and operator", () => {
    const byNumber = filterSimCards(base, {
      search: "222-33-44",
      companyFilter: "all",
      operatorFilter: "all",
      statusFilter: "all",
      typeFilter: "all",
    });

    const byOperator = filterSimCards(base, {
      search: "мтс",
      companyFilter: "all",
      operatorFilter: "all",
      statusFilter: "all",
      typeFilter: "all",
    });

    expect(byNumber).toHaveLength(1);
    expect(byNumber[0]?.id).toBe("2");
    expect(byOperator).toHaveLength(1);
    expect(byOperator[0]?.id).toBe("1");
  });

  it("filters by company, operator, status and type", () => {
    const result = filterSimCards(base, {
      search: "",
      companyFilter: "c1",
      operatorFilter: "op1",
      statusFilter: "active",
      typeFilter: "Голосовая",
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("1");
  });

  it("returns empty when filters exclude everything", () => {
    const result = filterSimCards(base, {
      search: "нет",
      companyFilter: "all",
      operatorFilter: "all",
      statusFilter: "all",
      typeFilter: "all",
    });

    expect(result).toHaveLength(0);
  });
});
