import {
  DEFAULT_TIMEOUT_MS,
  InvoiceExtractionError,
} from "@/lib/extraction/invoice-extraction-core";

export type LocalAiModelOption = {
  id: string;
  loaded: boolean;
};

function joinLmStudioApiV1Path(baseUrl: string, pathName: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  const withoutKnownSuffix = trimmed.replace(/\/api\/v1$/i, "").replace(/\/v1$/i, "");
  const apiBase = `${withoutKnownSuffix}/api/v1`;
  const normalizedPath = pathName.startsWith("/") ? pathName : `/${pathName}`;
  return `${apiBase}${normalizedPath}`;
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

function isModelLoaded(modelRecord: Record<string, unknown>): boolean {
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

function extractChatText(payload: unknown): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return "";
  }

  const record = payload as Record<string, unknown>;
  if (typeof record.output_text === "string" && record.output_text.trim().length > 0) {
    return record.output_text.trim();
  }

  const output = Array.isArray(record.output) ? record.output : [];
  const messageItems = output.filter((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return false;
    }
    return (item as Record<string, unknown>).type === "message";
  });

  for (const item of messageItems) {
    const itemRecord = item as Record<string, unknown>;
    if (typeof itemRecord.content === "string" && itemRecord.content.trim().length > 0) {
      return itemRecord.content.trim();
    }

    if (!Array.isArray(itemRecord.content)) {
      continue;
    }

    const textParts: string[] = [];
    for (const contentItem of itemRecord.content) {
      if (!contentItem || typeof contentItem !== "object" || Array.isArray(contentItem)) {
        continue;
      }
      const contentRecord = contentItem as Record<string, unknown>;
      if (
        (contentRecord.type === "text" || contentRecord.type === "output_text") &&
        typeof contentRecord.text === "string"
      ) {
        const trimmed = contentRecord.text.trim();
        if (trimmed.length > 0) {
          textParts.push(trimmed);
        }
      } else if (typeof contentRecord.content === "string" && contentRecord.content.trim().length > 0) {
        textParts.push(contentRecord.content.trim());
      }
    }

    if (textParts.length > 0) {
      return textParts.join(" ").trim();
    }
  }

  return "";
}

