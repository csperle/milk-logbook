import fs from "node:fs/promises";
import path from "node:path";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ACTIVE_COMPANY_COOKIE_NAME, parseActiveCompanyId } from "@/lib/active-company";
import { listCompanies } from "@/lib/companies-repo";
import { getInvoiceUploadByIdAndCompanyId } from "@/lib/invoice-uploads-repo";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

type FileErrorCode =
  | "INVALID_ACTIVE_COMPANY"
  | "UPLOAD_NOT_FOUND"
  | "FILE_NOT_FOUND"
  | "FILE_READ_FAILED";

function errorResponse(status: number, code: FileErrorCode, message: string) {
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

async function getActiveCompanyIdOrError():
  Promise<{ ok: true; activeCompanyId: number } | { ok: false; response: NextResponse }> {
  const companies = listCompanies();
  const cookieStore = await cookies();
  const activeCompanyId = parseActiveCompanyId(
    cookieStore.get(ACTIVE_COMPANY_COOKIE_NAME)?.value,
  );
  const hasValidActiveCompany =
    activeCompanyId !== null && companies.some((company) => company.id === activeCompanyId);

  if (!hasValidActiveCompany) {
    return {
      ok: false,
      response: errorResponse(
        409,
        "INVALID_ACTIVE_COMPANY",
        "Missing or invalid active company context.",
      ),
    };
  }

  return { ok: true, activeCompanyId };
}

function toAsciiFilenameFallback(originalFilename: string): string {
  const trimmed = originalFilename.trim();
  const withoutSlashes = trimmed.replace(/[\\/]/g, "_");
  const ascii = withoutSlashes.replace(/[^\x20-\x7E]/g, "_");
  const collapsedWhitespace = ascii.replace(/\s+/g, " ").trim();

  if (collapsedWhitespace.length < 1) {
    return "invoice.pdf";
  }

  return collapsedWhitespace.toLowerCase().endsWith(".pdf")
    ? collapsedWhitespace
    : `${collapsedWhitespace}.pdf`;
}

function toContentDisposition(filename: string, asAttachment: boolean): string {
  const fallbackFilename = toAsciiFilenameFallback(filename).replace(/[\r\n\";]/g, "");
  const encodedOriginal = encodeURIComponent(filename);
  const dispositionType = asAttachment ? "attachment" : "inline";
  return `${dispositionType}; filename="${fallbackFilename}"; filename*=UTF-8''${encodedOriginal}`;
}

export async function GET(request: Request, { params }: Params) {
  const activeCompany = await getActiveCompanyIdOrError();
  if (!activeCompany.ok) {
    return activeCompany.response;
  }

  const { id } = await params;
  const upload = getInvoiceUploadByIdAndCompanyId(id, activeCompany.activeCompanyId);
  if (!upload) {
    return errorResponse(404, "UPLOAD_NOT_FOUND", "Upload not found.");
  }

  const uploadDir = path.resolve(process.cwd(), "upload");
  const absoluteStoredPath = path.resolve(process.cwd(), upload.storedPath);
  if (!absoluteStoredPath.startsWith(`${uploadDir}${path.sep}`)) {
    return errorResponse(404, "FILE_NOT_FOUND", "Uploaded file is missing.");
  }

  let fileContent: Buffer;

  try {
    fileContent = await fs.readFile(absoluteStoredPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return errorResponse(404, "FILE_NOT_FOUND", "Uploaded file is missing.");
    }

    return errorResponse(500, "FILE_READ_FAILED", "Could not read uploaded file.");
  }

  const { searchParams } = new URL(request.url);
  const download = searchParams.get("download") === "1";
  const headers = new Headers();
  headers.set("Content-Type", "application/pdf");
  headers.set("Content-Disposition", toContentDisposition(upload.originalFilename, download));
  headers.set("Cache-Control", "private, max-age=120");
  headers.set("Vary", "Cookie");

  const fileBytes = new Uint8Array(fileContent.byteLength);
  fileBytes.set(fileContent);

  return new NextResponse(fileBytes.buffer, {
    status: 200,
    headers,
  });
}
