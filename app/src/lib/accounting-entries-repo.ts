import { getDb } from "@/lib/db";
import type { UploadEntryType } from "@/lib/invoice-uploads-repo";

export type AccountingEntrySummary = {
  id: number;
  companyId: number;
  documentNumber: number;
  entryType: UploadEntryType;
  documentDate: string;
  counterpartyName: string;
  amountGross: number;
  sourceOriginalFilename: string;
  extractionStatus: "pending";
  createdAt: string;
};

type AccountingEntrySummaryRow = {
  id: number;
  company_id: number;
  document_number: number;
  entry_type: UploadEntryType;
  document_date: string;
  counterparty_name: string;
  amount_gross: number;
  original_filename: string;
  extraction_status: "pending";
  created_at: string;
};

export type CreatedPlaceholderEntry = {
  id: number;
  documentNumber: number;
  documentDate: string;
  extractionStatus: "pending";
};

type CreatedPlaceholderEntryRow = {
  id: number;
  document_number: number;
  document_date: string;
  extraction_status: "pending";
};

function mapAccountingEntrySummary(row: AccountingEntrySummaryRow): AccountingEntrySummary {
  return {
    id: row.id,
    companyId: row.company_id,
    documentNumber: row.document_number,
    entryType: row.entry_type,
    documentDate: row.document_date,
    counterpartyName: row.counterparty_name,
    amountGross: row.amount_gross,
    sourceOriginalFilename: row.original_filename,
    extractionStatus: row.extraction_status,
    createdAt: row.created_at,
  };
}

export function createPlaceholderEntryFromUpload(input: {
  companyId: number;
  entryType: UploadEntryType;
  uploadId: string;
  documentDate: string;
  createdAt: string;
}): CreatedPlaceholderEntry {
  const db = getDb();
  const transaction = db.transaction(() => {
    const nextNumberRow = db
      .prepare(
        `
          SELECT COALESCE(MAX(document_number), 0) + 1 as nextNumber
          FROM accounting_entries
          WHERE company_id = ?
            AND document_year = ?
            AND entry_type = ?
        `,
      )
      .get(
        input.companyId,
        Number.parseInt(input.documentDate.slice(0, 4), 10),
        input.entryType,
      ) as { nextNumber: number };

    const result = db
      .prepare(
        `
          INSERT INTO accounting_entries (
            company_id,
            document_number,
            entry_type,
            document_date,
            document_year,
            payment_received_date,
            type_of_expense_id,
            counterparty_name,
            booking_text,
            amount_gross,
            amount_net,
            amount_tax,
            upload_id,
            extraction_status,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        input.companyId,
        nextNumberRow.nextNumber,
        input.entryType,
        input.documentDate,
        Number.parseInt(input.documentDate.slice(0, 4), 10),
        null,
        null,
        "Pending extraction",
        "Pending extraction",
        0,
        null,
        null,
        input.uploadId,
        "pending",
        input.createdAt,
        input.createdAt,
      );

    const createdRow = db
      .prepare(
        `
          SELECT
            id,
            document_number,
            document_date,
            extraction_status
          FROM accounting_entries
          WHERE id = ?
        `,
      )
      .get(result.lastInsertRowid) as CreatedPlaceholderEntryRow | undefined;

    if (!createdRow) {
      throw new Error("Could not create accounting entry.");
    }

    return {
      id: createdRow.id,
      documentNumber: createdRow.document_number,
      documentDate: createdRow.document_date,
      extractionStatus: createdRow.extraction_status,
    };
  });

  return transaction();
}

export function listAccountingEntriesByCompanyId(companyId: number): AccountingEntrySummary[] {
  const db = getDb();
  const rows = db
    .prepare(
      `
        SELECT
          accounting_entries.id,
          accounting_entries.company_id,
          accounting_entries.document_number,
          accounting_entries.entry_type,
          accounting_entries.document_date,
          accounting_entries.counterparty_name,
          accounting_entries.amount_gross,
          invoice_uploads.original_filename,
          accounting_entries.extraction_status,
          accounting_entries.created_at
        FROM accounting_entries
        INNER JOIN invoice_uploads
          ON invoice_uploads.id = accounting_entries.upload_id
        WHERE accounting_entries.company_id = ?
        ORDER BY accounting_entries.created_at DESC, accounting_entries.id DESC
      `,
    )
    .all(companyId) as AccountingEntrySummaryRow[];

  return rows.map(mapAccountingEntrySummary);
}