export async function listLocalAiModels(input: {
  apiBaseUrl: string;
  apiKey: string | null;
  timeoutMs: number;
}): Promise<{ models: LocalAiModelOption[]; loadedModelId: string | null }> {
  const effectiveTimeoutMs =
    Number.isFinite(input.timeoutMs) && input.timeoutMs > 0 ? input.timeoutMs : DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), effectiveTimeoutMs);
  const modelsUrl = joinLmStudioApiV1Path(input.apiBaseUrl, "/models");

  let response: Response;
  try {
    response = await fetch(modelsUrl, {
      method: "GET",
      headers: input.apiKey ? { Authorization: `Bearer ${input.apiKey}` } : {},
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeoutHandle);
    if (error instanceof Error && error.name === "AbortError") {
      throw new InvoiceExtractionError("EXTRACTION_TIMEOUT", "Model list request timed out.");
    }
    throw new InvoiceExtractionError(
      "EXTRACTION_PROVIDER_ERROR",
      "Model list request failed before response.",
    );
  }
  clearTimeout(timeoutHandle);

  if (!response.ok) {
    const bodySnippet = await readResponseBodySnippet(response);
    throw new InvoiceExtractionError(
      "EXTRACTION_PROVIDER_ERROR",
      `Model list request returned ${response.status}.`,
      {
        url: modelsUrl,
        httpStatus: response.status,
        responseBodySnippet: bodySnippet,
      },
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new InvoiceExtractionError(
      "EXTRACTION_INVALID_OUTPUT",
      "Model list response was not valid JSON.",
    );
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new InvoiceExtractionError(
      "EXTRACTION_INVALID_OUTPUT",
      "Model list response was not a valid JSON object.",
    );
  }

  const payloadRecord = payload as Record<string, unknown>;
  const modelsRaw = Array.isArray(payloadRecord.models)
    ? payloadRecord.models
    : Array.isArray(payloadRecord.data)
      ? payloadRecord.data
      : null;
  if (!modelsRaw) {
    throw new InvoiceExtractionError(
      "EXTRACTION_INVALID_OUTPUT",
      "Model list response did not include a valid models array.",
    );
  }

  const modelsById = new Map<string, LocalAiModelOption>();
  let loadedModelId: string | null = null;
  for (const rawModel of modelsRaw) {
    if (!rawModel || typeof rawModel !== "object" || Array.isArray(rawModel)) {
      continue;
    }
    const modelRecord = rawModel as Record<string, unknown>;
    const modelType = typeof modelRecord.type === "string" ? modelRecord.type.trim().toLowerCase() : "";
    if (modelType === "embedding" || modelType === "embeddings") {
      continue;
    }

    const idCandidate =
      typeof modelRecord.key === "string"
        ? modelRecord.key
        : typeof modelRecord.id === "string"
          ? modelRecord.id
          : "";
    const id = idCandidate.trim();
    if (id.length < 1) {
      continue;
    }

    const loaded = isModelLoaded(modelRecord);
    const existing = modelsById.get(id);
    modelsById.set(id, {
      id,
      loaded: existing ? existing.loaded || loaded : loaded,
    });
    if (!loadedModelId && loaded) {
      loadedModelId = id;
    }
  }

  const models = Array.from(modelsById.values()).sort((a, b) => a.id.localeCompare(b.id));
  return { models, loadedModelId };
}

export async function testLmStudioApiHealth(input: {
  apiBaseUrl: string;
  apiKey: string | null;
  model: string;
  timeoutMs: number;
}): Promise<{ latencyMs: number; expectedReplyMatched: boolean; actualReply: string }> {
  const effectiveTimeoutMs =
    Number.isFinite(input.timeoutMs) && input.timeoutMs > 0 ? input.timeoutMs : DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), effectiveTimeoutMs);
  const startedAt = Date.now();

  const modelsUrl = joinLmStudioApiV1Path(input.apiBaseUrl, "/models");
  const chatUrl = joinLmStudioApiV1Path(input.apiBaseUrl, "/chat");

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

    const response = await fetch(chatUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(input.apiKey ? { Authorization: `Bearer ${input.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: input.model,
        system_prompt: [
          "You are a health check endpoint.",
          "Reply with exactly one word: Okay",
          "Do not add punctuation, explanations, or extra words.",
        ].join(" "),
        input: "Return only the single word: Okay",
        temperature: 0,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const bodySnippet = await readResponseBodySnippet(response);
      throw new InvoiceExtractionError(
        "EXTRACTION_PROVIDER_ERROR",
        `Step 'chat-health' failed: POST /api/v1/chat returned ${response.status}.`,
        {
          step: "chat-health",
          url: chatUrl,
          httpStatus: response.status,
          responseBodySnippet: bodySnippet,
        },
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new InvoiceExtractionError(
        "EXTRACTION_INVALID_OUTPUT",
        "Chat health response was not valid JSON.",
        {
          step: "chat-health",
          url: chatUrl,
        },
      );
    }

    const output = (payload as { output?: unknown }).output;
    if (!Array.isArray(output) || output.length < 1) {
      throw new InvoiceExtractionError(
        "EXTRACTION_INVALID_OUTPUT",
        "Chat health response did not include output items.",
        {
          step: "chat-health",
          url: chatUrl,
        },
      );
    }

    const content = extractChatText(payload);
    if (content.length < 1) {
      throw new InvoiceExtractionError(
        "EXTRACTION_INVALID_OUTPUT",
        "Chat health response did not include readable text content.",
        {
          step: "chat-health",
          url: chatUrl,
          contentPreview: content.slice(0, 80),
        },
      );
    }

    const normalizedContent = content
      .trim()
      .toLowerCase()
      .replace(/^[^a-z]+|[^a-z]+$/g, "");
    const expectedReplyMatched = normalizedContent === "okay" || normalizedContent === "ok";
    return {
      latencyMs: Date.now() - startedAt,
      expectedReplyMatched,
      actualReply: content,
    };
  } catch (error) {
    if (error instanceof InvoiceExtractionError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new InvoiceExtractionError("EXTRACTION_TIMEOUT", "Model request timed out.", {
        step: "provider-reachability-or-chat-health",
        modelsUrl,
        chatUrl,
        timeoutMs: effectiveTimeoutMs,
      });
    }

    throw new InvoiceExtractionError(
      "EXTRACTION_PROVIDER_ERROR",
      `Model request failed before response: ${error instanceof Error ? error.message : "unknown error"}.`,
      {
        step: "provider-reachability-or-chat-health",
        modelsUrl,
        chatUrl,
      },
    );
  } finally {
    clearTimeout(timeoutHandle);
  }
}
