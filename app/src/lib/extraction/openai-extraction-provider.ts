import fs from "node:fs/promises";
import path from "node:path";
import type { UploadEntryType } from "@/lib/invoice-uploads-repo";
import {
  buildInvoiceExtractionPrompt,
  DEFAULT_TIMEOUT_MS,
  getInvoiceExtractionSchema,
  InvoiceExtractionError,
  parseExtractedInvoiceDraftFromResponsesJson,
  type ExtractedInvoiceDraft,
} from "@/lib/extraction/invoice-extraction-core";

const DEFAULT_MODEL = "gpt-5-mini";

function getModel(): string {
  const configuredModel = process.env.OPENAI_EXTRACTION_MODEL?.trim();
  if (configuredModel && configuredModel.length > 0) {
    return configuredModel;
  }

  return DEFAULT_MODEL;
}

function joinBaseUrlAndPath(baseUrl: string, pathName: string): string {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const normalizedPath = pathName.startsWith("/") ? pathName : `/${pathName}`;
  return `${normalizedBase}${normalizedPath}`;
}

export async function runResponsesApiInvoiceExtraction(input: {
  apiBaseUrl: string;
  apiKey: string | null;
  model: string;
  timeoutMs: number;
  filename: string;
  pdfBase64: string;
  entryType: UploadEntryType;
}): Promise<ExtractedInvoiceDraft> {
  const effectiveTimeoutMs =
    Number.isFinite(input.timeoutMs) && input.timeoutMs > 0 ? input.timeoutMs : DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), effectiveTimeoutMs);

  let response: Response;
  try {
    response = await fetch(joinBaseUrlAndPath(input.apiBaseUrl, "/responses"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(input.apiKey ? { Authorization: `Bearer ${input.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: input.model,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_file",
                filename: input.filename,
                file_data: `data:application/pdf;base64,${input.pdfBase64}`,
              },
              {
                type: "input_text",
                text: buildInvoiceExtractionPrompt(input.entryType),
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "invoice_extraction",
            strict: true,
            schema: getInvoiceExtractionSchema(),
          },
        },
      }),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeoutHandle);
    if (error instanceof Error && error.name === "AbortError") {
      throw new InvoiceExtractionError("EXTRACTION_TIMEOUT", "Model request timed out.");
    }

    throw new InvoiceExtractionError(
      "EXTRACTION_PROVIDER_ERROR",
      "Model request failed before response.",
    );
  }
  clearTimeout(timeoutHandle);

  const responseJson = await response.json();
  if (!response.ok) {
    throw new InvoiceExtractionError(
      "EXTRACTION_PROVIDER_ERROR",
      "Model request returned an error response.",
    );
  }

  return parseExtractedInvoiceDraftFromResponsesJson({
    responseJson,
    entryType: input.entryType,
  });
}

export async function extractInvoiceDraftFromPdf(input: {
  storedPath: string;
  entryType: UploadEntryType;
}): Promise<ExtractedInvoiceDraft> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new InvoiceExtractionError(
      "EXTRACTION_CONFIG_MISSING",
      "Missing OpenAI API key configuration.",
    );
  }

  const absolutePath = path.join(process.cwd(), input.storedPath);
  const pdfBuffer = await fs.readFile(absolutePath);
  if (pdfBuffer.length < 5 || pdfBuffer.subarray(0, 5).toString("utf-8") !== "%PDF-") {
    throw new InvoiceExtractionError(
      "EXTRACTION_INVALID_OUTPUT",
      "Stored upload file is not a valid PDF.",
    );
  }

  const timeoutMs = Number.parseInt(process.env.OPENAI_EXTRACTION_TIMEOUT_MS ?? "", 10);
  const effectiveTimeoutMs =
    Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS;

  return runResponsesApiInvoiceExtraction({
    apiBaseUrl: "https://api.openai.com/v1",
    apiKey,
    model: getModel(),
    timeoutMs: effectiveTimeoutMs,
    filename: path.basename(input.storedPath),
    pdfBase64: pdfBuffer.toString("base64"),
    entryType: input.entryType,
  });
}
