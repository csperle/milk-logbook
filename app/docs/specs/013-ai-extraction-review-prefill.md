# 013-ai-extraction-review-prefill

- Status: Planned

## 1) Goal

Replace deterministic dummy review prefill values with AI-extracted values from uploaded invoice PDFs while preserving the existing user-controlled review/save workflow.

Users should arrive on `/uploads/[id]/review` with meaningful prefilled fields that can still be corrected before final save.

## 2) Scope (In / Out)

### In

- Add AI extraction execution for uploaded PDFs.
- Persist extraction output as initial review draft values.
- Keep `GET /api/uploads/:id/review`, `PUT /api/uploads/:id/review`, and `POST /api/uploads/:id/save` contracts stable except where explicitly extended.
- Add deterministic extraction status/error handling.
- Keep active-company scoping and deterministic error contracts.

### Out

- OCR model experimentation UI.
- Human-in-the-loop confidence scoring UI.
- Batch extraction orchestration.
- Editing already-saved accounting entries.
- Annual P&L export.

---

## 3) Decisions (Resolved)

1. Extraction timing

- Extraction is triggered server-side immediately after successful `POST /api/uploads` file + metadata persistence.
- Extraction runs asynchronously relative to the upload response (upload endpoint does not block until extraction completes).

2. Source of truth for prefill

- `upload_review_drafts` remains the source of truth for review prefill/edit state.
- AI output is written into `upload_review_drafts` only when no user-authored draft exists.
- User edits always win; extraction must never overwrite existing user-saved draft fields.

3. Default behavior while extraction is pending

- `GET /api/uploads/:id/review` returns deterministic defaults from slice `005` when no extracted draft is available yet.
- Existing review/edit/save flow remains usable while extraction is pending or failed.

4. Minimal extracted fields for this slice

- `documentDate` (`YYYY-MM-DD`)
- `counterpartyName`
- `bookingText`
- `amountGross` (integer cents/rappen)
- Optional if confidently present:
  - `amountNet` (integer cents/rappen)
  - `amountTax` (integer cents/rappen)

5. Entry-type-specific fields

- `paymentReceivedDate` is extracted for `income` uploads when present; otherwise remains `null` for user completion.
- `typeOfExpenseId` is never inferred by AI in this slice and remains `null` until user selection for expense entries.

6. Monetary and currency policy

- No currency field is introduced.
- Extracted amounts are interpreted and persisted as CHF-compatible numeric values (existing app policy).

7. Extraction status model

- Introduce upload-level extraction status lifecycle:
  - `pending`
  - `succeeded`
  - `failed`
- `failed` stores a deterministic internal failure code/message for diagnostics; external API surfaces deterministic response shape.

8. Retry policy

- This slice does not add manual retry UI/action.
- One automatic extraction attempt is performed per upload.
- Future retry capability can be added in a dedicated slice.

9. Save behavior compatibility

- `POST /api/uploads/:id/save` keeps document-numbering and entry-type validation behavior from `005`.
- Exception: `bookingText` may be empty (still capped at max length).
- AI-prefilled fields are treated exactly like user-entered draft values at final save.

10. Provider abstraction

- Extraction integration must be encapsulated behind a dedicated module (for example `src/lib/openai/*`) so prompt/schema changes do not spread through route handlers.

11. Model selection

- Default extraction model for this slice is `gpt-5-mini`.
- Extraction must use Structured Outputs (JSON schema) to enforce deterministic field shapes.
- If model output is schema-invalid after one normalization attempt, mark extraction as failed for this slice (no automatic second model attempt).
- Future slice may add optional escalation for hard cases (for example to `gpt-5.1`), but this is out of scope here.

12. Prompt and API-call contract

- Extraction integration uses both:
  - a strict instruction prompt
  - a strict Structured Output JSON schema
- Prompt-only extraction is not sufficient for deterministic behavior in this app.
- After model response, backend validation still applies before draft persistence.

Recommended prompt template for this slice:

