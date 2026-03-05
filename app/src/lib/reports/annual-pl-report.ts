import type { AnnualPlEntry } from "@/lib/accounting-entries-repo";
import type { ExpensePlCategory } from "@/lib/expense-types-repo";

export type ExpenseDetailRow = {
  typeOfExpenseId: number | null;
  expenseTypeText: string;
  current: number;
  prior: number;
};

export type IncomeDetailRow = {
  counterpartyName: string;
  current: number;
  prior: number;
};

export type ExpenseDetailByCategory = {
  directCosts: ExpenseDetailRow[];
  operatingExpenses: ExpenseDetailRow[];
  financialOther: ExpenseDetailRow[];
  taxes: ExpenseDetailRow[];
};

export type AnnualPlTotals = {
  revenue: number;
  directCosts: number;
  operatingExpenses: number;
  financialOther: number;
  taxes: number;
  expenses: number;
};

export type StatementRow = {
  key: string;
  label: string;
  kind: "value" | "subtotal";
  mathRole: "add" | "subtract" | "subtotal";
  current: number;
  prior: number;
  hasEntries: boolean;
  entryType: "all" | "income" | "expense";
  optional?: boolean;
};

export type AnnualPlReportData = {
  selectedYear: number;
  priorYear: number;
  currentTotals: AnnualPlTotals;
  priorTotals: AnnualPlTotals;
  currentGrossProfit: number;
  priorGrossProfit: number;
  currentOperatingResult: number;
  priorOperatingResult: number;
  currentResult: number;
  priorResult: number;
  expenseDetailsByCategory: ExpenseDetailByCategory;
  incomeDetails: IncomeDetailRow[];
  statementRows: StatementRow[];
};

type ExpenseCategoryKey = keyof ExpenseDetailByCategory;

type GroupedExpenseEntry = {
  categoryKey: ExpenseCategoryKey;
  typeOfExpenseId: number | null;
  label: string;
};

function normalizeCounterpartyName(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length < 1) {
    return "Unknown counterparty";
  }
  return trimmed;
}

function normalizeExpenseTypeText(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("en-US")
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "");
}

function compareExpenseDetailRows(a: ExpenseDetailRow, b: ExpenseDetailRow): number {
  const normalizedTextCompare = normalizeExpenseTypeText(a.expenseTypeText).localeCompare(
    normalizeExpenseTypeText(b.expenseTypeText),
    "en-US",
  );
  if (normalizedTextCompare !== 0) {
    return normalizedTextCompare;
  }

  if (a.typeOfExpenseId === null && b.typeOfExpenseId === null) {
    return 0;
  }
  if (a.typeOfExpenseId === null) {
    return 1;
  }
  if (b.typeOfExpenseId === null) {
    return -1;
  }

  return a.typeOfExpenseId - b.typeOfExpenseId;
}

function compareIncomeDetailRows(a: IncomeDetailRow, b: IncomeDetailRow): number {
  if (a.current !== b.current) {
    return b.current - a.current;
  }
  return a.counterpartyName.localeCompare(b.counterpartyName);
}

function resolveExpenseCategory(entry: AnnualPlEntry): GroupedExpenseEntry {
  let categoryKey: ExpenseCategoryKey;
  const category = entry.expensePlCategory;
  if (category === "direct_cost") {
    categoryKey = "directCosts";
  } else if (category === "financial_other") {
    categoryKey = "financialOther";
  } else if (category === "tax") {
    categoryKey = "taxes";
  } else {
    categoryKey = "operatingExpenses";
  }

  const label = (entry.expenseTypeText ?? "").trim() || "Unassigned";
  return {
    categoryKey,
    typeOfExpenseId: entry.typeOfExpenseId,
    label,
  };
}

