# 010-improved-annual-pl-view

  - Status: Draft (proposed replacement for current annual P&L UI)

  ## 1) Goal

  Provide a business-usable annual P&L page that supports:

  - fast yearly performance reading
  - prior-year comparison
  - expense-driver analysis
  - compliance-friendly presentation structure (in-app only, no export in this slice)
  - clear management reporting boundaries (not a statutory filing output)

  ## 2) Scope (In / Out)

  ### In

  - Upgrade /reports/annual-pl UI and computation model.
  - Keep existing active-company guard behavior.
  - Add comparison mode: selected year vs prior year.
  - Add canonical P&L sections with deterministic row ordering.
  - Add margin metrics and common-size (% of revenue) display.
  - Add summary/details toggle for management vs accountant workflows.
  - Preserve Swiss formatting (de-CH, CHF, 2 decimals, DD.MM.YYYY where dates appear).
  - Keep URL-persisted state for year, view, mode.

  ### Out

  - PDF export/download.
  - New authentication/authorization behavior.
  - New edit/delete accounting actions.
  - AI extraction changes.
  - Charts (table-first delivery).

  ## 3) Route and state

  - Route: /reports/annual-pl
  - Required query params behavior:
      - year=YYYY (selected fiscal year)
      - view=summary|details (default summary)
      - mode=actual|compare|common_size (default compare)
  - Defaults:
      - year: latest available document_year for active company; fallback current UTC year if no entries.
      - view: summary
      - mode: compare
  - Invalid query values are normalized to defaults and URL is corrected deterministically.

  ## 4) Information architecture

  Page sections in order:

  1. Header/context bar
  2. KPI strip
  3. Controls row
  4. P&L statement table
  5. Empty or warning states (when applicable)

  ### 4.1 Header/context bar

  Must show:

  - Title: Annual Profit & Loss
  - Active company name
  - Fiscal year label
  - Actions:
      - Back to overview (/)
      - Upload invoice (/upload)
      - Open queue (/uploads?status=pending_review)
      - Switch company (/admin/companies)
      - Export (coming soon) placeholder (disabled, non-functional in this slice)

  ### 4.2 KPI strip

  Cards (always visible):

  - Revenue (selected year)
  - Expenses (selected year, absolute amount)
  - Net Result (selected year)
  - Net Margin (netResult / revenue, show - when revenue is 0)

  When mode=compare, each card also shows:

  - prior-year value
  - delta amount
  - delta percent (show - when prior-year base is 0)

  ### 4.3 Controls row

  Controls:

  - Year selector (required)
  - View selector: Summary, Details
  - Mode selector:
      - Actual (single-year)
      - Compare (year vs prior year)
      - Common-size (% of revenue)

  ## 5) P&L table design

  ### 5.1 Columns by mode

  - actual:
      - Line item
      - Amount (YYYY)
      - % of Revenue
  - compare:
      - Line item
      - Amount (YYYY)
      - Amount (YYYY-1)
      - Δ CHF
      - Δ %
      - % of Revenue (YYYY)
  - common_size:
      - Line item
      - % of Revenue (YYYY)
      - % of Revenue (YYYY-1)
      - Δ pp (percentage-point change)

  ### 5.2 Canonical row order (summary view)

  1. Revenue
  2. Direct Costs (optional section; hidden if always 0 in both periods)
  3. Gross Profit
  4. Operating Expenses
  5. Operating Result
  6. Financial / Other (optional; hidden if always 0)
  7. Taxes (optional; hidden if always 0)
  8. Net Profit / Loss

  ### 5.3 Details view rows

  - Expands revenue and expense sections into detail rows.
  - Revenue detail rows:
      - one row per income counterparty (`counterpartyName`) under `Revenue`
      - rows are grouped by normalized counterparty name (trimmed, case-insensitive)
      - income entries with the same normalized counterparty name are summed into one row
      - line-item label is the counterparty name
      - deterministic sorting: amount descending (selected year), tie-breaker counterparty name ascending
  - Expense detail rows:
      - one row per expense type under `Operating Expenses` from `expense_types`
  - Deterministic sorting inside details:
      - amount descending (selected year)
      - tie-breaker expenseTypeText ascending
      - tie-breaker typeOfExpenseId ascending (null last)
  - Unassigned bucket:
      - shown only when entries with type_of_expense_id = null exist in selected scope.

  ### 5.4 Row styling semantics

  - Subtotal/result rows (Gross Profit, Operating Result, Net Profit / Loss) are emphasized.
  - Negative-amount source values are displayed as persisted (no sign inversion).

  ## 6) Data mapping rules (V1 with current schema)

  Given current data (entry_type, amount_gross, type_of_expense_id, counterparty_name):

  - Revenue = sum(amount_gross) where entry_type = income
  - Operating Expenses = sum(amount_gross) where entry_type = expense
  - Net Profit / Loss = Revenue - Operating Expenses
  - Direct Costs, Financial / Other, Taxes:
      - default to 0.00 in V1 unless future categorization fields are introduced
      - section hidden in summary if both current/prior are zero
  - Gross Profit = Revenue - Direct Costs (equals Revenue in V1 default mapping)
  - Operating Result = Gross Profit - Operating Expenses

  Computation policy:

  - compute in integer cents
  - round only at display boundary
  - deterministic null/zero handling for percentage fields

