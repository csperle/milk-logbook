import { ExpenseTypesAdminClient } from "@/app/admin/expense-types/ExpenseTypesAdminClient";
import { requireActiveCompanyId } from "@/lib/active-company-guard";

export const dynamic = "force-dynamic";

export default async function ExpenseTypesAdminPage() {
  await requireActiveCompanyId();

  return <ExpenseTypesAdminClient />;
}
