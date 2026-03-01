import { getDb } from "@/lib/db";
import type { UploadExtractionMethod } from "@/lib/invoice-uploads-repo";

export const DEFAULT_LOCAL_AI_BASE_URL = "http://127.0.0.1:1234/v1";
export const DEFAULT_LOCAL_AI_TIMEOUT_MS = 30_000;

type AppSettingsRow = {
  extraction_method: UploadExtractionMethod;
  local_ai_base_url: string | null;
  local_ai_model: string | null;
  local_ai_api_key: string | null;
  local_ai_timeout_ms: number | null;
};

export type ExtractionSettings = {
  extractionMethod: UploadExtractionMethod;
  localAi: {
    baseUrl: string;
    model: string;
    timeoutMs: number;
    apiKeyConfigured: boolean;
  };
};

export type RuntimeExtractionSettings = {
  extractionMethod: UploadExtractionMethod;
  localAi: {
    baseUrl: string;
    model: string;
    timeoutMs: number;
    apiKey: string | null;
  };
};

export type UpdateExtractionSettingsInput = {
  extractionMethod: UploadExtractionMethod;
  localAi: {
    baseUrl: string;
    model: string;
    timeoutMs: number;
    apiKey?: string | null;
  };
};

function normalizeBaseUrl(value: string | null): string {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : DEFAULT_LOCAL_AI_BASE_URL;
}

function normalizeModel(value: string | null): string {
  return value?.trim() ?? "";
}

function normalizeTimeout(value: number | null): number {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    return DEFAULT_LOCAL_AI_TIMEOUT_MS;
  }
  return value as number;
}

function readSettingsRow(): AppSettingsRow {
  const db = getDb();
  const row = db
    .prepare(
      `
        SELECT
          extraction_method,
          local_ai_base_url,
          local_ai_model,
          local_ai_api_key,
          local_ai_timeout_ms
        FROM app_settings
        WHERE id = 1
      `,
    )
    .get() as AppSettingsRow | undefined;

  if (!row) {
    throw new Error("Extraction settings row is missing.");
  }

  return row;
}

export function getExtractionSettings(): ExtractionSettings {
  const row = readSettingsRow();

  return {
    extractionMethod: row.extraction_method,
    localAi: {
      baseUrl: normalizeBaseUrl(row.local_ai_base_url),
      model: normalizeModel(row.local_ai_model),
      timeoutMs: normalizeTimeout(row.local_ai_timeout_ms),
      apiKeyConfigured:
        typeof row.local_ai_api_key === "string" && row.local_ai_api_key.trim().length > 0,
    },
  };
}

export function getRuntimeExtractionSettings(): RuntimeExtractionSettings {
  const row = readSettingsRow();

  return {
    extractionMethod: row.extraction_method,
    localAi: {
      baseUrl: normalizeBaseUrl(row.local_ai_base_url),
      model: normalizeModel(row.local_ai_model),
      timeoutMs: normalizeTimeout(row.local_ai_timeout_ms),
      apiKey: row.local_ai_api_key,
    },
  };
}

export function updateExtractionSettings(input: UpdateExtractionSettingsInput): ExtractionSettings {
  const db = getDb();
  const existing = readSettingsRow();
  const now = new Date().toISOString();

  const normalizedApiKey =
    input.localAi.apiKey === undefined
      ? existing.local_ai_api_key
      : input.localAi.apiKey?.trim()
        ? input.localAi.apiKey.trim()
        : null;

  db.prepare(
    `
      UPDATE app_settings
      SET
        extraction_method = ?,
        local_ai_base_url = ?,
        local_ai_model = ?,
        local_ai_api_key = ?,
        local_ai_timeout_ms = ?,
        updated_at = ?
      WHERE id = 1
    `,
  ).run(
    input.extractionMethod,
    input.localAi.baseUrl.trim(),
    input.localAi.model.trim(),
    normalizedApiKey,
    input.localAi.timeoutMs,
    now,
  );

  return getExtractionSettings();
}
