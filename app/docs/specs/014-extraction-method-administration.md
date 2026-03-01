# 014-extraction-method-administration

- Status: Implemented

## 1) Goal

Add an administration setting that selects which extraction method is used for newly uploaded invoice PDFs.

Supported methods in this slice:
- `none`
- `gpt-5-mini`
- `local-ai` (LM Studio on same machine)

The selected method controls post-upload prefill behavior on `/uploads/[id]/review` while preserving the existing manual review/save flow.

## 2) Scope (In / Out)

### In

- Add a new Administration area to view/update extraction method.
- Persist extraction-method setting in app storage (SQLite), application-wide.
- Route upload extraction behavior by selected method.
- Keep deterministic status/error handling in review API/UI.
- Store per-upload method snapshot for traceability.

### Out

- Per-company extraction-method overrides.
- Automatic fallback between methods.
- Complex provider tuning UI (prompt editing, temperature, etc.).
- Multi-node/shared configuration management.

---

## 3) Decisions (Resolved)

1. Setting scope

- Application-wide for v1.
- Rationale: extraction provider choice is operational/infrastructure-level and should be consistent across companies.

2. Admin surface

- Add new admin page: `/admin/extraction`.
- Add link in `Administration` menu: `Extraction method`.

3. Authorization model

- No auth exists in V1; any user with app access can change setting (consistent with existing admin surfaces).

4. `none` behavior

- No external extraction call is executed.
- Upload redirects immediately to review as today.
- Review uses deterministic manual-empty defaults (no placeholder extraction text):
  - `documentDate: null`
  - `counterpartyName: ""`
  - `bookingText: ""`
  - `amountGross: 0` (renders as empty input in UI until user enters value)
  - `amountNet: null`
  - `amountTax: null`
  - `paymentReceivedDate: null`
  - `typeOfExpenseId: null`

5. `gpt-5-mini` behavior

- Keep existing asynchronous extraction behavior from slice `013` unchanged.

6. `local-ai` behavior

- Use LM Studio OpenAI-compatible local API endpoint.
- Use same extraction schema contract and backend post-validation rules as `gpt-5-mini`.
- Prompt and schema must remain strict and deterministic.

7. Failure policy

- No automatic fallback to another method.
- On provider/config/output failure, mark extraction `failed` with deterministic code; review remains manually editable.

8. Health checks

- Add admin action `Test local AI connection` (best-effort ping + structured test request).
- Validation feedback is shown inline and does not block saving non-local methods.

9. Persistence and traceability

- Persist application setting in DB (single-row settings table).
- Snapshot selected method onto each upload row at creation time (`extraction_method_used`).

10. Backward compatibility

- Existing uploads are deterministically backfilled by migration; runtime inference for missing method snapshot is not used.
- No migration rewrites user draft data.

11. In-flight behavior on settings changes

- Method choice is snapshotted per upload at creation (`extraction_method_used`).
- Changing app setting affects only future uploads.
- Already-created uploads (including `pending`) continue with their snapshotted method and are not rerouted.

---

## 4) Functional Requirements

### 4.1 Administration UI

- New route `/admin/extraction` provides:
  - Current extraction method (radio/select):
    - `none`
    - `gpt-5-mini`
    - `local-ai`
  - Method-specific config panel for `local-ai`:
    - `baseUrl` (default: `http://127.0.0.1:1234/v1`)
    - `model` (required string)
    - optional `apiKey` (if LM Studio requires one)
    - timeout (ms; default 30,000)
  - Action buttons:
    - `Save settings`
    - `Test local AI connection` (enabled only when method is `local-ai`)

- Validation:
  - method required and in enum set.
  - for `local-ai`: base URL valid HTTP/HTTPS, model non-empty trimmed, timeout integer in sane range.

### 4.2 Upload Routing by Method

`POST /api/uploads` behavior by active method:

