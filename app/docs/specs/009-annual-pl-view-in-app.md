# 009-annual-pl-view-in-app

- Status: Draft (pre-implementation decisions resolved)

## 1) Goal

Provide a company-scoped, in-app annual profit-and-loss (P&L) view so users can quickly see yearly totals and expense composition without exporting data.

## 2) Scope (In / Out)

### In

- Add a new route: `/reports/annual-pl`.
- Keep existing active-company guard behavior on this route.
- Show annual totals for selected year:
  - total income
  - total expenses
  - annual result (`income - expenses`)
- Show expense breakdown by expense type for selected year.
- Add year selector with deterministic default behavior.
- Persist selected year in URL query params for reload/share stability.
- Add navigation entry point from yearly overview (`/`) to the annual P&L page.
- Keep Swiss formatting rules:
  - CHF amount formatting (`de-CH`, 2 decimals)
  - date formatting where shown (`de-CH`)

### Out

- PDF export or download.
- New backend endpoints for this slice.
- Authentication/authorization changes.
- Pagination, charts, or multi-year comparison views.
- Edit/delete actions for accounting entries.
- Changes to upload/review workflows.

## 3) Interface / API (endpoints and/or UI behavior)

### Route and guard behavior

- Route: `/reports/annual-pl`.
- If active company context is missing/invalid, existing company guard redirect behavior remains unchanged.
- If active company context is valid, render annual P&L for that company.

### UI behavior

- Header shows:
  - page title (`Annual P&L`)
  - active company identity
  - quick actions: `Back to overview (/)`, `Upload invoice (/upload)`, `Open queue (/uploads?status=pending_review)`, `Switch company (/admin/companies)`
- Controls:
  - Year selector (required).
- Year selection policy:
  - available years are derived from `accounting_entries.document_year` for active company.
  - years are sorted descending.
  - if no entries exist, fallback year is current UTC year.
  - selected year is reflected in `?year=YYYY` and restored from URL on reload.
- KPI cards (selected year):
  - Total income
  - Total expenses
  - Annual result
- Expense breakdown table (selected year, expense entries only):
  - columns: Expense type, Amount, Share of total expenses
  - rows sorted by Amount descending
  - deterministic tie-breaker: expenseTypeText ascending, then typeOfExpenseId ascending (null last)
  - include bucket `Unassigned` for expense entries with `type_of_expense_id = null`
  - `Unassigned` row is shown only when at least one selected-year expense entry has null `type_of_expense_id`
- Negative-amount presentation:
  - values are displayed as persisted (no sign inversion).
  - expense rows with negative amount show a small `Negative amount` warning label in the breakdown table.
- Empty-state behavior:
  - if selected year has no entries, show explicit empty-state message and zero values in KPI cards.

### API behavior

- No new API endpoints for this slice.
- Data is sourced from existing persistence/repository layer for active company accounting entries.

## 4) Data model (new/changed fields/tables)

- No schema changes required.
- No new tables required.
- No field additions required.
- Existing fields used:
  - `accounting_entries.company_id`
  - `accounting_entries.document_year`
  - `accounting_entries.document_date` (display only, if needed)
  - `accounting_entries.entry_type`
  - `accounting_entries.amount_gross`
  - `accounting_entries.type_of_expense_id`
  - `expense_types.id`
  - `expense_types.expense_type_text`

## 5) Edge cases

- No entries for active company:
  - year selector shows current UTC year only.
  - KPI cards show `CHF 0.00`.
  - breakdown shows empty-state message.
- Entries exist, but selected year has no rows:
  - KPI cards show `CHF 0.00`.
  - breakdown empty-state shown.
- Expense entries with missing `type_of_expense_id`:
  - grouped under `Unassigned`.
- Amount sign handling:
  - totals use persisted `amount_gross` values as-is.
  - no sign inversion logic is applied in this slice.
- Rounding/precision:
  - all totals and grouped amounts are computed in integer cents and formatted to 2 decimals.
- Determinism:
  - identical amounts in breakdown use deterministic tie-breakers as specified above.

## 6) Acceptance criteria (checkboxes)

- [ ] `/reports/annual-pl` renders for valid active company context.
- [ ] `/reports/annual-pl` remains protected by existing active-company guard behavior.
- [ ] Year selector is visible, required, and defaults to latest available year (or current UTC year when no entries exist).
- [ ] Selected year is persisted in URL query param `year` and restored on reload.
- [ ] KPI cards show selected-year totals for income, expenses, and annual result.
- [ ] Expense breakdown lists selected-year expense totals grouped by expense type.
- [ ] Expense breakdown includes `Unassigned` bucket when null expense type references exist in selected year.
- [ ] Breakdown row ordering is deterministic (amount desc, then expenseTypeText asc, then typeOfExpenseId asc, null last).
- [ ] Breakdown shows `Share of total expenses` for each row.
- [ ] Negative expense amounts are shown as-is and flagged with a `Negative amount` warning label.
- [ ] Empty-state messaging is shown when selected year has no entries.
- [ ] Navigation link from `/` to `/reports/annual-pl` is visible.
- [ ] Page is usable on mobile and desktop layouts.
- [ ] `npm run lint` and `npm run build` pass after this slice.

## 7) Pre-implementation decisions (resolved)

- [x] URL state: `year` is persisted in query params to match existing yearly overview behavior and improve reload/share stability.
- [x] Breakdown percentage: `Share of total expenses` is always visible by default in the breakdown table.
- [x] Negative expenses: values are not transformed; they are displayed as persisted and flagged inline with a warning label.
- [x] Canonical year source: use `accounting_entries.document_year` for year list/filtering; use `document_date` only for display contexts.
- [x] Unassigned policy: support and render `Unassigned` only when selected-year data contains null `type_of_expense_id`.
- [x] Precision policy: compute with integer cents in this slice to avoid floating-point drift and keep totals deterministic.
