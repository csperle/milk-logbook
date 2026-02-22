"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { AnnualPlEntry } from "@/lib/accounting-entries-repo";

type Props = {
  activeCompanyId: number;
  activeCompanyName: string;
  defaultYear: number;
  entries: AnnualPlEntry[];
};

type ExpenseBreakdownRow = {
  typeOfExpenseId: number | null;
  expenseTypeText: string;
  amountGross: number;
};

function parseSelectedYear(value: string | null, availableYears: number[]): number {
  if (value !== null) {
    const parsed = Number.parseInt(value, 10);
    if (availableYears.includes(parsed)) {
      return parsed;
    }
  }
  return availableYears[0];
}

function formatAmountCents(amountCents: number): string {
  return new Intl.NumberFormat("de-CH", {
    style: "currency",
    currency: "CHF",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountCents / 100);
}

function formatShare(numerator: number, denominator: number): string {
  if (denominator === 0) {
    return "0.00%";
  }

  return new Intl.NumberFormat("de-CH", {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numerator / denominator);
}

function compareBreakdownRows(a: ExpenseBreakdownRow, b: ExpenseBreakdownRow): number {
  if (a.amountGross !== b.amountGross) {
    return b.amountGross - a.amountGross;
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

export function AnnualPlPageClient({
  activeCompanyId,
  activeCompanyName,
  defaultYear,
  entries,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

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

  const selectedYear = parseSelectedYear(searchParams.get("year"), availableYears);

  const canonicalQuery = useMemo(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("year", String(selectedYear));
    return params.toString();
  }, [searchParams, selectedYear]);

  useEffect(() => {
    if (searchParams.toString() !== canonicalQuery) {
      router.replace(`${pathname}?${canonicalQuery}`, { scroll: false });
    }
  }, [canonicalQuery, pathname, router, searchParams]);

  const selectedYearEntries = useMemo(() => {
    return entries.filter((entry) => entry.documentYear === selectedYear);
  }, [entries, selectedYear]);

  const totals = useMemo(() => {
    return selectedYearEntries.reduce(
      (acc, entry) => {
        if (entry.entryType === "income") {
          acc.income += entry.amountGross;
        } else {
          acc.expense += entry.amountGross;
        }
        return acc;
      },
      { income: 0, expense: 0 },
    );
  }, [selectedYearEntries]);

  const result = totals.income - totals.expense;

  const expenseBreakdown = useMemo(() => {
    const byExpenseType = new Map<string, ExpenseBreakdownRow>();
    for (const entry of selectedYearEntries) {
      if (entry.entryType !== "expense") {
        continue;
      }

      const key = entry.typeOfExpenseId === null ? "null" : String(entry.typeOfExpenseId);
      const existing = byExpenseType.get(key);
      if (existing) {
        existing.amountGross += entry.amountGross;
        continue;
      }

      byExpenseType.set(key, {
        typeOfExpenseId: entry.typeOfExpenseId,
        expenseTypeText: entry.expenseTypeText ?? "Unassigned",
        amountGross: entry.amountGross,
      });
    }

    return Array.from(byExpenseType.values()).sort(compareBreakdownRows);
  }, [selectedYearEntries]);

  const hasSelectedYearEntries = selectedYearEntries.length > 0;

  return (
    <main className="min-h-screen bg-zinc-50 px-6 py-12 text-zinc-900">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
              Annual P&L
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">
              {activeCompanyName}
            </h1>
            <p className="mt-1 text-sm text-zinc-600">
              Company #{activeCompanyId}
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
          </div>
        </header>

        <section className="rounded border border-zinc-300 bg-white p-4">
          <label className="flex max-w-xs flex-col gap-1 text-sm">
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
        </section>

        <section className="grid gap-3 md:grid-cols-3">
          <article className="rounded border border-zinc-300 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Total income ({selectedYear})</p>
            <p className="mt-2 text-2xl font-semibold text-emerald-700">
              {formatAmountCents(totals.income)}
            </p>
          </article>
          <article className="rounded border border-zinc-300 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Total expenses ({selectedYear})</p>
            <p className="mt-2 text-2xl font-semibold text-rose-700">
              {formatAmountCents(totals.expense)}
            </p>
          </article>
          <article className="rounded border border-zinc-300 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Annual result ({selectedYear})</p>
            <p className={`mt-2 text-2xl font-semibold ${result >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
              {formatAmountCents(result)}
            </p>
          </article>
        </section>

        {!hasSelectedYearEntries ? (
          <section className="rounded border border-zinc-300 bg-white px-4 py-5 text-sm text-zinc-600">
            No entries for the selected year. Totals are zero until entries are saved for this year.
          </section>
        ) : expenseBreakdown.length < 1 ? (
          <section className="rounded border border-zinc-300 bg-white px-4 py-5 text-sm text-zinc-600">
            No expense entries for the selected year.
          </section>
        ) : (
          <section className="overflow-x-auto rounded border border-zinc-300 bg-white">
            <table className="min-w-full divide-y divide-zinc-200 text-sm">
              <thead className="bg-zinc-100 text-left text-xs uppercase tracking-wide text-zinc-600">
                <tr>
                  <th className="px-3 py-2">Expense type</th>
                  <th className="px-3 py-2">Amount</th>
                  <th className="px-3 py-2">Share of total expenses</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {expenseBreakdown.map((row) => (
                  <tr key={row.typeOfExpenseId ?? "unassigned"}>
                    <td className="px-3 py-2 font-medium text-zinc-800">{row.expenseTypeText}</td>
                    <td className="px-3 py-2 font-medium text-zinc-900">
                      <div className="flex flex-wrap items-center gap-2">
                        <span>{formatAmountCents(row.amountGross)}</span>
                        {row.amountGross < 0 ? (
                          <span className="inline-flex rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                            Negative amount
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-zinc-700">
                      {formatShare(row.amountGross, totals.expense)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </main>
  );
}
