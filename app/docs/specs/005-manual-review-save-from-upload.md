# 005-manual-review-save-from-upload

- Status: Draft (ready for implementation)

## 1) Goal

Implement a user review/edit step after PDF upload so accounting entries are created only after explicit user save.

This slice uses deterministic dummy prefill values (no AI extraction yet) and allows users to correct values and add required business fields before final persistence.

## 2) Scope (In / Out)

### In

- Change upload flow to create upload metadata only (no `accounting_entries` insert on upload).
- Add review/edit page for one upload.
- Persist draft review values.
- Create `accounting_entries` only when user clicks Save.
- Enforce save-time validation rules by `entryType`.
- Keep active-company context enforcement.
- Keep deterministic API responses for success/errors.

### Out

- AI extraction calls.
- Confidence scoring.
- Batch extraction/review.
- Edit of already-saved accounting entries.
- Delete/archive flows.

---

## 3) Decisions (Resolved)

1. Accounting entry creation timing

- `accounting_entries` is created only on explicit Save from review form.
- Upload success does not create accounting entries.

2. Draft storage model

- Use a new table `upload_review_drafts` keyed by `upload_id` (1:1).
- Draft survives page reload/navigation and allows resume later.

3. Navigation

- After successful upload, client redirects to `/uploads/{uploadId}/review`.
- User may leave and return later; review page is resumable via saved draft.

4. Prefill data in this slice

- Prefill with deterministic dummy values:
  - `documentDate`: UTC date portion of `uploadedAt` (`YYYY-MM-DD`)
  - `counterpartyName`: `"Pending extraction"`
  - `bookingText`: `"Pending extraction"`
  - `amountGross`: `0` (integer cents/rappen)
  - `amountNet`: `null`
  - `amountTax`: `null`
  - `paymentReceivedDate`: `null`
  - `typeOfExpenseId`: `null`

5. Save-time validation

- Shared required:
  - `documentDate` (valid `YYYY-MM-DD`)
  - `counterpartyName` (trimmed non-empty, max 200)
  - `bookingText` (trimmed non-empty, max 500)
  - `amountGross` (integer cents, `>= 0`)
- Income-specific:
  - `paymentReceivedDate` required (valid `YYYY-MM-DD`)
  - `typeOfExpenseId` must be `null`
- Expense-specific:
  - `typeOfExpenseId` required and must reference existing expense type
  - `paymentReceivedDate` must be `null`

6. Document numbering

- Assign `documentNumber` at final save only.
- Sequence key: `(company_id, document_year, entry_type)`.
- Numbering logic and insert run in one transaction.

7. Idempotency / double save

- Save is single-use per upload.
- If upload already has a saved accounting entry, Save returns `409 ALREADY_SAVED`.

8. Source normalization

- `accounting_entries` stores `upload_id` only for file linkage.
- File metadata (`original_filename`, `stored_path`) remains canonical in `invoice_uploads`.

---

## 4) Interfaces / API

### 4.1 Upload behavior change

`POST /api/uploads`:

- Keeps current validation and file persistence behavior.
- Persists `invoice_uploads` only.
- No `accounting_entries` creation.
- Success (`201`) response:

```json
{
  "id": "upload-id",
  "companyId": 1,
  "entryType": "income",
  "originalFilename": "invoice.pdf",
  "storedFilename": "uuid.pdf",
  "uploadedAt": "2026-02-20T10:15:30.000Z"
}
```

### 4.2 Review read endpoint

`GET /api/uploads/:id/review`

- Validates active company and ownership (`upload.company_id == activeCompanyId`).
- Returns upload metadata + current draft values.
- If no draft exists, returns deterministic dummy prefill values.

Success shape:

```json
{
  "upload": {
    "id": "upload-id",
    "companyId": 1,
    "entryType": "expense",
    "originalFilename": "invoice.pdf",
    "uploadedAt": "2026-02-20T10:15:30.000Z"
  },
  "draft": {
    "documentDate": "2026-02-20",
    "counterpartyName": "Pending extraction",
    "bookingText": "Pending extraction",
    "amountGross": 0,
    "amountNet": null,
    "amountTax": null,
    "paymentReceivedDate": null,
    "typeOfExpenseId": null
  }
}
```

