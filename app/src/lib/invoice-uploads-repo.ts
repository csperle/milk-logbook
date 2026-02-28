import { getDb } from "@/lib/db";

export type UploadEntryType = "income" | "expense";
export type UploadExtractionStatus = "pending" | "succeeded" | "failed";

export type UploadExtractionError = {
  code: string;
  message: string;
};

export type InvoiceUpload = {
  id: string;
  companyId: number;
  entryType: UploadEntryType;
  originalFilename: string;
  storedFilename: string;
  storedPath: string;
  uploadedAt: string;
  extractionStatus: UploadExtractionStatus;
  extractionError: UploadExtractionError | null;
  extractedAt: string | null;
};

export type UploadReviewStatus = "pending_review" | "saved";
export type UploadStatusFilter = UploadReviewStatus | "all";

export type UploadQueueItem = {
  id: string;
  companyId: number;
  entryType: UploadEntryType;
  originalFilename: string;
  uploadedAt: string;
  reviewStatus: UploadReviewStatus;
  savedEntry: {
    id: number;
    documentNumber: number;
    createdAt: string;
  } | null;
};

type InvoiceUploadRow = {
  id: string;
  company_id: number;
  entry_type: UploadEntryType;
  original_filename: string;
  stored_filename: string;
  stored_path: string;
  uploaded_at: string;
  extraction_status: UploadExtractionStatus;
  extraction_error_code: string | null;
  extraction_error_message: string | null;
  extracted_at: string | null;
};

type UploadQueueItemRow = {
  id: string;
  company_id: number;
  entry_type: UploadEntryType;
  original_filename: string;
  uploaded_at: string;
  accounting_entry_id: number | null;
  accounting_entry_document_number: number | null;
  accounting_entry_created_at: string | null;
};

function mapInvoiceUpload(row: InvoiceUploadRow): InvoiceUpload {
  const hasExtractionError =
    typeof row.extraction_error_code === "string" && typeof row.extraction_error_message === "string";

  return {
    id: row.id,
    companyId: row.company_id,
    entryType: row.entry_type,
    originalFilename: row.original_filename,
    storedFilename: row.stored_filename,
    storedPath: row.stored_path,
    uploadedAt: row.uploaded_at,
    extractionStatus: row.extraction_status,
    extractionError: hasExtractionError
      ? {
          code: row.extraction_error_code as string,
          message: row.extraction_error_message as string,
        }
      : null,
    extractedAt: row.extracted_at,
  };
}