- `none`:
  - persist upload metadata as today.
  - set extraction status to `skipped` with no provider call.
  - create no AI draft row.
  - return success payload with `extractionStatus: "skipped"` and method snapshot.

- `gpt-5-mini`:
  - unchanged async extraction flow and status lifecycle (`pending -> succeeded|failed`).

- `local-ai`:
  - same async lifecycle as `gpt-5-mini`.
  - provider call targets LM Studio endpoint/config.
  - output must pass same schema and normalization validation.

### 4.3 Review API and UI

- `GET /api/uploads/:id/review` remains deterministic and includes:
  - `upload.extractionStatus`
  - `upload.extractionError` (when failed)
  - `upload.extractionMethodUsed`

- Review page behavior:
  - `none`: no polling spinner; show informational badge `Extraction disabled`.
  - `gpt-5-mini` / `local-ai`: keep existing pending polling behavior.
  - manual save/edit behavior unchanged for all methods.

### 4.4 Local AI Provider Contract

- Local AI integration is implemented behind provider abstraction in `src/lib/openai/*` (or sibling provider module), selected by method enum.
- LM Studio calls use OpenAI-compatible JSON interface and strict structured output.
- Backend re-validates all provider output exactly as current extraction pipeline does.

### 4.5 Deterministic Errors

Keep existing error shape:

```json
{
  "error": {
    "code": "STRING_CODE",
    "message": "Human-readable message"
  }
}
```

Add deterministic local-ai/admin codes:

- `EXTRACTION_METHOD_INVALID`
- `EXTRACTION_SETTINGS_NOT_FOUND`
- `EXTRACTION_CONFIG_MISSING`
- `EXTRACTION_PROVIDER_ERROR`
- `EXTRACTION_TIMEOUT`
- `EXTRACTION_INVALID_OUTPUT`
- `EXTRACTION_TEST_FAILED`

Error taxonomy rules:
- Upload extraction persistence (`invoice_uploads`) uses only `EXTRACTION_*` codes.
- Local-AI-specific failures are mapped into existing extraction taxonomy:
  - invalid local config -> `EXTRACTION_CONFIG_MISSING`
  - endpoint/network/provider failure -> `EXTRACTION_PROVIDER_ERROR`
  - timeout -> `EXTRACTION_TIMEOUT`
  - schema/validation mismatch -> `EXTRACTION_INVALID_OUTPUT`

---

## 5) Data Model Changes

### 5.1 New table: `app_settings`

- `id` (fixed single-row key, e.g. `1`)
- `extraction_method` (`none | gpt-5-mini | local-ai`) required
- `local_ai_base_url` nullable
- `local_ai_model` nullable
- `local_ai_api_key` nullable (plain text in v1 local-only app; future hardening possible)
- `local_ai_timeout_ms` nullable integer
- `updated_at` required

Constraints:
- one-row semantics enforced by fixed primary key.
- method enum check constraint.

### 5.2 Upload metadata extension

Add `invoice_uploads.extraction_method_used` enum:
- `none | gpt-5-mini | local-ai`

Rules:
- set at upload creation from current app setting.
- immutable after upload is created.

### 5.3 Migration defaults

- Seed `app_settings` with:
  - `extraction_method = 'gpt-5-mini'`
  - local-ai fields null/default.
- Backfill historical uploads:
  - `extraction_method_used = 'none'` where `extraction_error_code = 'EXTRACTION_NOT_ATTEMPTED'`
  - `extraction_method_used = 'gpt-5-mini'` for all remaining rows

Extraction status lifecycle extension:
- `pending | succeeded | failed | skipped`
- `skipped` means extraction intentionally disabled (`none` method), not a failure.

---

## 6) API Interfaces

### 6.1 New admin settings endpoints

`GET /api/admin/extraction-settings`

Returns:

