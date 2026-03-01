import fs from "node:fs/promises";
import path from "node:path";
import type { UploadEntryType } from "@/lib/invoice-uploads-repo";

type ExtractionErrorCode =
  | "EXTRACTION_PROVIDER_ERROR"
  | "EXTRACTION_TIMEOUT"
  | "EXTRACTION_INVALID_OUTPUT"
  | "EXTRACTION_CONFIG_MISSING";

export class InvoiceExtractionError extends Error {
  code: ExtractionErrorCode;
  details?: Record<string, unknown>;

  constructor(code: ExtractionErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

export type ExtractedInvoiceDraft = {
  documentDate: string | null;
  counterpartyName: string | null;
  bookingText: string | null;
  amountGross: number;
  amountNet: number | null;
  amountTax: number | null;
  paymentReceivedDate: string | null;
};

const DEFAULT_MODEL = "gpt-5-mini";
const DEFAULT_TIMEOUT_MS = 30_000;

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

async function readResponseBodySnippet(response: Response): Promise<string> {
  try {
    const body = await response.text();
    const trimmed = body.trim();
    if (trimmed.length < 1) {
      return "<empty body>";
    }

    return trimmed.slice(0, 400);
  } catch {
    return "<unreadable body>";
  }
}

export function buildInvoiceExtractionPrompt(entryType: UploadEntryType): string {
  return [
    "You extract bookkeeping fields from a single invoice PDF.",
    "",
    "Return ONLY JSON matching the provided schema.",
    "",
    "Rules:",
    "- Do not guess. If a field is missing or unclear, return null.",
    "- Use date format YYYY-MM-DD.",
    "- Amount fields must be integer cents (CHF/rappen), non-negative.",
    "- Parse common number formats (apostrophe/comma/dot/space thousands separators).",
    "- amountGross is required by schema; if missing, return 0.",
    "- amountNet and amountTax are optional; return null when not confidently present.",
    "- Keep text fields concise and source-faithful.",
    "- paymentReceivedDate is only for income documents; otherwise return null.",
    "- 'Christoph Sperle' is NEVER the counterpartyName because it is the name of the invoice recipient.",
    "- Never output markdown or extra keys.",
    "",
    `Document entryType context: ${entryType}.`,
  ].join("\n");
}

export function getInvoiceExtractionSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      documentDate: { type: ["string", "null"], pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      counterpartyName: { type: ["string", "null"] },
      bookingText: { type: ["string", "null"] },
      amountGross: { type: "integer", minimum: 0 },
      amountNet: { type: ["integer", "null"], minimum: 0 },
      amountTax: { type: ["integer", "null"], minimum: 0 },
      paymentReceivedDate: { type: ["string", "null"], pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    },
    required: [
      "documentDate",
      "counterpartyName",
      "bookingText",
      "amountGross",
      "amountNet",
      "amountTax",
      "paymentReceivedDate",
    ],
  };
}

export function tryExtractJsonText(responseJson: unknown): string | null {
  if (!responseJson || typeof responseJson !== "object") {
    return null;
  }

  const responseRecord = responseJson as Record<string, unknown>;
  if (
    typeof responseRecord.output_text === "string" &&
    responseRecord.output_text.trim().length > 0
  ) {
    return responseRecord.output_text;
  }

  if (!Array.isArray(responseRecord.output)) {
    return null;
  }

  for (const item of responseRecord.output) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) {
      continue;
    }

    for (const contentItem of content) {
      if (!contentItem || typeof contentItem !== "object") {
        continue;
      }

      const contentRecord = contentItem as Record<string, unknown>;
      if (contentRecord.type === "output_text" && typeof contentRecord.text === "string") {
        return contentRecord.text;
      }
    }
  }

  return null;
}

function isDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function normalizeText(value: unknown, maxLength: number): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    throw new InvoiceExtractionError(
      "EXTRACTION_INVALID_OUTPUT",
      "Model returned invalid text field type.",
    );
  }

  const trimmed = value.trim();
  if (trimmed.length < 1) {
    return null;
  }

  return trimmed.slice(0, maxLength);
}

function normalizeDate(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string" || !isDateOnly(value)) {
    throw new InvoiceExtractionError(
      "EXTRACTION_INVALID_OUTPUT",
      "Model returned invalid date field format.",
    );
  }

  return value;
}

function normalizeAmount(value: unknown, required: boolean): number | null {
  if (value === null || value === undefined) {
    if (required) {
      throw new InvoiceExtractionError(
        "EXTRACTION_INVALID_OUTPUT",
        "Model did not return a required amount field.",
      );
    }
    return null;
  }

  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new InvoiceExtractionError(
      "EXTRACTION_INVALID_OUTPUT",
      "Model returned invalid amount field value.",
    );
  }

  return value as number;
}

