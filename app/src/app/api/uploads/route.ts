import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ACTIVE_COMPANY_COOKIE_NAME, parseActiveCompanyId } from "@/lib/active-company";
import { listCompanies } from "@/lib/companies-repo";
import {
  createInvoiceUpload,
  listUploadQueueItemsByCompanyId,
  type UploadEntryType,
  type UploadStatusFilter,
} from "@/lib/invoice-uploads-repo";
import { runUploadExtraction } from "@/lib/upload-extraction-service";

export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const PDF_MAGIC_HEADER = "%PDF-";

type UploadErrorCode =
  | "INVALID_ENTRY_TYPE"
  | "MISSING_FILE"
  | "EMPTY_FILE"
  | "FILE_TOO_LARGE"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "INVALID_ACTIVE_COMPANY"
  | "UPLOAD_PERSISTENCE_FAILED";

type UploadListErrorCode =
  | "INVALID_ACTIVE_COMPANY"
  | "VALIDATION_ERROR"
  | "UPLOAD_LIST_FAILED";

function errorResponse(status: number, code: UploadErrorCode, message: string) {
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

function uploadListErrorResponse(status: number, code: UploadListErrorCode, message: string) {
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

function isUploadEntryType(value: string): value is UploadEntryType {
  return value === "income" || value === "expense";
}

function isUploadStatusFilter(value: string): value is UploadStatusFilter {
  return value === "pending_review" || value === "saved" || value === "all";
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
      response: uploadListErrorResponse(
        409,
        "INVALID_ACTIVE_COMPANY",
        "Missing or invalid active company context.",
      ),
    };
  }

  return { ok: true, activeCompanyId };
}

async function hasPdfSignature(file: File): Promise<boolean> {
  const headerBuffer = await file.slice(0, PDF_MAGIC_HEADER.length).arrayBuffer();
  const signature = new TextDecoder("utf-8").decode(headerBuffer);
  return signature === PDF_MAGIC_HEADER;
}

export async function GET(request: Request) {
  const activeCompany = await getActiveCompanyIdOrError();
  if (!activeCompany.ok) {
    return activeCompany.response;
  }

  const { searchParams } = new URL(request.url);
  const rawStatus = searchParams.get("status");
  const parsedStatus = rawStatus ?? "pending_review";

  if (!isUploadStatusFilter(parsedStatus)) {
    return uploadListErrorResponse(
      400,
      "VALIDATION_ERROR",
      "status must be one of pending_review, saved, or all.",
    );
  }

  try {
    const items = listUploadQueueItemsByCompanyId(activeCompany.activeCompanyId, parsedStatus);
    return NextResponse.json({ items }, { status: 200 });
  } catch {
    return uploadListErrorResponse(
      500,
      "UPLOAD_LIST_FAILED",
      "Could not list uploads.",
    );
  }
}

export async function POST(request: Request) {
  const activeCompany = await getActiveCompanyIdOrError();
  if (!activeCompany.ok) {
    return errorResponse(
      409,
      "INVALID_ACTIVE_COMPANY",
      "Missing or invalid active company context.",
    );
  }

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return errorResponse(400, "MISSING_FILE", "file is required.");
  }

  const rawEntryType = formData.get("entryType");
  if (typeof rawEntryType !== "string" || !isUploadEntryType(rawEntryType)) {
    return errorResponse(400, "INVALID_ENTRY_TYPE", "entryType must be income or expense.");
  }

  const fileValue = formData.get("file");
  if (!(fileValue instanceof File)) {
    return errorResponse(400, "MISSING_FILE", "file is required.");
  }

  if (fileValue.size < 1) {
    return errorResponse(400, "EMPTY_FILE", "file must not be empty.");
  }

  if (fileValue.size > MAX_UPLOAD_BYTES) {
    return errorResponse(
      413,
      "FILE_TOO_LARGE",
      "File exceeds 10 MiB (10,485,760 bytes) limit.",
    );
  }

  const hasPdfMimeType = fileValue.type === "application/pdf";
  const hasPdfExtension = fileValue.name.toLowerCase().endsWith(".pdf");
  const isPdfSignatureValid = await hasPdfSignature(fileValue);

  if ((!hasPdfMimeType && !hasPdfExtension) || !isPdfSignatureValid) {
    return errorResponse(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "Uploaded file must be a valid PDF.",
    );
  }

  const uploadDir = path.join(process.cwd(), "upload");
  const uploadId = randomUUID();
  const storedFilename = `${uploadId}.pdf`;
  const storedPath = `upload/${storedFilename}`;
  const absolutePath = path.join(uploadDir, storedFilename);
  const uploadedAt = new Date().toISOString();

  try {
    await fs.mkdir(uploadDir, { recursive: true });
    const contentBuffer = Buffer.from(await fileValue.arrayBuffer());
    await fs.writeFile(absolutePath, contentBuffer, { flag: "wx" });
  } catch {
    return errorResponse(
      500,
      "UPLOAD_PERSISTENCE_FAILED",
      "Could not persist uploaded file.",
    );
  }

  try {
    const createdUpload = createInvoiceUpload({
      id: uploadId,
      companyId: activeCompany.activeCompanyId,
      entryType: rawEntryType,
      originalFilename: fileValue.name,
      storedFilename,
      storedPath,
      uploadedAt,
    });

    void runUploadExtraction(createdUpload);

    return NextResponse.json(
      {
        id: createdUpload.id,
        companyId: createdUpload.companyId,
        entryType: createdUpload.entryType,
        originalFilename: createdUpload.originalFilename,
        storedFilename: createdUpload.storedFilename,
        uploadedAt: createdUpload.uploadedAt,
        extractionStatus: createdUpload.extractionStatus,
      },
      { status: 201 },
    );
  } catch {
    try {
      await fs.unlink(absolutePath);
    } catch {
      // If cleanup fails, still return deterministic storage failure.
    }

    return errorResponse(
      500,
      "UPLOAD_PERSISTENCE_FAILED",
      "Could not persist upload metadata.",
    );
  }
}
