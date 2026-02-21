# 006-pending-upload-review-queue

- Status: Draft (ready for implementation)

## 1) Goal

Add a company-scoped pending-review queue so users can find, resume, and complete upload drafts without needing direct upload IDs.

This slice focuses on listing and navigating upload reviews. Final save behavior from `005` remains unchanged.

The UX must guide users through two explicit workflows:
- Capture mode: quickly upload many documents.
- Processing mode: review and finalize pending uploads until queue is empty.

## 2) Scope (In / Out)

### In

- Add uploads list page at `/uploads`.
- Add API endpoint `GET /api/uploads` for active company.
- Show review status per upload (`pending_review` vs `saved`).
- Prioritize pending uploads in UI and enable quick navigation to review page.
- Add optional post-save redirect mode from review page (`Save entry and next`).

### Out

- AI extraction.
- Archive/delete workflows.
- Pagination (can be added later).
- Editing finalized accounting entries.

---

## 3) Decisions (Resolved)

1. Queue model

- Queue item source is `invoice_uploads` joined with `accounting_entries` by `upload_id`.
- Upload is `saved` when an `accounting_entries` row exists for the upload.
- Upload is `pending_review` when no `accounting_entries` row exists.

2. Company scope and security

- `GET /api/uploads` is scoped strictly to active company.
- No cross-company existence leakage.

3. Default ordering

- Pending uploads first.
- Within each status group: oldest first by `uploadedAt` ascending.

4. Default filtering

- `/uploads` opens with filter `status=pending_review`.
- User can switch to `status=all` and `status=saved`.

5. Review navigation

- Queue rows link to `/uploads/{id}/review`.
- Review page adds action `Save entry and next`:
  - saves current entry,
  - redirects to next pending upload for same company (oldest first),
  - if none left, redirects to `/uploads?status=pending_review`.

6. Compatibility with slice `005`

- Existing `Save draft` and `Save entry` behavior remains valid.
- `Save entry` default redirect remains `/entries`.
- `Save entry and next` is additive.

7. User guidance and next action clarity

- Every key screen must present a clear primary next action.
- The UI must keep users oriented in either capture mode or processing mode.
- Empty/complete states must explain what to do next (not only what happened).

---

## 4) Interfaces / API

### 4.1 List uploads endpoint

`GET /api/uploads?status=<pending_review|saved|all>`

- Validates active company context.
- Returns uploads for active company only.
- Supports optional `status` filter:
  - omitted defaults to `pending_review`
  - invalid value => `400 VALIDATION_ERROR`

Success shape (`200`):

```json
{
  "items": [
    {
      "id": "upload-id",
      "companyId": 1,
      "entryType": "expense",
      "originalFilename": "invoice.pdf",
      "uploadedAt": "2026-02-20T10:15:30.000Z",
      "reviewStatus": "pending_review",
      "savedEntry": null
    },
    {
      "id": "upload-id-2",
      "companyId": 1,
      "entryType": "income",
      "originalFilename": "invoice-2.pdf",
      "uploadedAt": "2026-02-20T11:00:00.000Z",
      "reviewStatus": "saved",
      "savedEntry": {
        "id": 123,
        "documentNumber": 7,
        "createdAt": "2026-02-20T11:05:00.000Z"
      }
    }
  ]
}
```

Error shape:

```json
{
  "error": {
    "code": "STRING_CODE",
    "message": "Human-readable message"
  }
}
```

Deterministic codes:

- `INVALID_ACTIVE_COMPANY` (`409`)
- `VALIDATION_ERROR` (`400`)

### 4.2 Next-pending lookup (internal behavior)

- No new public endpoint required.
- `Save entry and next` can:
  - call `GET /api/uploads?status=pending_review`,
  - skip current upload id,
  - redirect to first remaining item.

---

## 5) UI

### 5.1 New uploads queue page

- Route: `/uploads`
- Guarded by active-company context.
- Shows:
  - status filter tabs (`Pending review`, `All`, `Saved`)
  - table/list rows with:
    - `uploadedAt`
    - `originalFilename`
    - `entryType`
    - `reviewStatus`
    - action button (`Review` or `Open`)

### 5.2 Review page additions

- Add secondary action button: `Save entry and next`.
- Keep existing `Save draft` and `Save entry`.
- On successful save-and-next:
  - redirect to next pending upload review.
  - if no pending items remain, redirect to `/uploads?status=pending_review` with success message.

### 5.3 Navigation updates

- Home page adds link to `/uploads`.
- Optional label can include pending count (`Uploads (N pending)`), count calculation may be deferred if costly.

### 5.4 Workflow UX requirements

- Capture mode:
  - Upload page keeps focus on quick repeated uploads.
  - After upload success, user can immediately choose:
    - continue review now,
    - save draft and upload next,
    - return to pending queue.
- Processing mode:
  - Queue page highlights pending items and provides a clear next item to process.
  - Review page provides a primary completion path (`Save entry and next`).
  - When queue becomes empty, UI confirms completion and guides user to next useful action (for example: upload new files or view entries).

---

## 6) Data Model

No schema changes required.

- Reuse:
  - `invoice_uploads`
  - `accounting_entries` (`upload_id` unique)
  - `upload_review_drafts` from `005`

`reviewStatus` is derived at query time:

- `saved` if join finds `accounting_entries.upload_id = invoice_uploads.id`
- otherwise `pending_review`

---

## 7) Acceptance Criteria

- [ ] `/uploads` page exists and is active-company guarded.
- [ ] `GET /api/uploads` returns active-company uploads only.
- [ ] Default queue view shows only `pending_review` items.
- [ ] Queue sorting is deterministic: pending first, oldest first within status.
- [ ] Queue rows navigate to `/uploads/{id}/review`.
- [ ] `Save entry and next` saves current upload and opens next pending one.
- [ ] If no pending uploads remain after save-and-next, user lands on `/uploads?status=pending_review`.
- [ ] Existing `Save draft` and `Save entry` flows from `005` continue to work.
- [ ] Upload/review/queue screens each expose a clear primary next action (capture mode or processing mode).
- [ ] Empty queue state clearly guides the user to the next step.

---

## 8) Notes

- This slice solves discoverability/resume for draft reviews without introducing delete/archive complexity.
- Pagination can be introduced later when real data volume requires it.