function normalizePayload(payload: unknown, entryType: UploadEntryType): ExtractedInvoiceDraft {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new InvoiceExtractionError(
      "EXTRACTION_INVALID_OUTPUT",
      "Model output was not a JSON object.",
    );
  }

  const record = payload as Record<string, unknown>;

  const amountGross = normalizeAmount(record.amountGross, true);
  const paymentReceivedDate = normalizeDate(record.paymentReceivedDate);

  return {
    documentDate: normalizeDate(record.documentDate),
    counterpartyName: normalizeText(record.counterpartyName, 200),
    bookingText: normalizeText(record.bookingText, 500),
    amountGross: amountGross as number,
    amountNet: normalizeAmount(record.amountNet, false),
    amountTax: normalizeAmount(record.amountTax, false),
    paymentReceivedDate: entryType === "income" ? paymentReceivedDate : null,
  };
}

export function parseExtractedInvoiceDraftFromResponsesJson(input: {
  responseJson: unknown;
  entryType: UploadEntryType;
}): ExtractedInvoiceDraft {
  const jsonText = tryExtractJsonText(input.responseJson);
  if (!jsonText) {
    throw new InvoiceExtractionError(
      "EXTRACTION_INVALID_OUTPUT",
      "Model response did not include extraction output.",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new InvoiceExtractionError(
      "EXTRACTION_INVALID_OUTPUT",
      "Model response was not valid JSON.",
    );
  }

  return normalizePayload(parsed, input.entryType);
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

export async function testResponsesApiStructuredOutput(input: {
  apiBaseUrl: string;
  apiKey: string | null;
  model: string;
  timeoutMs: number;
}): Promise<{ latencyMs: number }> {
  const effectiveTimeoutMs =
    Number.isFinite(input.timeoutMs) && input.timeoutMs > 0 ? input.timeoutMs : DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), effectiveTimeoutMs);
  const startedAt = Date.now();

  const modelsUrl = joinBaseUrlAndPath(input.apiBaseUrl, "/models");
  const responsesUrl = joinBaseUrlAndPath(input.apiBaseUrl, "/responses");

  try {
    const modelsResponse = await fetch(modelsUrl, {
      method: "GET",
      headers: input.apiKey ? { Authorization: `Bearer ${input.apiKey}` } : {},
      signal: controller.signal,
    });
    if (!modelsResponse.ok) {
      const bodySnippet = await readResponseBodySnippet(modelsResponse);
      throw new InvoiceExtractionError(
        "EXTRACTION_PROVIDER_ERROR",
        `Step 'provider-reachability' failed: GET /models returned ${modelsResponse.status}.`,
        {
          step: "provider-reachability",
          url: modelsUrl,
          httpStatus: modelsResponse.status,
          responseBodySnippet: bodySnippet,
        },
      );
    }

    const response = await fetch(responsesUrl, {
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
                type: "input_text",
                text: "Return a JSON object with key 'ok' set to true.",
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "local_ai_health_check",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                ok: { type: "boolean" },
              },
              required: ["ok"],
            },
          },
        },
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const bodySnippet = await readResponseBodySnippet(response);
      throw new InvoiceExtractionError(
        "EXTRACTION_PROVIDER_ERROR",
        `Step 'structured-output' failed: POST /responses returned ${response.status}.`,
        {
          step: "structured-output",
          url: responsesUrl,
          httpStatus: response.status,
          responseBodySnippet: bodySnippet,
        },
      );
    }

    const payload = await response.json();
    const jsonText = tryExtractJsonText(payload);
    if (!jsonText) {
      throw new InvoiceExtractionError(
        "EXTRACTION_INVALID_OUTPUT",
        "Structured output test did not return JSON text.",
        {
          step: "structured-output",
          url: responsesUrl,
        },
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      throw new InvoiceExtractionError(
        "EXTRACTION_INVALID_OUTPUT",
        "Structured output test returned invalid JSON.",
        {
          step: "structured-output",
          url: responsesUrl,
        },
      );
    }

    if (
      !parsed ||
      typeof parsed !== "object" ||
      (parsed as Record<string, unknown>).ok !== true
    ) {
      throw new InvoiceExtractionError(
        "EXTRACTION_INVALID_OUTPUT",
        "Structured output test JSON shape was invalid.",
        {
          step: "structured-output",
          url: responsesUrl,
        },
      );
    }

    return { latencyMs: Date.now() - startedAt };
  } catch (error) {
    if (error instanceof InvoiceExtractionError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new InvoiceExtractionError("EXTRACTION_TIMEOUT", "Model request timed out.", {
        step: "provider-reachability-or-structured-output",
        modelsUrl,
        responsesUrl,
        timeoutMs: effectiveTimeoutMs,
      });
    }

    throw new InvoiceExtractionError(
      "EXTRACTION_PROVIDER_ERROR",
      `Model request failed before response: ${error instanceof Error ? error.message : "unknown error"}.`,
      {
        step: "provider-reachability-or-structured-output",
        modelsUrl,
        responsesUrl,
      },
    );
  } finally {
    clearTimeout(timeoutHandle);
  }
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
