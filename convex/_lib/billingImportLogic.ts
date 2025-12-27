export type NormalizedCompanyName = {
  raw: string;
  normalized: string;
};

export type NormalizedCompany<TId = string> = NormalizedCompanyName & { id: TId };

export type CompanyConflict<TId = string> = {
  contractNumber: string;
  name: string;
  suggestions: Array<{ id: TId; name: string }>;
};

export function normalizeCompanyName(value: string): NormalizedCompanyName {
  const raw = value.trim();
  const normalized = raw
    .toLowerCase()
    .replace(/["'`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return { raw, normalized };
}

export function findSimilarCompanies<TId>(
  target: NormalizedCompanyName,
  companies: NormalizedCompany<TId>[],
): NormalizedCompany<TId>[] {
  if (!target.normalized) return [];
  return companies.filter((c) => {
    if (!c.normalized) return false;
    if (c.normalized === target.normalized) return true;
    if (c.normalized.includes(target.normalized)) return true;
    if (target.normalized.includes(c.normalized)) return true;
    return false;
  });
}

export function collectCompanyConflicts<TId>(
  createCompanyRequests: Array<{
    contractNumber: string;
    company: { name: string; forceCreate?: boolean };
  }>,
  normalizedCompanies: NormalizedCompany<TId>[],
): CompanyConflict<TId>[] {
  return createCompanyRequests.flatMap((request) => {
    const target = normalizeCompanyName(request.company.name);
    if (request.company.forceCreate) return [];
    const suggestions = findSimilarCompanies(target, normalizedCompanies);
    if (!suggestions.length) return [];
    return [
      {
        contractNumber: request.contractNumber,
        name: request.company.name,
        suggestions: suggestions.map((s) => ({ id: s.id, name: s.raw })),
      },
    ];
  });
}

export function collectMissingContracts(
  rows: Array<{ contractNumber: string }>,
  contractNumbers: Set<string>,
  resolvedContractNumbers: Set<string>,
): string[] {
  const missing = new Set<string>();
  rows.forEach((row) => {
    if (!contractNumbers.has(row.contractNumber) && !resolvedContractNumbers.has(row.contractNumber)) {
      missing.add(row.contractNumber);
    }
  });
  return Array.from(missing.values());
}

export function buildTariffFeeByKey(
  rows: Array<{ contractNumber: string; tariffName: string; tariffFee: number }>,
  contractByNumber: Map<string, { operatorId: string }>,
): Map<string, number> {
  const tariffFeeByKey = new Map<string, number>();
  for (const row of rows) {
    if (!row.tariffName) continue;
    const contract = contractByNumber.get(row.contractNumber);
    if (!contract) continue;
    const key = `${contract.operatorId}:${row.tariffName.toLowerCase().trim()}`;
    const current = tariffFeeByKey.get(key) ?? 0;
    if (row.tariffFee > current) tariffFeeByKey.set(key, row.tariffFee);
  }
  return tariffFeeByKey;
}
