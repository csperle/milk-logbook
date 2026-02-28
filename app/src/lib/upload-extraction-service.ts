import {
  markInvoiceUploadExtractionFailed,
  markInvoiceUploadExtractionSucceeded,
  type InvoiceUpload,
} from "@/lib/invoice-uploads-repo";
import {
  createUploadReviewDraftFromExtractionIfMissing,
} from "@/lib/upload-review-repo";
import {
  extractInvoiceDraftFromPdf,
  InvoiceExtractionError,
} from "@/lib/openai/invoice-extraction";

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

export async function runUploadExtraction(upload: InvoiceUpload): Promise<void> {
  try {
    const extractedDraft = await extractInvoiceDraftFromPdf({
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
