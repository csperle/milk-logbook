# Global Design Spec (v1)

## 1. Purpose and Scope
This application simplifies bookkeeping for sole proprietors who use a simple profit-and-loss (P&L) method. Users upload invoice PDFs, the system extracts structured accounting data, and entries are recorded as income or expenses. The app provides yearly reporting and generates an annual P&L statement.

### In Scope (V1)
- Upload PDF invoices for income and expenses
- Automatic extraction of structured invoice data using OpenAI
- Persist extracted records as accounting entries
- Yearly overview of entries
- Multi-company support
- Annual P&L statement generation per company and year

### Out of Scope (V1)
- Authentication and role-based access
- Cloud deployment and production infrastructure
- Analytics/error tracking integrations
- Explicit CI/CD, coverage, or performance/accessibility targets

## 2. Technical Baseline (Verified from Repository)
- Framework: Next.js `16.1.6` (App Router)
- Runtime: React `19.2.3`, React DOM `19.2.3`
- Language: TypeScript (`strict: true`, `noEmit: true`)
- Styling: Tailwind CSS v4 (`@import "tailwindcss"`), PostCSS via `@tailwindcss/postcss`
- Persistence (implemented for current slice): SQLite via `better-sqlite3`
- Linting: ESLint v9 + `eslint-config-next/core-web-vitals` + `eslint-config-next/typescript`
- Commands:
  - `npm run dev`
  - `npm run build`
  - `npm run start`
  - `npm run lint`
- Current app structure:
  - `src/app/layout.tsx`
  - `src/app/page.tsx`
  - `src/app/admin/expense-types/page.tsx`
  - `src/app/api/expense-types/route.ts`
  - `src/app/api/expense-types/[id]/route.ts`
  - `src/app/globals.css`
  - `src/lib/db.ts`
  - `src/lib/expense-types-repo.ts`
  - `public/` for static assets
- TS alias: `@/* -> ./src/*`

## 3. Target Users
- Primary users: sole proprietors managing small-scale bookkeeping
- Accounting model: simplified annual P&L (income vs expenses), not full double-entry bookkeeping

## 4. Functional Requirements

### 4.1 Company Management
- Users can create and manage multiple companies.
- Every accounting entry belongs to exactly one company.
- Reporting and P&L are always filtered by selected company and year.

### 4.2 Invoice PDF Upload
- User can upload PDF files as either:
  - Income invoice
  - Expense invoice
- Uploaded files must be persisted in a local `upload` folder.
- Uploaded file metadata should be retained for traceability (original filename, stored filename, upload timestamp).
- Stored file naming must be unique and based on accounting context.
  - Required base pattern: `<documentNumber>_<year>.pdf`.
  - If needed to guarantee uniqueness across companies/types, append stable segments such as `<entryType>` and `<companyId>`.
  - Example: `15_2026_income_company-3.pdf`.

### 4.3 AI Data Extraction
- For each uploaded PDF, call OpenAI to extract structured fields.
- Minimum extracted fields:
  - `documentDate` (date printed on the document)
  - `counterpartyName`
  - `bookingText` (description text of the booking entry, or invoice reference)
  - `amountNet` (if present)
  - `amountTax` (if present)
  - `amountGross`
  - `entryType` (`income` | `expense`)
- Additional field for income invoices:
  - `paymentReceivedDate` (date payment was actually received)
- If confidence is low or fields are missing, allow user correction before final save.
- Currency handling:
  - No currency field is captured.
  - All monetary values are interpreted and stored as Swiss francs (CHF).

### 4.4 Accounting Entry Records
- Create/edit/delete accounting entries.
- Entry fields should support at minimum:
  - `id`
  - `companyId`
  - `documentNumber`
  - `entryType`
  - `documentDate` (date printed on invoice/document)
  - `paymentReceivedDate` (required for `income`, not used for `expense`)
  - `typeOfExpense` (required for `expense`, not used for `income`)
  - `counterpartyName`
  - `bookingText`
  - `amountGross`
  - `sourceFile` reference (stored PDF path/name from `upload` folder)
  - `createdAt`, `updatedAt`
- Document numbering rules:
  - Every entry must have a `documentNumber`.
  - Numbering restarts at `1` for each calendar year.
  - Separate number ranges exist per year for `income` and `expense`.
  - Example for 2026: income entries `1, 2, 3...`; expense entries `1, 2, 3...` independently.
- Expense typing rules:
  - Expense entries must reference one expense type (`typeOfExpense`).
  - Income entries must not set `typeOfExpense`.
  - In the expense entry UI, user selects `typeOfExpense` from a dropdown.

### 4.5 Yearly Overview
- Show all entries for a selected company and year.
- Support basic filtering by type (`income`/`expense`) and sorting by date.
- Display yearly totals for income, expenses, and net profit/loss in CHF.
- For each entry, provide a link/action in the UI to open the original uploaded PDF.

### 4.6 Annual P&L Statement
- Generate annual P&L for a selected company and year.
- Output must include:
  - Total income (CHF)
  - Total expenses (CHF)
  - Annual result (`income - expenses`) in CHF
- Statement should be viewable in-app and exportable (format to be decided during implementation; default target: PDF).

### 4.7 Expense Type Administration
- Maintain a fixed set of expense types as a separate entity.
- Provide an admin section in the app to manage expense types.
- Admin route path: `/admin/expense-types`.
- Admin section capabilities:
  - Add expense type
  - Remove expense type
- Expense-type selection in expense-entry forms must read from this maintained list.
- API behavior for this feature:
  - `GET /api/expense-types`: returns list sorted by `createdAt` ascending.
  - `POST /api/expense-types`: validates `expenseTypeText` (required, trimmed non-empty, unique case-insensitive).
  - `DELETE /api/expense-types/:id`: rejects deletion with `409` when referenced by accounting entries.

