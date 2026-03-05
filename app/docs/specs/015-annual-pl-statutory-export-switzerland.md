# 015-annual-pl-statutory-export-switzerland

- Status: Draft

## 1) Goal

Provide a minimal annual P&L workflow for Swiss `Einzelunternehmen` that:

- satisfies a minimum presentation for simplified records (`Milchbuechleinrechnung`), and
- uses the simplified P&L row structure already defined in `010` section `5.2`.

This slice intentionally avoids full statutory line-by-line Art. 959b implementation.

## 2) Legal baseline (minimum for this slice)

This feature is scoped to Swiss Code of Obligations (OR, SR 220) minimum constraints relevant to a simple annual P&L output:

- Art. 957: accounting obligation and simplified regime threshold for sole proprietorships.
- Art. 958: annual accounts obligations are acknowledged but remain outside software enforcement for this simplified-records slice.
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
- Generate export on demand (fire-and-forget).

### Out

- Full statutory Art. 959b minimum-line export.
- Balance sheet or notes generation.
- Legal-form-specific filing packs.
- Audit/revision workflows.

## 4) Applicability

- Primary target: `Einzelunternehmen`.
- This slice supports only simplified records (`Milchbuechleinrechnung`, Art. 957(2) context).
- Export output is management reporting output and must not be labeled as a legally required statutory statement.
- No legal-threshold auto-detection is implemented in this slice.

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
- Language policy in v1:
  - PDF row labels and PDF title/subtitle are German (`de`).
  - Existing on-screen annual P&L UI language remains unchanged in this slice (no forced UI i18n rewrite).
- Prior year = `selectedYear - 1`.
- Deterministic row order always enforced.
- Export values must be generated from the same summary computation model as `/reports/annual-pl`.
- Export dataset source is canonical summary data only:
  - export ignores `view` and `mode` URL query parameters,
  - export always uses the fixed 8-row summary model with current year and prior year columns.

### PDF visual design requirements (mandatory)

The export must be presentation-quality and not look like a raw/plain table.

- Visual hierarchy:
  - report title at top with strong visual weight.
  - subtitle/context row directly below title:
    - company name,
    - fiscal year,
    - comparative year (`Vorjahr`),
    - scope label `Management report (Milchbüchleinrechnung)`.
  - generation timestamp in smaller, de-emphasized text.
- Typography:
  - use a clean, professional sans-serif font.
  - title: semibold/bold.
  - column headers: semibold.
  - body rows: regular.
  - subtotal/total rows (`Gross Profit`, `Operating Result`, `Net Profit / Loss`): semibold.
  - avoid decorative or script fonts.
- Table composition:
  - fixed 3-column layout:
    - left: row label,
    - middle: selected year amount,
    - right: prior year amount.
  - labels are left-aligned.
  - amount columns are right-aligned with tabular-number style where available.
  - maintain consistent row height and padding.
- Indentation and grouping:
  - base rows (`Revenue`, `Direct Costs`, `Operating Expenses`, `Financial / Other`, `Taxes`) on base indent.
  - computed rows (`Gross Profit`, `Operating Result`, `Net Profit / Loss`) visually distinguished via stronger weight and separator lines, not deeper indentation.
- Lines and separators:
  - header row has top and bottom rule.
  - subtle horizontal rules between regular rows.
  - stronger separator before each computed row.
  - final `Net Profit / Loss` row has strongest emphasis (weight + rule treatment).
  - avoid vertical grid lines unless needed for readability.
- Color and contrast:
  - monochrome/print-safe palette (black/charcoal/gray).
  - do not rely on color alone for semantic meaning.
  - maintain high contrast for printed readability.
- Numeric presentation:
  - always render values as `CHF` with Swiss formatting (`CHF 12'345.67`).
  - show negative values with a deterministic style (`-CHF 1'234.00`).
  - all numbers in amount columns align on the right edge.
- Spacing and page layout:
  - A4 portrait layout.
  - generous but compact margins suitable for print and digital.
  - keep the full 8-row statement together on one page in normal cases.
  - avoid orphan header/row artifacts.
- Footer:
  - include a small neutral footer note clarifying simplified-report scope (non-statutory labeling).

## 8) Export requirements

- Format: PDF only.
- Filename: `annual-pl-{companySlug}-{year}-simple-{generatedAtUtc}.pdf`.
- Filename rules (deterministic):
  - `companySlug`: lowercase ASCII slug from company name using `[a-z0-9-]` only; trim leading/trailing `-`; collapse repeated `-`; fallback `company` when empty after normalization.
  - `generatedAtUtc`: UTC timestamp in `YYYYMMDDTHHmmssZ` format (example: `20260304T184512Z`).
- No export persistence:
  - no DB table,
  - no snapshot JSON storage,
  - no checksum storage.
- Export is generated and streamed immediately from canonical summary data.

## 9) API/UI changes

### UI

- `/reports/annual-pl`:
  - `Export annual P&L (PDF)` action.
  - fixed scope badge text:
    - `Management report (Milchbüchleinrechnung)`

### API

- `POST /api/reports/annual-pl/export`
  - request: `{ year }`
  - response: `200` PDF stream with download `Content-Disposition`.

Deterministic errors:

- `INVALID_EXPORT_YEAR`
- `EXPORT_GENERATION_FAILED`

## 10) Edge cases

- No entries in selected year and prior year:
  - export allowed with all rows = `CHF 0.00`.
- No prior-year entries:
  - prior-year column is `CHF 0.00`.
- Unassigned expense categories:
  - include in `Operating Expenses` by default.
- Year outside deterministic bounds (non-4-digit or invalid):
  - reject with `INVALID_EXPORT_YEAR`.
- Year validation bounds:
  - accepted year is integer `1900..9999` only.
- Source-data missing behavior:
  - `EXPORT_SOURCE_DATA_MISSING` is not used in this slice because zero-valued exports are valid.

## 11) Acceptance criteria

- [ ] Annual P&L uses exactly the 8-row order from `010` §5.2.
- [ ] Export PDF includes current and prior-year amounts for all 8 rows.
- [ ] Export is generated deterministically from the canonical summary computation model (independent of UI `view`/`mode`).
- [ ] Export is generated on demand and returned directly without DB persistence.
- [ ] PDF output follows the mandatory visual design requirements (hierarchy, typography, alignment, separators, emphasis, and print-safe styling).
- [ ] Net Profit / Loss formula is aligned with `011` (`Operating Result - Financial / Other - Taxes`).
- [ ] Export clearly indicates simplified-record scope (`Milchbüchleinrechnung`) and avoids statutory-label ambiguity.
- [ ] Build and lint pass.

## 12) Pre-implementation decisions (resolved)

- Keep structure aligned with `010` §5.2 (no Art. 959b full expansion).
- German labels are required for PDF export output; existing screen language stays unchanged in this slice.
- CHF only.
- PDF only.
- Export errors in this slice: `INVALID_EXPORT_YEAR`, `EXPORT_GENERATION_FAILED`.
