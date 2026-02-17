import Link from "next/link";
import { requireActiveCompanyId } from "@/lib/active-company-guard";

export const dynamic = "force-dynamic";

export default async function Home() {
  await requireActiveCompanyId();

  return (
    <main className="min-h-screen bg-zinc-50 px-6 py-16 text-zinc-900">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <h1 className="text-3xl font-semibold tracking-tight">
          Bookkeeping App
        </h1>
        <p className="max-w-2xl text-base text-zinc-600">
          Use the admin area to manage companies and expense types used by
          expense accounting entries.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/admin/companies"
            className="inline-flex items-center rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-100"
          >
            Open Company Admin
          </Link>
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
