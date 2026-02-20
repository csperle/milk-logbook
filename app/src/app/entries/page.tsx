import Link from "next/link";
import { requireActiveCompanyId } from "@/lib/active-company-guard";
import { listAccountingEntriesByCompanyId } from "@/lib/accounting-entries-repo";
import { listCompanies } from "@/lib/companies-repo";

export const dynamic = "force-dynamic";

function formatAmountCents(amount: number): string {
  return `CHF ${(amount / 100).toFixed(2)}`;
}

export default async function EntriesPage() {
  const activeCompanyId = await requireActiveCompanyId();
  const activeCompany = listCompanies().find((company) => company.id === activeCompanyId);
  const entries = listAccountingEntriesByCompanyId(activeCompanyId);

  return (
    <main className="min-h-screen bg-zinc-50 px-6 py-16 text-zinc-900">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Booking Entries</h1>
            <p className="mt-1 text-sm text-zinc-600">
              Active company: {activeCompany?.name ?? `Company #${activeCompanyId}`} (#
              {activeCompanyId})
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/upload"
              className="inline-flex items-center rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100"
            >
              Upload PDF
            </Link>
            <Link
              href="/"
              className="inline-flex items-center rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100"
            >
              Back to main page
            </Link>
          </div>
        </header>

        {entries.length < 1 ? (
          <p className="rounded border border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-600">
            No booking entries yet. Upload an invoice PDF to create the first placeholder entry.
          </p>
        ) : (
          <div className="overflow-x-auto rounded border border-zinc-300 bg-white">
            <table className="min-w-full divide-y divide-zinc-200 text-sm">
              <thead className="bg-zinc-100 text-left text-xs uppercase tracking-wide text-zinc-600">
                <tr>
                  <th className="px-3 py-2">Doc #</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Document date</th>
                  <th className="px-3 py-2">Counterparty</th>
                  <th className="px-3 py-2">Amount gross</th>
                  <th className="px-3 py-2">Source file</th>
                  <th className="px-3 py-2">Created at</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="px-3 py-2 font-medium">{entry.documentNumber}</td>
                    <td className="px-3 py-2">{entry.entryType}</td>
                    <td className="px-3 py-2">{entry.documentDate}</td>
                    <td className="px-3 py-2">{entry.counterpartyName}</td>
                    <td className="px-3 py-2">{formatAmountCents(entry.amountGross)}</td>
                    <td className="px-3 py-2">{entry.sourceOriginalFilename}</td>
                    <td className="px-3 py-2">{new Date(entry.createdAt).toISOString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
