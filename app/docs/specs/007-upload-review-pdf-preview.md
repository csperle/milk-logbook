# 007-upload-review-pdf-preview

- Status: Implemented (2026-02-21)

## 1) Goal

Allow users to view the original uploaded invoice PDF directly on the upload review screen (`/uploads/[id]/review`) so they can compare extracted/editable fields against the source document without leaving processing mode.

## 2) Scope (In / Out)

### In

- Add a company-scoped file-delivery API endpoint for upload PDFs:
  - `GET /api/uploads/:id/file`
- Embed the source PDF on the review page using a browser-native PDF viewer container (`iframe`).
- Add a deterministic fallback action (`Download PDF`) when inline preview is unavailable or blocked.
- Keep navigation and review form behavior from slice `006` intact.
- Apply resolved defaults for:
  - file-response cache policy
  - responsive review-page layout
  - preview availability for saved uploads

### Out

- OCR/AI extraction changes.
- Annotation tools, highlighting, drawing, or comments on PDFs.
- Multi-file compare, split-diff, or version history.
- Pagination/virtualization for queue screens.
- Editing finalized accounting entries.

## 3) Interface / API (endpoints and/or UI behavior)

### 3.1 New endpoint

`GET /api/uploads/:id/file`

Purpose:

- Serve the stored PDF for the requested upload ID, scoped to active company context.

Access/scoping rules:

- Active company must be valid (same rule as existing guarded upload/review endpoints).
- Upload must exist and belong to active company.
- No cross-company existence leakage.

Success response:

- Status: `200`
- Body: PDF binary stream/content
- Headers:
  - `Content-Type: application/pdf`
  - `Content-Disposition`:
    - default preview response: `inline; filename="<ascii-safe-fallback>.pdf"; filename*=UTF-8''<percent-encoded-original>`
    - download response (when `?download=1`): `attachment; filename="<ascii-safe-fallback>.pdf"; filename*=UTF-8''<percent-encoded-original>`
  - `Cache-Control: private, max-age=120`
  - `Vary: Cookie`

Error response shape:

```json
{
  "error": {
    "code": "STRING_CODE",
    "message": "Human-readable message"
  }
}
```

Deterministic error codes:

- `INVALID_ACTIVE_COMPANY` (`409`)
- `UPLOAD_NOT_FOUND` (`404`)
- `FILE_NOT_FOUND` (`404`) when DB metadata exists but file is missing on disk
- `FILE_READ_FAILED` (`500`)

Path/ID parsing policy:

- Any unresolvable/malformed upload id is mapped to `UPLOAD_NOT_FOUND` (`404`) to keep lookup behavior deterministic and non-enumerable.

### 3.2 Review page behavior

Route:

- `/uploads/[id]/review`

Behavior changes:

- Show embedded PDF preview panel via `iframe` pointing to `/api/uploads/{id}/file`.
- Keep existing review form and save actions unchanged.
- Provide fallback actions:
  - `Open PDF in new tab` -> `/api/uploads/{id}/file`
  - `Download PDF` -> `/api/uploads/{id}/file?download=1`
- Always show short helper text near the preview explaining fallback actions because browser-level PDF render failures are not reliably detectable.
- Keep processing-mode orientation and primary CTA rules from `006`:
  - Primary action remains review completion (`Save entry and next` when pending).
- Responsive layout requirement:
  - Desktop (`lg` and above): default side-by-side layout (PDF panel and review form visible together).
  - Mobile/tablet (below `lg`): default stacked layout with PDF panel shown before the review form.
- Preview availability rule:
  - Inline preview is shown for both `pending_review` and `saved` review statuses.

## 4) Data model (new/changed fields/tables)

No schema changes required.

Reused data:

- `invoice_uploads`:
  - `id`
  - `company_id`
  - `stored_path`
  - `original_filename`
- Company scoping via active company cookie context.

## 5) Edge cases

- Active company cookie missing/invalid -> `409 INVALID_ACTIVE_COMPANY`.
- Upload ID valid format but not found in active company scope -> `404 UPLOAD_NOT_FOUND`.
- Upload exists but underlying file was deleted/moved -> `404 FILE_NOT_FOUND`.
- File exists but cannot be read due to runtime I/O error -> `500 FILE_READ_FAILED`.
- Original filename contains special characters:
  - Response must still provide a safe user-facing filename in `Content-Disposition`.
- Browser cannot render inline PDF (settings/extensions/mobile limitations):
  - `Open PDF in new tab` and `Download PDF` fallback actions remain available and deterministic.
- Saved vs pending review status does not affect file availability:
  - both statuses can preview/download source PDF if company-scoped access is valid.
- Client-side caching behavior:
  - cached PDF responses are private and short-lived (`max-age=120`), and must not be shared across users.
- Upload id parsing behavior:
  - malformed/unresolvable id is handled as `404 UPLOAD_NOT_FOUND` (no separate validation error).

## 6) Acceptance criteria (checkboxes)

- [x] `GET /api/uploads/:id/file` exists and is active-company scoped.
- [x] Endpoint returns `200` with `Content-Type: application/pdf` for valid company-scoped uploads.
- [x] Endpoint sets `Content-Disposition` with RFC-6266-compatible filename handling (`filename` + `filename*`) and supports `attachment` mode via `?download=1`.
- [x] Endpoint sets `Cache-Control: private, max-age=120`.
- [x] Endpoint sets `Vary: Cookie` for company-scoped cache separation.
- [x] Endpoint uses deterministic error payload shape and codes (`INVALID_ACTIVE_COMPANY`, `UPLOAD_NOT_FOUND`, `FILE_NOT_FOUND`, `FILE_READ_FAILED`).
- [x] `/uploads/[id]/review` shows inline PDF preview via `iframe` for valid uploads.
- [x] Inline preview is available for both `pending_review` and `saved` statuses.
- [x] Review page uses responsive default layout: side-by-side on desktop, stacked on smaller screens.
- [x] Review page includes both fallback actions (`Open PDF in new tab`, `Download PDF`).
- [x] Existing review behaviors (`Save draft`, `Save entry`, `Save entry and next`) continue to work unchanged.
- [x] No cross-company PDF access is possible through direct URL guessing.

## 7) Open questions

- None currently.
