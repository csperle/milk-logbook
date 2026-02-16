import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-50 px-6 py-16 text-zinc-900">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <h1 className="text-3xl font-semibold tracking-tight">
          Bookkeeping App
        </h1>
        <p className="max-w-2xl text-base text-zinc-600">
          Use the admin area to manage expense types used by expense accounting
          entries.
        </p>
        <div>
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
