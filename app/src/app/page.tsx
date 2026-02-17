import Link from "next/link";
import { requireActiveCompanyId } from "@/lib/active-company-guard";
import { listCompanies } from "@/lib/companies-repo";

export const dynamic = "force-dynamic";

export default async function Home() {
  const activeCompanyId = await requireActiveCompanyId();
  const activeCompany = listCompanies().find((company) => company.id === activeCompanyId);

  return (
    <main className="min-h-screen bg-zinc-50 px-6 py-16 text-zinc-900">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <header className="flex items-start justify-between gap-4">
          <h1 className="text-3xl font-semibold tracking-tight">
            Bookkeeping App
          </h1>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Active Company:
            </p>
            <Link
              href="/admin/companies"
              className="inline-flex items-center rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100"
            >
              {activeCompany?.name ?? `Company #${activeCompanyId}`}
            </Link>
          </div>
        </header>
        <p className="max-w-2xl text-base text-zinc-600">
          Use the admin area to manage expense types used by
          expense accounting entries.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/admin/expense-types"
            className="inline-flex items-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
          >
            Open Expense Types Admin
          </Link>
        </div>
      </div>
    </main>
  );
}
