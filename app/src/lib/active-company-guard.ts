import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { parseActiveCompanyId, ACTIVE_COMPANY_COOKIE_NAME } from "@/lib/active-company";
import { listCompanies } from "@/lib/companies-repo";

export async function requireActiveCompanyId(): Promise<number> {
  const companies = listCompanies();

  if (companies.length < 1) {
    redirect("/admin/companies?reason=no-companies");
  }

  const cookieStore = await cookies();
  const activeCompanyId = parseActiveCompanyId(
    cookieStore.get(ACTIVE_COMPANY_COOKIE_NAME)?.value,
  );

  if (activeCompanyId === null) {
    redirect("/admin/companies?reason=no-active-company");
  }

  const hasActiveCompany = companies.some((company) => company.id === activeCompanyId);
  if (!hasActiveCompany) {
    redirect("/admin/companies?reason=no-active-company");
  }

  return activeCompanyId;
}
