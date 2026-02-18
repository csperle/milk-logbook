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
      - Maximum file size is 10 MiB (`10,485,760` bytes).
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
  - File size limit:
      - Reject when `file.size > 10,485,760` bytes with `413 Payload Too Large`.
  - PDF validation:
      - Accept only when the uploaded file has `%PDF-` signature in the first 5 bytes, and
      - (`Content-Type` is `application/pdf` OR filename extension is `.pdf`, case-insensitive).
      - Otherwise return `415 Unsupported Media Type`.
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
      - `stored_path` and absolute filesystem paths must not be returned by this endpoint.
  - Error responses:
      - 400 Bad Request: missing/invalid entryType, missing file, empty file payload.
      - 413 Payload Too Large: file size exceeds `10,485,760` bytes.
      - 415 Unsupported Media Type: uploaded file is not a PDF.
      - 409 Conflict: missing or invalid active company context.
      - 500 Internal Server Error: storage or database persistence failure.
  - Error response JSON contract (all non-2xx responses):
      - Shape: `{ "error": { "code": string, "message": string } }`
      - Defined codes for this endpoint:
          - `INVALID_ENTRY_TYPE`
          - `MISSING_FILE`
          - `EMPTY_FILE`
          - `FILE_TOO_LARGE`
          - `UNSUPPORTED_MEDIA_TYPE`
          - `INVALID_ACTIVE_COMPANY`
          - `UPLOAD_PERSISTENCE_FAILED`
  - Persistence order (no-orphan guarantee):
      - Validate payload and active company first.
      - Write file to disk under `upload/`.
      - Insert metadata row in `invoice_uploads`.
      - If DB insert fails, delete the written file before returning `500`.

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

  - Physical file location root: project-root-relative `upload/`.
  - The `upload/` directory is created on demand if missing.
  - Persisted file must be the uploaded binary content.
  - stored_filename must be unique across all uploads.
  - stored_filename must be opaque and server-generated (UUID-based), not derived from original_filename.
  - stored_filename must not encode accounting fields such as document number, year, company, or entry type.
  - No overwrite of existing files.
  - original_filename is metadata only and must never be used to build stored_path.
  - original_filename must be used as the user-facing filename for future download/read endpoints.
  - stored_path must always be normalized to `upload/<stored_filename>` and remain under `upload/`.
  - Any future accounting document numbering is separate from file storage naming.

  ### Related existing endpoint behavior

  - `DELETE /api/companies/:id` must return:
      - `409 Conflict` when restricted by FK references (including `invoice_uploads.company_id`),
      - `404 Not Found` when company does not exist,
      - `204 No Content` on successful delete.

  ## 5) Edge cases

  - Active company cookie missing.
  - Active company cookie present but company no longer exists.
  - entryType omitted or not one of income/expense.
  - File field omitted.
  - File extension is .pdf but MIME/content is not a valid PDF.
  - Zero-byte file upload.
  - File larger than `10,485,760` bytes.
  - Duplicate original filenames across uploads (must still succeed via unique stored filename).
  - Filesystem write succeeds but DB write fails (must delete written file before returning 500).
  - Filesystem write fails before DB insert (must return 500 without persisting DB row).
  - Concurrent uploads with same original filename.
  - Filename includes traversal characters/separators (must not affect stored_path generation).

  ## 6) Acceptance criteria (checkboxes)

  - [ ] /upload route exists and is reachable when active company context is valid.
  - [ ] /upload redirects to /admin/companies when no company exists.
  - [ ] /upload redirects to /admin/companies when active company is missing/invalid.
  - [ ] User can submit a PDF with entryType=income and receive 201.
  - [ ] User can submit a PDF with entryType=expense and receive 201.
  - [ ] Uploaded PDF is persisted in local upload/ directory.
  - [ ] Files larger than `10,485,760` bytes are rejected with `413`.
  - [ ] Metadata record is persisted in invoice_uploads with correct company_id, entry_type, original_filename, stored_filename, and
    uploaded_at.
  - [ ] POST /api/uploads rejects non-PDF uploads with 415.
  - [ ] POST /api/uploads rejects invalid payloads with 400.
  - [ ] POST /api/uploads rejects missing/invalid company context with 409.
  - [ ] PDF validation requires `%PDF-` signature and (`application/pdf` MIME or `.pdf` extension); otherwise response is 415.
  - [ ] Upload API errors use `{ error: { code, message } }` with defined endpoint error codes.
  - [ ] original_filename is stored only as metadata and does not affect stored_path.
  - [ ] original_filename is preserved for future download naming.
  - [ ] POST /api/uploads success response does not expose `stored_path`.
  - [ ] On failed upload request, no orphan file and no orphan DB row remain.
  - [ ] DELETE /api/companies/:id returns 409 when company has related invoice_uploads.
  - [ ] UI shows clear success and error states based on API responses.
  - [ ] No AI extraction or accounting-entry creation is performed in this slice.

  ## 7) Open questions

  - `GET /api/uploads` is intentionally deferred to a later slice to keep this slice focused on upload + persistence only.
