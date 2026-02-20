# 004-booking-entry-from-upload-placeholder

  - Status: Draft (ready for implementation)

  ## 1) Goal

  Create a small vertical slice where uploading an invoice PDF immediately creates a persisted booking entry linked to that PDF, using
  deterministic placeholder values for fields not yet extracted by AI.

  ## 2) Scope (In / Out)

  ### In

  - Extend upload flow so successful upload also creates one accounting_entries record.
  - Persist placeholder values for non-user-provided entry fields.
  - Keep active-company context enforcement.
  - Add a booking entries list page showing created entries.
  - Keep deterministic API responses for success/errors.

  ### Out

  - AI extraction.
  - Manual edit form for booking entries.
  - Delete booking entry.
  - Yearly totals/P&L.
  - Expense-type selection UX beyond placeholder/default handling.

  ———

  ## 3) Recommended Decisions (Open Questions Answered)

  1. Dummy values per field:

  - documentDate: date portion of `uploadedAt` in UTC (`YYYY-MM-DD`, e.g. `2026-02-18`).
  - UTC date extraction is intentional for this slice; local business timezone date handling is deferred.
  - counterpartyName: "Pending extraction".
  - bookingText: "Pending extraction".
  - amountGross: 0 (stored as integer cents/rappen).
  - amountNet: null.
  - amountTax: null.
  - sourceFilePath: from upload stored_path.
  - sourceOriginalFilename: from upload original_filename.
  - extractionStatus: "pending".

  2. Nullability vs strict defaults:

  - Keep DB permissive where possible for this slice.
  - Use deterministic placeholders above; do not force fake business values where nullable is cleaner (amountNet, amountTax).

  3. paymentReceivedDate for income:

  - Allow null placeholder in this slice.
  - Set to null on create; enforce requiredness later when edit/review flow exists.

  4. typeOfExpenseId for expense:

  - Allow null placeholder in this slice.
  - Set to null on create; enforce requiredness later when expense-entry edit flow exists.

  5. Document numbering:

  - Implement now for forward progress and stability.
  - Assign documentNumber at creation time using `(companyId, documentYear, entryType)` sequence, starting at `1`.
  - `documentYear` is persisted as UTC year derived from `documentDate`.
  - Assign number and insert entry in one DB transaction using `MAX(document_number) + 1` on the sequence key.
  - documentNumber is immutable after creation in this slice.

  6. Failure behavior (upload succeeded, entry create fails):

  - Use all-or-nothing behavior across steps:
      - If entry creation fails, roll back upload metadata + file (no orphan upload).
      - If rollback cleanup fails, return `500` with deterministic code `UPLOAD_ROLLBACK_FAILED` and do not return partial success.
  - End state must be all-or-nothing for this slice.

  7. Initial list view fields/sort:

  - Fields: documentNumber, entryType, documentDate, counterpartyName, amountGross, sourceOriginalFilename, createdAt.
  - Default sort: createdAt DESC, id DESC.

  ———

  ## 4) Interface / API

  ### Upload endpoint behavior update

  POST /api/uploads continues to accept:

  - entryType: income | expense
  - file: PDF

  On success (201), response shape is:

  ```json
  {
    "id": "upload-id",
    "companyId": 1,
    "entryType": "income",
    "originalFilename": "invoice.pdf",
    "storedFilename": "uuid.pdf",
    "uploadedAt": "2026-02-20T10:15:30.000Z",
    "entry": {
      "id": 123,
      "documentNumber": 1,
      "documentDate": "2026-02-20",
      "extractionStatus": "pending"
    }
  }
  ```

  - `stored_path` remains internal and must not be exposed.

  On error (non-2xx), response shape remains:

  - `{ "error": { "code": string, "message": string } }`
  - Deterministic endpoint codes for this slice:
      - `INVALID_ENTRY_TYPE`
      - `MISSING_FILE`
      - `EMPTY_FILE`
      - `FILE_TOO_LARGE`
      - `UNSUPPORTED_MEDIA_TYPE`
      - `INVALID_ACTIVE_COMPANY`
      - `UPLOAD_PERSISTENCE_FAILED`
      - `BOOKING_ENTRY_PERSISTENCE_FAILED`
      - `UPLOAD_ROLLBACK_FAILED`

  ### Booking entries list

  - New route: /entries
  - Guarded by active company context.
  - Shows entries for active company.
  - Data source endpoint: GET /api/accounting-entries (company-scoped via active cookie), sorted by `createdAt DESC, id DESC`.
  - `GET /api/accounting-entries` returns `409` with `INVALID_ACTIVE_COMPANY` when active company context is missing/invalid.
  - `GET /api/accounting-entries` returns `200` with `[]` when no entries exist.
  - No pagination in this slice.
  - `GET /api/accounting-entries` success response fields (minimum):
      - id
      - companyId
      - documentNumber
      - entryType
      - documentDate
      - counterpartyName
      - amountGross
      - sourceOriginalFilename
      - extractionStatus
      - createdAt

  ———

  ## 5) Data Model Changes (Recommended)

  ### accounting_entries (extend to v1 shape for this slice)

  - id (integer primary key autoincrement)
  - company_id (integer, not null, FK companies, restrict delete)
  - document_number (not null)
  - entry_type (income|expense, not null)
  - document_date (not null)
  - document_year (integer, not null; UTC year derived from document_date)
  - payment_received_date (nullable)
  - type_of_expense_id (nullable FK expense_types)
  - upload_id (text, not null, unique, FK invoice_uploads)
  - counterparty_name (not null placeholder allowed)
  - booking_text (not null placeholder allowed)
  - amount_gross (not null, default 0)
  - amount_net (nullable)
  - amount_tax (nullable)
  - source_file_path (not null)
  - source_original_filename (not null)
  - extraction_status (not null, default "pending")
  - created_at, updated_at (not null)

  Constraints:

  - Unique `(company_id, document_year, entry_type, document_number)`.
  - `upload_id` unique and references `invoice_uploads(id)` with delete restrict.
  - `entry_type IN ('income', 'expense')`.
  - `extraction_status IN ('pending')` for this slice.

  ———

  ## 6) Acceptance Criteria

  - [ ] Uploading a valid PDF with entryType=income creates upload record and linked booking entry.
  - [ ] Uploading a valid PDF with entryType=expense creates upload record and linked booking entry.
  - [ ] Created booking entry contains deterministic placeholder values defined in this spec.
  - [ ] documentNumber is assigned per (company, year, entryType) sequence starting at 1.
  - [ ] If entry creation fails, upload metadata and file are rolled back (no orphan upload).
  - [ ] /entries route exists and lists booking entries for active company.
  - [ ] /entries is guarded by active-company rules.
  - [ ] List is sorted by newest (createdAt DESC).
  - [ ] No AI extraction is triggered in this slice.

  ———

  ## 7) Notes

  - This slice intentionally delivers domain progress (booking_entries) while keeping AI and edit UX deferred.
  - Next slice can add manual edit/validation of placeholder entries before introducing AI extraction.
  - Temporary override for this slice only:
      - `payment_received_date` may be null for income placeholders.
      - `type_of_expense_id` may be null for expense placeholders.
      - Later edit/review slices will enforce requiredness.

  ## 8) Open questions

  - None for this slice. All implementation decisions required for build/test are fixed above.
