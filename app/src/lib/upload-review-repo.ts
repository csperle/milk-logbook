import { getDb } from "@/lib/db";
import { getInvoiceUploadByIdAndCompanyId, type UploadEntryType } from "@/lib/invoice-uploads-repo";

export type UploadReviewUpload = {
  id: string;
  companyId: number;
  entryType: UploadEntryType;
  originalFilename: string;
  uploadedAt: string;
};

export type UploadReviewDraft = {
  documentDate: string;
  counterpartyName: string;
  bookingText: string;
  amountGross: number;
  amountNet: number | null;
  amountTax: number | null;
  paymentReceivedDate: string | null;
  typeOfExpenseId: number | null;
};

export type UploadReviewData = {
  upload: UploadReviewUpload;
  draft: UploadReviewDraft;
  reviewStatus: "pending_review" | "saved";
};

type UploadReviewDraftRow = {
  upload_id: string;
  document_date: string | null;
  counterparty_name: string | null;
  booking_text: string | null;
  amount_gross: number | null;
  amount_net: number | null;
  amount_tax: number | null;
  payment_received_date: string | null;
  type_of_expense_id: number | null;
};

function defaultDraft(uploadedAt: string): UploadReviewDraft {
  return {
    documentDate: uploadedAt.slice(0, 10),
    counterpartyName: "Pending extraction",
    bookingText: "",
    amountGross: 0,
    amountNet: null,
    amountTax: null,
    paymentReceivedDate: null,
    typeOfExpenseId: null,
  };
}

function mapDraftRow(row: UploadReviewDraftRow, fallback: UploadReviewDraft): UploadReviewDraft {
  return {
    documentDate: row.document_date ?? fallback.documentDate,
    counterpartyName: row.counterparty_name ?? fallback.counterpartyName,
    bookingText: row.booking_text ?? fallback.bookingText,
    amountGross: row.amount_gross ?? fallback.amountGross,
    amountNet: row.amount_net,
    amountTax: row.amount_tax,
    paymentReceivedDate: row.payment_received_date,
    typeOfExpenseId: row.type_of_expense_id,
  };
}

function toUploadReviewUpload(upload: {
  id: string;
  companyId: number;
  entryType: UploadEntryType;
  originalFilename: string;
  uploadedAt: string;
}): UploadReviewUpload {
  return {
    id: upload.id,
    companyId: upload.companyId,
    entryType: upload.entryType,
    originalFilename: upload.originalFilename,
    uploadedAt: upload.uploadedAt,
  };
}

function getDraftRow(uploadId: string): UploadReviewDraftRow | null {
  const db = getDb();
  const row = db
    .prepare(
      `
        SELECT
          upload_id,
          document_date,
          counterparty_name,
          booking_text,
          amount_gross,
          amount_net,
          amount_tax,
          payment_received_date,
          type_of_expense_id
        FROM upload_review_drafts
        WHERE upload_id = ?
      `,
    )
    .get(uploadId) as UploadReviewDraftRow | undefined;

  return row ?? null;
}

export function getUploadReviewByUploadIdAndCompanyId(
  uploadId: string,
  companyId: number,
): UploadReviewData | null {
  const upload = getInvoiceUploadByIdAndCompanyId(uploadId, companyId);
  if (!upload) {
    return null;
  }

  const fallbackDraft = defaultDraft(upload.uploadedAt);
  const draftRow = getDraftRow(uploadId);
  const hasSavedEntry = getDb()
    .prepare(
      `
        SELECT 1 AS exists_value
        FROM accounting_entries
        WHERE upload_id = ?
        LIMIT 1
      `,
    )
    .get(uploadId) as { exists_value: number } | undefined;

  return {
    upload: toUploadReviewUpload(upload),
    draft: draftRow ? mapDraftRow(draftRow, fallbackDraft) : fallbackDraft,
    reviewStatus: hasSavedEntry ? "saved" : "pending_review",
  };
}

export function saveUploadReviewDraft(input: {
  uploadId: string;
  companyId: number;
  patch: Partial<UploadReviewDraft>;
}): UploadReviewData | null {
  const current = getUploadReviewByUploadIdAndCompanyId(input.uploadId, input.companyId);
  if (!current) {
    return null;
  }

  const nextDraft: UploadReviewDraft = {
    ...current.draft,
    ...input.patch,
  };
  const db = getDb();
  const now = new Date().toISOString();

  const existingRow = getDraftRow(input.uploadId);
  if (!existingRow) {
    db.prepare(
      `
        INSERT INTO upload_review_drafts (
          upload_id,
          document_date,
          counterparty_name,
          booking_text,
          amount_gross,
          amount_net,
          amount_tax,
          payment_received_date,
          type_of_expense_id,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    ).run(
      input.uploadId,
      nextDraft.documentDate,
      nextDraft.counterpartyName,
      nextDraft.bookingText,
      nextDraft.amountGross,
      nextDraft.amountNet,
      nextDraft.amountTax,
      nextDraft.paymentReceivedDate,
      nextDraft.typeOfExpenseId,
      now,
      now,
    );
  } else {
    db.prepare(
      `
        UPDATE upload_review_drafts
        SET
          document_date = ?,
          counterparty_name = ?,
          booking_text = ?,
          amount_gross = ?,
          amount_net = ?,
          amount_tax = ?,
          payment_received_date = ?,
          type_of_expense_id = ?,
          updated_at = ?
        WHERE upload_id = ?
      `,
    ).run(
      nextDraft.documentDate,
      nextDraft.counterpartyName,
      nextDraft.bookingText,
      nextDraft.amountGross,
      nextDraft.amountNet,
      nextDraft.amountTax,
      nextDraft.paymentReceivedDate,
      nextDraft.typeOfExpenseId,
      now,
      input.uploadId,
    );
  }

  return {
    upload: current.upload,
    draft: nextDraft,
    reviewStatus: current.reviewStatus,
  };
}
