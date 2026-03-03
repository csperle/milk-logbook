#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { PDFParse } from "pdf-parse";

const DEFAULT_BASE_URL = "http://host.docker.internal:1234";
const DEFAULT_TIMEOUT_MS = 120_000;

function printUsage() {
  console.log(
    [
      "Usage:",
      "  node scripts/test-local-ai-pdf-extraction.mjs --file <absolute-or-relative-pdf-path> --entry-type <income|expense> [--base-url <url>] [--api-key <key>] [--timeout-ms <number>] [--model <optional-override>]",
      "",
      "Environment variable fallbacks:",
      "  --base-url: LOCAL_AI_BASE_URL (default http://host.docker.internal:1234)",
      "  --model: LOCAL_AI_MODEL (optional override; default behavior auto-uses loaded LM Studio model)",
      "  --api-key: LOCAL_AI_API_KEY (optional)",
      "",
      "Example:",
      "  node scripts/test-local-ai-pdf-extraction.mjs --file ./sample.pdf --entry-type expense",
    ].join("\n"),
  );
}

function parseArgs(argv) {
  const args = {
    file: "",
    entryType: "",
    baseUrl: process.env.LOCAL_AI_BASE_URL ?? DEFAULT_BASE_URL,
    model: process.env.LOCAL_AI_MODEL ?? "",
    apiKey: process.env.LOCAL_AI_API_KEY ?? "",
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    const next = argv[index + 1];

    if (value === "--help" || value === "-h") {
      args.help = true;
      continue;
    }

    if (value === "--file") {
      args.file = next ?? "";
      index += 1;
      continue;
    }

    if (value === "--entry-type") {
      args.entryType = next ?? "";
      index += 1;
      continue;
    }

    if (value === "--base-url") {
      args.baseUrl = next ?? "";
      index += 1;
      continue;
    }

    if (value === "--model") {
      args.model = next ?? "";
      index += 1;
      continue;
    }

    if (value === "--api-key") {
      args.apiKey = next ?? "";
      index += 1;
      continue;
    }

    if (value === "--timeout-ms") {
      const parsed = Number(next);
      if (!Number.isFinite(parsed) || parsed < 1) {
        throw new Error("--timeout-ms must be a positive integer.");
      }
      args.timeoutMs = parsed;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${value}`);
  }

  return args;
}

function joinLmStudioApiV1Path(baseUrl, pathName) {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  const withoutKnownSuffix = trimmed.replace(/\/api\/v1$/i, "").replace(/\/v1$/i, "");
  const apiBase = `${withoutKnownSuffix}/api/v1`;
  const normalizedPath = pathName.startsWith("/") ? pathName : `/${pathName}`;
  return `${apiBase}${normalizedPath}`;
}

function isModelLoaded(modelRecord) {
  if (Array.isArray(modelRecord.loaded_instances) && modelRecord.loaded_instances.length > 0) {
    return true;
  }

  if (modelRecord.loaded === true || modelRecord.is_loaded === true) {
    return true;
  }

  const state = typeof modelRecord.state === "string" ? modelRecord.state.toLowerCase() : "";
  const status = typeof modelRecord.status === "string" ? modelRecord.status.toLowerCase() : "";
  return state.includes("loaded") || status.includes("loaded") || status.includes("active");
}

function resolveLoadedModelFromModelsPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const modelsRaw = Array.isArray(payload.models)
    ? payload.models
    : Array.isArray(payload.data)
      ? payload.data
      : null;
  if (!modelsRaw) {
    return null;
  }

  for (const rawModel of modelsRaw) {
    if (!rawModel || typeof rawModel !== "object" || Array.isArray(rawModel)) {
      continue;
    }

    const modelType = typeof rawModel.type === "string" ? rawModel.type.trim().toLowerCase() : "";
    if (modelType === "embedding" || modelType === "embeddings") {
      continue;
    }

    const loaded = isModelLoaded(rawModel);
    if (!loaded) {
      continue;
    }

    const idCandidate =
      typeof rawModel.key === "string"
        ? rawModel.key
        : typeof rawModel.id === "string"
          ? rawModel.id
          : "";
    const id = idCandidate.trim();
    if (id.length > 0) {
      return id;
    }
  }

  return null;
}

function isValidHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function buildPrompt(entryType) {
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

function extractChatMessageText(responseJson) {
  if (!responseJson || typeof responseJson !== "object" || Array.isArray(responseJson)) {
    return null;
  }

  if (typeof responseJson.output_text === "string" && responseJson.output_text.trim().length > 0) {
    return responseJson.output_text;
  }

  if (!Array.isArray(responseJson.output)) {
    return null;
  }

  for (const item of responseJson.output) {
    if (!item || typeof item !== "object" || Array.isArray(item) || item.type !== "message") {
      continue;
    }

    if (typeof item.content === "string" && item.content.trim().length > 0) {
      return item.content;
    }

    if (!Array.isArray(item.content)) {
      continue;
    }

    const textParts = [];
    for (const content of item.content) {
      if (!content || typeof content !== "object" || Array.isArray(content)) {
        continue;
      }
      if ((content.type === "text" || content.type === "output_text") && typeof content.text === "string") {
        const trimmed = content.text.trim();
        if (trimmed.length > 0) {
          textParts.push(trimmed);
        }
      } else if (typeof content.content === "string" && content.content.trim().length > 0) {
        textParts.push(content.content.trim());
      }
    }

    if (textParts.length > 0) {
      return textParts.join(" ");
    }
  }

  return null;
}

function isDateOnly(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function pickAliasValue(record, canonicalKey, aliases) {
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

function normalizePayloadWithAliases(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const record = payload;
  return {
    documentDate: pickAliasValue(record, "documentDate", ["date", "invoiceDate", "invoice_date"]),
    counterpartyName: pickAliasValue(record, "counterpartyName", [
      "vendorName",
      "supplierName",
      "issuerName",
    ]),
    bookingText: pickAliasValue(record, "bookingText", [
      "description",
      "lineItemDescription",
      "lineDescription",
      "purpose",
    ]),
    amountGross: pickAliasValue(record, "amountGross", [
      "gross",
      "total",
      "totalAmount",
      "amountTotal",
      "amount_total",
      "grossAmount",
    ]),
    amountNet: pickAliasValue(record, "amountNet", [
      "net",
      "subtotal",
      "netAmount",
      "amountExclTax",
      "amount_excl_tax",
    ]),
    amountTax: pickAliasValue(record, "amountTax", ["tax", "vat", "taxAmount", "mwst"]),
    paymentReceivedDate: pickAliasValue(record, "paymentReceivedDate", [
      "paymentDate",
      "receivedDate",
      "payment_received_date",
    ]),
  };
}

function validateExtractionPayload(payload) {
  const errors = [];
  const requiredKeys = [
    "documentDate",
    "counterpartyName",
    "bookingText",
    "amountGross",
    "amountNet",
    "amountTax",
    "paymentReceivedDate",
  ];

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return ["response is not a JSON object"];
  }
  const normalized = normalizePayloadWithAliases(payload);
  if (!normalized) {
    return ["response is not a JSON object"];
  }

  for (const key of requiredKeys) {
    if (!(key in normalized)) {
      errors.push(`missing required key: ${key}`);
    }
  }

  if (normalized.documentDate !== null && normalized.documentDate !== undefined && !isDateOnly(normalized.documentDate)) {
    errors.push("documentDate must be null or strict YYYY-MM-DD");
  }

  if (
    normalized.counterpartyName !== null &&
    normalized.counterpartyName !== undefined &&
    typeof normalized.counterpartyName !== "string"
  ) {
    errors.push("counterpartyName must be string or null");
  }

  if (normalized.bookingText !== null && normalized.bookingText !== undefined && typeof normalized.bookingText !== "string") {
    errors.push("bookingText must be string or null");
  }

  if (!Number.isInteger(normalized.amountGross) || normalized.amountGross < 0) {
    errors.push("amountGross must be a non-negative integer");
  }

  if (
    normalized.amountNet !== null &&
    normalized.amountNet !== undefined &&
    (!Number.isInteger(normalized.amountNet) || normalized.amountNet < 0)
  ) {
    errors.push("amountNet must be null or a non-negative integer");
  }

  if (
    normalized.amountTax !== null &&
    normalized.amountTax !== undefined &&
    (!Number.isInteger(normalized.amountTax) || normalized.amountTax < 0)
  ) {
    errors.push("amountTax must be null or a non-negative integer");
  }

  if (
    normalized.paymentReceivedDate !== null &&
    normalized.paymentReceivedDate !== undefined &&
    !isDateOnly(normalized.paymentReceivedDate)
  ) {
    errors.push("paymentReceivedDate must be null or strict YYYY-MM-DD");
  }

  return errors;
}

async function readResponseDebug(response) {
  let body = "<empty>";
  try {
    const raw = await response.text();
    body = raw.trim().length > 0 ? raw.trim().slice(0, 1200) : "<empty>";
  } catch {
    body = "<unreadable>";
  }

  return {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body,
  };
}

function normalizeExtractedText(input) {
  return input
    .replace(/\u0000/g, "")
    .replace(/[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, " ")
    .replace(/[^\S\r\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractTextFromPdfBuffer(fileBuffer) {
  const parser = new PDFParse({ data: fileBuffer });
  try {
    const result = await parser.getText();
    return normalizeExtractedText(result.text).slice(0, 200_000);
  } finally {
    await parser.destroy();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }

  if (!args.file) {
    throw new Error("Missing required argument: --file");
  }

  if (args.entryType !== "income" && args.entryType !== "expense") {
    throw new Error("Missing or invalid --entry-type. Use income or expense.");
  }

  const baseUrl = args.baseUrl.trim();
  if (!isValidHttpUrl(baseUrl)) {
    throw new Error("Invalid --base-url. Use a valid http(s) URL, e.g. http://127.0.0.1:1234");
  }

  const pdfPath = path.resolve(args.file);
  const fileBuffer = await fs.readFile(pdfPath);

  if (fileBuffer.length < 5 || fileBuffer.subarray(0, 5).toString("utf8") !== "%PDF-") {
    throw new Error(`File is not a valid PDF signature: ${pdfPath}`);
  }

  const extractedText = await extractTextFromPdfBuffer(fileBuffer);
  if (extractedText.length < 1) {
    throw new Error("Could not extract usable text from PDF.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), args.timeoutMs);
  const startTime = Date.now();

  const modelsUrl = joinLmStudioApiV1Path(baseUrl, "/models");
  const chatUrl = joinLmStudioApiV1Path(baseUrl, "/chat");
  const headers = {
    "Content-Type": "application/json",
    ...(args.apiKey.trim().length > 0 ? { Authorization: `Bearer ${args.apiKey.trim()}` } : {}),
  };

  console.log(`Step 1/2: Checking provider reachability via ${modelsUrl}`);
  let modelsResponse;
  try {
    modelsResponse = await fetch(modelsUrl, {
      method: "GET",
      headers: args.apiKey.trim().length > 0 ? { Authorization: `Bearer ${args.apiKey.trim()}` } : {},
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
  if (!modelsResponse.ok) {
    clearTimeout(timeout);
    const debug = await readResponseDebug(modelsResponse);
    console.error("Step failed: provider reachability.");
    console.error(JSON.stringify(debug, null, 2));
    process.exitCode = 1;
    return;
  }

  let modelsPayload;
  try {
    modelsPayload = await modelsResponse.json();
  } catch {
    clearTimeout(timeout);
    throw new Error("Model list response is not valid JSON.");
  }

  const loadedModel = resolveLoadedModelFromModelsPayload(modelsPayload);
  const modelOverride = args.model.trim();
  const effectiveModel = modelOverride.length > 0 ? modelOverride : loadedModel;
  if (!effectiveModel) {
    clearTimeout(timeout);
    throw new Error(
      "No loaded LM Studio model detected. Load a chat model in LM Studio first, or pass --model as an override.",
    );
  }

  console.log(`Step 2/2: Running text-based extraction via ${chatUrl}`);
  const requestBody = {
    model: effectiveModel,
    system_prompt: buildPrompt(args.entryType),
    input: [
      "Extract the bookkeeping fields from this invoice text and return only JSON.",
      "",
      "--- BEGIN INVOICE TEXT ---",
      extractedText.slice(0, 120_000),
      "--- END INVOICE TEXT ---",
    ].join("\n"),
    temperature: 0,
  };

  const authHeader = args.apiKey.trim().length > 0 ? "Bearer [REDACTED]" : null;
  console.log("POST request payload:");
  console.log(
    JSON.stringify(
      {
        method: "POST",
        url: chatUrl,
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
        },
        body: requestBody,
      },
      null,
      2,
    ),
  );

  let response;
  const aiRequestStartedAt = Date.now();
  try {
    response = await fetch(chatUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeout);
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Timeout after ${args.timeoutMs}ms while calling ${chatUrl}`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const debug = await readResponseDebug(response);
    console.error("Step failed: extraction request.");
    console.error(JSON.stringify(debug, null, 2));
    process.exitCode = 1;
    return;
  }

  const responseJson = await response.json();
  const aiResponseTimeMs = Date.now() - aiRequestStartedAt;
  const jsonText = extractChatMessageText(responseJson);
  if (!jsonText) {
    console.error("Could not find JSON output in extraction response.");
    console.error(JSON.stringify(responseJson, null, 2));
    process.exitCode = 1;
    return;
  }

  let payload;
  try {
    payload = JSON.parse(jsonText);
  } catch (error) {
    console.error("Model output is not valid JSON text.");
    console.error(String(error));
    console.error(jsonText);
    process.exitCode = 1;
    return;
  }

  const normalizedPayload = normalizePayloadWithAliases(payload);
  const validationErrors = validateExtractionPayload(payload);

  console.log(`AI response time: ${aiResponseTimeMs}ms`);
  console.log("");

  console.log("Extraction metadata:");
  console.log(
    JSON.stringify(
      {
        provider: "local-ai",
        baseUrl,
        modelSelection: modelOverride.length > 0 ? "cli-override" : "loaded-model-auto",
        model: responseJson.model ?? responseJson.model_instance_id ?? effectiveModel,
        responseId: responseJson.id ?? responseJson.response_id ?? null,
        usage: responseJson.usage ?? responseJson.stats ?? null,
        extractedTextLength: extractedText.length,
        latencyMs: Date.now() - startTime,
      },
      null,
      2,
    ),
  );
  console.log("");
  console.log("Extracted fields (normalized):");
  console.log(JSON.stringify(normalizedPayload, null, 2));

  if (validationErrors.length > 0) {
    console.log("");
    console.log("Validation errors:");
    for (const validationError of validationErrors) {
      console.log(`- ${validationError}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("");
  console.log("Validation: OK");
}

main().catch((error) => {
  console.error(String(error));
  process.exit(1);
});
