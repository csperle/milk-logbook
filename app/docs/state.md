# Project State

- Last updated date: 2026-02-21
- Current goal: implement the next vertical slice: pending upload review queue with capture/processing workflows.
- Active feature spec(s): `docs/specs/006-pending-upload-review-queue.md`.

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
- Invoice upload slice (`003-invoice-pdf-upload-local-storage`) is implemented.
- Upload UI is available at `/upload` and is protected by active-company context guard.
- Upload API endpoint exists: `POST /api/uploads`.
- Upload endpoint enforces:
  - `entryType` validation (`income` | `expense`)
  - max file size `10,485,760` bytes with `413`
  - PDF validation (`%PDF-` signature + MIME/extension rule)
  - deterministic error payload shape `{ error: { code, message } }`
- Local file persistence is implemented under project-root `upload/`.
- Upload metadata is persisted in SQLite table `invoice_uploads`:
  - `company_id`, `entry_type`, `original_filename`, `stored_filename`, `stored_path`, `uploaded_at`.
- Stored filenames are UUID-based and opaque; original filenames are persisted for future user-facing download naming.
- `stored_path` is persisted internally and not exposed in upload success responses.
- No-orphan guarantee is implemented: file write first, DB insert second, with file cleanup on DB failure.
- Company deletion now returns conflict (`409`) when the company is referenced by `invoice_uploads`.
- Manual review/save slice (`005-manual-review-save-from-upload`) is implemented.
- `POST /api/uploads` now persists upload metadata only and redirects users to review flow.
- Review APIs exist:
  - `GET /api/uploads/:id/review`
  - `PUT /api/uploads/:id/review`
  - `POST /api/uploads/:id/save`
- Review page UI is available at `/uploads/[id]/review` and is protected by active-company context guard.
- Draft persistence is implemented in `upload_review_drafts` (1:1 by `upload_id`), resumable across reload/navigation.
- Deterministic draft defaults are used when no draft exists (`Pending extraction`, zero gross, nullable conditional fields).
- Final accounting entry is created only on explicit save action.
- Booking entries persistence is implemented in `accounting_entries` with:
  - sequence key `(company_id, document_year, entry_type)`
  - document numbers starting at `1` per key
  - deterministic unique constraints for numbering and `upload_id`.
- `accounting_entries` links to uploads via `upload_id` (normalized metadata source).
- Final-save validation rules are enforced by `entryType`:
  - income requires `paymentReceivedDate` and forbids `typeOfExpenseId`
  - expense requires valid `typeOfExpenseId` and forbids `paymentReceivedDate`
- Double-save/concurrent save attempts are rejected deterministically with `409 ALREADY_SAVED`.
- Booking entries list UI is available at `/entries` and is protected by active-company context guard.
- Booking entries API endpoint exists: `GET /api/accounting-entries`.
- `GET /api/accounting-entries` is company-scoped via active cookie and sorted by `created_at DESC, id DESC`.
- Home page navigation includes `/entries`.

## What remains
  - Implement next planned features:
  - pending upload review queue (`006`): `/uploads` page, `GET /api/uploads`, and capture/processing guidance
  - AI extraction/review/save on top of the established review/save workflow (after `006`)
  - yearly overview
  - annual P&L

## How to run (dev/validation)
- Dev server: `npm run dev`
- Lint: `npm run lint`
- Build: `npm run build`

## Known issues / open questions
- Product/spec open questions remain outside the active slices: future soft-delete/archive and pagination timing.
- Current UX gap addressed by `006`: no dedicated list/queue page yet for discovering pending drafts without direct upload URLs.