## 7) Business semantics and labels

- All amounts treated as CHF (no currency selector).
- Comparison semantics:
    - prior year is always selectedYear - 1
- Percent calculations:
      - Δ % = (current - prior) / abs(prior); show - if prior = 0
      - % of Revenue = line / revenue; show - if revenue = 0

  ## 8) Empty, warning, and edge states

  - No entries for company:
      - KPI = CHF 0.00 / - margins
      - table shows empty state with CTA to upload
  - Selected year has no entries, prior year has entries:
      - show zeros for current, prior populated
      - keep compare mode active
  - Selected year has entries, prior year missing:
      - prior columns show CHF 0.00
      - Δ % shows - where prior is 0
  - Unassigned expenses present:
      - warning banner: Some expenses are unassigned and grouped under "Unassigned".
  - Extremely large values:
      - no scientific notation; always localized currency formatting

  ## 9) Accessibility and responsive behavior

  - Mobile:
      - KPI cards stack
      - table supports horizontal scroll with sticky first column (Line item)
  - Desktop:
      - full-width table with aligned numeric columns
  - Accessibility:
      - controls have labels
      - variance color is never sole signal (icons/text labels included)
      - keyboard operable selectors and links

  ## 10) Acceptance criteria

  - [ ] /reports/annual-pl supports year, view, mode URL state and restores on reload.
  - [ ] KPI strip shows current-year values and compare deltas in compare mode.
  - [ ] Table supports three modes: actual, compare, common-size.
  - [ ] Summary view uses canonical row order and required subtotal rows.
  - [ ] Details view expands revenue rows by income counterparty and groups duplicate counterparties deterministically.
  - [ ] Details view expands expense rows by expense type with deterministic sorting.
  - [ ] Statement rows that have source entries provide drill-through navigation to filtered overview entries.
  - [ ] Source-entry drill-through preserves year context and allows opening source PDFs through existing file actions.
  - [ ] Unassigned expense bucket appears only when applicable.
  - [ ] Percentage and delta calculations follow defined zero-base rules.
  - [ ] Swiss formatting is applied consistently for amounts/dates.
  - [ ] Empty and warning states render as specified.
  - [ ] Mobile and desktop layouts remain usable.
  - [ ] Existing active-company guard behavior remains unchanged.
  - [ ] npm run lint and npm run build pass after implementation.

  ## 11) Implementation notes (non-binding)

  Suggested files to touch:

  - src/app/reports/annual-pl/page.tsx
  - src/app/reports/annual-pl/AnnualPlPageClient.tsx
  - src/lib/accounting-entries-repo.ts (only if extra aggregation helper is needed)
  - optional shared formatter/util if duplicated logic emerges

  No schema migration required for this slice.
