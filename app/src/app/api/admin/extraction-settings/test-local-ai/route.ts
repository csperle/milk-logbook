import { NextResponse } from "next/server";
import { InvoiceExtractionError } from "@/lib/extraction/invoice-extraction-core";
import { testLmStudioApiHealth } from "@/lib/extraction/lmstudio-extraction-provider";

export const runtime = "nodejs";

type TestErrorCode =
  | "INVALID_JSON"
  | "LOCAL_AI_CONFIG_INVALID"
  | "EXTRACTION_CONFIG_MISSING"
  | "EXTRACTION_PROVIDER_ERROR"
  | "EXTRACTION_TIMEOUT"
  | "EXTRACTION_INVALID_OUTPUT"
  | "EXTRACTION_TEST_FAILED";

type TestRequestPayload = {
  localAi?: {
    baseUrl?: string;
    model?: string;
    timeoutMs?: number;
    apiKey?: string | null;
  };
};

function errorResponse(
  status: number,
  code: TestErrorCode,
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
  | { ok: true; baseUrl: string; model: string; timeoutMs: number; apiKey: string | null }
  | { ok: false; code: TestErrorCode; message: string } {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {
      ok: false,
      code: "LOCAL_AI_CONFIG_INVALID",
      message: "Request body must be a JSON object.",
    };
  }

  const record = payload as TestRequestPayload;
  if (!record.localAi || typeof record.localAi !== "object" || Array.isArray(record.localAi)) {
    return {
      ok: false,
      code: "LOCAL_AI_CONFIG_INVALID",
      message: "localAi must be an object.",
    };
  }

  const baseUrl = typeof record.localAi.baseUrl === "string" ? record.localAi.baseUrl.trim() : "";
  const model = typeof record.localAi.model === "string" ? record.localAi.model.trim() : "";
  const timeoutMs = record.localAi.timeoutMs;
  const apiKeyRaw = record.localAi.apiKey;

  if (!isValidHttpUrl(baseUrl)) {
    return {
      ok: false,
      code: "LOCAL_AI_CONFIG_INVALID",
      message: "localAi.baseUrl must be a valid HTTP/HTTPS URL.",
    };
  }
  if (model.length < 1) {
    return {
      ok: false,
      code: "EXTRACTION_CONFIG_MISSING",
      message: "localAi.model is required.",
    };
  }
  if (!Number.isInteger(timeoutMs) || (timeoutMs as number) < 1 || (timeoutMs as number) > 120_000) {
    return {
      ok: false,
      code: "LOCAL_AI_CONFIG_INVALID",
      message: "localAi.timeoutMs must be an integer between 1 and 120000.",
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
    baseUrl,
    model,
    timeoutMs: timeoutMs as number,
    apiKey: typeof apiKeyRaw === "string" && apiKeyRaw.trim().length > 0 ? apiKeyRaw.trim() : null,
  };
}

function mapFailure(error: unknown): {
  status: number;
  code: TestErrorCode;
  message: string;
  details?: Record<string, unknown>;
} {
  if (error instanceof InvoiceExtractionError) {
    if (error.code === "EXTRACTION_CONFIG_MISSING") {
      return {
        status: 400,
        code: error.code,
        message: error.message,
        details: error.details,
      };
    }

    if (error.code === "EXTRACTION_TIMEOUT") {
      return {
        status: 504,
        code: error.code,
        message: error.message,
        details: error.details,
      };
    }

    if (error.code === "EXTRACTION_INVALID_OUTPUT") {
      return {
        status: 502,
        code: error.code,
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
    message: error instanceof Error ? error.message : "Local AI test failed unexpectedly.",
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
    return errorResponse(400, parsed.code, parsed.message);
  }

  try {
    const testResult = await testLmStudioApiHealth({
      apiBaseUrl: parsed.baseUrl,
      apiKey: parsed.apiKey,
      model: parsed.model,
      timeoutMs: parsed.timeoutMs,
    });

    return NextResponse.json(
      {
        ok: true,
        providerReachable: true,
        structuredOutputOk: testResult.expectedReplyMatched,
        expectedReplyMatched: testResult.expectedReplyMatched,
        actualReply: testResult.actualReply,
        latencyMs: testResult.latencyMs,
      },
      { status: 200 },
    );
  } catch (error) {
    const failure = mapFailure(error);
    return errorResponse(failure.status, failure.code, failure.message, failure.details);
  }
}
