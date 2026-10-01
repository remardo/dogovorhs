export type ImportPreview = {
  importId: string;
  fileName: string;
  totals: {
    rows: number;
    contractsMissing: number;
    simCardsMissing: number;
    tariffsMissing: number;
    vatMismatches: number;
    totalAmount: number;
    totalVat: number;
    totalTotal: number;
  };
  missingContracts: {
    contractNumber: string;
    rowsCount: number;
    periodStart: string;
    periodEnd: string;
  }[];
  missingSimCards: {
    phone: string;
    contractNumber: string;
    tariffName: string;
  }[];
  missingTariffs: {
    operatorId: string;
    operatorName: string;
    contractNumber: string;
    tariffName: string;
  }[];
  rows: {
    rowIndex: number;
    phone: string;
    contractNumber: string;
    tariffName: string;
    periodStart: string;
    periodEnd: string;
    month: string;
    amount: number;
    vat: number;
    total: number;
    tariffFee: number;
    vatMismatch: boolean;
    isVatOnly: boolean;
  }[];
};

export type ImportHistoryItem = {
  _id: string;
  fileName: string;
  status: string;
  createdAt: number;
  appliedAt?: number;
  previewSummary?: {
    rows: number;
    contractsMissing: number;
    simCardsMissing: number;
    tariffsMissing: number;
    vatMismatches?: number;
    totalAmount: number;
    totalVat: number;
    totalTotal: number;
  };
  appliedSummary?: {
    expensesCreated: number;
    simCardsCreated: number;
    tariffsCreated: number;
    contractsCreated: number;
  };
};

export type ContractResolutionState = {
  contractNumber: string;
  companyMode: "existing" | "create";
  companyId?: string;
  companyName?: string;
  companyInn?: string;
  companyKpp?: string;
  companyComment?: string;
  operatorMode: "existing" | "create";
  operatorId?: string;
  operatorName?: string;
  operatorType?: string;
  operatorManager?: string;
  operatorPhone?: string;
  operatorEmail?: string;
  name?: string;
  type: string;
  status: "active" | "closing";
  startDate: string;
  endDate: string;
  monthlyFee: number;
  simCount: number;
  forceCreate?: boolean;
};

export type CompanyConflict = {
  contractNumber: string;
  name: string;
  suggestions: { id: string; name: string }[];
};

export type SimAction = "create" | "skip";
