# Project State

- Last updated date: 2026-02-17
- Current goal: implement the next vertical slice: Company Context Guard.
- Active feature spec(s): `docs/specs/002-company-context-guard.md`.

## What is implemented
- Expense type admin UI is available at `/admin/expense-types`.
- Root/home navigation now links to `/admin/expense-types`.
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
- Implement company management and mandatory active-company context guard per `002-company-context-guard`:
  - Companies CRUD (list/create/delete) with deterministic API statuses
  - `/admin/companies` page with active-company selection
  - Cookie-based `activeCompanyId` persistence and guard routing behavior
  - Invalid/missing active-company recovery and fallback selection behavior
- After this slice: invoice upload/extraction/review/save, yearly overview, P&L.

## How to run (dev/validation)
- Dev server: `npm run dev`
- Lint: `npm run lint`
- Build: `npm run build`

## Known issues / open questions
- Product/spec open questions remain outside this slice: future soft-delete/archive and pagination timing.