function buildExpenseDetailsByCategory(
  rows: AnnualPlEntry[],
  selectedYear: number,
  priorYear: number,
): ExpenseDetailByCategory {
  const byCategory: Record<ExpenseCategoryKey, Map<string, ExpenseDetailRow>> = {
    directCosts: new Map<string, ExpenseDetailRow>(),
    operatingExpenses: new Map<string, ExpenseDetailRow>(),
    financialOther: new Map<string, ExpenseDetailRow>(),
    taxes: new Map<string, ExpenseDetailRow>(),
  };

  for (const entry of rows) {
    if (entry.entryType !== "expense") {
      continue;
    }
    if (entry.documentYear !== selectedYear && entry.documentYear !== priorYear) {
      continue;
    }

    const grouped = resolveExpenseCategory(entry);
    const key = grouped.typeOfExpenseId === null ? `unassigned:${grouped.label}` : String(grouped.typeOfExpenseId);
    const existing = byCategory[grouped.categoryKey].get(key);
    if (existing) {
      if (entry.documentYear === selectedYear) {
        existing.current += entry.amountGross;
      } else {
        existing.prior += entry.amountGross;
      }
      continue;
    }

    byCategory[grouped.categoryKey].set(key, {
      typeOfExpenseId: grouped.typeOfExpenseId,
      expenseTypeText: grouped.label,
      current: entry.documentYear === selectedYear ? entry.amountGross : 0,
      prior: entry.documentYear === priorYear ? entry.amountGross : 0,
    });
  }

  return {
    directCosts: Array.from(byCategory.directCosts.values()).sort(compareExpenseDetailRows),
    operatingExpenses: Array.from(byCategory.operatingExpenses.values()).sort(compareExpenseDetailRows),
    financialOther: Array.from(byCategory.financialOther.values()).sort(compareExpenseDetailRows),
    taxes: Array.from(byCategory.taxes.values()).sort(compareExpenseDetailRows),
  };
}

function buildTotals(rows: AnnualPlEntry[]): AnnualPlTotals {
  return rows.reduce(
    (acc, row) => {
      if (row.entryType === "income") {
        acc.revenue += row.amountGross;
        return acc;
      }

      const category: ExpensePlCategory | "uncategorized-fallback" =
        row.expensePlCategory ?? "uncategorized-fallback";
      if (category === "direct_cost") {
        acc.directCosts += row.amountGross;
      } else if (category === "financial_other") {
        acc.financialOther += row.amountGross;
      } else if (category === "tax") {
        acc.taxes += row.amountGross;
      } else {
        acc.operatingExpenses += row.amountGross;
      }

      acc.expenses += row.amountGross;
      return acc;
    },
    {
      revenue: 0,
      directCosts: 0,
      operatingExpenses: 0,
      financialOther: 0,
      taxes: 0,
      expenses: 0,
    } satisfies AnnualPlTotals,
  );
}

function hasVisibleExpenseDetails(rows: ExpenseDetailRow[]): boolean {
  return rows.some((row) => row.current > 0 || row.prior > 0);
}

function buildIncomeDetails(rows: AnnualPlEntry[], selectedYear: number, priorYear: number): IncomeDetailRow[] {
  const byCounterparty = new Map<string, IncomeDetailRow>();

  for (const entry of rows) {
    if (entry.entryType !== "income") {
      continue;
    }
    if (entry.documentYear !== selectedYear && entry.documentYear !== priorYear) {
      continue;
    }

    const normalizedName = normalizeCounterpartyName(entry.counterpartyName);
    const key = normalizedName.toLocaleLowerCase("en-US");
    const existing = byCounterparty.get(key);
    if (existing) {
      if (entry.documentYear === selectedYear) {
        existing.current += entry.amountGross;
      } else {
        existing.prior += entry.amountGross;
      }
      continue;
    }

    byCounterparty.set(key, {
      counterpartyName: normalizedName,
      current: entry.documentYear === selectedYear ? entry.amountGross : 0,
      prior: entry.documentYear === priorYear ? entry.amountGross : 0,
    });
  }

  return Array.from(byCounterparty.values()).sort(compareIncomeDetailRows);
}

