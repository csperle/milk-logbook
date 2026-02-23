import { getDb } from "@/lib/db";

export const MAX_EXPENSE_TYPE_TEXT_LENGTH = 100;
export const EXPENSE_PL_CATEGORIES = [
  "direct_cost",
  "operating_expense",
  "financial_other",
  "tax",
] as const;

export type ExpensePlCategory = (typeof EXPENSE_PL_CATEGORIES)[number];

export type ExpenseType = {
  id: number;
  expenseTypeText: string;
  plCategory: ExpensePlCategory;
  createdAt: string;
  updatedAt: string;
};

type ExpenseTypeRow = {
  id: number;
  expense_type_text: string;
  pl_category: ExpensePlCategory;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type CreateExpenseTypeResult =
  | { ok: true; value: ExpenseType }
  | { ok: false; reason: "validation"; field: "expenseTypeText"; message: string }
  | { ok: false; reason: "pl_category_required"; field: "plCategory"; message: string }
  | { ok: false; reason: "invalid_pl_category"; field: "plCategory"; message: string }
  | { ok: false; reason: "duplicate"; field: "expenseTypeText"; message: string };

type DeleteExpenseTypeResult =
  | { ok: true }
  | { ok: false; reason: "not_found"; message: string }
  | { ok: false; reason: "conflict"; message: string };

type UpdateExpenseTypeResult =
  | { ok: true; value: ExpenseType }
  | { ok: false; reason: "not_found"; message: string }
  | { ok: false; reason: "validation"; field: "expenseTypeText"; message: string }
  | { ok: false; reason: "pl_category_required"; field: "plCategory"; message: string }
  | { ok: false; reason: "invalid_pl_category"; field: "plCategory"; message: string }
  | { ok: false; reason: "duplicate"; field: "expenseTypeText"; message: string };

type ReorderExpenseTypesResult =
  | { ok: true }
  | { ok: false; reason: "validation"; field: "orderedExpenseTypeIds"; message: string };

function normalizeExpenseTypeText(value: string): string {
  return value.trim().toLowerCase();
}

function isExpensePlCategory(value: string): value is ExpensePlCategory {
  return EXPENSE_PL_CATEGORIES.includes(value as ExpensePlCategory);
}

function mapExpenseType(row: ExpenseTypeRow): ExpenseType {
  return {
    id: row.id,
    expenseTypeText: row.expense_type_text,
    plCategory: row.pl_category,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listExpenseTypes(): ExpenseType[] {
  const db = getDb();
  const rows = db
    .prepare(
      `
        SELECT id, expense_type_text, pl_category, sort_order, created_at, updated_at
        FROM expense_types
        ORDER BY sort_order ASC, id ASC
      `,
    )
    .all() as ExpenseTypeRow[];

  return rows.map(mapExpenseType);
}

export function createExpenseType(
  rawText: string,
  rawPlCategory: string | null | undefined,
): CreateExpenseTypeResult {
  const db = getDb();
  const trimmedText = rawText.trim();

  if (typeof rawPlCategory !== "string") {
    return {
      ok: false,
      reason: "pl_category_required",
      field: "plCategory",
      message: "plCategory is required.",
    };
  }

  if (!isExpensePlCategory(rawPlCategory)) {
    return {
      ok: false,
      reason: "invalid_pl_category",
      field: "plCategory",
      message: "plCategory must be a valid enum value.",
    };
  }

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
  const nextSortOrderRow = db
    .prepare(
      `
        SELECT COALESCE(MAX(sort_order), 0) + 1 as next_sort_order
        FROM expense_types
      `,
    )
    .get() as { next_sort_order: number };

  try {
    const insert = db.prepare(
      `
        INSERT INTO expense_types (
          expense_type_text,
          normalized_text,
          pl_category,
          sort_order,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `,
    );
    const result = insert.run(
      trimmedText,
      normalizedText,
      rawPlCategory,
      nextSortOrderRow.next_sort_order,
      now,
      now,
    );

    const createdRow = db
      .prepare(
        `
          SELECT id, expense_type_text, pl_category, sort_order, created_at, updated_at
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

export function updateExpenseTypeById(input: {
  id: number;
  expenseTypeText?: string;
  plCategory: string | null | undefined;
}): UpdateExpenseTypeResult {
  const db = getDb();
  const existing = db
    .prepare(
      `
        SELECT id, expense_type_text, pl_category, sort_order, created_at, updated_at
        FROM expense_types
        WHERE id = ?
      `,
    )
    .get(input.id) as ExpenseTypeRow | undefined;

  if (!existing) {
    return {
      ok: false,
      reason: "not_found",
      message: "Expense type not found.",
    };
  }

  if (typeof input.plCategory !== "string") {
    return {
      ok: false,
      reason: "pl_category_required",
      field: "plCategory",
      message: "plCategory is required.",
    };
  }

  if (!isExpensePlCategory(input.plCategory)) {
    return {
      ok: false,
      reason: "invalid_pl_category",
      field: "plCategory",
      message: "plCategory must be a valid enum value.",
    };
  }

  const nextText = input.expenseTypeText ?? existing.expense_type_text;
  const trimmedText = nextText.trim();
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

  const normalizedText = normalizeExpenseTypeText(trimmedText);
  const now = new Date().toISOString();

  try {
    db.prepare(
      `
        UPDATE expense_types
        SET
          expense_type_text = ?,
          normalized_text = ?,
          pl_category = ?,
          updated_at = ?
        WHERE id = ?
      `,
    ).run(trimmedText, normalizedText, input.plCategory, now, input.id);
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

  const updatedRow = db
    .prepare(
      `
        SELECT id, expense_type_text, pl_category, sort_order, created_at, updated_at
        FROM expense_types
        WHERE id = ?
      `,
    )
    .get(input.id) as ExpenseTypeRow | undefined;

  if (!updatedRow) {
    return {
      ok: false,
      reason: "not_found",
      message: "Expense type not found.",
    };
  }

  return { ok: true, value: mapExpenseType(updatedRow) };
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
  const remaining = db
    .prepare(
      `
        SELECT id
        FROM expense_types
        ORDER BY sort_order ASC, id ASC
      `,
    )
    .all() as Array<{ id: number }>;
  const updateSortOrder = db.prepare(
    "UPDATE expense_types SET sort_order = ? WHERE id = ?",
  );
  const resequenceSortOrder = db.transaction((rows: Array<{ id: number }>) => {
    rows.forEach((row, index) => {
      updateSortOrder.run(index + 1, row.id);
    });
  });
  resequenceSortOrder(remaining);
  return { ok: true };
}

export function reorderExpenseTypes(
  orderedExpenseTypeIds: number[],
): ReorderExpenseTypesResult {
  const db = getDb();

  if (orderedExpenseTypeIds.length < 1) {
    return {
      ok: false,
      reason: "validation",
      field: "orderedExpenseTypeIds",
      message: "orderedExpenseTypeIds must be a non-empty array.",
    };
  }

  const uniqueIds = new Set(orderedExpenseTypeIds);
  if (uniqueIds.size !== orderedExpenseTypeIds.length) {
    return {
      ok: false,
      reason: "validation",
      field: "orderedExpenseTypeIds",
      message: "orderedExpenseTypeIds must not contain duplicates.",
    };
  }

  const existingRows = db
    .prepare("SELECT id FROM expense_types ORDER BY sort_order ASC, id ASC")
    .all() as Array<{ id: number }>;
  const existingIds = existingRows.map((row) => row.id);

  if (existingIds.length !== orderedExpenseTypeIds.length) {
    return {
      ok: false,
      reason: "validation",
      field: "orderedExpenseTypeIds",
      message: "orderedExpenseTypeIds must include every expense type exactly once.",
    };
  }

  const existingIdSet = new Set(existingIds);
  const hasUnknownId = orderedExpenseTypeIds.some((id) => !existingIdSet.has(id));
  if (hasUnknownId) {
    return {
      ok: false,
      reason: "validation",
      field: "orderedExpenseTypeIds",
      message: "orderedExpenseTypeIds contains an unknown expense type id.",
    };
  }

  const updateSortOrder = db.prepare(
    "UPDATE expense_types SET sort_order = ?, updated_at = ? WHERE id = ?",
  );
  const now = new Date().toISOString();
  const reorderTx = db.transaction((ids: number[]) => {
    ids.forEach((id, index) => {
      updateSortOrder.run(index + 1, now, id);
    });
  });
  reorderTx(orderedExpenseTypeIds);

  return { ok: true };
}

export function expenseTypeExistsById(id: number): boolean {
  const expenseType = getExpenseTypeById(id);
  return expenseType !== null;
}

export function getExpenseTypeById(id: number): ExpenseType | null {
  const db = getDb();
  const row = db
    .prepare(
      `
        SELECT id, expense_type_text, pl_category, sort_order, created_at, updated_at
        FROM expense_types
        WHERE id = ?
      `,
    )
    .get(id) as ExpenseTypeRow | undefined;
  if (!row) {
    return null;
  }

  return mapExpenseType(row);
}
