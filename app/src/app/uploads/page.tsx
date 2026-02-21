import { requireActiveCompanyId } from "@/lib/active-company-guard";
import { listCompanies } from "@/lib/companies-repo";
import { UploadsQueuePageClient } from "@/app/uploads/UploadsQueuePageClient";

export const dynamic = "force-dynamic";

export default async function UploadsPage() {
  const activeCompanyId = await requireActiveCompanyId();
  const activeCompany = listCompanies().find((company) => company.id === activeCompanyId);

  return (
    <UploadsQueuePageClient
      activeCompanyId={activeCompanyId}
      activeCompanyName={activeCompany?.name ?? `Company #${activeCompanyId}`}
    />
  );
}