export function createInvoiceUpload(input: {
  id: string;
  companyId: number;
  entryType: UploadEntryType;
  originalFilename: string;
  storedFilename: string;
  storedPath: string;
  uploadedAt: string;
}): InvoiceUpload {
  const db = getDb();

  db.prepare(
    `
      INSERT INTO invoice_uploads (
        id,
        company_id,
        entry_type,
        original_filename,
        stored_filename,
        stored_path,
        uploaded_at,
        extraction_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    input.id,
    input.companyId,
    input.entryType,
    input.originalFilename,
    input.storedFilename,
    input.storedPath,
    input.uploadedAt,
    "pending",
  );

  const createdRow = db
    .prepare(
      `
        SELECT
          id,
          company_id,
          entry_type,
          original_filename,
          stored_filename,
          stored_path,
          uploaded_at,
          extraction_status,
          extraction_error_code,
          extraction_error_message,
          extracted_at
        FROM invoice_uploads
        WHERE id = ?
      `,
    )
    .get(input.id) as InvoiceUploadRow | undefined;

  if (!createdRow) {
    throw new Error("Could not create invoice upload.");
  }

  return mapInvoiceUpload(createdRow);
}

export function getInvoiceUploadByIdAndCompanyId(
  id: string,
  companyId: number,
): InvoiceUpload | null {
  const db = getDb();
  const row = db
    .prepare(
      `
        SELECT
          id,
          company_id,
          entry_type,
          original_filename,
          stored_filename,
          stored_path,
          uploaded_at,
          extraction_status,
          extraction_error_code,
          extraction_error_message,
          extracted_at
        FROM invoice_uploads
        WHERE id = ? AND company_id = ?
      `,
    )
    .get(id, companyId) as InvoiceUploadRow | undefined;

  if (!row) {
    return null;
  }

  return mapInvoiceUpload(row);
}

function mapUploadQueueItem(row: UploadQueueItemRow): UploadQueueItem {
  const isSaved = row.accounting_entry_id !== null;

  return {
    id: row.id,
    companyId: row.company_id,
    entryType: row.entry_type,
    originalFilename: row.original_filename,
    uploadedAt: row.uploaded_at,
    reviewStatus: isSaved ? "saved" : "pending_review",
    savedEntry: isSaved
      ? {
          id: row.accounting_entry_id as number,
          documentNumber: row.accounting_entry_document_number as number,
          createdAt: row.accounting_entry_created_at as string,
        }
      : null,
  };
}

export function listUploadQueueItemsByCompanyId(
  companyId: number,
  status: UploadStatusFilter,
): UploadQueueItem[] {
  const db = getDb();

  let statusClause = "";
  if (status === "pending_review") {
    statusClause = "AND accounting_entries.id IS NULL";
  } else if (status === "saved") {
    statusClause = "AND accounting_entries.id IS NOT NULL";
  }

  const rows = db
    .prepare(
      `
        SELECT
          invoice_uploads.id,
          invoice_uploads.company_id,
          invoice_uploads.entry_type,
          invoice_uploads.original_filename,
          invoice_uploads.uploaded_at,
          accounting_entries.id AS accounting_entry_id,
          accounting_entries.document_number AS accounting_entry_document_number,
          accounting_entries.created_at AS accounting_entry_created_at
        FROM invoice_uploads
        LEFT JOIN accounting_entries
          ON accounting_entries.upload_id = invoice_uploads.id
        WHERE invoice_uploads.company_id = ?
          ${statusClause}
        ORDER BY
          CASE
            WHEN accounting_entries.id IS NULL THEN 0
            ELSE 1
          END ASC,
          invoice_uploads.uploaded_at ASC,
          invoice_uploads.id ASC
      `,
    )
    .all(companyId) as UploadQueueItemRow[];

  return rows.map(mapUploadQueueItem);
}

export function countInvoiceUploadsByCompanyId(companyId: number): number {
  const db = getDb();
  const row = db
    .prepare(
      `
        SELECT COUNT(*) as count
        FROM invoice_uploads
        WHERE company_id = ?
      `,
    )
    .get(companyId) as { count: number };

  return row.count;
}

export function countPendingUploadQueueItemsByCompanyId(companyId: number): number {
  const db = getDb();
  const row = db
    .prepare(
      `
        SELECT COUNT(*) as count
        FROM invoice_uploads
        LEFT JOIN accounting_entries
          ON accounting_entries.upload_id = invoice_uploads.id
        WHERE invoice_uploads.company_id = ?
          AND accounting_entries.id IS NULL
      `,
    )
    .get(companyId) as { count: number };

  return row.count;
}

export function deleteInvoiceUploadById(id: string): void {
  const db = getDb();
  db.prepare("DELETE FROM invoice_uploads WHERE id = ?").run(id);
}

export function markInvoiceUploadExtractionSucceeded(input: {
  id: string;
  extractedAt: string;
}): boolean {
  const db = getDb();
  const result = db
    .prepare(
      `
        UPDATE invoice_uploads
        SET
          extraction_status = 'succeeded',
          extraction_error_code = NULL,
          extraction_error_message = NULL,
          extracted_at = ?
        WHERE id = ?
          AND extraction_status = 'pending'
      `,
    )
    .run(input.extractedAt, input.id);

  return result.changes > 0;
}

export function markInvoiceUploadExtractionFailed(input: {
  id: string;
  code: string;
  message: string;
}): boolean {
  const db = getDb();
  const result = db
    .prepare(
      `
        UPDATE invoice_uploads
        SET
          extraction_status = 'failed',
          extraction_error_code = ?,
          extraction_error_message = ?,
          extracted_at = NULL
        WHERE id = ?
          AND extraction_status = 'pending'
      `,
    )
    .run(input.code, input.message, input.id);

  return result.changes > 0;
}
