import { NextResponse } from "next/server";
import { InvoiceExtractionError } from "@/lib/extraction/invoice-extraction-core";
import { listLocalAiModels } from "@/lib/extraction/lmstudio-extraction-provider";

export const runtime = "nodejs";

type ModelsErrorCode =
  | "INVALID_JSON"
  | "LOCAL_AI_CONFIG_INVALID"
  | "EXTRACTION_PROVIDER_ERROR"
  | "EXTRACTION_TIMEOUT"
  | "EXTRACTION_INVALID_OUTPUT"
  | "EXTRACTION_TEST_FAILED";

type ModelsRequestPayload = {
  localAi?: {
    baseUrl?: string;
    timeoutMs?: number;
    apiKey?: string | null;
  };
};

function errorResponse(
  status: number,
  code: ModelsErrorCode,
  message: string,
  details?: Record<string, unknown>,
) {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        details: details ?? null,
      },
    },
    { status },
  );
}

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function parsePayload(payload: unknown):
  | { ok: true; baseUrl: string; timeoutMs: number; apiKey: string | null }
  | { ok: false; message: string } {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, message: "Request body must be a JSON object." };
  }

  const record = payload as ModelsRequestPayload;
  if (!record.localAi || typeof record.localAi !== "object" || Array.isArray(record.localAi)) {
    return { ok: false, message: "localAi must be an object." };
  }

  const baseUrl = typeof record.localAi.baseUrl === "string" ? record.localAi.baseUrl.trim() : "";
  const timeoutMs = record.localAi.timeoutMs;
  const apiKey = typeof record.localAi.apiKey === "string" ? record.localAi.apiKey.trim() : null;

  if (!isValidHttpUrl(baseUrl)) {
    return { ok: false, message: "localAi.baseUrl must be a valid HTTP/HTTPS URL." };
  }
  if (!Number.isInteger(timeoutMs) || (timeoutMs as number) < 1 || (timeoutMs as number) > 120_000) {
    return { ok: false, message: "localAi.timeoutMs must be an integer between 1 and 120000." };
  }

  return {
    ok: true,
    baseUrl,
    timeoutMs: timeoutMs as number,
    apiKey: apiKey && apiKey.length > 0 ? apiKey : null,
  };
}

function mapFailure(error: unknown): {
  status: number;
  code: ModelsErrorCode;
  message: string;
  details?: Record<string, unknown>;
} {
  if (error instanceof InvoiceExtractionError) {
    if (error.code === "EXTRACTION_TIMEOUT") {
      return {
        status: 504,
        code: "EXTRACTION_TIMEOUT",
        message: error.message,
        details: error.details,
      };
    }
    if (error.code === "EXTRACTION_INVALID_OUTPUT") {
      return {
        status: 502,
        code: "EXTRACTION_INVALID_OUTPUT",
        message: error.message,
        details: error.details,
      };
    }
    return {
      status: 502,
      code: "EXTRACTION_PROVIDER_ERROR",
      message: error.message,
      details: error.details,
    };
  }

  return {
    status: 500,
    code: "EXTRACTION_TEST_FAILED",
    message: error instanceof Error ? error.message : "Could not load local AI models.",
  };
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return errorResponse(400, "INVALID_JSON", "Request body must be valid JSON.");
  }

  const parsed = parsePayload(payload);
  if (!parsed.ok) {
    return errorResponse(400, "LOCAL_AI_CONFIG_INVALID", parsed.message);
  }

  try {
    const modelsResult = await listLocalAiModels({
      apiBaseUrl: parsed.baseUrl,
      timeoutMs: parsed.timeoutMs,
      apiKey: parsed.apiKey,
    });

    return NextResponse.json(
      {
        models: modelsResult.models,
        loadedModelId: modelsResult.loadedModelId,
      },
      { status: 200 },
    );
  } catch (error) {
    const failure = mapFailure(error);
    return errorResponse(failure.status, failure.code, failure.message, failure.details);
  }
}