```text
You extract bookkeeping fields from a single invoice PDF.

Return ONLY JSON matching the provided schema.

Rules:
- Do not guess. If a field is missing or unclear, return null.
- Use date format YYYY-MM-DD.
- Amount fields must be integer cents (CHF/rappen), non-negative.
- Parse common number formats (apostrophe/comma/dot/space thousands separators).
- amountGross is required by schema; if missing, return 0.
- amountNet and amountTax are optional; return null when not confidently present.
- Keep text fields concise and source-faithful.
- paymentReceivedDate is only for income documents; otherwise return null.
- 'Christoph Sperle' is NEVER the counterpartyName because it is the name of the invoice recipient.
- Never output markdown or extra keys.
```

Schema/validation requirements:

- Schema must include exactly:
  - `documentDate`
  - `counterpartyName`
  - `bookingText`
  - `amountGross`
  - `amountNet`
  - `amountTax`
  - `paymentReceivedDate`
- No additional keys accepted.
- Backend re-validates:
  - strict date format
  - integer non-negative amount constraints
  - type constraints from review draft API
- Schema-invalid or post-validation-invalid outputs map to deterministic failure code `EXTRACTION_INVALID_OUTPUT`.

Implementation insights from manual API testing:

- Responses API `input_file.file_data` must be sent as a data URL, not raw base64.
  - required format: `data:application/pdf;base64,<BASE64_CONTENT>`
  - sending raw base64 causes deterministic API validation error:
    - `invalid_request_error`
    - `param: input[0].content[0].file_data`

### 3.1 Pre-implementation decisions (resolved)

1. Rule for "user-authored draft exists"

- A draft is treated as user-authored once a row exists in `upload_review_drafts` for the upload.
- Extraction prefill must be insert-only for draft creation:
  - create draft from extraction only when no row exists yet
  - never update an existing draft row from extraction
- This guarantees "user edits always win" without field-level merge complexity.

2. Async extraction execution model

- Keep this slice local-first and infrastructure-minimal:
  - `POST /api/uploads` persists file + metadata, returns `201` immediately
  - extraction is kicked off in-process as a best-effort background task after persistence
- No separate job queue/worker is introduced in this slice.
- On process interruption/restart, uploads may remain `pending`; they stay manually reviewable.

3. Concurrency and idempotency

- Extraction finalization updates are single-write from `pending` only:
  - success/failure status update uses `WHERE extraction_status = 'pending'`
  - if status already left `pending`, later completion attempts are ignored
- Draft prefill uses "insert if absent" semantics for deterministic race handling.

4. Extraction error taxonomy and API mapping

- Provider/internal errors are persisted on `invoice_uploads` and exposed through `GET /api/uploads/:id/review` metadata, not as terminal API errors for normal review reads.
- Deterministic stored failure codes for this slice:
  - `EXTRACTION_PROVIDER_ERROR` (model/provider call failure)
  - `EXTRACTION_TIMEOUT` (provider/network timeout)
  - `EXTRACTION_INVALID_OUTPUT` (output failed normalization/validation)
  - `EXTRACTION_PERSISTENCE_FAILED` (DB write failure while finalizing extraction)
  - `EXTRACTION_CONFIG_MISSING` (missing OpenAI config, e.g. API key)
- `EXTRACTION_INVALID_OUTPUT` also covers schema-invalid Structured Output responses from `gpt-5-mini`.
- External API error payload shape remains unchanged.

5. Existing-upload migration policy

- Migration adds new extraction columns with defaults for new rows.
- Existing rows are backfilled to:
  - `extraction_status = 'failed'`
  - `extraction_error_code = 'EXTRACTION_NOT_ATTEMPTED'`
  - `extraction_error_message = 'Upload predates AI extraction feature'`
  - `extracted_at = NULL`
- This avoids indefinite `pending` status for historical uploads and keeps behavior explicit.

6. Normalization rules for extracted values

- Dates must be strict `YYYY-MM-DD` and pass existing date validation logic used by review APIs.
- Monetary parsing accepts common invoice number formatting (`'`, `.`, `,`, spaces) and normalizes to integer cents.
- Invalid, negative, or overflow amounts are discarded and fall back to deterministic defaults/nulls.
- `amountGross` defaults to `0` when missing/invalid; optional amounts (`amountNet`, `amountTax`) fall back to `null`.

