# 011-expense-type-pl-categorization

- Status: Draft

## 1) Goal

Make annual P&L calculations structurally accurate by introducing mandatory P&L categorization for expense types and using that categorization in saved expense entries.

This slice ensures:
- Gross Profit is calculated from Revenue minus Direct Costs.
- Operating Result, Financial/Other, Taxes, and Net Profit/Loss are computed from explicit categories.
- New expense types cannot be created without category assignment.

## 2) Scope (In / Out)

### In

- Extend `expense_types` with a required P&L category.
- Require category assignment when creating expense types.
- Allow updating category for existing expense types.
- Persist expense category snapshot on `accounting_entries` at save time.
- Update annual P&L computations to use categorized expense sums.
- Keep existing active-company guard and current routes.

### Out

- No handling for unassigned legacy entries in this slice (dev DB reset assumed).
- No AI extraction changes.
- No export/download implementation.
- No authentication/authorization changes.

## 3) Domain model changes

### 3.1 Expense P&L category enum

Add canonical values:
- `direct_cost`
- `operating_expense`
- `financial_other`
- `tax`

### 3.2 expense_types changes

Add required field:
- `pl_category` (`TEXT NOT NULL`)

Validation rules:
- must be one of the canonical enum values
- required on create
- required on update

### 3.3 accounting_entries changes

Add field:
- `expense_pl_category` (`TEXT NULL`)

Rules:
- income entries: `expense_pl_category` must be `NULL`
- expense entries: `expense_pl_category` must be set from selected expense type category at save time
- value is a snapshot for historical stability (later expense-type edits do not mutate old entries)

## 4) API and UI behavior

### 4.1 Expense type API

#### GET /api/expense-types

Response items now include:
- `id`
- `expenseTypeText`
- `plCategory`
- `createdAt`
- `updatedAt`

Ordering behavior remains unchanged.

#### POST /api/expense-types

Request body:
- `expenseTypeText` (required, existing trim/non-empty/length/uniqueness rules)
- `plCategory` (required enum)

Validation:
- missing/invalid `plCategory` returns `400` with deterministic error code

#### PUT /api/expense-types/:id

Introduce/update endpoint behavior for editing:
- `expenseTypeText` (optional; same validation when provided)
- `plCategory` (required for update request in this slice)

Deterministic statuses:
- `200` updated
- `400` validation error
- `404` not found
- `409` duplicate text conflict (if text update collides)

### 4.2 Expense type admin UI (/admin/expense-types)

Enhancements:
- Add required category selector in create form.
- Show category column in list.
- Add edit action to update category (and optionally text).
- Keep reorder and delete behavior unchanged.

### 4.3 Review/save workflow

On `POST /api/uploads/:id/save` for expense entries:
- require `typeOfExpenseId` as before
- resolve expense type and read `plCategory`
- persist `accounting_entries.expense_pl_category` from resolved type

If selected expense type is missing at save time:
- return deterministic validation/not-found error (existing conventions)

## 5) Annual P&L computation rules

Given selected year `Y` and prior year `Y-1`:

- `Revenue` = sum(`amount_gross`) where `entry_type = income`
- `Direct Costs` = sum(`amount_gross`) where `entry_type = expense` and `expense_pl_category = direct_cost`
- `Gross Profit` = `Revenue - Direct Costs`
- `Operating Expenses` = sum(`amount_gross`) where `entry_type = expense` and `expense_pl_category = operating_expense`
- `Operating Result` = `Gross Profit - Operating Expenses`
- `Financial / Other` = sum(`amount_gross`) where `entry_type = expense` and `expense_pl_category = financial_other`
- `Taxes` = sum(`amount_gross`) where `entry_type = expense` and `expense_pl_category = tax`
- `Net Profit / Loss` = `Operating Result - Financial / Other - Taxes`

Display/sign policy remains unchanged:
- amounts displayed as persisted (no sign inversion)
- CHF formatting remains Swiss (`de-CH`, 2 decimals)

## 6) Data migration and rollout assumptions

Assumption for this slice:
- development database will be reset before validation, so no legacy unassigned category remediation is required

Migration requirements:
- schema migration to add `expense_types.pl_category` (required)
- schema migration to add `accounting_entries.expense_pl_category` (nullable)

No backfill logic is required under the reset-DB assumption.

## 7) Edge cases

- Creating expense type without category: rejected (`400`).
- Invalid category value: rejected (`400`).
- Expense save where selected expense type was deleted concurrently: deterministic failure (not found/conflict based on existing API style).
- Income entries must never receive `expense_pl_category`.

## 8) Acceptance criteria

- [ ] `expense_types` schema includes required `pl_category` constrained to canonical enum values.
- [ ] `accounting_entries` schema includes `expense_pl_category` snapshot field.
- [ ] `POST /api/expense-types` rejects missing/invalid `plCategory`.
- [ ] `GET /api/expense-types` returns `plCategory` for each item.
- [ ] `/admin/expense-types` create flow requires category assignment.
- [ ] `/admin/expense-types` displays category for existing rows.
- [ ] Expense save persists `expense_pl_category` from selected expense type.
- [ ] Annual P&L summary rows compute from category-based sums (Direct Costs, Operating Expenses, Financial/Other, Taxes).
- [ ] Gross Profit, Operating Result, and Net Profit/Loss reflect categorized sums correctly.
- [ ] Existing company-context guard behavior remains unchanged.
- [ ] `npm run lint` and `npm run build` pass after implementation.

## 9) Suggested implementation files (non-binding)

- `src/lib/db.ts` (schema migration)
- `src/lib/expense-types-repo.ts`
- `src/app/api/expense-types/route.ts`
- `src/app/api/expense-types/[id]/route.ts`
- `src/app/admin/expense-types/ExpenseTypesAdminClient.tsx`
- `src/lib/accounting-entries-repo.ts`
- `src/app/api/uploads/[id]/save/route.ts`
- `src/app/reports/annual-pl/AnnualPlPageClient.tsx`
