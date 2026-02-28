#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_MODEL = "gpt-5-mini";
const DEFAULT_TIMEOUT_MS = 60_000;

function printUsage() {
  console.log(
    [
      "Usage:",
      "  node scripts/test-openai-pdf-extraction.mjs --file <absolute-or-relative-pdf-path> --entry-type <income|expense> [--model <model>] [--timeout-ms <number>]",
      "",
      "Example:",
      "  node scripts/test-openai-pdf-extraction.mjs --file ./sample.pdf --entry-type expense --model gpt-5-mini",
    ].join("\n"),
  );
}

function parseArgs(argv) {
  const args = {
    file: "",
    entryType: "",
    model: DEFAULT_MODEL,
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

    if (value === "--model") {
      args.model = next ?? DEFAULT_MODEL;
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

function buildPrompt(entryType) {
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
    "- Never output markdown or extra keys.",
    "",
    `Document entryType context: ${entryType}.`,
  ].join("\n");
}

function getSchema() {
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

function tryExtractJsonText(responseJson) {
  if (typeof responseJson.output_text === "string" && responseJson.output_text.trim().length > 0) {
    return responseJson.output_text;
  }

  if (!Array.isArray(responseJson.output)) {
    return null;
  }

  for (const item of responseJson.output) {
    if (!item || !Array.isArray(item.content)) {
      continue;
    }

    for (const content of item.content) {
      if (!content || typeof content !== "object") {
        continue;
      }

      if (content.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
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

  const keys = Object.keys(payload);
  const unknownKeys = keys.filter((key) => !requiredKeys.includes(key));
  if (unknownKeys.length > 0) {
    errors.push(`unknown keys found: ${unknownKeys.join(", ")}`);
  }

  for (const key of requiredKeys) {
    if (!(key in payload)) {
      errors.push(`missing required key: ${key}`);
    }
  }

  if (payload.documentDate !== null && !isDateOnly(payload.documentDate)) {
    errors.push("documentDate must be null or strict YYYY-MM-DD");
  }

  if (
    payload.counterpartyName !== null &&
    typeof payload.counterpartyName !== "string"
  ) {
    errors.push("counterpartyName must be string or null");
  }

  if (payload.bookingText !== null && typeof payload.bookingText !== "string") {
    errors.push("bookingText must be string or null");
  }

  if (!Number.isInteger(payload.amountGross) || payload.amountGross < 0) {
    errors.push("amountGross must be a non-negative integer");
  }

  if (
    payload.amountNet !== null &&
    (!Number.isInteger(payload.amountNet) || payload.amountNet < 0)
  ) {
    errors.push("amountNet must be null or a non-negative integer");
  }

  if (
    payload.amountTax !== null &&
    (!Number.isInteger(payload.amountTax) || payload.amountTax < 0)
  ) {
    errors.push("amountTax must be null or a non-negative integer");
  }

  if (
    payload.paymentReceivedDate !== null &&
    !isDateOnly(payload.paymentReceivedDate)
  ) {
    errors.push("paymentReceivedDate must be null or strict YYYY-MM-DD");
  }

  return errors;
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

  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set.");
  }

  const pdfPath = path.resolve(args.file);
  const fileBuffer = await fs.readFile(pdfPath);

  if (fileBuffer.length < 5 || fileBuffer.subarray(0, 5).toString("utf8") !== "%PDF-") {
    throw new Error(`File is not a valid PDF signature: ${pdfPath}`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), args.timeoutMs);

  const requestBody = {
    model: args.model,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_file",
            filename: path.basename(pdfPath),
            file_data: `data:application/pdf;base64,${fileBuffer.toString("base64")}`,
          },
          {
            type: "input_text",
            text: buildPrompt(args.entryType),
          },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "invoice_extraction",
        strict: true,
        schema: getSchema(),
      },
    },
  };

  let response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  const responseJson = await response.json();

  if (!response.ok) {
    console.error("OpenAI API request failed.");
    console.error(JSON.stringify(responseJson, null, 2));
    process.exitCode = 1;
    return;
  }

  const jsonText = tryExtractJsonText(responseJson);
  if (!jsonText) {
    console.error("Could not find JSON output in response.");
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

  const validationErrors = validateExtractionPayload(payload);

  console.log("Extraction metadata:");
  console.log(
    JSON.stringify(
      {
        responseId: responseJson.id ?? null,
        model: responseJson.model ?? args.model,
        usage: responseJson.usage ?? null,
      },
      null,
      2,
    ),
  );
  console.log("");
  console.log("Extracted fields:");
  console.log(JSON.stringify(payload, null, 2));

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
