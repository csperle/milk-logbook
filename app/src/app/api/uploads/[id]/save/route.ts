import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ACTIVE_COMPANY_COOKIE_NAME, parseActiveCompanyId } from "@/lib/active-company";
import {
  saveAccountingEntryFromUploadReview,
  type AccountingEntrySummary,
} from "@/lib/accounting-entries-repo";
import { listCompanies } from "@/lib/companies-repo";
import { getUploadReviewByUploadIdAndCompanyId } from "@/lib/upload-review-repo";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

type SaveErrorCode =
  | "INVALID_ACTIVE_COMPANY"
  | "UPLOAD_NOT_FOUND"
  | "VALIDATION_ERROR"
  | "EXPENSE_TYPE_NOT_FOUND"
  | "ALREADY_SAVED"
  | "ACCOUNTING_ENTRY_PERSISTENCE_FAILED";

function errorResponse(status: number, code: SaveErrorCode, message: string) {
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

function validateSaveInput(input: {
  entryType: "income" | "expense";
  draft: {
    documentDate: string;
    counterpartyName: string;
    bookingText: string;
    amountGross: number;
    paymentReceivedDate: string | null;
    typeOfExpenseId: number | null;
  };
}): { ok: true } | { ok: false; code: SaveErrorCode; message: string } {
  if (!isValidDateOnly(input.draft.documentDate)) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "documentDate must be a valid YYYY-MM-DD date.",
    };
  }

  const counterpartyName = input.draft.counterpartyName.trim();
  if (counterpartyName.length < 1 || counterpartyName.length > 200) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "counterpartyName must be non-empty and at most 200 characters.",
    };
  }

  const bookingText = input.draft.bookingText.trim();
  if (bookingText.length < 1 || bookingText.length > 500) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "bookingText must be non-empty and at most 500 characters.",
    };
  }

  if (!Number.isInteger(input.draft.amountGross) || input.draft.amountGross < 0) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "amountGross must be an integer >= 0.",
    };
  }

  if (input.entryType === "income") {
    if (
      input.draft.paymentReceivedDate === null ||
      !isValidDateOnly(input.draft.paymentReceivedDate)
    ) {
      return {
        ok: false,
        code: "VALIDATION_ERROR",
        message: "paymentReceivedDate is required for income entries.",
      };
    }

    if (input.draft.typeOfExpenseId !== null) {
      return {
        ok: false,
        code: "VALIDATION_ERROR",
        message: "typeOfExpenseId must be null for income entries.",
      };
    }
  }

  if (input.entryType === "expense") {
    if (input.draft.paymentReceivedDate !== null) {
      return {
        ok: false,
        code: "VALIDATION_ERROR",
        message: "paymentReceivedDate must be null for expense entries.",
      };
    }

    if (input.draft.typeOfExpenseId === null) {
      return {
        ok: false,
        code: "VALIDATION_ERROR",
        message: "typeOfExpenseId is required for expense entries.",
      };
    }

  }

  return { ok: true };
}

function mapEntryResponse(entry: AccountingEntrySummary) {
  return {
    entry: {
      id: entry.id,
      companyId: entry.companyId,
      documentNumber: entry.documentNumber,
      entryType: entry.entryType,
      documentDate: entry.documentDate,
      counterpartyName: entry.counterpartyName,
      amountGross: entry.amountGross,
      sourceOriginalFilename: entry.sourceOriginalFilename,
      extractionStatus: entry.extractionStatus,
      createdAt: entry.createdAt,
    },
  };
}

export async function POST(_: Request, { params }: Params) {
  const companies = listCompanies();
  const cookieStore = await cookies();
  const activeCompanyId = parseActiveCompanyId(
    cookieStore.get(ACTIVE_COMPANY_COOKIE_NAME)?.value,
  );
  const hasValidActiveCompany =
    activeCompanyId !== null && companies.some((company) => company.id === activeCompanyId);

  if (!hasValidActiveCompany) {
    return errorResponse(
      409,
      "INVALID_ACTIVE_COMPANY",
      "Missing or invalid active company context.",
    );
  }

  const { id } = await params;
  const reviewData = getUploadReviewByUploadIdAndCompanyId(id, activeCompanyId);
  if (!reviewData) {
    return errorResponse(404, "UPLOAD_NOT_FOUND", "Upload not found.");
  }

  const validation = validateSaveInput({
    entryType: reviewData.upload.entryType,
    draft: reviewData.draft,
  });
  if (!validation.ok) {
    return errorResponse(400, validation.code, validation.message);
  }

  try {
    const saveResult = saveAccountingEntryFromUploadReview({
      companyId: activeCompanyId,
      uploadId: reviewData.upload.id,
      entryType: reviewData.upload.entryType,
      originalFilename: reviewData.upload.originalFilename,
      draft: {
        ...reviewData.draft,
        counterpartyName: reviewData.draft.counterpartyName.trim(),
        bookingText: reviewData.draft.bookingText.trim(),
      },
    });

    if (!saveResult.ok) {
      if (saveResult.reason === "expense_type_not_found") {
        return errorResponse(
          400,
          "EXPENSE_TYPE_NOT_FOUND",
          "Referenced expense type was not found.",
        );
      }

      return errorResponse(
        409,
        "ALREADY_SAVED",
        "Accounting entry for this upload already exists.",
      );
    }

    return NextResponse.json(mapEntryResponse(saveResult.value), { status: 201 });
  } catch {
    return errorResponse(
      500,
      "ACCOUNTING_ENTRY_PERSISTENCE_FAILED",
      "Could not persist accounting entry.",
    );
  }
}
