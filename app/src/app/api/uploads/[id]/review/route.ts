import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ACTIVE_COMPANY_COOKIE_NAME, parseActiveCompanyId } from "@/lib/active-company";
import { listCompanies } from "@/lib/companies-repo";
import {
  getUploadReviewByUploadIdAndCompanyId,
  saveUploadReviewDraft,
  type UploadReviewDraft,
} from "@/lib/upload-review-repo";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

type DraftFieldName = keyof UploadReviewDraft;

type ReviewErrorCode =
  | "INVALID_ACTIVE_COMPANY"
  | "UPLOAD_NOT_FOUND"
  | "INVALID_JSON"
  | "VALIDATION_ERROR"
  | "DRAFT_PERSISTENCE_FAILED";

const ALLOWED_DRAFT_FIELDS: DraftFieldName[] = [
  "documentDate",
  "counterpartyName",
  "bookingText",
  "amountGross",
  "amountNet",
  "amountTax",
  "paymentReceivedDate",
  "typeOfExpenseId",
];

function errorResponse(status: number, code: ReviewErrorCode, message: string) {
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

function isValidDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validateDraftPatch(payload: unknown): {
  ok: true;
  patch: Partial<UploadReviewDraft>;
} | {
  ok: false;
  message: string;
} {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, message: "Request body must be a JSON object." };
  }

  const rawPatch = payload as Record<string, unknown>;
  const unknownField = Object.keys(rawPatch).find(
    (key) => !ALLOWED_DRAFT_FIELDS.includes(key as DraftFieldName),
  );
  if (unknownField) {
    return { ok: false, message: `Unknown field: ${unknownField}.` };
  }

  const patch: Partial<UploadReviewDraft> = {};

  if ("documentDate" in rawPatch) {
    if (typeof rawPatch.documentDate !== "string" || !isValidDateOnly(rawPatch.documentDate)) {
      return { ok: false, message: "documentDate must be a valid YYYY-MM-DD string." };
    }
    patch.documentDate = rawPatch.documentDate;
  }

  if ("counterpartyName" in rawPatch) {
    if (
      typeof rawPatch.counterpartyName !== "string" ||
      rawPatch.counterpartyName.length > 200
    ) {
      return {
        ok: false,
        message: "counterpartyName must be a string with at most 200 characters.",
      };
    }
    patch.counterpartyName = rawPatch.counterpartyName;
  }

  if ("bookingText" in rawPatch) {
    if (typeof rawPatch.bookingText !== "string" || rawPatch.bookingText.length > 500) {
      return { ok: false, message: "bookingText must be a string with at most 500 characters." };
    }
    patch.bookingText = rawPatch.bookingText;
  }

  if ("amountGross" in rawPatch) {
    if (!Number.isInteger(rawPatch.amountGross) || (rawPatch.amountGross as number) < 0) {
      return { ok: false, message: "amountGross must be an integer >= 0." };
    }
    patch.amountGross = rawPatch.amountGross as number;
  }

  if ("amountNet" in rawPatch) {
    if (rawPatch.amountNet !== null && !Number.isInteger(rawPatch.amountNet)) {
      return { ok: false, message: "amountNet must be an integer or null." };
    }
    patch.amountNet = rawPatch.amountNet as number | null;
  }

  if ("amountTax" in rawPatch) {
    if (rawPatch.amountTax !== null && !Number.isInteger(rawPatch.amountTax)) {
      return { ok: false, message: "amountTax must be an integer or null." };
    }
    patch.amountTax = rawPatch.amountTax as number | null;
  }

  if ("paymentReceivedDate" in rawPatch) {
    if (
      rawPatch.paymentReceivedDate !== null &&
      (typeof rawPatch.paymentReceivedDate !== "string" ||
        !isValidDateOnly(rawPatch.paymentReceivedDate))
    ) {
      return {
        ok: false,
        message: "paymentReceivedDate must be a valid YYYY-MM-DD string or null.",
      };
    }
    patch.paymentReceivedDate = rawPatch.paymentReceivedDate as string | null;
  }

  if ("typeOfExpenseId" in rawPatch) {
    if (
      rawPatch.typeOfExpenseId !== null &&
      (!Number.isInteger(rawPatch.typeOfExpenseId) || (rawPatch.typeOfExpenseId as number) < 1)
    ) {
      return { ok: false, message: "typeOfExpenseId must be a positive integer or null." };
    }
    patch.typeOfExpenseId = rawPatch.typeOfExpenseId as number | null;
  }

  return { ok: true, patch };
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

export async function GET(_: Request, { params }: Params) {
  const activeCompany = await getActiveCompanyIdOrError();
  if (!activeCompany.ok) {
    return activeCompany.response;
  }

  const { id } = await params;
  const reviewData = getUploadReviewByUploadIdAndCompanyId(id, activeCompany.activeCompanyId);
  if (!reviewData) {
    return errorResponse(404, "UPLOAD_NOT_FOUND", "Upload not found.");
  }

  return NextResponse.json(reviewData, { status: 200 });
}

export async function PUT(request: Request, { params }: Params) {
  const activeCompany = await getActiveCompanyIdOrError();
  if (!activeCompany.ok) {
    return activeCompany.response;
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return errorResponse(400, "INVALID_JSON", "Request body must be valid JSON.");
  }

  const validation = validateDraftPatch(payload);
  if (!validation.ok) {
    return errorResponse(400, "VALIDATION_ERROR", validation.message);
  }

  const { id } = await params;
  try {
    const saved = saveUploadReviewDraft({
      uploadId: id,
      companyId: activeCompany.activeCompanyId,
      patch: validation.patch,
    });

    if (!saved) {
      return errorResponse(404, "UPLOAD_NOT_FOUND", "Upload not found.");
    }

    return NextResponse.json(saved, { status: 200 });
  } catch {
    return errorResponse(
      500,
      "DRAFT_PERSISTENCE_FAILED",
      "Could not persist upload review draft.",
    );
  }
}
