import fs from "node:fs/promises";
import path from "node:path";
import {
  markInvoiceUploadExtractionFailed,
  markInvoiceUploadExtractionSucceeded,
  type InvoiceUpload,
} from "@/lib/invoice-uploads-repo";
import { getRuntimeExtractionSettings } from "@/lib/extraction-settings-repo";
import {
  createUploadReviewDraftFromExtractionIfMissing,
} from "@/lib/upload-review-repo";
import {
  InvoiceExtractionError,
} from "@/lib/extraction/invoice-extraction-core";
import {
  extractInvoiceDraftFromPdf,
  runResponsesApiInvoiceExtraction,
} from "@/lib/extraction/openai-extraction-provider";

const EXTRACTION_FAILURE_MESSAGES: Record<string, string> = {
  EXTRACTION_PROVIDER_ERROR: "Extraction provider request failed.",
  EXTRACTION_TIMEOUT: "Extraction request timed out.",
  EXTRACTION_INVALID_OUTPUT: "Extraction output could not be validated.",
  EXTRACTION_CONFIG_MISSING: "Extraction configuration is missing.",
  EXTRACTION_PERSISTENCE_FAILED: "Extraction output could not be persisted.",
};

function mapErrorToFailure(error: unknown): { code: string; message: string } {
  if (error instanceof InvoiceExtractionError) {
    return {
      code: error.code,
      message: EXTRACTION_FAILURE_MESSAGES[error.code] ?? error.message,
    };
  }

  return {
    code: "EXTRACTION_PROVIDER_ERROR",
    message: EXTRACTION_FAILURE_MESSAGES.EXTRACTION_PROVIDER_ERROR,
  };
}

async function extractWithLocalAi(upload: InvoiceUpload) {
  const settings = getRuntimeExtractionSettings();
  const baseUrl = settings.localAi.baseUrl.trim();
  const model = settings.localAi.model.trim();
  if (baseUrl.length < 1 || model.length < 1) {
    throw new InvoiceExtractionError(
      "EXTRACTION_CONFIG_MISSING",
      "Local AI extraction configuration is missing.",
    );
  }

  return runResponsesApiInvoiceExtraction({
    apiBaseUrl: baseUrl,
    apiKey: settings.localAi.apiKey?.trim() ? settings.localAi.apiKey.trim() : null,
    model,
    timeoutMs: settings.localAi.timeoutMs,
    filename: upload.storedFilename,
    pdfBase64: (await fs.readFile(path.join(process.cwd(), upload.storedPath))).toString("base64"),
    entryType: upload.entryType,
  });
}

export async function runUploadExtraction(upload: InvoiceUpload): Promise<void> {
  if (upload.extractionMethodUsed === "none") {
    return;
  }

  try {
    const extractedDraft =
      upload.extractionMethodUsed === "local-ai"
        ? await extractWithLocalAi(upload)
        : await extractInvoiceDraftFromPdf({
            storedPath: upload.storedPath,
            entryType: upload.entryType,
          });

    try {
      createUploadReviewDraftFromExtractionIfMissing({
        uploadId: upload.id,
        draft: extractedDraft,
      });
    } catch {
      markInvoiceUploadExtractionFailed({
        id: upload.id,
        code: "EXTRACTION_PERSISTENCE_FAILED",
        message: EXTRACTION_FAILURE_MESSAGES.EXTRACTION_PERSISTENCE_FAILED,
      });
      return;
    }

    markInvoiceUploadExtractionSucceeded({
      id: upload.id,
      extractedAt: new Date().toISOString(),
    });
  } catch (error) {
    const failure = mapErrorToFailure(error);
    markInvoiceUploadExtractionFailed({
      id: upload.id,
      code: failure.code,
      message: failure.message,
    });
  }
}
