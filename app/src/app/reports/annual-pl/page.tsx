import { AnnualPlPageClient } from "@/app/reports/annual-pl/AnnualPlPageClient";
import { listAnnualPlEntriesByCompanyId } from "@/lib/accounting-entries-repo";
import { requireActiveCompanyId } from "@/lib/active-company-guard";
import { listCompanies } from "@/lib/companies-repo";

export const dynamic = "force-dynamic";

export default async function AnnualPlPage() {
  const activeCompanyId = await requireActiveCompanyId();
  const activeCompany = listCompanies().find((company) => company.id === activeCompanyId);
  const entries = listAnnualPlEntriesByCompanyId(activeCompanyId);
  const defaultYear = new Date().getUTCFullYear();

  return (
    <AnnualPlPageClient
      activeCompanyId={activeCompanyId}
      activeCompanyName={activeCompany?.name ?? `Company #${activeCompanyId}`}
      defaultYear={defaultYear}
      entries={entries}
    />
  );
}
