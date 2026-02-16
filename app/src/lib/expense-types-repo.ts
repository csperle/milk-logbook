import { getDb } from "@/lib/db";

export const MAX_EXPENSE_TYPE_TEXT_LENGTH = 100;

export type ExpenseType = {
  id: number;
  expenseTypeText: string;
  createdAt: string;
  updatedAt: string;
};

type ExpenseTypeRow = {
  id: number;
  expense_type_text: string;
  created_at: string;
  updated_at: string;
};

type CreateExpenseTypeResult =
  | { ok: true; value: ExpenseType }
  | { ok: false; reason: "validation"; field: "expenseTypeText"; message: string }
  | { ok: false; reason: "duplicate"; field: "expenseTypeText"; message: string };

type DeleteExpenseTypeResult =
  | { ok: true }
  | { ok: false; reason: "not_found"; message: string }
  | { ok: false; reason: "conflict"; message: string };

function normalizeExpenseTypeText(value: string): string {
  return value.trim().toLowerCase();
}

function mapExpenseType(row: ExpenseTypeRow): ExpenseType {
  return {
    id: row.id,
    expenseTypeText: row.expense_type_text,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listExpenseTypes(): ExpenseType[] {
  const db = getDb();
  const rows = db
    .prepare(
      `
        SELECT id, expense_type_text, created_at, updated_at
        FROM expense_types
        ORDER BY created_at ASC, id ASC
      `,
    )
    .all() as ExpenseTypeRow[];

  return rows.map(mapExpenseType);
}

export function createExpenseType(rawText: string): CreateExpenseTypeResult {
  const db = getDb();
  const trimmedText = rawText.trim();

  if (trimmedText.length < 1) {
    return {
      ok: false,
      reason: "validation",
      field: "expenseTypeText",
      message: "Expense type text is required.",
    };
  }

  if (trimmedText.length > MAX_EXPENSE_TYPE_TEXT_LENGTH) {
    return {
      ok: false,
      reason: "validation",
      field: "expenseTypeText",
      message: `Expense type text must be at most ${MAX_EXPENSE_TYPE_TEXT_LENGTH} characters.`,
    };
  }

  const now = new Date().toISOString();
  const normalizedText = normalizeExpenseTypeText(trimmedText);

  try {
    const insert = db.prepare(
      `
        INSERT INTO expense_types (
          expense_type_text,
          normalized_text,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?)
      `,
    );
    const result = insert.run(trimmedText, normalizedText, now, now);

    const createdRow = db
      .prepare(
        `
          SELECT id, expense_type_text, created_at, updated_at
          FROM expense_types
          WHERE id = ?
        `,
      )
      .get(result.lastInsertRowid) as ExpenseTypeRow | undefined;

    if (!createdRow) {
      return {
        ok: false,
        reason: "validation",
        field: "expenseTypeText",
        message: "Could not create expense type.",
      };
    }

    return { ok: true, value: mapExpenseType(createdRow) };
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE"
    ) {
      return {
        ok: false,
        reason: "duplicate",
        field: "expenseTypeText",
        message: "Expense type must be unique (case-insensitive, trimmed).",
      };
    }

    throw error;
  }
}

export function deleteExpenseTypeById(id: number): DeleteExpenseTypeResult {
  const db = getDb();

  const existing = db
    .prepare("SELECT id FROM expense_types WHERE id = ?")
    .get(id) as { id: number } | undefined;

  if (!existing) {
    return {
      ok: false,
      reason: "not_found",
      message: "Expense type not found.",
    };
  }

  const referenceRow = db
    .prepare(
      `
        SELECT COUNT(*) as count
        FROM accounting_entries
        WHERE type_of_expense_id = ?
      `,
    )
    .get(id) as { count: number };

  if (referenceRow.count > 0) {
    return {
      ok: false,
      reason: "conflict",
      message:
        "Expense type is referenced by accounting entries and cannot be deleted.",
    };
  }

  db.prepare("DELETE FROM expense_types WHERE id = ?").run(id);
  return { ok: true };
}
