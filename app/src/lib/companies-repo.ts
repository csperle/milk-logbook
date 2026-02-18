import { getDb } from "@/lib/db";
import { countInvoiceUploadsByCompanyId } from "@/lib/invoice-uploads-repo";

export const MAX_COMPANY_NAME_LENGTH = 100;

export type Company = {
  id: number;
  name: string;
  createdAt: string;
  updatedAt: string;
};

type CompanyRow = {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
};

type CreateCompanyResult =
  | { ok: true; value: Company }
  | { ok: false; reason: "validation"; field: "name"; message: string }
  | { ok: false; reason: "duplicate"; field: "name"; message: string };

type DeleteCompanyResult =
  | { ok: true }
  | { ok: false; reason: "not_found"; message: string }
  | { ok: false; reason: "conflict"; message: string };

function normalizeCompanyName(value: string): string {
  return value.trim().toLowerCase();
}

function mapCompany(row: CompanyRow): Company {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listCompanies(): Company[] {
  const db = getDb();
  const rows = db
    .prepare(
      `
        SELECT id, name, created_at, updated_at
        FROM companies
        ORDER BY created_at ASC, id ASC
      `,
    )
    .all() as CompanyRow[];

  return rows.map(mapCompany);
}

export function createCompany(rawName: string): CreateCompanyResult {
  const db = getDb();
  const trimmedName = rawName.trim();

  if (trimmedName.length < 1) {
    return {
      ok: false,
      reason: "validation",
      field: "name",
      message: "Company name is required.",
    };
  }

  if (trimmedName.length > MAX_COMPANY_NAME_LENGTH) {
    return {
      ok: false,
      reason: "validation",
      field: "name",
      message: `Company name must be at most ${MAX_COMPANY_NAME_LENGTH} characters.`,
    };
  }

  const now = new Date().toISOString();
  const normalizedName = normalizeCompanyName(trimmedName);

  try {
    const insert = db.prepare(
      `
        INSERT INTO companies (name, normalized_name, created_at, updated_at)
        VALUES (?, ?, ?, ?)
      `,
    );
    const result = insert.run(trimmedName, normalizedName, now, now);
    const createdRow = db
      .prepare(
        `
          SELECT id, name, created_at, updated_at
          FROM companies
          WHERE id = ?
        `,
      )
      .get(result.lastInsertRowid) as CompanyRow | undefined;

    if (!createdRow) {
      return {
        ok: false,
        reason: "validation",
        field: "name",
        message: "Could not create company.",
      };
    }

    return { ok: true, value: mapCompany(createdRow) };
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE"
    ) {
      return {
        ok: false,
        reason: "duplicate",
        field: "name",
        message: "Company name must be unique (case-insensitive, trimmed).",
      };
    }

    throw error;
  }
}

export function deleteCompanyById(id: number): DeleteCompanyResult {
  const db = getDb();
  const existing = db
    .prepare("SELECT id FROM companies WHERE id = ?")
    .get(id) as { id: number } | undefined;

  if (!existing) {
    return {
      ok: false,
      reason: "not_found",
      message: "Company not found.",
    };
  }

  const referenceRow = db
    .prepare(
      `
        SELECT COUNT(*) as count
        FROM accounting_entries
        WHERE company_id = ?
      `,
    )
    .get(id) as { count: number };

  if (referenceRow.count > 0) {
    return {
      ok: false,
      reason: "conflict",
      message: "Company is referenced by domain records and cannot be deleted.",
    };
  }

  const uploadReferenceCount = countInvoiceUploadsByCompanyId(id);
  if (uploadReferenceCount > 0) {
    return {
      ok: false,
      reason: "conflict",
      message: "Company is referenced by domain records and cannot be deleted.",
    };
  }

  db.prepare("DELETE FROM companies WHERE id = ?").run(id);
  return { ok: true };
}
