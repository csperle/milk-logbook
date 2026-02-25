# 012-workflow-first-navigation

- Status: Implemented

## 1) Goal

Create a clear separation between:
- day-to-day work (prominent, always visible)
- administration/setup (de-emphasized, grouped in one place)

Users should immediately know where to go for regular tasks without seeing admin clutter.

## 2) Global navigation model

### 2.1 Primary work navigation (always visible)

Order:
1. `Yearly Overview` -> `/`
2. `Inbox` -> `/uploads?status=pending_review`
3. `Upload invoice` -> `/upload`
4. `Annual P&L` -> `/reports/annual-pl`

Rules:
- Desktop: horizontal nav in header.
- Mobile: same items in a compact top menu (or bottom tabs if added later).
- Active route gets clear selected state.

### 2.2 Company context (always visible, compact)

- Company context is shown inside `Administration` dropdown as `Active company: <name>`.
- Action opens company selection/management page (`/admin/companies`).
- No standalone company button in header.

### 2.3 Administration (secondary, collapsed)

- Single header item: `Administration`
- Dropdown entries:
  - `Companies` -> `/admin/companies`
  - `Expense types` -> `/admin/expense-types`

Rules:
- No direct admin buttons in primary page content on workflow pages.
- Admin items are one click away but visually low priority.

## 3) Page-level CTA policy

### 3.1 Inbox (`/uploads`)

Prominent:
- pending-review table with direct `Review` action per row

Hidden here:
- admin links/buttons

### 3.2 Upload (`/upload`)

Prominent:
- upload form submit

After success:
- redirect directly to review screen for the uploaded PDF (`/uploads/[id]/review`)

### 3.3 Review (`/uploads/[id]/review`)

Prominent:
- `Save entry and next` (when pending)
- `Save entry`

Hidden here:
- admin links/buttons

### 3.4 Overview (`/`)

Prominent:
- core filters/sort/year

Remove from prominent area:
- `Switch company` button (replace by compact header company control)
- `Expense types` admin button (move to Administration menu)

### 3.5 Annual P&L (`/reports/annual-pl`)

Prominent:
- report controls (year/view/mode)
- optional operational link: `Back to Overview`

De-emphasize:
- admin links (header menu only)

## 4) Header structure (desktop)

Left to right:
1. App name/logo
2. Primary work nav (`Yearly Overview`, `Inbox`, `Upload invoice`, `Annual P&L`)
3. `Administration` dropdown (contains `Active company: <name>` and `Expense types`)

## 5) Copy and label rules

- Use `Inbox` instead of `Queue` in user-facing labels.
- Use `Administration` (explicit wording).
- Keep button text action-oriented (`Review now`, `Back to Inbox`).

## 6) Route-to-nav active mapping

- `/uploads` and `/uploads/[id]/review` -> active tab `Inbox`
- `/upload` -> `Upload invoice`
- `/` -> `Yearly Overview`
- `/reports/annual-pl` -> `Annual P&L`
- `/admin/*` -> no primary tab active; highlight `Administration` menu trigger

## 7) Open questions and proposed decisions

1. Default landing behavior
- Question: should `/` remain default, or redirect users to `Inbox` when pending items exist?
- Proposed decision: keep `/` as default route for consistency and stability; add a prominent `Open Inbox` action and pending count badge in global nav to guide immediate processing work.

2. Active company control behavior
- Question: should active-company control always navigate to `/admin/companies` or open an inline switcher?
- Proposed decision: phase 1 navigates to `/admin/companies` (lowest implementation risk). Inline switcher can be a later enhancement.

3. Inbox tab semantics for non-pending filters
- Question: when `/uploads?status=saved|all` is selected, should `Inbox` tab still be active?
- Proposed decision: yes. Any `/uploads*` route keeps `Inbox` active because it is the same workflow area.

4. Admin page header behavior
- Question: should primary work tabs be hidden on `/admin/*` pages?
- Proposed decision: keep primary tabs visible (inactive) on admin pages to preserve orientation and reduce navigation dead-ends.

5. Guard/no-company states
- Question: what should be prominent when no valid active company context exists?
- Proposed decision: show only minimal workflow nav in disabled state and make `Administration > Companies` the clear primary action until company context is resolved.

6. Mobile navigation pattern
- Question: top compact menu or bottom tab bar?
- Proposed decision: implement compact top menu first (fewer layout changes); defer bottom tab bar unless usability testing shows strong need.

7. Cross-page local action duplication
- Question: after adding global nav, should workflow pages still show local shortcuts?
- Proposed decision: keep only context-critical local actions (for example `Save entry and next`, `Review now`, `Back to Inbox`), remove generic duplicated global nav actions.

8. Terminology migration scope (`Queue` -> `Inbox`)
- Question: rename only visible labels or also internal route/query terms?
- Proposed decision: rename user-facing copy only in this slice; keep routes/query params stable (`/uploads`, `status=pending_review`) to avoid avoidable refactor risk.

## 8) Acceptance criteria

- [x] Workflow pages no longer show prominent admin buttons.
- [x] Primary header always shows day-to-day nav items.
- [x] Admin pages are reachable via `Administration` menu only.
- [x] Company context is always visible and compact within `Administration`.
- [x] Users can complete upload -> review -> next review flow without encountering admin controls.

## 9) Minimal rollout plan

1. Add shared header nav component with primary tabs + company control + admin dropdown.
2. Remove page-level admin CTAs from Overview/P&L/Upload/Inbox/Review screens.
3. Align labels (`Queue` -> `Inbox`) and active-route highlighting.
4. Verify responsive behavior and keyboard navigation for dropdown.
5. Validate main workflows manually (`lint` + `build` + flow check).
