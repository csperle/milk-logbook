import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const dataDir = path.join(process.cwd(), "data");
const dbPath = path.join(dataDir, "app.db");

let dbInstance: Database.Database | null = null;

const EXPENSE_PL_CATEGORY_CHECK =
  "('direct_cost','operating_expense','financial_other','tax')";

function ensureExpenseTypeSortOrder(db: Database.Database): void {
  const columns = db
    .prepare("PRAGMA table_info(expense_types)")
    .all() as Array<{ name: string }>;
  const hasSortOrder = columns.some((column) => column.name === "sort_order");

  if (!hasSortOrder) {
    db.exec("ALTER TABLE expense_types ADD COLUMN sort_order INTEGER;");
  }

  const nullSortOrderCount = db
    .prepare(
      `
        SELECT COUNT(*) as count
        FROM expense_types
        WHERE sort_order IS NULL
      `,
    )
    .get() as { count: number };

  if (hasSortOrder && nullSortOrderCount.count === 0) {
    return;
  }

  const orderedExpenseTypes = db
    .prepare(
      `
        SELECT id
        FROM expense_types
        ORDER BY created_at ASC, id ASC
      `,
    )
    .all() as Array<{ id: number }>;

  const updateSortOrder = db.prepare(
    "UPDATE expense_types SET sort_order = ? WHERE id = ?",
  );
  const fillSortOrder = db.transaction((rows: Array<{ id: number }>) => {
    rows.forEach((row, index) => {
      updateSortOrder.run(index + 1, row.id);
    });
  });
  fillSortOrder(orderedExpenseTypes);
}

function ensureExpenseTypePlCategory(db: Database.Database): void {
  const columns = db
    .prepare("PRAGMA table_info(expense_types)")
    .all() as Array<{ name: string }>;
  const hasPlCategory = columns.some((column) => column.name === "pl_category");
  if (hasPlCategory) {
    return;
  }

  db.exec(`
    ALTER TABLE expense_types
    ADD COLUMN pl_category TEXT NOT NULL DEFAULT 'operating_expense'
    CHECK (pl_category IN ${EXPENSE_PL_CATEGORY_CHECK});
  `);
}

function ensureAccountingEntriesCompanyColumn(db: Database.Database): void {
  const columns = db
    .prepare("PRAGMA table_info(accounting_entries)")
    .all() as Array<{ name: string }>;
  const hasCompanyId = columns.some((column) => column.name === "company_id");

  if (!hasCompanyId) {
    db.exec("ALTER TABLE accounting_entries ADD COLUMN company_id INTEGER;");
  }
}

