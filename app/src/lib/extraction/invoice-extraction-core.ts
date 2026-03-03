import type { UploadEntryType } from "@/lib/invoice-uploads-repo";

export type ExtractionErrorCode =
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

export const DEFAULT_TIMEOUT_MS = 30_000;

export function buildInvoiceExtractionPrompt(entryType: UploadEntryType): string {
  const requiredKeys = [
    "documentDate",
    "counterpartyName",
    "bookingText",
    "amountGross",
    "amountNet",
    "amountTax",
    "paymentReceivedDate",
  ].join(", ");

  return [
    "You extract bookkeeping fields from a single invoice PDF.",
    "",
    "Return ONLY one JSON object. No markdown. No prose. No code fences.",
    "",
    "IMPORTANT OUTPUT CONTRACT:",
    `- Output EXACTLY these keys and no others: ${requiredKeys}.`,
    "- Use these exact key names. Do not rename keys.",
    "- If invoice uses other labels, map them to the required keys:",
    "  - date | invoiceDate -> documentDate",
    "  - description | lineItemDescription -> bookingText",
    "  - total | gross | amountTotal -> amountGross",
    "  - subtotal | net | amountExclTax -> amountNet",
    "  - vat | tax | mwst -> amountTax",
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
    "Field guidance:",
    "- documentDate: invoice/bill document date, not due date and not service period end date.",
    "- counterpartyName: seller/issuer company name (invoice sender).",
    "- bookingText: short booking description of goods/services (invoice subject).",
    "- amountGross: total amount including tax, in cents (integer).",
    "- amountNet: amount excluding tax, in cents (integer) or null.",
    "- amountTax: tax amount, in cents (integer) or null.",
    "- paymentReceivedDate: only for income entryType when explicitly known; otherwise null.",
    "",
    "Example valid output:",
    '{"documentDate":"2025-04-01","counterpartyName":"wint.global GmbH","bookingText":"Domain renewal sperle.ch + privacy service","amountGross":2034,"amountNet":1709,"amountTax":325,"paymentReceivedDate":null}',
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

function pickAliasValue(
  record: Record<string, unknown>,
  canonicalKey: string,
  aliases: string[],
): unknown {
  if (canonicalKey in record) {
    return record[canonicalKey];
  }

  for (const alias of aliases) {
    if (alias in record) {
      return record[alias];
    }
  }

  return undefined;
}

function normalizePayload(payload: unknown, entryType: UploadEntryType): ExtractedInvoiceDraft {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new InvoiceExtractionError(
      "EXTRACTION_INVALID_OUTPUT",
      "Model output was not a JSON object.",
    );
  }

  const record = payload as Record<string, unknown>;
  const amountGross = normalizeAmount(
    pickAliasValue(record, "amountGross", [
      "gross",
      "total",
      "totalAmount",
      "amountTotal",
      "amount_total",
      "grossAmount",
    ]),
    true,
  );
  const paymentReceivedDate = normalizeDate(
    pickAliasValue(record, "paymentReceivedDate", [
      "paymentDate",
      "receivedDate",
      "payment_received_date",
    ]),
  );

  return {
    documentDate: normalizeDate(
      pickAliasValue(record, "documentDate", ["date", "invoiceDate", "invoice_date"]),
    ),
    counterpartyName: normalizeText(
      pickAliasValue(record, "counterpartyName", [
        "vendorName",
        "supplierName",
        "issuerName",
      ]),
      200,
    ),
    bookingText: normalizeText(
      pickAliasValue(record, "bookingText", [
        "description",
        "lineItemDescription",
        "lineDescription",
        "purpose",
      ]),
      500,
    ),
    amountGross: amountGross as number,
    amountNet: normalizeAmount(
      pickAliasValue(record, "amountNet", [
        "net",
        "subtotal",
        "netAmount",
        "amountExclTax",
        "amount_excl_tax",
      ]),
      false,
    ),
    amountTax: normalizeAmount(
      pickAliasValue(record, "amountTax", ["tax", "vat", "taxAmount", "mwst"]),
      false,
    ),
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
