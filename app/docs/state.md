# Project State

- Last updated date: 2026-02-17
- Current goal: implement the next small vertical slice: Invoice PDF Upload + Local Storage (without AI extraction yet).
- Active feature spec(s): `docs/specs/002-company-context-guard.md`.

## What is implemented
- Company context guard slice (`002-company-context-guard`) is implemented.
- Company admin UI is available at `/admin/companies`.
- Company API endpoints exist: `GET /api/companies`, `POST /api/companies`, `DELETE /api/companies/:id`.
- Company creation enforces trim/non-empty validation, max length 100, and case-insensitive uniqueness.
- Active company is persisted in cookie key `activeCompanyId`.
- Guard behavior is enforced for non-company-admin routes when no company exists or no valid active company is selected.
- Company admin page shows clear warning guidance when navigation is blocked by missing company setup/context.
- Main page header shows active company in a top-right bordered link to company admin.
- Expense type admin UI is available at `/admin/expense-types`.
- Root/home navigation links to `/admin/expense-types`.
- API endpoints exist: `GET /api/expense-types`, `POST /api/expense-types`, `DELETE /api/expense-types/:id`.
- SQLite persistence is implemented via `better-sqlite3` with local DB file `data/app.db`.
- Expense type creation enforces trim/non-empty validation and case-insensitive uniqueness.
- Expense type text length is validated with a max of 100 characters.
- Expense type order is persisted in the database and returned consistently by `GET /api/expense-types`.
- Expense type admin UI supports reordering (move up/down) and persists changes via API.
- Delete flow includes confirmation in UI and deterministic API statuses (`400/404/409/204`).
- Deletion is blocked when an expense type is referenced by `accounting_entries.type_of_expense_id`.
- API contract examples and local data reset workflow are documented in `README.md`.

## What remains
- Implement next planned features:
  - invoice PDF upload + local file storage (no AI extraction in this slice):
    - PDF-only upload endpoint
    - local `upload/` persistence
    - persisted upload metadata (original filename, stored filename, upload timestamp, company context)
    - simple upload UI with success/error states
    - active-company guard enforcement on upload page
  - AI extraction/review/save on top of uploaded files
  - yearly overview
  - annual P&L

## How to run (dev/validation)
- Dev server: `npm run dev`
- Lint: `npm run lint`
- Build: `npm run build`

## Known issues / open questions
- Product/spec open questions remain outside this slice: future soft-delete/archive and pagination timing.