function ensureAccountingEntriesColumns(db: Database.Database): void {
  const columns = db
    .prepare("PRAGMA table_info(accounting_entries)")
    .all() as Array<{ name: string }>;
  const columnNames = new Set(columns.map((column) => column.name));

  if (!columnNames.has("document_number")) {
    db.exec("ALTER TABLE accounting_entries ADD COLUMN document_number INTEGER;");
  }

  if (!columnNames.has("entry_type")) {
    db.exec("ALTER TABLE accounting_entries ADD COLUMN entry_type TEXT;");
  }

  if (!columnNames.has("document_date")) {
    db.exec("ALTER TABLE accounting_entries ADD COLUMN document_date TEXT;");
  }

  if (!columnNames.has("document_year")) {
    db.exec("ALTER TABLE accounting_entries ADD COLUMN document_year INTEGER;");
  }

  if (!columnNames.has("payment_received_date")) {
    db.exec("ALTER TABLE accounting_entries ADD COLUMN payment_received_date TEXT;");
  }

  if (!columnNames.has("counterparty_name")) {
    db.exec("ALTER TABLE accounting_entries ADD COLUMN counterparty_name TEXT;");
  }

  if (!columnNames.has("booking_text")) {
    db.exec("ALTER TABLE accounting_entries ADD COLUMN booking_text TEXT;");
  }

  if (!columnNames.has("amount_gross")) {
    db.exec(
      "ALTER TABLE accounting_entries ADD COLUMN amount_gross INTEGER NOT NULL DEFAULT 0;",
    );
  }

  if (!columnNames.has("amount_net")) {
    db.exec("ALTER TABLE accounting_entries ADD COLUMN amount_net INTEGER;");
  }

  if (!columnNames.has("amount_tax")) {
    db.exec("ALTER TABLE accounting_entries ADD COLUMN amount_tax INTEGER;");
  }

  if (!columnNames.has("upload_id")) {
    db.exec("ALTER TABLE accounting_entries ADD COLUMN upload_id TEXT;");
  }

  if (!columnNames.has("extraction_status")) {
    db.exec(
      "ALTER TABLE accounting_entries ADD COLUMN extraction_status TEXT NOT NULL DEFAULT 'pending';",
    );
  }

  if (!columnNames.has("created_at")) {
    db.exec("ALTER TABLE accounting_entries ADD COLUMN created_at TEXT;");
  }

  if (!columnNames.has("updated_at")) {
    db.exec("ALTER TABLE accounting_entries ADD COLUMN updated_at TEXT;");
  }

  if (!columnNames.has("expense_pl_category")) {
    db.exec(`
      ALTER TABLE accounting_entries
      ADD COLUMN expense_pl_category TEXT
      CHECK (
        (entry_type = 'income' AND expense_pl_category IS NULL)
        OR
        (entry_type = 'expense' AND expense_pl_category IN ${EXPENSE_PL_CATEGORY_CHECK})
      );
    `);
  }

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS accounting_entries_sequence_unique
    ON accounting_entries (company_id, document_year, entry_type, document_number)
    WHERE company_id IS NOT NULL
      AND document_year IS NOT NULL
      AND entry_type IS NOT NULL
      AND document_number IS NOT NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS accounting_entries_upload_id_unique
    ON accounting_entries (upload_id)
    WHERE upload_id IS NOT NULL;
  `);
}

function initializeSchema(db: Database.Database): void {
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS expense_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_type_text TEXT NOT NULL,
      normalized_text TEXT NOT NULL UNIQUE,
      pl_category TEXT NOT NULL CHECK(pl_category IN ('direct_cost','operating_expense','financial_other','tax')),
      sort_order INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS invoice_uploads (
      id TEXT PRIMARY KEY,
      company_id INTEGER NOT NULL,
      entry_type TEXT NOT NULL CHECK(entry_type IN ('income', 'expense')),
      original_filename TEXT NOT NULL,
      stored_filename TEXT NOT NULL UNIQUE,
      stored_path TEXT NOT NULL,
      uploaded_at TEXT NOT NULL,
      FOREIGN KEY (company_id)
        REFERENCES companies (id)
        ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS upload_review_drafts (
      upload_id TEXT PRIMARY KEY,
      document_date TEXT,
      counterparty_name TEXT,
      booking_text TEXT,
      amount_gross INTEGER,
      amount_net INTEGER,
      amount_tax INTEGER,
      payment_received_date TEXT,
      type_of_expense_id INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (upload_id)
        REFERENCES invoice_uploads (id)
        ON DELETE CASCADE,
      FOREIGN KEY (type_of_expense_id)
        REFERENCES expense_types (id)
        ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS accounting_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      document_number INTEGER NOT NULL,
      entry_type TEXT NOT NULL CHECK(entry_type IN ('income', 'expense')),
      expense_pl_category TEXT CHECK(
        (entry_type = 'income' AND expense_pl_category IS NULL)
        OR
        (entry_type = 'expense' AND expense_pl_category IN ('direct_cost','operating_expense','financial_other','tax'))
      ),
      document_date TEXT NOT NULL,
      document_year INTEGER NOT NULL,
      payment_received_date TEXT,
      type_of_expense_id INTEGER,
      counterparty_name TEXT NOT NULL,
      booking_text TEXT NOT NULL,
      amount_gross INTEGER NOT NULL DEFAULT 0,
      amount_net INTEGER,
      amount_tax INTEGER,
      upload_id TEXT NOT NULL UNIQUE,
      extraction_status TEXT NOT NULL DEFAULT 'pending' CHECK(extraction_status IN ('pending')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (company_id, document_year, entry_type, document_number),
      FOREIGN KEY (type_of_expense_id)
        REFERENCES expense_types (id)
        ON DELETE RESTRICT,
      FOREIGN KEY (company_id)
        REFERENCES companies (id)
        ON DELETE RESTRICT,
      FOREIGN KEY (upload_id)
        REFERENCES invoice_uploads (id)
        ON DELETE RESTRICT
    );
  `);

  ensureExpenseTypePlCategory(db);
  ensureExpenseTypeSortOrder(db);
  ensureAccountingEntriesCompanyColumn(db);
  ensureAccountingEntriesColumns(db);
}

export function getDb(): Database.Database {
  if (dbInstance) {
    return dbInstance;
  }

  fs.mkdirSync(dataDir, { recursive: true });
  dbInstance = new Database(dbPath);
  initializeSchema(dbInstance);

  return dbInstance;
}
