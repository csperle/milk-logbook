# 003-invoice-pdf-upload-local-storage

  ## 1) Goal

  Implement a small vertical slice that allows a user to upload invoice PDFs (classified as income or expense), persist the file locally,
  and store upload metadata in SQLite under the active company context.
  This slice explicitly excludes AI extraction and accounting-entry creation.

  ## 2) Scope (In / Out)

  ### In

  - New upload page UI for manual PDF upload.
  - Active-company context enforcement for the upload page.
  - API endpoint to accept PDF upload and entryType (income or expense).
  - Local filesystem persistence in upload/.
  - SQLite persistence of upload metadata:
      - active company
      - original filename
      - stored filename
      - upload timestamp
      - entry type
  - Deterministic API responses for success and validation/error states.
  - Ability to display immediate upload result in the UI (success/error).

  ### Out

  - AI extraction from uploaded PDFs.
  - Editable extracted fields.
  - Accounting entry creation/edit/delete from uploads.
  - Document numbering logic for accounting entries.
  - Yearly overview integration.
  - P&L integration.
  - Authentication/authorization.

  ## 3) Interface / API (endpoints and/or UI behavior)

  ### UI behavior

  - Route: /upload.
  - Access rules:
      - If no companies exist: redirect to /admin/companies.
      - If no valid active company is selected: redirect to /admin/companies.
  - Upload form fields:
      - entryType (required): income | expense.
      - file (required): single .pdf file.
  - Upload size limit:
      - Maximum file size is 10 MB.
  - On success:
      - Show a success message including original filename and stored filename.
  - On error:
      - Show specific error message from API response.
      - Preserve selected entryType in the form state when possible.

  ### API

  #### POST /api/uploads

  - Content type: multipart/form-data.
  - Required form fields:
      - entryType: income | expense
      - file: PDF file
  - Company context source:
      - activeCompanyId cookie must be present and reference an existing company.
  - Success response:
      - Status: 201 Created
      - Body:
          - id
          - companyId
          - entryType
          - originalFilename
          - storedFilename
          - uploadedAt
      - `stored_path` must not be returned by this endpoint.
  - Error responses:
      - 400 Bad Request: missing/invalid entryType, missing file, empty file payload.
      - 413 Payload Too Large: file size exceeds 10 MB.
      - 415 Unsupported Media Type: uploaded file is not a PDF.
      - 409 Conflict: missing or invalid active company context.
      - 500 Internal Server Error: storage or database persistence failure.

  ## 4) Data model (new/changed fields/tables)

  ### New table: invoice_uploads

  - id (text, primary key)
  - company_id (text, not null, FK -> companies.id, ON DELETE RESTRICT)
  - entry_type (text, not null, allowed: income, expense)
  - original_filename (text, not null)
  - stored_filename (text, not null, unique)
  - stored_path (text, not null)
      - relative path under local storage root (e.g., upload/<stored_filename>)
  - uploaded_at (text datetime, not null)

  ### Storage rules

  - Physical file location root: upload/.
  - Persisted file must be the uploaded binary content.
  - stored_filename must be unique across all uploads.
  - stored_filename must be opaque and server-generated (UUID-based), not derived from original_filename.
  - No overwrite of existing files.
  - original_filename is metadata only and must never be used to build stored_path.
  - stored_path must always remain under upload/ and reject/ignore path traversal sequences.
  - Future document-number-based naming for accounting entries is out of scope for this slice.

  ## 5) Edge cases

  - Active company cookie missing.
  - Active company cookie present but company no longer exists.
  - entryType omitted or not one of income/expense.
  - File field omitted.
  - File extension is .pdf but MIME/content is not a valid PDF.
  - Zero-byte file upload.
  - File larger than 10 MB.
  - Duplicate original filenames across uploads (must still succeed via unique stored filename).
  - Filesystem write succeeds but DB write fails (must delete written file before returning 500).
  - DB write succeeds but filesystem write fails (must roll back DB write before returning 500).
  - Concurrent uploads with same original filename.
  - Filename includes traversal characters/separators (must not affect stored_path generation).

  ## 6) Acceptance criteria (checkboxes)

  - [ ] /upload route exists and is reachable when active company context is valid.
  - [ ] /upload redirects to /admin/companies when no company exists.
  - [ ] /upload redirects to /admin/companies when active company is missing/invalid.
  - [ ] User can submit a PDF with entryType=income and receive 201.
  - [ ] User can submit a PDF with entryType=expense and receive 201.
  - [ ] Uploaded PDF is persisted in local upload/ directory.
  - [ ] Metadata record is persisted in invoice_uploads with correct company_id, entry_type, original_filename, stored_filename, and
    uploaded_at.
  - [ ] POST /api/uploads rejects non-PDF uploads with 415.
  - [ ] POST /api/uploads rejects files larger than 10 MB with 413.
  - [ ] POST /api/uploads rejects invalid payloads with 400.
  - [ ] POST /api/uploads rejects missing/invalid company context with 409.
  - [ ] PDF validation requires both PDF-compatible content type and `%PDF-` file signature; otherwise response is 415.
  - [ ] original_filename is stored only as metadata and does not affect stored_path.
  - [ ] POST /api/uploads success response does not expose `stored_path`.
  - [ ] On failed upload request, no orphan file and no orphan DB row remain.
  - [ ] Deleting a company with related invoice_uploads is rejected by FK restriction.
  - [ ] UI shows clear success and error states based on API responses.
  - [ ] No AI extraction or accounting-entry creation is performed in this slice.

  ## 7) Open questions

  - `GET /api/uploads` is intentionally deferred to a later slice to keep this slice focused on upload + persistence only.
