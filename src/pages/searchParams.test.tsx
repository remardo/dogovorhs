// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";

vi.mock("@/components/layout/MainLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/lib/backend", () => ({
  useContracts: () => ({
    items: [],
    companies: [],
    operators: [],
    createContract: vi.fn(),
    updateContract: vi.fn(),
    deleteContract: vi.fn(),
  }),
  useSimCards: () => ({
    items: [],
    companies: [],
    operators: [],
    employees: [],
    tariffs: [],
    createSimCard: vi.fn(),
    updateSimCard: vi.fn(),
    deleteSimCard: vi.fn(),
  }),
  useEmployeesWithMutations: () => ({
    items: [],
    createEmployee: vi.fn(),
    updateEmployee: vi.fn(),
    deleteEmployee: vi.fn(),
  }),
  useCompanies: () => ({ items: [] }),
  useExpenses: () => ({ items: [] }),
  useEmployees: () => [],
}));

import Contracts from "@/pages/Contracts";
import Employees from "@/pages/Employees";
import SimCards from "@/pages/SimCards";

describe("search query param", () => {
  it("prefills contracts search from ?q", () => {
    render(
      <MemoryRouter initialEntries={["/contracts?q=RTK-2024/015"]}>
        <Contracts />
      </MemoryRouter>,
    );

    expect(screen.getByPlaceholderText("Поиск по номеру/типу...")).toHaveValue("RTK-2024/015");
  });

  it("prefills sim cards search from ?q", () => {
    render(
      <MemoryRouter initialEntries={["/sim-cards?q=79005553535"]}>
        <SimCards />
      </MemoryRouter>,
    );

    expect(screen.getByPlaceholderText("Поиск по номеру, ICCID, оператору...")).toHaveValue("79005553535");
  });

  it("prefills employees search from ?q", () => {
    render(
      <MemoryRouter initialEntries={["/employees?q=Иванов"]}>
        <Employees />
      </MemoryRouter>,
    );

    expect(screen.getByPlaceholderText("Поиск по ФИО или должности...")).toHaveValue("Иванов");
  });
});
