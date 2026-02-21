import { listCompanies } from "@/lib/companies-repo";
import { listExpenseTypes } from "@/lib/expense-types-repo";
import { requireActiveCompanyId } from "@/lib/active-company-guard";
import { UploadReviewPageClient } from "@/app/uploads/[id]/review/UploadReviewPageClient";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{ id: string }>;
};

export default async function UploadReviewPage({ params }: Params) {
  const activeCompanyId = await requireActiveCompanyId();
  const activeCompany = listCompanies().find((company) => company.id === activeCompanyId);
  const expenseTypes = listExpenseTypes();
  const { id } = await params;

  return (
    <UploadReviewPageClient
      uploadId={id}
      activeCompanyId={activeCompanyId}
      activeCompanyName={activeCompany?.name ?? `Company #${activeCompanyId}`}
      expenseTypes={expenseTypes.map((expenseType) => ({
        id: expenseType.id,
        expenseTypeText: expenseType.expenseTypeText,
      }))}
    />
  );
}