export function buildAnnualPlReportData(rows: AnnualPlEntry[], selectedYear: number): AnnualPlReportData {
  const priorYear = selectedYear - 1;
  const selectedYearEntries = rows.filter((entry) => entry.documentYear === selectedYear);
  const priorYearEntries = rows.filter((entry) => entry.documentYear === priorYear);

  const currentTotals = buildTotals(selectedYearEntries);
  const priorTotals = buildTotals(priorYearEntries);
  const currentGrossProfit = currentTotals.revenue - currentTotals.directCosts;
  const priorGrossProfit = priorTotals.revenue - priorTotals.directCosts;
  const currentOperatingResult = currentGrossProfit - currentTotals.operatingExpenses;
  const priorOperatingResult = priorGrossProfit - priorTotals.operatingExpenses;
  const currentResult = currentOperatingResult - currentTotals.financialOther - currentTotals.taxes;
  const priorResult = priorOperatingResult - priorTotals.financialOther - priorTotals.taxes;

  const expenseDetailsByCategory = buildExpenseDetailsByCategory(rows, selectedYear, priorYear);
  const showDirectCosts = hasVisibleExpenseDetails(expenseDetailsByCategory.directCosts);
  const showOperatingExpenses = hasVisibleExpenseDetails(expenseDetailsByCategory.operatingExpenses);
  const showFinancialOther = hasVisibleExpenseDetails(expenseDetailsByCategory.financialOther);
  const showTaxes = hasVisibleExpenseDetails(expenseDetailsByCategory.taxes);

  const statementRows = [
    {
      key: "revenue",
      label: "Revenue",
      kind: "value",
      mathRole: "add",
      current: currentTotals.revenue,
      prior: priorTotals.revenue,
      hasEntries: true,
      entryType: "income",
    },
    {
      key: "direct_costs",
      label: "Direct Costs",
      kind: "value",
      mathRole: "subtract",
      current: currentTotals.directCosts,
      prior: priorTotals.directCosts,
      hasEntries: showDirectCosts,
      entryType: "expense",
      optional: true,
    },
    {
      key: "gross_profit",
      label: "Gross Profit",
      kind: "subtotal",
      mathRole: "subtotal",
      current: currentGrossProfit,
      prior: priorGrossProfit,
      hasEntries: true,
      entryType: "all",
    },
    {
      key: "operating_expenses",
      label: "Operating Expenses",
      kind: "value",
      mathRole: "subtract",
      current: currentTotals.operatingExpenses,
      prior: priorTotals.operatingExpenses,
      hasEntries: showOperatingExpenses,
      entryType: "expense",
      optional: true,
    },
    {
      key: "operating_result",
      label: "Operating Result",
      kind: "subtotal",
      mathRole: "subtotal",
      current: currentOperatingResult,
      prior: priorOperatingResult,
      hasEntries: true,
      entryType: "all",
    },
    {
      key: "financial_other",
      label: "Financial / Other",
      kind: "value",
      mathRole: "subtract",
      current: currentTotals.financialOther,
      prior: priorTotals.financialOther,
      hasEntries: showFinancialOther,
      entryType: "expense",
      optional: true,
    },
    {
      key: "taxes",
      label: "Taxes",
      kind: "value",
      mathRole: "subtract",
      current: currentTotals.taxes,
      prior: priorTotals.taxes,
      hasEntries: showTaxes,
      entryType: "expense",
      optional: true,
    },
    {
      key: "net_profit_loss",
      label: "Net Profit / Loss",
      kind: "subtotal",
      mathRole: "subtotal",
      current: currentResult,
      prior: priorResult,
      hasEntries: true,
      entryType: "all",
    },
  ] satisfies StatementRow[];

  return {
    selectedYear,
    priorYear,
    currentTotals,
    priorTotals,
    currentGrossProfit,
    priorGrossProfit,
    currentOperatingResult,
    priorOperatingResult,
    currentResult,
    priorResult,
    expenseDetailsByCategory,
    incomeDetails: buildIncomeDetails(rows, selectedYear, priorYear),
    statementRows: statementRows.filter((row) => !row.optional || row.hasEntries),
  };
}
