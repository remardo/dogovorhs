import { describe, expect, it } from "vitest";
import {
  comparePeriodKeys,
  distinctSortedPeriodKeys,
  latestPeriodKey,
  normalizePeriodKey,
  periodLabel,
} from "@/lib/servicePeriod";

describe("servicePeriod", () => {
  it("keeps canonical keys", () => {
    expect(normalizePeriodKey("2026-10")).toBe("2026-10");
  });

  it("parses MM.YYYY and day ranges", () => {
    expect(normalizePeriodKey("10.2026")).toBe("2026-10");
    expect(normalizePeriodKey("12.03.2026 - 12.04.2026")).toBe("2026-03");
    expect(normalizePeriodKey("01.01.2025")).toBe("2025-01");
  });

  it("parses ISO dates and Russian month names", () => {
    expect(normalizePeriodKey("2026-10-15")).toBe("2026-10");
    expect(normalizePeriodKey("Октябрь 2026")).toBe("2026-10");
    expect(normalizePeriodKey("октября 2026")).toBe("2026-10");
  });

  it("returns empty for unknown labels", () => {
    expect(normalizePeriodKey("")).toBe("");
    expect(normalizePeriodKey("текущий период")).toBe("");
    expect(periodLabel("")).toBe("Без периода");
    expect(periodLabel("2026-10")).toBe("Октябрь 2026");
  });

  it("sorts calendrically and picks latest", () => {
    expect(comparePeriodKeys("2026-08", "2026-10")).toBeLessThan(0);
    expect(latestPeriodKey(["2026-08", "2026-10", "текущий период"])).toBe("2026-10");
    expect(distinctSortedPeriodKeys(["10.2026", "Октябрь 2026", "08.2026"])).toEqual([
      "2026-08",
      "2026-10",
    ]);
  });
});
