import { ExtractionSettingsAdminClient } from "@/app/admin/extraction/ExtractionSettingsAdminClient";
import { requireActiveCompanyId } from "@/lib/active-company-guard";

export const dynamic = "force-dynamic";

export default async function ExtractionSettingsAdminPage() {
  await requireActiveCompanyId();

  return <ExtractionSettingsAdminClient />;
}
