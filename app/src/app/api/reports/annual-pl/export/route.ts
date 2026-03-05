import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ACTIVE_COMPANY_COOKIE_NAME, parseActiveCompanyId } from "@/lib/active-company";
import { listAnnualPlEntriesByCompanyId } from "@/lib/accounting-entries-repo";
import { listCompanies } from "@/lib/companies-repo";
import { generateAnnualPlExportPdf } from "@/lib/reports/annual-pl-export-pdf";

export const runtime = "nodejs";

type ExportErrorCode = "INVALID_ACTIVE_COMPANY" | "INVALID_EXPORT_YEAR" | "EXPORT_GENERATION_FAILED";

function errorResponse(status: number, code: ExportErrorCode, message: string) {
  return NextResponse.json(
    {
      error: {
        code,
        message,
      },
    },
    { status },
  );
}

function toAsciiFilenameFallback(filename: string): string {
  const trimmed = filename.trim().replace(/[\\/]/g, "_");
  const ascii = trimmed.replace(/[^\x20-\x7E]/g, "_");
  const collapsed = ascii.replace(/\s+/g, " ").trim();
  if (collapsed.length < 1) {
    return "annual-pl-export.pdf";
  }
  return collapsed;
}

function contentDisposition(filename: string): string {
  const fallbackFilename = toAsciiFilenameFallback(filename).replace(/[\r\n\";]/g, "");
  const encodedOriginal = encodeURIComponent(filename);
  return `attachment; filename="${fallbackFilename}"; filename*=UTF-8''${encodedOriginal}`;
}

function parseExportYear(payload: unknown): number | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const year = (payload as Record<string, unknown>).year;
  if (typeof year !== "number" || !Number.isInteger(year)) {
    return null;
  }
  if (year < 1900 || year > 9999) {
    return null;
  }
  return year;
}

export async function POST(request: Request) {
  const companies = listCompanies();
  const cookieStore = await cookies();
  const activeCompanyId = parseActiveCompanyId(
    cookieStore.get(ACTIVE_COMPANY_COOKIE_NAME)?.value,
  );
  const activeCompany = companies.find((company) => company.id === activeCompanyId);

  if (!activeCompanyId || !activeCompany) {
    return errorResponse(
      409,
      "INVALID_ACTIVE_COMPANY",
      "Missing or invalid active company context.",
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return errorResponse(
      400,
      "INVALID_EXPORT_YEAR",
      "year must be provided as an integer between 1900 and 9999.",
    );
  }

  const year = parseExportYear(payload);
  if (year === null) {
    return errorResponse(
      400,
      "INVALID_EXPORT_YEAR",
      "year must be provided as an integer between 1900 and 9999.",
    );
  }

  try {
    const entries = listAnnualPlEntriesByCompanyId(activeCompanyId);
    const generated = generateAnnualPlExportPdf({
      companyName: activeCompany.name,
      selectedYear: year,
      entries,
    });

    const bytes = new Uint8Array(generated.pdf.byteLength);
    bytes.set(generated.pdf);

    return new NextResponse(bytes.buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": contentDisposition(generated.filename),
        "Cache-Control": "no-store",
        Vary: "Cookie",
      },
    });
  } catch {
    return errorResponse(
      500,
      "EXPORT_GENERATION_FAILED",
      "Could not generate annual P&L export.",
    );
  }
}
