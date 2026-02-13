# Project State

- Last updated date: 2026-02-13
- Current goal: complete and stabilize the first vertical slice: Expense Type Administration.
- Active feature spec(s): `docs/specs/001-expense-types-admin.md`.

## What is implemented
- Expense type admin UI is available at `/admin/expense-types`.
- API endpoints exist: `GET /api/expense-types`, `POST /api/expense-types`, `DELETE /api/expense-types/:id`.
- SQLite persistence is implemented via `better-sqlite3` with local DB file `data/app.db`.
- Expense type creation enforces trim/non-empty validation and case-insensitive uniqueness.
- Expense type list is returned in stable order (`createdAt` ascending, then id).
- Delete flow includes confirmation in UI and deterministic API statuses (`400/404/409/204`).
- Deletion is blocked when an expense type is referenced by `accounting_entries.type_of_expense_id`.

## What remains
- Update root/home navigation so admin route is discoverable from `/`.
- Add/update docs for API contract examples and local data reset workflow.
- Implement next planned features (invoice upload/extraction/review/save, yearly overview, P&L).
- Introduce a proper test runner and automated tests for API + UI behavior.

## How to run (dev/tests)
- Dev server: `npm run dev`
- Lint: `npm run lint`
- Build: `NODE_ENV=production npm run build`

## Known issues / open questions
- `npm run build` can fail in this environment when `NODE_ENV` is non-standard; use `NODE_ENV=production`.
- Product/spec open questions remain: max length for `expenseTypeText`, future soft-delete/archive, and pagination timing.
