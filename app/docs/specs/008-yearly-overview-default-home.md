# 008-yearly-overview-default-home

- Status: Draft (prototype implemented, pending product sign-off)

## 1) Goal

Make the yearly overview the default screen after a valid active company is selected, so users land directly in a bookkeeping-oriented dashboard instead of a generic landing page.

This view should provide:
- immediate financial orientation for the selected year
- fast access to capture/processing workflows
- practical filtering/sorting for daily bookkeeping review

## 2) Scope (In / Out)

### In

- Replace `/` content with a company-scoped yearly overview dashboard.
- Keep existing active-company guard behavior on `/`.
- Show yearly totals (income, expenses, result).
- Add filter controls:
  - year (required)
  - type (`all`, `income`, `expense`)
- Add sorting controls for entries table.
- Keep core workflow CTAs visible (`Upload invoice`, `Open queue`, `Switch company`).

### Out

- Annual P&L export/generation workflow.
- New server-side query API for overview filters.
- Search by counterparty/text.
- Pagination/virtualized table.
- Edit/delete entry actions.

## 3) UX/Behavior

### 3.1 Default screen behavior

Route:
- `/`

Behavior:
- If active company context is invalid/missing, existing guard redirect behavior remains unchanged.
- If active company context is valid, user lands on yearly overview dashboard for that company.

### 3.2 Overview composition

The screen contains:
- Header:
  - overview title and active company identity
  - workflow shortcuts (`Upload invoice`, `Open queue`, `Switch company`)
- KPI cards for selected year:
  - total income
  - total expenses
  - net result (`income - expenses`)
- Filters/sort controls:
  - `Year` selector (required)
  - `Type` selector (`All entries`, `Income only`, `Expenses only`)
  - `Sort` selector
- Entries table:
  - `Doc #`
  - `Type`
  - `Document date`
  - `Counterparty`
  - `Amount gross`
  - `Source file`

### 3.3 Filtering and sorting

Year filter policy:
- Year is the primary filter and must always be visible.
- Available years are derived from entry `documentDate` values for active company.
- Sort years descending (latest year first).
- If company has no entries, fallback year option is current UTC year.

Type filter policy:
- Applies after year filter.
- `all` includes both entry types.

Sort options:
- `documentDateDesc` (default)
- `documentDateAsc`
- `amountDesc`
- `amountAsc`
- `documentNumberDesc`
- `documentNumberAsc`

Deterministic tie-breaker:
- Use entry `id` as fallback tie-breaker for stable ordering.

Totals policy:
- KPI totals are computed from the currently filtered dataset (selected year + type filter).

## 4) Data and interfaces

No schema changes required.

No new API endpoints required for this slice.

Data source:
- Reuse existing repository method `listAccountingEntriesByCompanyId(companyId)`.
- Perform filtering/sorting in UI layer for this slice.

## 5) Implementation details (prototype)

Implemented draft UI code:
- `src/app/page.tsx`
  - switched to yearly overview as default root content
  - still uses `requireActiveCompanyId()`
  - loads entries with `listAccountingEntriesByCompanyId(activeCompanyId)`
- `src/app/YearlyOverviewClient.tsx`
  - added client-side stateful filter/sort controls
  - added KPI cards + responsive entries table
  - added locale formatting:
    - currency via `Intl.NumberFormat("de-CH", { currency: "CHF" })`
    - date via `toLocaleDateString("de-CH")`

## 6) Product/UX reasoning

1. Why make this the default screen:
- After company selection, the user’s first question is usually “where do we stand this year?”
- A yearly overview answers that immediately and reduces navigation steps.

2. Why year is mandatory primary filter:
- Bookkeeping and tax workflows are year-bounded.
- It prevents mixed-year totals that are hard to reason about.

3. Why include type filter now:
- It supports common review loops (income-only or expense-only checks) with minimal complexity.

4. Why dropdown sort first (instead of clickable headers):
- Lower implementation complexity and clearer deterministic behavior for MVP.
- Easier to evolve later into table-header sorting without changing data semantics.

5. Why client-side filtering/sorting for now:
- Existing data volume in V1 is expected to be small.
- Avoids premature API expansion while preserving clear upgrade path to server-side filtering.

## 7) Acceptance criteria

- [x] `/` shows yearly overview dashboard when active company is valid.
- [x] `/` remains protected by active-company guard behavior.
- [x] Dashboard shows selected-year totals for income, expenses, and result.
- [x] Year filter is present and defaults to latest available year.
- [x] Type filter supports `all`, `income`, `expense`.
- [x] Sort control supports document date, amount, and document number (asc/desc).
- [x] Entries table updates deterministically when filters/sort change.
- [x] Empty-state message is shown when no entries match filters.
- [x] Workflow actions (`Upload invoice`, `Open queue`, `Switch company`) are visible on overview.
- [x] Layout is usable on mobile (stacked) and desktop (wide table/cards).

## 8) Pre-implementation decisions (resolved)

This section resolves the open questions for `008` so implementation can proceed without ambiguity.

- [x] KPI scope: totals **respect the active filters** (`year` + `type`).
- [x] URL state: `year`, `type`, and `sort` are persisted in URL query params for reload/share stability.
- [x] Source file column behavior:
  - Render original filename as the primary label.
  - Provide row action to open the source PDF in a new tab via existing file endpoint.
  - Reuse existing review/file flow behavior; no new endpoint.
- [x] Year fallback:
  - If no entries exist for active company, default to server-computed current UTC year.
  - Pass that year from server component to client component to avoid hydration drift.
- [x] Document number sorting with mixed types (`type=all`):
  - Keep direct document number sort as specified.
  - Use deterministic tie-breakers in order: `documentNumber`, then `documentDate`, then `id`.
  - No additional type grouping is applied in this slice.
- [x] Formatting standardization:
  - Amounts: Swiss CHF formatting (`de-CH`, currency `CHF`, 2 decimals).
  - Dates: Swiss date formatting (`DD.MM.YYYY` via `de-CH` locale).
  - Reuse shared formatting helpers if already present; otherwise add minimal local helpers in this slice.
- [x] Scale guardrail for client-side filtering/sorting:
  - Keep client-side behavior for `008`.
  - Revisit server-side filtering when active-company yearly dataset regularly exceeds ~1,000 rows or UI responsiveness degrades in manual verification.

## 9) Acceptance criteria clarifications

- [x] KPI cards recompute from the same filtered dataset used by the table (`year` + `type`).
- [x] `year`, `type`, and `sort` are reflected in URL query params and restored on reload.
- [x] `Source file` column shows original filename and supports opening the stored PDF.
