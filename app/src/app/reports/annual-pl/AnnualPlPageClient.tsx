"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { AnnualPlEntry } from "@/lib/accounting-entries-repo";

type Props = {
  activeCompanyId: number;
  activeCompanyName: string;
  defaultYear: number;
  entries: AnnualPlEntry[];
};

type ViewMode = "summary" | "details";
type ReportMode = "actual" | "compare" | "common_size";

type ExpenseDetailRow = {
  typeOfExpenseId: number | null;
  expenseTypeText: string;
  current: number;
  prior: number;
};

type IncomeDetailRow = {
  counterpartyName: string;
  current: number;
  prior: number;
};

type Totals = {
  revenue: number;
  expenses: number;
};

type StatementRow = {
  key: string;
  label: string;
  kind: "value" | "subtotal";
  current: number;
  prior: number;
  hasEntries: boolean;
  entryType: "all" | "income" | "expense";
  optional?: boolean;
};

function parseSelectedYear(value: string | null, availableYears: number[], fallback: number): number {
  if (value !== null) {
    const parsed = Number.parseInt(value, 10);
    if (availableYears.includes(parsed)) {
      return parsed;
    }
  }
  return availableYears[0] ?? fallback;
}

function parseView(value: string | null): ViewMode {
  if (value === "details") {
    return "details";
  }
  return "summary";
}

function parseMode(value: string | null): ReportMode {
  if (value === "actual" || value === "common_size") {
    return value;
  }
  return "compare";
}

