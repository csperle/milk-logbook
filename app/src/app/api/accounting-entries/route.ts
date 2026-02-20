import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ACTIVE_COMPANY_COOKIE_NAME, parseActiveCompanyId } from "@/lib/active-company";
import { listAccountingEntriesByCompanyId } from "@/lib/accounting-entries-repo";
import { listCompanies } from "@/lib/companies-repo";

export const runtime = "nodejs";

export async function GET() {
  const companies = listCompanies();
  const cookieStore = await cookies();
  const activeCompanyId = parseActiveCompanyId(
    cookieStore.get(ACTIVE_COMPANY_COOKIE_NAME)?.value,
  );
  const hasValidActiveCompany =
    activeCompanyId !== null && companies.some((company) => company.id === activeCompanyId);

  if (!hasValidActiveCompany) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_ACTIVE_COMPANY",
          message: "Missing or invalid active company context.",
        },
      },
      { status: 409 },
    );
  }

  const entries = listAccountingEntriesByCompanyId(activeCompanyId);
  return NextResponse.json(entries, { status: 200 });
}