## 5. Data Model

### 5.1 Company
- `id`
- `name`
- Optional profile fields (for V1 optional): tax id, address
- `createdAt`, `updatedAt`

### 5.2 AccountingEntry
- `id`
- `companyId` (FK to Company)
- `documentNumber` (integer, required)
- `entryType`: `income | expense`
- `documentDate` (date printed on document)
- `paymentReceivedDate` (required when `entryType = income`, null/not-applicable for `expense`)
- `typeOfExpenseId` (required when `entryType = expense`, null/not-applicable for `income`)
- `counterpartyName`
- `bookingText`
- `amountGross`
- Optional: `amountNet`, `amountTax`
- `sourceFilePath` (required; local path/reference to stored PDF in `upload` folder)
- `sourceOriginalFilename` (required)
- `extractionStatus` and optional `extractionConfidence`
- `createdAt`, `updatedAt`

### 5.3 ExpenseType
- `id`
- `expenseTypeText`
- `normalizedText` (persisted lowercase+trimmed value for uniqueness checks)
- `createdAt`, `updatedAt`

### 5.4 Expense Type Relation (Derived Rule)
- 1:n relation from `ExpenseType` to `AccountingEntry` (`ExpenseType` one, `AccountingEntry` many).
- Relation key: `AccountingEntry.typeOfExpenseId -> ExpenseType.id`
- Applies only when `AccountingEntry.entryType = expense`.

### 5.5 Document Number Range (Derived Rule)
- Number range key: `(companyId, year, entryType)`
- Sequence starts at `1` for each unique key.
- On create, assign the next available integer in that key's sequence.
- Uniqueness constraint target: `(companyId, year, entryType, documentNumber)` must be unique.

### 5.6 Swiss Regional Formatting Rules
- Currency model:
  - All amounts are CHF by definition.
  - No persisted currency code field in V1.
- Number formatting (for region-specific numeric content in UI and reports):
  - Monetary fields (`amountGross`, `amountNet`, `amountTax`, totals, annual result) use Swiss number formatting.
  - Format convention: thousands separator apostrophe (`'`), decimal separator dot (`.`), and exactly 2 decimals.
  - Example: `CHF 12'345.67`.
- Date formatting:
  - `documentDate` should be displayed in Swiss style `DD.MM.YYYY` in UI/reports.
  - `paymentReceivedDate` should be displayed in Swiss style `DD.MM.YYYY` for income entries.
  - Internal storage format may remain ISO-compatible for processing.
- Company tax ID formatting (if provided):
  - Prefer Swiss UID format `CHE-123.456.789`.

## 6. Architecture and Modules (V1 Target)
- `src/app/` routes/pages for:
  - company selection/management
  - upload flow
  - yearly overview
  - annual P&L view
  - admin expense-type management
- Suggested internal modules under `src/`:
  - `src/lib/db.ts` for SQLite connection and schema initialization (implemented)
  - `src/lib/expense-types-repo.ts` for expense-type persistence and validation rules (implemented)
  - `src/lib/openai/` for extraction client and prompt/schema
  - `src/lib/accounting/` for aggregation and P&L calculations
  - `src/lib/storage/` for local persistence and file handling
  - `src/types/` for domain types (`Company`, `AccountingEntry`, `ExpenseType`)

## 7. Local Runtime and Operations
- Local-only execution is sufficient.
- OpenAI API key should be provided via local environment variables (e.g., `.env.local`).
- No deployment platform constraints for V1.
- SQLite database file for current slice: `data/app.db` (created automatically on first write).
- Local file storage:
  - Store uploaded invoice PDFs under a dedicated `upload` folder.
  - Accounting entries must reference the stored file so the original document can be opened from the UI.

## 8. Quality Requirements
- No mandatory CI/CD or coverage threshold.
- No unit tests or behavior/end-to-end tests are required for this project.
- Practical quality gate for development:
  - Type checks via Next.js build
  - Lint checks via `npm run lint`
- Manual verification is acceptable for V1 workflows.

## 9. Non-Requirements (Confirmed)
- No authentication/authorization
- No analytics or error-tracking stack
- No explicit compliance framework requirements
- No fixed milestones or delivery dates in this specification

## 10. Acceptance Criteria (V1)
1. User can create at least two companies and keep entries separated by company.
2. User can upload PDF invoices and classify each as income or expense.
3. OpenAI extraction populates structured entry fields from uploaded PDFs.
4. User can correct extracted values before final save.
5. User can view a yearly list of entries per company.
6. Yearly totals (income, expense, net result) are correctly calculated.
7. Annual P&L statement can be generated for a selected company/year.
8. Entire application runs locally with documented environment setup.
9. For each company and year, income entries and expense entries maintain independent document number ranges starting at `1`.
10. No currency field is used; all stored and calculated amounts are CHF.
11. Region-specific values in UI/reports follow Swiss formatting rules (amounts and dates).
12. Every uploaded PDF is saved with a unique stored filename in the `upload` folder, referenced by its accounting entry, and openable from the UI.
13. Income entries include `paymentReceivedDate`, while `documentDate` remains the printed date on the source document.
14. Expense entries require a `typeOfExpense` selected from a dropdown populated by a separately managed expense-type list.
15. The app includes an admin section where users can add and remove expense types.

## 11. Change Log

### (2026-02-13)
- The first implemented vertical slice is Expense Type Administration.
- Deterministic API statuses are in place for that slice: success, validation (`400`), duplicate/conflict (`409`), and not found (`404`).
- Deletion integrity is enforced by explicit reference checks against `accounting_entries.type_of_expense_id`.
- Expense type uniqueness is enforced case-insensitively and trim-insensitively using persisted normalization.