function formatAmountCents(amountCents: number): string {
  return new Intl.NumberFormat("de-CH", {
    style: "currency",
    currency: "CHF",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountCents / 100);
}

function formatPercent(value: number): string {
  return new Intl.NumberFormat("de-CH", {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatShare(numerator: number, denominator: number): string {
  if (denominator === 0) {
    return "-";
  }
  return formatPercent(numerator / denominator);
}

function formatDeltaPercent(current: number, prior: number): string {
  if (prior === 0) {
    return "-";
  }
  return formatPercent((current - prior) / Math.abs(prior));
}

function formatPercentagePointDelta(current: number, prior: number, currentRevenue: number, priorRevenue: number): string {
  if (currentRevenue === 0 || priorRevenue === 0) {
    return "-";
  }
  const currentShare = current / currentRevenue;
  const priorShare = prior / priorRevenue;
  const ppDelta = (currentShare - priorShare) * 100;
  return `${ppDelta.toFixed(2)} pp`;
}

function compareExpenseDetailRows(a: ExpenseDetailRow, b: ExpenseDetailRow): number {
  if (a.current !== b.current) {
    return b.current - a.current;
  }

  const textCompare = a.expenseTypeText.localeCompare(b.expenseTypeText);
  if (textCompare !== 0) {
    return textCompare;
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

function normalizeCounterpartyName(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length < 1) {
    return "Unknown counterparty";
  }
  return trimmed;
}

function buildTotals(rows: AnnualPlEntry[]): Totals {
  return rows.reduce(
    (acc, row) => {
      if (row.entryType === "income") {
        acc.revenue += row.amountGross;
      } else {
        acc.expenses += row.amountGross;
      }
      return acc;
    },
    { revenue: 0, expenses: 0 } satisfies Totals,
  );
}

function formatSignedDelta(amountCents: number): string {
  if (amountCents > 0) {
    return `+${formatAmountCents(amountCents)}`;
  }
  return formatAmountCents(amountCents);
}

function buildOverviewDrillthroughHref(year: number, entryType: "all" | "income" | "expense"): string {
  const params = new URLSearchParams();
  params.set("year", String(year));
  params.set("type", entryType);
  params.set("sort", "documentDateDesc");
  return `/?${params.toString()}`;
}

function getCurrentLabel(mode: ReportMode, year: number): string {
  if (mode === "common_size") {
    return `% of Revenue (${year})`;
  }
  return `Amount (${year})`;
}

function getPriorLabel(mode: ReportMode, year: number): string {
  if (mode === "common_size") {
    return `% of Revenue (${year - 1})`;
  }
  return `Amount (${year - 1})`;
}

function computeModePrimaryCell(mode: ReportMode, amount: number, revenue: number): string {
  if (mode === "common_size") {
    return formatShare(amount, revenue);
  }
  return formatAmountCents(amount);
}

function computeModeSecondaryCell(mode: ReportMode, amount: number, revenue: number): string {
  if (mode === "common_size") {
    return formatShare(amount, revenue);
  }
  return formatAmountCents(amount);
}

function computeExtraDeltaCell(mode: ReportMode, current: number, prior: number, currentRevenue: number, priorRevenue: number): string {
  if (mode === "common_size") {
    return formatPercentagePointDelta(current, prior, currentRevenue, priorRevenue);
  }
  return formatSignedDelta(current - prior);
}

function computeExtraPercentCell(mode: ReportMode, current: number, prior: number): string {
  if (mode === "common_size") {
    return "";
  }
  return formatDeltaPercent(current, prior);
}

function computeFinalShareCell(mode: ReportMode, current: number, currentRevenue: number): string {
  if (mode === "common_size") {
    return "";
  }
  return formatShare(current, currentRevenue);
}

function getDetailColSpan(mode: ReportMode): number {
  if (mode === "actual") {
    return 3;
  }
  if (mode === "compare") {
    return 6;
  }
  return 4;
}

export function AnnualPlPageClient({
  activeCompanyId,
  activeCompanyName,
  defaultYear,
  entries,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const selectedView = parseView(searchParams.get("view"));
  const selectedMode = parseMode(searchParams.get("mode"));

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    for (const entry of entries) {
      years.add(entry.documentYear);
    }
    if (years.size < 1) {
      years.add(defaultYear);
    }
    return Array.from(years).sort((a, b) => b - a);
  }, [defaultYear, entries]);

  const selectedYear = parseSelectedYear(searchParams.get("year"), availableYears, defaultYear);
  const priorYear = selectedYear - 1;

  const canonicalQuery = useMemo(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("year", String(selectedYear));
    params.set("view", selectedView);
    params.set("mode", selectedMode);
    return params.toString();
  }, [searchParams, selectedYear, selectedView, selectedMode]);

  useEffect(() => {
    if (searchParams.toString() !== canonicalQuery) {
      router.replace(`${pathname}?${canonicalQuery}`, { scroll: false });
    }
  }, [canonicalQuery, pathname, router, searchParams]);

  const selectedYearEntries = useMemo(() => {
    return entries.filter((entry) => entry.documentYear === selectedYear);
  }, [entries, selectedYear]);

  const priorYearEntries = useMemo(() => {
    return entries.filter((entry) => entry.documentYear === priorYear);
  }, [entries, priorYear]);

  const currentTotals = useMemo(() => buildTotals(selectedYearEntries), [selectedYearEntries]);
  const priorTotals = useMemo(() => buildTotals(priorYearEntries), [priorYearEntries]);

  const currentResult = currentTotals.revenue - currentTotals.expenses;
  const priorResult = priorTotals.revenue - priorTotals.expenses;

  const incomeDetails = useMemo(() => {
    const byCounterparty = new Map<string, IncomeDetailRow>();

    for (const entry of entries) {
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
  }, [entries, priorYear, selectedYear]);

  const expenseDetails = useMemo(() => {
    const byExpenseType = new Map<string, ExpenseDetailRow>();

    for (const entry of entries) {
      if (entry.entryType !== "expense") {
        continue;
      }
      if (entry.documentYear !== selectedYear && entry.documentYear !== priorYear) {
        continue;
      }

      const key = entry.typeOfExpenseId === null ? "null" : String(entry.typeOfExpenseId);
      const existing = byExpenseType.get(key);
      if (existing) {
        if (entry.documentYear === selectedYear) {
          existing.current += entry.amountGross;
        } else {
          existing.prior += entry.amountGross;
        }
        continue;
      }

      const current = entry.documentYear === selectedYear ? entry.amountGross : 0;
      const prior = entry.documentYear === priorYear ? entry.amountGross : 0;
      byExpenseType.set(key, {
        typeOfExpenseId: entry.typeOfExpenseId,
        expenseTypeText: entry.expenseTypeText ?? "Unassigned",
        current,
        prior,
      });
    }

    return Array.from(byExpenseType.values()).sort(compareExpenseDetailRows);
  }, [entries, priorYear, selectedYear]);

  const hasAnyEntries = entries.length > 0;
  const hasUnassignedExpenses = expenseDetails.some((row) => row.typeOfExpenseId === null && row.current !== 0);

  const statementRows = useMemo(() => {
    const directCostsCurrent = 0;
    const directCostsPrior = 0;
    const grossProfitCurrent = currentTotals.revenue - directCostsCurrent;
    const grossProfitPrior = priorTotals.revenue - directCostsPrior;
    const operatingResultCurrent = grossProfitCurrent - currentTotals.expenses;
    const operatingResultPrior = grossProfitPrior - priorTotals.expenses;
    const financialOtherCurrent = 0;
    const financialOtherPrior = 0;
    const taxesCurrent = 0;
    const taxesPrior = 0;

    const rows: StatementRow[] = [
      {
        key: "revenue",
        label: "Revenue",
        kind: "value",
        current: currentTotals.revenue,
        prior: priorTotals.revenue,
        hasEntries: true,
        entryType: "income",
      },
      {
        key: "direct_costs",
        label: "Direct Costs",
        kind: "value",
        current: directCostsCurrent,
        prior: directCostsPrior,
        hasEntries: false,
        entryType: "all",
        optional: true,
      },
      {
        key: "gross_profit",
        label: "Gross Profit",
        kind: "subtotal",
        current: grossProfitCurrent,
        prior: grossProfitPrior,
        hasEntries: true,
        entryType: "all",
      },
      {
        key: "operating_expenses",
        label: "Operating Expenses",
        kind: "value",
        current: currentTotals.expenses,
        prior: priorTotals.expenses,
        hasEntries: true,
        entryType: "expense",
      },
      {
        key: "operating_result",
        label: "Operating Result",
        kind: "subtotal",
        current: operatingResultCurrent,
        prior: operatingResultPrior,
        hasEntries: true,
        entryType: "all",
      },
      {
        key: "financial_other",
        label: "Financial / Other",
        kind: "value",
        current: financialOtherCurrent,
        prior: financialOtherPrior,
        hasEntries: false,
        entryType: "all",
        optional: true,
      },
      {
        key: "taxes",
        label: "Taxes",
        kind: "value",
        current: taxesCurrent,
        prior: taxesPrior,
        hasEntries: false,
        entryType: "all",
        optional: true,
      },
      {
        key: "net_profit_loss",
        label: "Net Profit / Loss",
        kind: "subtotal",
        current: currentResult,
        prior: priorResult,
        hasEntries: true,
        entryType: "all",
      },
    ];

    return rows.filter((row) => {
      if (!row.optional) {
        return true;
      }
      return row.current !== 0 || row.prior !== 0;
    });
  }, [currentResult, currentTotals.expenses, currentTotals.revenue, priorResult, priorTotals.expenses, priorTotals.revenue]);

  const emptyStateText = !hasAnyEntries
    ? "No accounting entries yet. Upload invoices to start building your annual P&L."
    : "No entries for the selected year. Compare view still shows prior-year values when available.";

  const kpiCards = [
    { key: "revenue", label: "Revenue", current: currentTotals.revenue, prior: priorTotals.revenue },
    { key: "expenses", label: "Expenses", current: currentTotals.expenses, prior: priorTotals.expenses },
    { key: "net", label: "Net Result", current: currentResult, prior: priorResult },
  ];

  return (
    <main className="min-h-screen bg-zinc-50 px-6 py-12 text-zinc-900">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Annual Profit &amp; Loss</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">{activeCompanyName}</h1>
            <p className="mt-1 text-sm text-zinc-600">
              Company #{activeCompanyId} | Fiscal year {selectedYear}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/"
              className="inline-flex items-center rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-100"
            >
              Back to overview
            </Link>
            <Link
              href="/upload"
              className="inline-flex items-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
            >
              Upload invoice
            </Link>
            <Link
              href="/uploads?status=pending_review"
              className="inline-flex items-center rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-100"
            >
              Open queue
            </Link>
            <Link
              href="/admin/companies"
              className="inline-flex items-center rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-100"
            >
              Switch company
            </Link>
            <button
              type="button"
              disabled
              className="inline-flex cursor-not-allowed items-center rounded-md border border-zinc-200 bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-500"
              aria-disabled="true"
            >
              Export (coming soon)
            </button>
          </div>
        </header>

        <section className="grid gap-3 rounded border border-zinc-300 bg-white p-4 md:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-zinc-700">Year</span>
            <select
              value={selectedYear}
              onChange={(event) => {
                const params = new URLSearchParams(searchParams.toString());
                params.set("year", event.target.value);
                router.replace(`${pathname}?${params.toString()}`, { scroll: false });
              }}
              className="rounded border border-zinc-300 px-3 py-2"
            >
              {availableYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-zinc-700">View</span>
            <select
              value={selectedView}
              onChange={(event) => {
                const params = new URLSearchParams(searchParams.toString());
                params.set("view", event.target.value);
                router.replace(`${pathname}?${params.toString()}`, { scroll: false });
              }}
              className="rounded border border-zinc-300 px-3 py-2"
            >
              <option value="summary">Summary</option>
              <option value="details">Details</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-zinc-700">Mode</span>
            <select
              value={selectedMode}
              onChange={(event) => {
                const params = new URLSearchParams(searchParams.toString());
                params.set("mode", event.target.value);
                router.replace(`${pathname}?${params.toString()}`, { scroll: false });
              }}
              className="rounded border border-zinc-300 px-3 py-2"
            >
              <option value="actual">Actual</option>
              <option value="compare">Compare</option>
              <option value="common_size">Common-size</option>
            </select>
          </label>

        </section>

        <section className="grid gap-3 md:grid-cols-4">
          {kpiCards.map((card) => (
            <article key={card.key} className="rounded border border-zinc-300 bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-zinc-500">
                {card.label} ({selectedYear})
              </p>
              <p
                className={`mt-2 text-2xl font-semibold ${
                  card.key === "revenue"
                    ? "text-emerald-700"
                    : card.key === "expenses"
                      ? "text-rose-700"
                      : card.current >= 0
                        ? "text-emerald-700"
                        : "text-rose-700"
                }`}
              >
                {formatAmountCents(card.current)}
              </p>
              {selectedMode === "compare" ? (
                <div className="mt-2 text-xs text-zinc-600">
                  <p>{priorYear}: {formatAmountCents(card.prior)}</p>
                  <p>
                    Delta: {formatSignedDelta(card.current - card.prior)} ({formatDeltaPercent(card.current, card.prior)})
                  </p>
                </div>
              ) : null}
            </article>
          ))}
          <article className="rounded border border-zinc-300 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Net Margin ({selectedYear})</p>
            <p className={`mt-2 text-2xl font-semibold ${currentResult >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
              {formatShare(currentResult, currentTotals.revenue)}
            </p>
            {selectedMode === "compare" ? (
              <div className="mt-2 text-xs text-zinc-600">
                <p>{priorYear}: {formatShare(priorResult, priorTotals.revenue)}</p>
                <p>
                  Delta: {formatPercentagePointDelta(currentResult, priorResult, currentTotals.revenue, priorTotals.revenue)}
                </p>
              </div>
            ) : null}
          </article>
        </section>

        {hasUnassignedExpenses ? (
          <section className="rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Some expenses are unassigned and grouped under &quot;Unassigned&quot;.
          </section>
        ) : null}

        {!hasAnyEntries ? (
          <section className="rounded border border-zinc-300 bg-white px-4 py-5 text-sm text-zinc-600">
            <p>{emptyStateText}</p>
            <Link href="/upload" className="mt-3 inline-flex items-center text-sm font-medium text-zinc-900 underline">
              Upload invoice
            </Link>
          </section>
        ) : (
          <>
            {selectedYearEntries.length < 1 ? (
              <section className="rounded border border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-600">
                No entries for {selectedYear}. Current-year values are zero; prior-year comparison remains visible.
              </section>
            ) : null}
            <section className="overflow-x-auto rounded border border-zinc-300 bg-white">
              <table className="min-w-full divide-y divide-zinc-200 text-sm">
              <thead className="bg-zinc-100 text-left text-xs uppercase tracking-wide text-zinc-600">
                <tr>
                  <th className="sticky left-0 bg-zinc-100 px-3 py-2">Line item</th>
                  <th className="px-3 py-2">{getCurrentLabel(selectedMode, selectedYear)}</th>
                  {selectedMode === "compare" || selectedMode === "common_size" ? (
                    <th className="px-3 py-2">{getPriorLabel(selectedMode, selectedYear)}</th>
                  ) : null}
                  {selectedMode === "compare" || selectedMode === "common_size" ? (
                    <th className="px-3 py-2">{selectedMode === "common_size" ? "Delta (pp)" : "Delta (CHF)"}</th>
                  ) : null}
                  {selectedMode === "compare" ? <th className="px-3 py-2">Delta (%)</th> : null}
                  {selectedMode !== "common_size" ? <th className="px-3 py-2">% of Revenue ({selectedYear})</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {statementRows.map((row) => (
                  <Fragment key={row.key}>
                    <tr className={row.kind === "subtotal" ? "bg-zinc-50" : ""}>
                      <td className="sticky left-0 bg-inherit px-3 py-2 font-medium text-zinc-800">
                        {row.hasEntries ? (
                          <Link href={buildOverviewDrillthroughHref(selectedYear, row.entryType)} className="underline">
                            {row.label}
                          </Link>
                        ) : (
                          row.label
                        )}
                      </td>
                      <td className={`px-3 py-2 text-zinc-900 ${row.kind === "subtotal" ? "font-semibold" : ""}`}>
                        {computeModePrimaryCell(selectedMode, row.current, currentTotals.revenue)}
                      </td>
                      {selectedMode === "compare" || selectedMode === "common_size" ? (
                        <td className={`px-3 py-2 text-zinc-900 ${row.kind === "subtotal" ? "font-semibold" : ""}`}>
                          {computeModeSecondaryCell(selectedMode, row.prior, priorTotals.revenue)}
                        </td>
                      ) : null}
                      {selectedMode === "compare" || selectedMode === "common_size" ? (
                        <td className="px-3 py-2">
                          <span className="text-zinc-700">
                            {computeExtraDeltaCell(
                              selectedMode,
                              row.current,
                              row.prior,
                              currentTotals.revenue,
                              priorTotals.revenue,
                            )}
                          </span>
                        </td>
                      ) : null}
                      {selectedMode === "compare" ? (
                        <td className="px-3 py-2 text-zinc-700">
                          {computeExtraPercentCell(selectedMode, row.current, row.prior)}
                        </td>
                      ) : null}
                      {selectedMode !== "common_size" ? (
                        <td className="px-3 py-2 text-zinc-700">
                          {computeFinalShareCell(selectedMode, row.current, currentTotals.revenue)}
                        </td>
                      ) : null}
                    </tr>

                    {selectedView === "details" && row.key === "revenue"
                      ? incomeDetails.map((detailRow) => (
                          <tr key={`income-${detailRow.counterpartyName}`}>
                            <td className="sticky left-0 bg-white px-3 py-2 pl-8 text-zinc-700">
                              <Link href={buildOverviewDrillthroughHref(selectedYear, "income")} className="underline">
                                {detailRow.counterpartyName}
                              </Link>
                            </td>
                            <td className="px-3 py-2 text-zinc-900">
                              {computeModePrimaryCell(selectedMode, detailRow.current, currentTotals.revenue)}
                            </td>
                            {selectedMode === "compare" || selectedMode === "common_size" ? (
                              <td className="px-3 py-2 text-zinc-900">
                                {computeModeSecondaryCell(selectedMode, detailRow.prior, priorTotals.revenue)}
                              </td>
                            ) : null}
                            {selectedMode === "compare" || selectedMode === "common_size" ? (
                              <td className="px-3 py-2 text-zinc-700">
                                {computeExtraDeltaCell(
                                  selectedMode,
                                  detailRow.current,
                                  detailRow.prior,
                                  currentTotals.revenue,
                                  priorTotals.revenue,
                                )}
                              </td>
                            ) : null}
                            {selectedMode === "compare" ? (
                              <td className="px-3 py-2 text-zinc-700">
                                {computeExtraPercentCell(selectedMode, detailRow.current, detailRow.prior)}
                              </td>
                            ) : null}
                            {selectedMode !== "common_size" ? (
                              <td className="px-3 py-2 text-zinc-700">
                                {computeFinalShareCell(selectedMode, detailRow.current, currentTotals.revenue)}
                              </td>
                            ) : null}
                          </tr>
                        ))
                      : null}

                    {selectedView === "details" && row.key === "operating_expenses"
                      ? expenseDetails.map((detailRow) => (
                          <tr key={`expense-${detailRow.typeOfExpenseId ?? "unassigned"}`}>
                            <td className="sticky left-0 bg-white px-3 py-2 pl-8 text-zinc-700">
                              <Link href={buildOverviewDrillthroughHref(selectedYear, "expense")} className="underline">
                                {detailRow.expenseTypeText}
                              </Link>
                            </td>
                            <td className="px-3 py-2 text-zinc-900">
                              {computeModePrimaryCell(selectedMode, detailRow.current, currentTotals.revenue)}
                            </td>
                            {selectedMode === "compare" || selectedMode === "common_size" ? (
                              <td className="px-3 py-2 text-zinc-900">
                                {computeModeSecondaryCell(selectedMode, detailRow.prior, priorTotals.revenue)}
                              </td>
                            ) : null}
                            {selectedMode === "compare" || selectedMode === "common_size" ? (
                              <td className="px-3 py-2 text-zinc-700">
                                {computeExtraDeltaCell(
                                  selectedMode,
                                  detailRow.current,
                                  detailRow.prior,
                                  currentTotals.revenue,
                                  priorTotals.revenue,
                                )}
                              </td>
                            ) : null}
                            {selectedMode === "compare" ? (
                              <td className="px-3 py-2 text-zinc-700">
                                {computeExtraPercentCell(selectedMode, detailRow.current, detailRow.prior)}
                              </td>
                            ) : null}
                            {selectedMode !== "common_size" ? (
                              <td className="px-3 py-2 text-zinc-700">
                                {computeFinalShareCell(selectedMode, detailRow.current, currentTotals.revenue)}
                              </td>
                            ) : null}
                          </tr>
                        ))
                      : null}
                  </Fragment>
                ))}

                {selectedView === "details" && incomeDetails.length < 1 && expenseDetails.length < 1 ? (
                  <tr>
                    <td className="sticky left-0 bg-white px-3 py-2 text-zinc-600" colSpan={getDetailColSpan(selectedMode)}>
                      No detail rows available for the selected year.
                    </td>
                  </tr>
                ) : null}
              </tbody>
              </table>
            </section>
          </>
        )}

      </div>
    </main>
  );
}
