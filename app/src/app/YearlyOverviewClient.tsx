"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { AccountingEntrySummary } from "@/lib/accounting-entries-repo";

type Props = {
  activeCompanyId: number;
  activeCompanyName: string;
  defaultYear: number;
  entries: AccountingEntrySummary[];
};

type EntryTypeFilter = "all" | "income" | "expense";
type SortOption =
  | "documentDateDesc"
  | "documentDateAsc"
  | "amountDesc"
  | "amountAsc"
  | "documentNumberDesc"
  | "documentNumberAsc";

function getEntryYear(entry: AccountingEntrySummary): number {
  return Number.parseInt(entry.documentDate.slice(0, 4), 10);
}

function formatDocumentReference(entry: AccountingEntrySummary): string {
  const prefix = entry.entryType === "income" ? "I" : "E";
  const year = entry.documentDate.slice(0, 4);
  return `${prefix}-${year}-${entry.documentNumber}`;
}

function parseEntryTypeFilter(value: string | null): EntryTypeFilter {
  if (value === "income" || value === "expense") {
    return value;
  }
  return "all";
}

function parseSortOption(value: string | null): SortOption {
  if (
    value === "documentDateDesc" ||
    value === "documentDateAsc" ||
    value === "amountDesc" ||
    value === "amountAsc" ||
    value === "documentNumberDesc" ||
    value === "documentNumberAsc"
  ) {
    return value;
  }
  return "documentDateDesc";
}

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

function formatSwissDate(dateValue: string): string {
  return new Date(`${dateValue}T00:00:00.000Z`).toLocaleDateString("de-CH");
}

function compareEntries(a: AccountingEntrySummary, b: AccountingEntrySummary, sort: SortOption): number {
  if (sort === "documentDateDesc") {
    return b.documentDate.localeCompare(a.documentDate) || b.id - a.id;
  }
  if (sort === "documentDateAsc") {
    return a.documentDate.localeCompare(b.documentDate) || a.id - b.id;
  }
  if (sort === "amountDesc") {
    return b.amountGross - a.amountGross || b.id - a.id;
  }
  if (sort === "amountAsc") {
    return a.amountGross - b.amountGross || a.id - b.id;
  }
  if (sort === "documentNumberDesc") {
    return (
      b.documentNumber - a.documentNumber ||
      b.documentDate.localeCompare(a.documentDate) ||
      b.id - a.id
    );
  }

  return (
    a.documentNumber - b.documentNumber ||
    a.documentDate.localeCompare(b.documentDate) ||
    a.id - b.id
  );
}

