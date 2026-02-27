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

- `POST /api/uploads/:id/save` validation and document-numbering behavior from `005` remains unchanged.
- AI-prefilled fields are treated exactly like user-entered draft values at final save.

10. Provider abstraction

- Extraction integration must be encapsulated behind a dedicated module (for example `src/lib/openai/*`) so prompt/schema changes do not spread through route handlers.

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
      "code": "EXTRACTION_FAILED",
      "message": "Extraction did not complete successfully"
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

- `EXTRACTION_FAILED` (`500` or internally mapped status where applicable)
- `EXTRACTION_PERSISTENCE_FAILED` (`500`)

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
- Keep existing actions unchanged:
  - `Save draft`
  - `Save entry`
  - `Save entry and next` (when pending review)

### 5.3 UX invariants

- User can always continue manually even if extraction is pending or failed.
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
- [ ] `POST /api/uploads/:id/save` validation/document-numbering behavior from `005` remains unchanged.
- [ ] Review page displays extraction status (`pending|succeeded|failed`) without blocking manual completion.
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
