import { NextResponse } from "next/server";
import {
  getExtractionSettings,
  updateExtractionSettings,
  type UpdateExtractionSettingsInput,
} from "@/lib/extraction-settings-repo";
import type { UploadExtractionMethod } from "@/lib/invoice-uploads-repo";

export const runtime = "nodejs";

type SettingsErrorCode =
  | "INVALID_JSON"
  | "EXTRACTION_METHOD_INVALID"
  | "LOCAL_AI_CONFIG_INVALID"
  | "EXTRACTION_SETTINGS_NOT_FOUND"
  | "EXTRACTION_SETTINGS_PERSISTENCE_FAILED";

type ApiErrorPayload = {
  error: {
    code: SettingsErrorCode;
    message: string;
  };
};

function errorResponse(status: number, code: SettingsErrorCode, message: string) {
  return NextResponse.json(
    {
      error: {
        code,
        message,
      },
    } satisfies ApiErrorPayload,
    { status },
  );
}

function isExtractionMethod(value: unknown): value is UploadExtractionMethod {
  return value === "none" || value === "gpt-5-mini" || value === "local-ai";
}

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function parseUpdatePayload(payload: unknown):
  | { ok: true; value: UpdateExtractionSettingsInput }
  | { ok: false; message: string; code: SettingsErrorCode } {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {
      ok: false,
      code: "LOCAL_AI_CONFIG_INVALID",
      message: "Request body must be a JSON object.",
    };
  }

  const record = payload as Record<string, unknown>;
  if (!isExtractionMethod(record.extractionMethod)) {
    return {
      ok: false,
      code: "EXTRACTION_METHOD_INVALID",
      message: "extractionMethod must be one of: none, gpt-5-mini, local-ai.",
    };
  }

  if (!record.localAi || typeof record.localAi !== "object" || Array.isArray(record.localAi)) {
    return {
      ok: false,
      code: "LOCAL_AI_CONFIG_INVALID",
      message: "localAi must be an object.",
    };
  }
  const localAi = record.localAi as Record<string, unknown>;
  const baseUrl = typeof localAi.baseUrl === "string" ? localAi.baseUrl.trim() : "";
  const model = typeof localAi.model === "string" ? localAi.model.trim() : "";
  const timeoutMs = localAi.timeoutMs;
  const apiKeyRaw = localAi.apiKey;

  if (!isValidHttpUrl(baseUrl)) {
    return {
      ok: false,
      code: "LOCAL_AI_CONFIG_INVALID",
      message: "localAi.baseUrl must be a valid HTTP/HTTPS URL.",
    };
  }
  if (!Number.isInteger(timeoutMs) || (timeoutMs as number) < 1 || (timeoutMs as number) > 120_000) {
    return {
      ok: false,
      code: "LOCAL_AI_CONFIG_INVALID",
      message: "localAi.timeoutMs must be an integer between 1 and 120000.",
    };
  }
  if (record.extractionMethod === "local-ai" && model.length < 1) {
    return {
      ok: false,
      code: "LOCAL_AI_CONFIG_INVALID",
      message: "localAi.model is required when extractionMethod is local-ai.",
    };
  }
  if (apiKeyRaw !== undefined && apiKeyRaw !== null && typeof apiKeyRaw !== "string") {
    return {
      ok: false,
      code: "LOCAL_AI_CONFIG_INVALID",
      message: "localAi.apiKey must be a string, null, or omitted.",
    };
  }

  return {
    ok: true,
    value: {
      extractionMethod: record.extractionMethod,
      localAi: {
        baseUrl,
        model,
        timeoutMs: timeoutMs as number,
        apiKey: apiKeyRaw as string | null | undefined,
      },
    },
  };
}

export async function GET() {
  try {
    const settings = getExtractionSettings();
    return NextResponse.json(settings, { status: 200 });
  } catch {
    return errorResponse(
      500,
      "EXTRACTION_SETTINGS_NOT_FOUND",
      "Could not load extraction settings.",
    );
  }
}

export async function PUT(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return errorResponse(400, "INVALID_JSON", "Request body must be valid JSON.");
  }

  const parsed = parseUpdatePayload(payload);
  if (!parsed.ok) {
    return errorResponse(400, parsed.code, parsed.message);
  }

  try {
    const updated = updateExtractionSettings(parsed.value);
    return NextResponse.json(updated, { status: 200 });
  } catch {
    return errorResponse(
      500,
      "EXTRACTION_SETTINGS_PERSISTENCE_FAILED",
      "Could not persist extraction settings.",
    );
  }
}
