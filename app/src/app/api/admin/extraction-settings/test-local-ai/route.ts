import { NextResponse } from "next/server";
import { getRuntimeExtractionSettings } from "@/lib/extraction-settings-repo";
import { InvoiceExtractionError } from "@/lib/extraction/invoice-extraction-core";
import { testLmStudioApiHealth } from "@/lib/extraction/lmstudio-extraction-provider";

export const runtime = "nodejs";

type TestErrorCode =
  | "EXTRACTION_CONFIG_MISSING"
  | "EXTRACTION_PROVIDER_ERROR"
  | "EXTRACTION_TIMEOUT"
  | "EXTRACTION_INVALID_OUTPUT"
  | "EXTRACTION_TEST_FAILED";

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

export async function POST() {
  try {
    const settings = getRuntimeExtractionSettings();
    if (settings.extractionMethod !== "local-ai") {
      return errorResponse(
        400,
        "EXTRACTION_CONFIG_MISSING",
        "Set extraction method to local-ai before running this test.",
      );
    }

    if (settings.localAi.baseUrl.trim().length < 1 || settings.localAi.model.trim().length < 1) {
      return errorResponse(
        400,
        "EXTRACTION_CONFIG_MISSING",
        "Local AI base URL and model are required.",
      );
    }

    const testResult = await testLmStudioApiHealth({
      apiBaseUrl: settings.localAi.baseUrl,
      apiKey: settings.localAi.apiKey?.trim() ? settings.localAi.apiKey.trim() : null,
      model: settings.localAi.model,
      timeoutMs: settings.localAi.timeoutMs,
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
