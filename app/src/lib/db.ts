import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const dataDir = path.join(process.cwd(), "data");
const dbPath = path.join(dataDir, "app.db");

let dbInstance: Database.Database | null = null;

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

function initializeSchema(db: Database.Database): void {
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS expense_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_type_text TEXT NOT NULL,
      normalized_text TEXT NOT NULL UNIQUE,
      sort_order INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS accounting_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type_of_expense_id INTEGER,
      FOREIGN KEY (type_of_expense_id)
        REFERENCES expense_types (id)
        ON DELETE RESTRICT
    );
  `);

  ensureExpenseTypeSortOrder(db);
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