7. Review response shape stability

- `GET /api/uploads/:id/review` always returns:
  - `upload.extractionStatus`
  - `upload.extractionError` (object when failed, otherwise `null`)
- This keeps client handling deterministic and avoids optional-field branching.

---

## 4) Interfaces / API

### 4.1 Upload endpoint extension

`POST /api/uploads`

- Existing success/error behavior remains unchanged for upload persistence.
- Success response is extended with extraction metadata:

```json
{
  "id": "upload-id",
  "companyId": 1,
  "entryType": "expense",
  "originalFilename": "invoice.pdf",
  "storedFilename": "uuid.pdf",
  "uploadedAt": "2026-02-27T10:15:30.000Z",
  "extractionStatus": "pending"
}
```

Notes:
- Extraction failure must not convert upload success into upload failure.
- Upload remains reviewable even when extraction later fails.

### 4.2 Review read endpoint extension

`GET /api/uploads/:id/review`

- Existing active-company scoping and `404 UPLOAD_NOT_FOUND` policy remain unchanged.
- Response extends `upload` metadata with extraction state:

```json
{
  "upload": {
    "id": "upload-id",
    "companyId": 1,
    "entryType": "expense",
    "originalFilename": "invoice.pdf",
    "uploadedAt": "2026-02-27T10:15:30.000Z",
    "extractionStatus": "succeeded"
  },
  "draft": {
    "documentDate": "2026-02-20",
    "counterpartyName": "Vendor AG",
    "bookingText": "Office supplies",
    "amountGross": 12345,
    "amountNet": 11420,
    "amountTax": 925,
    "paymentReceivedDate": null,
    "typeOfExpenseId": null
  }
}
```

If extraction failed, include deterministic optional info:

```json
{
  "upload": {
    "extractionStatus": "failed",
    "extractionError": {
      "code": "EXTRACTION_PROVIDER_ERROR",
      "message": "Extraction provider request failed."
    }
  }
}
```

### 4.3 Draft save endpoint compatibility

`PUT /api/uploads/:id/review`

- Contract and validation semantics from `005` remain unchanged.
- User-saved draft updates must continue to use partial-update semantics and strict JSON type handling.

### 4.4 Final save endpoint compatibility

`POST /api/uploads/:id/save`

- Contract and deterministic validation behavior from `005` remain unchanged.
- New extraction states do not alter save-time business validation requirements.

### 4.5 Error shape

All non-2xx responses keep the deterministic shape:

```json
{
  "error": {
    "code": "STRING_CODE",
    "message": "Human-readable message"
  }
}
```

Deterministic extraction-related codes introduced in this slice:

- `EXTRACTION_PROVIDER_ERROR`
- `EXTRACTION_TIMEOUT`
- `EXTRACTION_INVALID_OUTPUT`
- `EXTRACTION_CONFIG_MISSING`
- `EXTRACTION_PERSISTENCE_FAILED`

Notes:
- `UPLOAD_NOT_FOUND` and active-company behavior remain unchanged.
- Extraction failures are represented in extraction metadata and must not break normal review retrieval.

---

## 5) UI behavior

### 5.1 Upload page (`/upload`)

- After upload success and redirect to review, user sees extraction-aware review state.
- No new upload-page controls are required for this slice.

### 5.2 Review page (`/uploads/[id]/review`)

- Continue rendering current review form.
- Show extraction status indicator near upload metadata:
  - `Pending extraction`
  - `Extraction complete`
  - `Extraction failed` (with concise helper text)
- While extraction is pending:
  - keep form inputs and `Save draft` available
  - temporarily disable `Save entry` and `Save entry and next`
- Keep existing actions unchanged:
  - `Save draft`
  - `Save entry`
  - `Save entry and next` (when pending review)

### 5.3 UX invariants

- User can continue manual editing even if extraction is pending or failed.
- While extraction is pending, final-save actions may be temporarily disabled.
- AI prefill must never silently erase user-entered values.

---

## 6) Data model

### 6.1 `invoice_uploads` additions

