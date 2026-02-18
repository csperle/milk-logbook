import { requireActiveCompanyId } from "@/lib/active-company-guard";
import { listCompanies } from "@/lib/companies-repo";
import { UploadPageClient } from "@/app/upload/UploadPageClient";

export const dynamic = "force-dynamic";

export default async function UploadPage() {
  const activeCompanyId = await requireActiveCompanyId();
  const activeCompany = listCompanies().find((company) => company.id === activeCompanyId);

  return (
    <UploadPageClient
      activeCompanyId={activeCompanyId}
      activeCompanyName={activeCompany?.name ?? `Company #${activeCompanyId}`}
    />
  );
}
