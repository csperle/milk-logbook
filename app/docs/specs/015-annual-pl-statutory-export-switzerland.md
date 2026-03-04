# 015-annual-pl-statutory-export-switzerland

- Status: Draft

## 1) Goal

Provide a minimal annual P&L workflow for Swiss `Einzelunternehmen` that:

- satisfies a compliance-oriented minimum presentation for annual reporting, and
- uses the simplified P&L row structure already defined in `010` section `5.2`.

This slice intentionally avoids full statutory line-by-line Art. 959b implementation.

## 2) Legal baseline (minimum for this slice)

This feature is scoped to Swiss Code of Obligations (OR, SR 220) minimum constraints relevant to a simple annual P&L output:

- Art. 957: accounting obligation and simplified regime threshold for sole proprietorships.
- Art. 958: annual accounts include a P&L for entities under full accounting; preparation/signature obligations remain outside software enforcement.
- Art. 958d(2): prior-year comparative figure must be shown.
- Art. 958d(3): reporting language and currency principles.
- Art. 958c: clarity/consistency/no-offsetting principles.

Reference links:

- Fedlex OR (official text): https://fedlex.data.admin.ch/filestore/fedlex.data.admin.ch/eli/cc/27/317_321_377/20250708/de/pdf-a/fedlex-data-admin-ch-eli-cc-27-317_321_377-20250708-de-pdf-a.pdf
- Art. 957/958/958d (readable mirrors):
  - https://www.droit-bilingue.ch/en-de/3/22/957-958.html
  - https://lawbrary.ch/law/art/OR-v2025.07-de-art-958d/

## 3) Scope (In / Out)

### In

- Keep route `/reports/annual-pl` as the single annual P&L surface.
- Add/keep export action for annual P&L (PDF).
- Use fixed simplified row order from `010` §5.2.
- Show current year and prior year values side-by-side.
- Use CHF formatting and deterministic calculation rules.
- Persist export snapshots for traceability.

### Out

- Full statutory Art. 959b minimum-line export.
- Balance sheet or notes generation.
- Legal-form-specific filing packs.
- Audit/revision workflows.

## 4) Applicability and reporting mode

- Primary target: `Einzelunternehmen`.
- This slice supports two practical modes:
  - `full-accounting mode` (Art. 957(1) context): export is compliance-oriented annual P&L output.
  - `simplified-record mode` (Art. 957(2) context): export is management reporting output and must not be labeled as a legally required statutory statement.
- No legal-threshold auto-detection is implemented in this slice; applicability is based on company profile configuration.

## 5) Required P&L structure and order (from 010 §5.2)

The exported/visible statement must follow this exact order:

1. Revenue
2. Direct Costs
3. Gross Profit
4. Operating Expenses
5. Operating Result
6. Financial / Other
7. Taxes
8. Net Profit / Loss

Rules:

- No reordering.
- Summary lines (`Gross Profit`, `Operating Result`, `Net Profit / Loss`) are always shown.
- Zero lines may be hidden in UI summary view, but exported PDF must show all 8 rows.

## 6) Data mapping (minimal, aligned with spec 011)

Given current model:

- `Revenue` = sum of `income` entries.
- `Direct Costs`, `Operating Expenses`, `Financial / Other`, `Taxes` = sums from `expense` entries by existing `expense_pl_category` mapping.
- `Gross Profit` = `Revenue - Direct Costs`.
- `Operating Result` = `Gross Profit - Operating Expenses`.
- `Net Profit / Loss` = `Operating Result - Financial / Other - Taxes`.

Computation policy:

- compute in integer rappen,
- round only at display/export boundary,
- no sign inversion.
- negative source amounts are displayed as persisted.

## 7) Presentation requirements

- Columns:
  - line item
  - amount (selected year)
  - amount (prior year)
- Currency: CHF only.
- Language for labels: German (`de`) in v1.
- Prior year = `selectedYear - 1`.
- Deterministic row order always enforced.
- Export values must be generated from the same summary computation model as `/reports/annual-pl`.

## 8) Export requirements

- Format: PDF only.
- Filename: `annual-pl-{companySlug}-{year}-simple-{generatedAtUtc}.pdf`.
- Export metadata persisted in `annual_pl_exports`:
  - `id`, `company_id`, `fiscal_year`, `format`, `currency`, `generated_at`, `file_path`, `checksum_sha256`.

## 9) API/UI changes

### UI

- `/reports/annual-pl`:
  - `Export annual P&L (PDF)` action.
  - optional export history list with download links.
  - mode badge text:
    - `Compliance-oriented (full accounting)` for full-accounting mode
    - `Management report (simplified records)` for simplified-record mode

### API

- `POST /api/reports/annual-pl/export`
  - request: `{ year, mode: "simple_einzelunternehmen" }`
  - response: `201` with export metadata and file URL.
- `GET /api/reports/annual-pl/exports?year=YYYY`
- `GET /api/reports/annual-pl/exports/:id/file`

Deterministic errors:

- `INVALID_EXPORT_YEAR`
- `EXPORT_SOURCE_DATA_MISSING`
- `EXPORT_GENERATION_FAILED`
- `EXPORT_NOT_FOUND`

## 10) Edge cases

- No entries in selected year and prior year:
  - export allowed with all rows = `CHF 0.00`.
- No prior-year entries:
  - prior-year column is `CHF 0.00`.
- Unassigned expense categories:
  - include in `Operating Expenses` by default.
- Year outside deterministic bounds (non-4-digit or invalid):
  - reject with `INVALID_EXPORT_YEAR`.

## 11) Acceptance criteria

- [ ] Annual P&L uses exactly the 8-row order from `010` §5.2.
- [ ] Export PDF includes current and prior-year amounts for all 8 rows.
- [ ] Export is generated deterministically from existing annual P&L calculations.
- [ ] Export snapshot is persisted with checksum and download path.
- [ ] Net Profit / Loss formula is aligned with `011` (`Operating Result - Financial / Other - Taxes`).
- [ ] Export clearly indicates reporting mode (`full-accounting` vs `simplified-record`) to avoid legal-label ambiguity.
- [ ] Build and lint pass.

## 12) Pre-implementation decisions (resolved)

- Keep structure aligned with `010` §5.2 (no Art. 959b full expansion).
- German labels only for v1 export.
- CHF only.
- PDF only.