- `extraction_status` (`TEXT NOT NULL`, default `pending`, constrained to `pending|succeeded|failed`)
- `extraction_error_code` (`TEXT NULL`)
- `extraction_error_message` (`TEXT NULL`)
- `extracted_at` (`TEXT NULL`, ISO-8601 UTC)

### 6.2 `upload_review_drafts` reuse

- Existing draft fields remain unchanged.
- AI writes initial values into this table only when draft row does not yet contain user-authored values.

### 6.3 Integrity rules

- On extraction success:
  - set `invoice_uploads.extraction_status = 'succeeded'`
  - set `extracted_at`
  - clear extraction error fields
- On extraction failure:
  - set `invoice_uploads.extraction_status = 'failed'`
  - set deterministic error fields
  - keep draft defaults available for manual completion

---

## 7) Edge cases

- Extraction completes after user already saved draft edits: AI result must not overwrite user draft values.
- Extraction returns invalid/malformed values: normalize/validate before draft persistence; invalid fields fall back to existing deterministic defaults.
- Missing key fields from extraction output: keep defaults/nulls and allow manual completion.
- Concurrent extraction finalization attempts for same upload must resolve deterministically (single final status).
- Provider/network timeout must map to deterministic failure status and not break upload/review flow.

---

## 8) Acceptance criteria

- [ ] New uploads start with `extractionStatus = pending`.
- [ ] AI extraction is triggered after successful upload persistence.
- [ ] Extraction success writes prefill values into review draft state.
- [ ] Extraction failure marks upload as failed with deterministic error metadata.
- [ ] `GET /api/uploads/:id/review` returns `upload.extractionStatus`.
- [ ] Review prefill uses AI values when available and valid.
- [ ] User-authored draft values are never overwritten by later extraction writes.
- [ ] `PUT /api/uploads/:id/review` behavior from `005` remains unchanged.
- [ ] `POST /api/uploads/:id/save` keeps `005` numbering/entry-type behavior (with `bookingText` allowed empty).
- [ ] Review page displays extraction status (`pending|succeeded|failed`) without blocking manual editing.
- [ ] Active-company scoping and `UPLOAD_NOT_FOUND` behavior remain unchanged.
- [ ] Deterministic error payload shape is preserved for all endpoint failures.
- [ ] `npm run lint` and `npm run build` pass after implementation.

---

## 9) Suggested implementation files (non-binding)

- `src/lib/db.ts`
- `src/lib/invoice-uploads-repo.ts`
- `src/lib/upload-review-repo.ts`
- `src/lib/openai/*` (new extraction module)
- `src/app/api/uploads/route.ts`
- `src/app/api/uploads/[id]/review/route.ts`
- `src/app/uploads/[id]/review/UploadReviewPageClient.tsx`

---

## 10) Extraction quality checklist (implementation guidance)

The following items increase extraction quality and should be considered during implementation or immediate follow-up slices:

1. Input handling strategy

- Prefer direct PDF input for native/digital PDFs.
- Define deterministic fallback behavior for low-quality scans (for example OCR-first path in a future slice).

2. Parsing and normalization hardening

- Keep all amount/date/text normalization in a single backend module.
- Normalize Swiss-relevant number formats deterministically before draft persistence.

3. Edge-case policy

- Define deterministic handling for:
  - credit notes / negative totals
  - multi-page or multi-document PDFs
  - missing/ambiguous invoice dates
  - mixed VAT presentations

4. Validation-first persistence

- Never persist raw model output directly.
- Persist only schema-valid + backend-valid values; otherwise use deterministic defaults and/or fail with `EXTRACTION_INVALID_OUTPUT`.

5. Observability

- Log extraction lifecycle events with upload id and deterministic failure code.
- Track counts/rates for `succeeded`, `failed`, and key failure codes for iterative improvement.

6. Regression corpus

- Maintain a representative local invoice sample set for manual and automated comparison when prompt/model logic changes.
- Re-check extraction quality before changing prompt text, schema, or model version.

7. UX-assisted quality

- Keep manual correction path fast and obvious on review page (especially for failed/pending extraction).
- Ensure extraction status is visible and non-blocking so users can complete bookkeeping deterministically.