export function YearlyOverviewClient({
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
      const year = getEntryYear(entry);
      if (!Number.isNaN(year)) {
        years.add(year);
      }
    }
    if (years.size < 1) {
      years.add(defaultYear);
    }
    return Array.from(years).sort((a, b) => b - a);
  }, [defaultYear, entries]);

  const selectedYear = parseSelectedYear(searchParams.get("year"), availableYears);
  const entryTypeFilter = parseEntryTypeFilter(searchParams.get("type"));
  const sortOption = parseSortOption(searchParams.get("sort"));

  const canonicalQuery = useMemo(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("year", String(selectedYear));
    params.set("type", entryTypeFilter);
    params.set("sort", sortOption);
    return params.toString();
  }, [entryTypeFilter, searchParams, selectedYear, sortOption]);

  useEffect(() => {
    if (searchParams.toString() !== canonicalQuery) {
      router.replace(`${pathname}?${canonicalQuery}`, { scroll: false });
    }
  }, [canonicalQuery, pathname, router, searchParams]);

  function updateQueryParam(key: "year" | "type" | "sort", value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, value);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const filteredAndSortedEntries = useMemo(() => {
    const yearFiltered = entries.filter((entry) => getEntryYear(entry) === selectedYear);
    const typeFiltered =
      entryTypeFilter === "all"
        ? yearFiltered
        : yearFiltered.filter((entry) => entry.entryType === entryTypeFilter);
    return [...typeFiltered].sort((a, b) => compareEntries(a, b, sortOption));
  }, [entries, selectedYear, entryTypeFilter, sortOption]);

  const totals = useMemo(() => {
    return filteredAndSortedEntries.reduce(
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
  }, [filteredAndSortedEntries]);

  const result = totals.income - totals.expense;

  return (
    <main className="min-h-screen bg-zinc-50 px-6 py-12 text-zinc-900">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
              Yearly Overview
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
            <Link
              href="/admin/expense-types"
              className="inline-flex items-center rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-100"
            >
              Edit expense types
            </Link>
          </div>
        </header>

        <section className="grid gap-3 md:grid-cols-3">
          <article className="rounded border border-zinc-300 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Income ({selectedYear})</p>
            <p className="mt-2 text-2xl font-semibold text-emerald-700">
              {formatAmountCents(totals.income)}
            </p>
          </article>
          <article className="rounded border border-zinc-300 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Expenses ({selectedYear})</p>
            <p className="mt-2 text-2xl font-semibold text-rose-700">
              {formatAmountCents(totals.expense)}
            </p>
          </article>
          <article className="rounded border border-zinc-300 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Result ({selectedYear})</p>
            <p className={`mt-2 text-2xl font-semibold ${result >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
              {formatAmountCents(result)}
            </p>
          </article>
        </section>

        <section className="rounded border border-zinc-300 bg-white p-4">
          <div className="grid gap-3 md:grid-cols-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-zinc-700">Year</span>
              <select
                value={selectedYear}
                onChange={(event) => {
                  updateQueryParam("year", event.target.value);
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
              <span className="font-medium text-zinc-700">Type</span>
              <select
                value={entryTypeFilter}
                onChange={(event) => {
                  updateQueryParam("type", event.target.value);
                }}
                className="rounded border border-zinc-300 px-3 py-2"
              >
                <option value="all">All entries</option>
                <option value="income">Income only</option>
                <option value="expense">Expenses only</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-zinc-700">Sort</span>
              <select
                value={sortOption}
                onChange={(event) => {
                  updateQueryParam("sort", event.target.value);
                }}
                className="rounded border border-zinc-300 px-3 py-2"
              >
                <option value="documentDateDesc">Document date (newest first)</option>
                <option value="documentDateAsc">Document date (oldest first)</option>
                <option value="amountDesc">Amount (highest first)</option>
                <option value="amountAsc">Amount (lowest first)</option>
                <option value="documentNumberDesc">Document number (highest first)</option>
                <option value="documentNumberAsc">Document number (lowest first)</option>
              </select>
            </label>
          </div>
        </section>

        {filteredAndSortedEntries.length < 1 ? (
          <section className="rounded border border-zinc-300 bg-white px-4 py-5 text-sm text-zinc-600">
            No entries for the selected filters. Try another year or type filter.
          </section>
        ) : (
          <section className="overflow-x-auto rounded border border-zinc-300 bg-white">
            <table className="min-w-full divide-y divide-zinc-200 text-sm">
              <thead className="bg-zinc-100 text-left text-xs uppercase tracking-wide text-zinc-600">
                <tr>
                  <th className="px-3 py-2">Document ref</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Document date</th>
                  <th className="px-3 py-2">Counterparty</th>
                  <th className="px-3 py-2">Amount gross</th>
                  <th className="px-3 py-2">Source file</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {filteredAndSortedEntries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="px-3 py-2 font-medium">{formatDocumentReference(entry)}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${
                          entry.entryType === "income"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-rose-100 text-rose-700"
                        }`}
                      >
                        {entry.entryType}
                      </span>
                    </td>
                    <td className="px-3 py-2">{formatSwissDate(entry.documentDate)}</td>
                    <td className="px-3 py-2">{entry.counterpartyName}</td>
                    <td className="px-3 py-2 font-medium">{formatAmountCents(entry.amountGross)}</td>
                    <td className="px-3 py-2 text-zinc-600">
                      <a
                        href={`/api/uploads/${entry.uploadId}/file`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-zinc-800 underline decoration-zinc-400 underline-offset-2 hover:text-zinc-950"
                      >
                        {entry.sourceOriginalFilename}
                      </a>
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
