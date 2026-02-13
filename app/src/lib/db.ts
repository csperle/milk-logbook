import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const dataDir = path.join(process.cwd(), "data");
const dbPath = path.join(dataDir, "app.db");

let dbInstance: Database.Database | null = null;

function initializeSchema(db: Database.Database): void {
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS expense_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_type_text TEXT NOT NULL,
      normalized_text TEXT NOT NULL UNIQUE,
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
