import { describe, expect, it } from "vitest";
import {
  buildTariffFeeByKey,
  collectCompanyConflicts,
  collectMissingContracts,
  findSimilarCompanies,
  normalizeCompanyName,
} from "./billingImportLogic";

describe("normalizeCompanyName", () => {
  it("normalizes quotes and spaces", () => {
    expect(normalizeCompanyName('  "ООО   Ромашка"  ')).toEqual({
      raw: '"ООО   Ромашка"',
      normalized: "ооо ромашка",
    });
  });
});

describe("findSimilarCompanies", () => {
  it("matches by normalized substring", () => {
    const companies = [
      { id: "1", raw: "ООО Ромашка", normalized: "ооо ромашка" },
      { id: "2", raw: "АО Василек", normalized: "ао василек" },
    ];
    const target = normalizeCompanyName("Ромашка");
    const matches = findSimilarCompanies(target, companies);
    expect(matches.map((c) => c.id)).toEqual(["1"]);
  });
});

describe("collectCompanyConflicts", () => {
  it("returns conflicts when similar companies exist", () => {
    const normalizedCompanies = [
      { id: "c1", raw: "ООО Ромашка", normalized: "ооо ромашка" },
      { id: "c2", raw: "ООО Луч", normalized: "ооо луч" },
    ];
    const conflicts = collectCompanyConflicts(
      [
        { contractNumber: "A-1", company: { name: "Ромашка" } },
        { contractNumber: "A-2", company: { name: "Новая", forceCreate: true } },
      ],
      normalizedCompanies,
    );
    expect(conflicts).toEqual([
      {
        contractNumber: "A-1",
        name: "Ромашка",
        suggestions: [{ id: "c1", name: "ООО Ромашка" }],
      },
    ]);
  });
});

describe("collectMissingContracts", () => {
  it("returns contract numbers missing in db and resolutions", () => {
    const rows = [{ contractNumber: "A-1" }, { contractNumber: "B-2" }, { contractNumber: "B-2" }];
    const contractNumbers = new Set<string>(["A-1"]);
    const resolved = new Set<string>(["C-3"]);
    expect(collectMissingContracts(rows, contractNumbers, resolved)).toEqual(["B-2"]);
  });
});

describe("buildTariffFeeByKey", () => {
  it("collects max fee per operator+tariff key", () => {
    const contractByNumber = new Map<string, { operatorId: string }>([
      ["A-1", { operatorId: "op1" }],
      ["A-2", { operatorId: "op1" }],
    ]);
    const rows = [
      { contractNumber: "A-1", tariffName: "Plan", tariffFee: 100 },
      { contractNumber: "A-2", tariffName: "Plan", tariffFee: 150 },
      { contractNumber: "A-1", tariffName: "", tariffFee: 500 },
    ];
    const result = buildTariffFeeByKey(rows, contractByNumber);
    expect(result.get("op1:plan")).toBe(150);
  });
});
