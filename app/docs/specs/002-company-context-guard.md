# 002 Company Context Guard

## 1) Goal
Establish a mandatory active-company context for the app, and introduce minimal company administration so the app cannot be used without a known active company.

## 2) Scope (In / Out)

### In
- Add minimal company management (create, list, delete).
- Add active company selection UX.
- Persist active company in a browser cookie.
- Enforce route-level guard behavior:
  - If no companies exist, force user to company administration.
  - If companies exist but no active company is selected, force user to select one.
  - No non-company-admin page is usable until active company is known.
- Define deterministic behavior when active company becomes invalid (deleted/missing).

### Out
- Authentication/authorization.
- Company profile fields beyond minimal identity.
- Multi-user synchronization semantics.
- Invoice upload, extraction, yearly overview, and P&L implementation.
- Migration of existing domain features to strict company scoping (unless required only for guarding access).

## 3) Interface / API (endpoints and/or UI behavior)

### API Endpoints
- `GET /api/companies`
  - Returns all companies ordered by `createdAt` ascending.
  - `200 OK` with array payload.
- `POST /api/companies`
  - Creates a new company.
  - Validates `name` as required, trimmed, non-empty, max length 100.
  - Rejects duplicate names case-insensitively (trim-insensitive).
  - Responses:
    - `201 Created` on success
    - `400 Bad Request` on validation failure
    - `409 Conflict` on duplicate
- `DELETE /api/companies/:id`
  - Deletes a company by id.
  - Responses:
    - `204 No Content` on success
    - `404 Not Found` if id does not exist
    - `409 Conflict` if deletion is blocked by existing references

### UI Routes and Guard Behavior
- Company administration route: `/admin/companies`.
- Active company is persisted in a browser cookie under one stable key (e.g. `activeCompanyId`).
- Guard rules for all app routes except `/admin/companies`:
  - If company count is `0`: redirect to `/admin/companies`.
  - If company count is `>0` and no valid active company is persisted: redirect to `/admin/companies`.
  - If persisted active company id does not exist in DB: treat as missing active company and redirect to `/admin/companies`.
- `/admin/companies` behavior:
  - Shows company list.
  - Allows create/delete.
  - Requires active-company selection immediately when at least one company exists and no valid active company is set.
  - If first company is created and it is the only company, it is auto-selected as active.
  - If active company is deleted:
    - If other companies exist, select deterministic fallback (oldest by `createdAt`) and persist it.
    - If none exist, clear active-company cookie.
  - User cannot leave `/admin/companies` to other app routes until a valid active company exists.

## 4) Data model (new/changed fields/tables)

### New Table: `companies`
- `id` (primary key)
- `name` (required)
- `normalized_name` (required, unique; lowercase + trimmed for uniqueness checks)
- `created_at` (required timestamp)
- `updated_at` (required timestamp)

### Persisted client/server context state
- `activeCompanyId` stored in cookie (string/integer id representation).
- Cookie is the source of truth for route guards and server-side checks.

### Constraints
- Unique constraint on `normalized_name`.
- Name uniqueness is global and permanent; if soft-delete is introduced later, deleted company names remain reserved and cannot be reused.

## 5) Edge cases
- First-time user with empty DB and no active company: must land on `/admin/companies` and cannot proceed until at least one company exists.
- First company created: auto-set as active when it is the only company.
- Persisted active id is malformed/corrupt: treat as no active company.
- Persisted active id references deleted/missing company: clear/ignore and require immediate re-selection on `/admin/companies`.
- User deep-links directly to a non-admin route without active company: must be redirected.
- Active company deleted:
  - With remaining companies: auto-fallback to oldest company and persist it.
  - With no remaining companies: clear active company and force `/admin/companies`.
- Multiple browser tabs with stale in-memory UI state: any tab with invalid active company must recover via guard rules on next navigation/load.

## 6) Acceptance criteria (checkboxes)
- [ ] A user can create, list, and delete companies from `/admin/companies`.
- [ ] Company creation enforces required trimmed non-empty name and max length 100.
- [ ] Duplicate company names are rejected case-insensitively and trim-insensitively.
- [ ] If no companies exist, any non-admin route redirects to `/admin/companies`.
- [ ] If companies exist but no valid active company is persisted, any non-admin route redirects to `/admin/companies`.
- [ ] `/admin/companies` enforces immediate active-company selection when companies exist and none is validly selected.
- [ ] Creating the first (and only) company auto-sets it as active.
- [ ] Deleting the active company selects a deterministic fallback when possible; otherwise active company is cleared.
- [ ] Persisted active company id that does not exist is treated as invalid and triggers re-selection.
- [ ] `GET /api/companies`, `POST /api/companies`, and `DELETE /api/companies/:id` return deterministic status codes as specified.
- [ ] `DELETE /api/companies/:id` returns `409 Conflict` when the company is referenced by domain records.
- [ ] Company names are never reusable once created, including after potential future soft-delete.

## 7) Open questions
- None for this slice.