```json
{
  "extractionMethod": "gpt-5-mini",
  "localAi": {
    "baseUrl": "http://127.0.0.1:1234/v1",
    "model": "qwen2.5-7b-instruct",
    "timeoutMs": 30000,
    "apiKeyConfigured": false
  }
}
```

`PUT /api/admin/extraction-settings`

Request:

```json
{
  "extractionMethod": "local-ai",
  "localAi": {
    "baseUrl": "http://127.0.0.1:1234/v1",
    "model": "qwen2.5-7b-instruct",
    "timeoutMs": 30000,
    "apiKey": null
  }
}
```

Returns updated settings with masked key semantics (`apiKeyConfigured`).

`POST /api/admin/extraction-settings/test-local-ai`

- Uses persisted local-ai settings (no request body).
- Performs deterministic two-step test:
  - step 1: provider reachability check (`GET /models` on configured base URL)
  - step 2: minimal strict-JSON structured output check via OpenAI-compatible response call (text-only dry-run; no PDF needed)
- Returns success only if both steps pass within timeout.
- Deterministic response contract:

```json
{
  "ok": true,
  "providerReachable": true,
  "structuredOutputOk": true,
  "latencyMs": 123
}
```

Failure shape keeps standard `{ error: { code, message } }` with codes from section 4.5.

### 6.2 Upload endpoint extension

`POST /api/uploads` success metadata extends with:

```json
{
  "id": "upload-id",
  "companyId": 1,
  "entryType": "expense",
  "originalFilename": "invoice.pdf",
  "storedFilename": "uuid.pdf",
  "uploadedAt": "2026-03-01T10:15:30.000Z",
  "extractionStatus": "pending",
  "extractionMethodUsed": "gpt-5-mini"
}
```

For `none`, `extractionStatus` is immediately `skipped`.

---

## 7) UX Details

- Navigation:
  - Add `Extraction method` inside existing `Administration` dropdown.
- Labels:
  - Method labels in UI:
    - `None (manual review only)`
    - `OpenAI gpt-5-mini`
    - `Local AI (LM Studio)`
- Review status copy:
  - `Extraction disabled` for `none`.
  - existing pending/success/failed labels retained for AI methods.

---

## 8) Acceptance Criteria

- [ ] Admin can open `/admin/extraction`, select one of three methods, and persist the choice.
- [ ] Uploads created after setting change use the selected method only.
- [ ] Method `none` performs no extraction call and review is immediately usable with manual defaults.
- [ ] Method `none` sets `extractionStatus = skipped` (not failed) and never enters polling state.
- [ ] Method `gpt-5-mini` preserves current behavior unchanged.
- [ ] Method `local-ai` calls configured LM Studio endpoint and either prefills draft on success or records deterministic failure on error.
- [ ] Each upload stores immutable `extractionMethodUsed`.
- [ ] Changing extraction method does not alter behavior of already-created uploads.
- [ ] Review API/UI exposes method-used and appropriate status/UX behavior.
- [ ] Existing workflows (upload -> review -> save, save-and-next, yearly overview, annual P&L) remain unaffected.

---

## 9) Minimal Rollout Plan

1. Add settings persistence + migration (`app_settings`, `extraction_method_used`).
2. Add admin extraction settings API and `/admin/extraction` UI.
3. Refactor extraction service behind method router (`none`, `gpt-5-mini`, `local-ai`).
4. Extend upload/review contracts and UI status handling for `extractionMethodUsed`.
5. Validate with manual scenarios for all three methods plus deterministic error cases.

---

## 10) Open Questions and Follow-ups

1. Should local AI API key be persisted plain-text in SQLite for v1, or moved immediately to env-only secret management?
   - Proposed now: allow DB persistence (local-only app), with future hardening slice if deployment model changes.

2. Should we add optional global fallback (`local-ai -> none`) later?
   - Proposed now: no fallback in this slice; explicit failure is safer and more transparent.

3. Should per-company override be added later?
   - Proposed now: defer; introduce only if operational need appears.
