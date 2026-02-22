import { requireActiveCompanyId } from "@/lib/active-company-guard";
import { listAccountingEntriesByCompanyId } from "@/lib/accounting-entries-repo";
import { listCompanies } from "@/lib/companies-repo";
import { YearlyOverviewClient } from "@/app/YearlyOverviewClient";

export const dynamic = "force-dynamic";

export default async function Home() {
  const activeCompanyId = await requireActiveCompanyId();
  const activeCompany = listCompanies().find((company) => company.id === activeCompanyId);
  const entries = listAccountingEntriesByCompanyId(activeCompanyId);
  const defaultYear = new Date().getUTCFullYear();

  return (
    <YearlyOverviewClient
      activeCompanyId={activeCompanyId}
      activeCompanyName={activeCompany?.name ?? `Company #${activeCompanyId}`}
      defaultYear={defaultYear}
      entries={entries}
    />
  );
}