### 4.3 Draft save endpoint

`PUT /api/uploads/:id/review`

- Upserts draft fields to `upload_review_drafts`.
- Validates field types/format (not full business requiredness yet).
- Returns saved draft.

### 4.4 Final save endpoint

`POST /api/uploads/:id/save`

- Validates active company + ownership.
- Loads draft (or default prefill if no draft row).
- Applies full save-time validation rules.
- Creates `accounting_entries` row + assigns `documentNumber` transactionally.
- Returns created entry summary.

Success shape:

```json
{
  "entry": {
    "id": 123,
    "companyId": 1,
    "documentNumber": 7,
    "entryType": "expense",
    "documentDate": "2026-02-20",
    "counterpartyName": "Vendor AG",
    "amountGross": 12345,
    "sourceOriginalFilename": "invoice.pdf",
    "extractionStatus": "pending",
    "createdAt": "2026-02-20T10:20:00.000Z"
  }
}
```

Error response shape for all non-2xx:

```json
{
  "error": {
    "code": "STRING_CODE",
    "message": "Human-readable message"
  }
}
```

Deterministic codes for this slice:

- `INVALID_ACTIVE_COMPANY` (`409`)
- `UPLOAD_NOT_FOUND` (`404`)
- `UPLOAD_COMPANY_MISMATCH` (`409`)
- `INVALID_JSON` (`400`)
- `VALIDATION_ERROR` (`400`)
- `EXPENSE_TYPE_NOT_FOUND` (`400`)
- `ALREADY_SAVED` (`409`)
- `DRAFT_PERSISTENCE_FAILED` (`500`)
- `ACCOUNTING_ENTRY_PERSISTENCE_FAILED` (`500`)

---

## 5) UI

### 5.1 New review page

- Route: `/uploads/[id]/review`
- Guarded by active-company context.
- Shows:
  - upload metadata (`originalFilename`, `entryType`, `uploadedAt`)
  - editable fields from draft
  - expense type dropdown when `entryType=expense`
  - payment received date input when `entryType=income`
- Actions:
  - `Save draft` (calls `PUT /api/uploads/:id/review`)
  - `Save entry` (calls `POST /api/uploads/:id/save`)

### 5.2 Upload page behavior

- On successful upload, redirect to `/uploads/{uploadId}/review`.
- Success message may still be shown briefly before redirect.

### 5.3 Entries list

- Remains at `/entries`.
- Lists only saved `accounting_entries`.

---

## 6) Data Model Changes

### 6.1 New table: `upload_review_drafts`

- `upload_id` (text primary key, FK `invoice_uploads.id`, delete cascade/restrict per implementation choice; default: restrict)
- `document_date` (text nullable in DB, validated by API)
- `counterparty_name` (text nullable in DB)
- `booking_text` (text nullable in DB)
- `amount_gross` (integer nullable in DB)
- `amount_net` (integer nullable in DB)
- `amount_tax` (integer nullable in DB)
- `payment_received_date` (text nullable)
- `type_of_expense_id` (integer nullable FK `expense_types.id`)
- `created_at` (text not null)
- `updated_at` (text not null)

### 6.2 `accounting_entries`

- Keep current normalized link via `upload_id`.
- `upload_id` remains unique so one upload can produce at most one accounting entry.

---

## 7) Acceptance Criteria

- [ ] Uploading a valid PDF creates only an `invoice_uploads` record (no accounting entry yet).
- [ ] After upload, user is redirected to `/uploads/{id}/review`.
- [ ] Review page shows deterministic dummy prefill values when no draft exists.
- [ ] User can save draft values and reload page without losing changes.
- [ ] Clicking `Save entry` creates one accounting entry with transactional document numbering.
- [ ] Save enforces income/expense conditional requiredness.
- [ ] Double-save on same upload is rejected with `409 ALREADY_SAVED`.
- [ ] `/entries` lists only saved entries.
- [ ] No AI extraction is triggered in this slice.

---

## 8) Notes

- This slice intentionally establishes the user-controlled review workflow before AI.
- A following slice can replace dummy prefill with AI-extracted prefill while reusing the same review/save endpoints and UI.
