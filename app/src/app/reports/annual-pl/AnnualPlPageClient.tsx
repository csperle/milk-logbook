"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { AnnualPlEntry } from "@/lib/accounting-entries-repo";
import { buildAnnualPlReportData } from "@/lib/reports/annual-pl-report";

type Props = {
  activeCompanyId: number;
  activeCompanyName: string;
  defaultYear: number;
  entries: AnnualPlEntry[];
};

type ViewMode = "summary" | "details";
type ReportMode = "actual" | "compare" | "common_size";

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
    return 4;
  }
  if (mode === "compare") {
    return 7;
  }
  return 5;
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
  const [isExporting, setIsExporting] = useState(false);
  const [showExportSpinner, setShowExportSpinner] = useState(false);
  const spinnerTimeoutRef = useRef<number | null>(null);

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

  const report = useMemo(() => buildAnnualPlReportData(entries, selectedYear), [entries, selectedYear]);
  const currentTotals = report.currentTotals;
  const priorTotals = report.priorTotals;
  const currentResult = report.currentResult;
  const priorResult = report.priorResult;
  const incomeDetails = report.incomeDetails;
  const expenseDetailsByCategory = report.expenseDetailsByCategory;
  const statementRows = report.statementRows;
  const selectedYearEntries = useMemo(
    () => entries.filter((entry) => entry.documentYear === selectedYear),
    [entries, selectedYear],
  );
  const hasAnyEntries = entries.length > 0;

  const emptyStateText = !hasAnyEntries
    ? "No accounting entries yet. Upload invoices to start building your annual P&L."
    : "No entries for the selected year. Compare view still shows prior-year values when available.";

  const kpiCards = [
    { key: "revenue", label: "Revenue", current: currentTotals.revenue, prior: priorTotals.revenue },
    {
      key: "expenses",
      label: "Expenses",
      current: currentTotals.expenses,
      prior: priorTotals.expenses,
    },
    { key: "net", label: "Net Result", current: currentResult, prior: priorResult },
  ];

  async function handleExport(): Promise<void> {
    if (isExporting) {
      return;
    }
    setIsExporting(true);
    setShowExportSpinner(false);
    spinnerTimeoutRef.current = window.setTimeout(() => {
      setShowExportSpinner(true);
    }, 2000);

    try {
      const response = await fetch("/api/reports/annual-pl/export", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ year: selectedYear }),
      });

      if (!response.ok) {
        setShowExportSpinner(false);
        window.alert("Could not generate annual P&L export.");
        return;
      }

      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const disposition = response.headers.get("Content-Disposition");
      const filenameMatch = disposition?.match(/filename\*=UTF-8''([^;]+)/);
      const filename = filenameMatch ? decodeURIComponent(filenameMatch[1]) : `annual-pl-${selectedYear}.pdf`;
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch {
      window.alert("Could not generate annual P&L export.");
    } finally {
      if (spinnerTimeoutRef.current !== null) {
        window.clearTimeout(spinnerTimeoutRef.current);
        spinnerTimeoutRef.current = null;
      }
      setShowExportSpinner(false);
      setIsExporting(false);
    }
  }

  useEffect(() => {
    return () => {
      if (spinnerTimeoutRef.current !== null) {
        window.clearTimeout(spinnerTimeoutRef.current);
      }
    };
  }, []);

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
            <p className="mt-2 inline-flex rounded border border-zinc-300 bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700">
              Management report (Milchbüchleinrechnung)
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/"
              className="inline-flex items-center rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-100"
            >
              Back to overview
            </Link>
            <button
              type="button"
              disabled={isExporting}
              onClick={handleExport}
              className={`inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium ${
                isExporting
                  ? "cursor-not-allowed border-zinc-200 bg-zinc-100 text-zinc-500"
                  : "border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-100"
              }`}
              aria-busy={isExporting}
            >
              {showExportSpinner ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
              ) : null}
              <span>{isExporting ? "Exporting PDF..." : "Export annual P&L (PDF)"}</span>
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
                  <th className="w-28 px-3 py-2" aria-label="Math role"></th>
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
                    <tr
                      className={
                        row.mathRole === "subtotal"
                          ? "bg-zinc-100 ring-1 ring-inset ring-zinc-300"
                          : row.mathRole === "subtract"
                            ? "bg-rose-50/40"
                            : ""
                      }
                    >
                      <td className="px-3 py-2 text-right align-middle">
                        <span
                          className={`inline-flex min-w-[2.75rem] items-center justify-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                            row.mathRole === "add"
                              ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                              : row.mathRole === "subtract"
                                ? "border-rose-300 bg-rose-50 text-rose-700"
                                : "border-zinc-400 bg-zinc-200 text-zinc-800"
                          }`}
                        >
                          {row.mathRole === "add"
                            ? "+ Add"
                            : row.mathRole === "subtract"
                              ? "- Sub"
                              : "= Total"}
                        </span>
                      </td>
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
                            <td className="px-3 py-2"></td>
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

                    {selectedView === "details" &&
                    (row.key === "direct_costs" ||
                      row.key === "operating_expenses" ||
                      row.key === "financial_other" ||
                      row.key === "taxes")
                      ? (row.key === "direct_costs"
                          ? expenseDetailsByCategory.directCosts
                          : row.key === "operating_expenses"
                            ? expenseDetailsByCategory.operatingExpenses
                            : row.key === "financial_other"
                              ? expenseDetailsByCategory.financialOther
                              : expenseDetailsByCategory.taxes
                        ).map((detailRow) => (
                          <tr
                            key={`expense-${detailRow.typeOfExpenseId ?? "unassigned"}-${detailRow.expenseTypeText}`}
                          >
                            <td className="px-3 py-2"></td>
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

                {selectedView === "details" &&
                incomeDetails.length < 1 &&
                expenseDetailsByCategory.directCosts.length < 1 &&
                expenseDetailsByCategory.operatingExpenses.length < 1 &&
                expenseDetailsByCategory.financialOther.length < 1 &&
                expenseDetailsByCategory.taxes.length < 1 ? (
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
