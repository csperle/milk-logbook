import { getDb } from "@/lib/db";

export type UploadEntryType = "income" | "expense";

export type InvoiceUpload = {
  id: string;
  companyId: number;
  entryType: UploadEntryType;
  originalFilename: string;
  storedFilename: string;
  storedPath: string;
  uploadedAt: string;
};

type InvoiceUploadRow = {
  id: string;
  company_id: number;
  entry_type: UploadEntryType;
  original_filename: string;
  stored_filename: string;
  stored_path: string;
  uploaded_at: string;
};

function mapInvoiceUpload(row: InvoiceUploadRow): InvoiceUpload {
  return {
    id: row.id,
    companyId: row.company_id,
    entryType: row.entry_type,
    originalFilename: row.original_filename,
    storedFilename: row.stored_filename,
    storedPath: row.stored_path,
    uploadedAt: row.uploaded_at,
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
        uploaded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    input.id,
    input.companyId,
    input.entryType,
    input.originalFilename,
    input.storedFilename,
    input.storedPath,
    input.uploadedAt,
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
          uploaded_at
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

export function deleteInvoiceUploadById(id: string): void {
  const db = getDb();
  db.prepare("DELETE FROM invoice_uploads WHERE id = ?").run(id);
}
