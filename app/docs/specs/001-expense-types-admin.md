# 001-expense-types-admin

  ## 1) Goal

  Provide a minimal admin capability to manage the canonical list of expense types used by expense accounting entries, including listing, creating, and deleting expense types with clear validation and integrity rules.

  ## 2) Scope (In / Out)

  ### In

  - Admin screen to view all expense types.
  - Create a new expense type with validated text input.
  - Reorder expense types and persist that order.
  - Delete an existing expense type, subject to reference rules.
  - API endpoints for list/create/delete operations.
  - Deterministic validation and user-visible error states.

  ### Out

  - Editing/renaming expense types (not included in this feature).
  - Bulk import/export of expense types.
  - Authentication/authorization model.
  - Expense entry creation UI.
  - Invoice upload and AI extraction.
  - Yearly overview and P&L reporting.

  ## 3) Interface / API (endpoints and/or UI behavior)

  ### UI behavior

  - Route: admin expense types page.
  - The page displays:
      - Table/list of existing expense types sorted by persisted order.
      - Create form with one required text field: expenseTypeText.
      - Reorder actions per row (move up/down).
      - Delete action per row.
  - Create behavior:
      - Submit is blocked when input is empty after trimming.
      - On success, the new expense type appears in the list without page reload.
      - On failure, a visible error message is shown.
  - Reorder behavior:
      - User can move an item up or down in the list.
      - New order is persisted in the database.
      - Subsequent reads use the persisted order.
  - Delete behavior:
      - User must confirm delete action.
      - If deletion is allowed, the item is removed from list.
      - If deletion is blocked by references, user sees a clear blocking message.

  ### API endpoints

  - GET /api/expense-types
      - Returns all expense types.
      - Response includes: id, expenseTypeText, createdAt, updatedAt.
      - Items are ordered by persisted display order.
  - POST /api/expense-types
      - Creates one expense type.
      - Request body: expenseTypeText.
      - Validation:
          - Required.
          - Trimmed length must be >= 1.
          - Trimmed length must be <= 100.
          - Must be unique case-insensitively after trimming.
      - Returns created object with server-generated fields.
  - PATCH /api/expense-types/reorder
      - Persists full expense-type order.
      - Request body: orderedExpenseTypeIds (array of ids in desired order).
      - Validation:
          - Must be a non-empty array of positive integers.
          - Must contain no duplicates.
          - Must include every existing expense type id exactly once.
  - DELETE /api/expense-types/:id
      - Deletes one expense type by identifier.
      - If referenced by any accounting entry, deletion is rejected with conflict response and explicit reason.

  ### Response semantics

  - Validation errors return a client-error status with field-specific message.
  - Reference conflict on delete returns conflict status.
  - Unknown id on delete returns not-found status.

  ## 4) Data model (new/changed fields/tables)

  ### ExpenseType table

  - id (primary key).
  - expenseTypeText (required text).
  - normalizedText (derived/virtual or persisted normalization for uniqueness checks).
  - createdAt (required timestamp).
  - updatedAt (required timestamp).

  ### Constraints

  - Uniqueness: normalized expenseTypeText must be unique (trimmed, case-insensitive).
  - Non-empty invariant: expenseTypeText cannot be blank after trimming.
  - Maximum length: expenseTypeText must be at most 100 characters after trimming.

  ### Related model dependency

  - AccountingEntry.typeOfExpenseId references ExpenseType.id for expense entries.
  - Deletion rule: an ExpenseType referenced by any AccountingEntry cannot be deleted.

  ## 5) Edge cases

  - Input is whitespace-only.
  - Input differs only by case or surrounding spaces from an existing value.
  - Rapid repeated submit creates duplicate requests.
  - Delete requested for non-existent id.
  - Delete requested for an expense type currently in use.
  - Long text input near storage limits.
  - Concurrent creates with same normalized value.

  ## 6) Acceptance criteria (checkboxes)

  - [x] Admin page displays existing expense types with stable ordering.
  - [x] User can create a new expense type with non-empty text.
  - [x] Whitespace-only values are rejected.
  - [x] Case-insensitive duplicates are rejected.
  - [x] On successful create, the new type is visible in the list immediately.
  - [x] User can reorder expense types and persisted order is returned by list API.
  - [x] User can request deletion of an expense type from the list.
  - [x] Deletion of an unreferenced expense type succeeds.
  - [x] Deletion of a referenced expense type is blocked with explicit conflict feedback.
  - [x] API returns deterministic status codes for success, validation error, conflict, and not found.
  - [x] No other domain behavior (invoice upload, extraction, P&L) is changed by this feature.

  ## 7) Open questions

  - Should delete be permanently blocked when referenced, or should soft-delete/archive be introduced later?
  - Should additional metadata (e.g., isActive) be added now or deferred?
  - Should the API support pagination now or only when list size justifies it?
