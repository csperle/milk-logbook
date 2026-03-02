"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type ExtractionMethod = "none" | "gpt-5-mini" | "local-ai";

type SettingsResponse = {
  extractionMethod: ExtractionMethod;
  localAi: {
    baseUrl: string;
    model: string;
    timeoutMs: number;
    apiKeyConfigured: boolean;
  };
};

type ApiError = {
  error?: {
    code?: string;
    message?: string;
    details?: Record<string, unknown> | null;
  };
};

type Feedback = {
  tone: "info" | "warning" | "error";
  message: string;
};

type LocalAiModelOption = {
  id: string;
  loaded: boolean;
};

type LocalAiModelsResponse = {
  models: LocalAiModelOption[];
  loadedModelId: string | null;
};

async function parseApiError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as ApiError;
    if (payload.error?.message) {
      const lines = [
        payload.error.code ? `${payload.error.message} (${payload.error.code})` : payload.error.message,
      ];
      if (payload.error.details && typeof payload.error.details === "object") {
        const detailEntries = Object.entries(payload.error.details)
          .filter(([, value]) => value !== null && value !== undefined)
          .map(([key, value]) => `${key}: ${String(value)}`);
        if (detailEntries.length > 0) {
          lines.push(detailEntries.join(" | "));
        }
      }
      return lines.join("\n");
    }

    const rawText = await response.text();
    if (rawText.trim().length > 0) {
      return rawText.trim().slice(0, 400);
    }
  } catch {
    return "Request failed.";
  }

  return "Request failed.";
}

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function ExtractionSettingsAdminClient() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [method, setMethod] = useState<ExtractionMethod>("gpt-5-mini");
  const [localAiBaseUrl, setLocalAiBaseUrl] = useState("http://127.0.0.1:1234");
  const [localAiModel, setLocalAiModel] = useState("");
  const [localAiTimeoutSeconds, setLocalAiTimeoutSeconds] = useState("30");
  const [localAiApiKey, setLocalAiApiKey] = useState("");
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
  const [availableModels, setAvailableModels] = useState<LocalAiModelOption[]>([]);
  const [loadedModelId, setLoadedModelId] = useState<string | null>(null);
  const [hasFetchedModels, setHasFetchedModels] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelsFeedback, setModelsFeedback] = useState<Feedback | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const isLocalAi = method === "local-ai";
  const validationError = useMemo(() => {
    if (!isValidHttpUrl(localAiBaseUrl.trim())) {
      return "Local AI base URL must be a valid HTTP/HTTPS URL.";
    }

    const timeoutSeconds = Number.parseInt(localAiTimeoutSeconds.trim(), 10);
    if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 120) {
      return "Local AI timeout must be between 1 and 120 seconds.";
    }

    if (isLocalAi && localAiModel.trim().length < 1) {
      return "Local AI model is required when local-ai is selected.";
    }

    return null;
  }, [isLocalAi, localAiBaseUrl, localAiModel, localAiTimeoutSeconds]);

  function resetModelDiscoveryState() {
    setAvailableModels([]);
    setLoadedModelId(null);
    setHasFetchedModels(false);
    setModelsFeedback(null);
  }

  async function handleLoadModels() {
    setModelsFeedback(null);

    if (!isValidHttpUrl(localAiBaseUrl.trim())) {
      setModelsFeedback({
        tone: "error",
        message: "Enter a valid Base URL first, then load models.",
      });
      return;
    }

    const timeoutSeconds = Number.parseInt(localAiTimeoutSeconds.trim(), 10);
    if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 120) {
      setModelsFeedback({
        tone: "error",
        message: "Timeout must be between 1 and 120 seconds before loading models.",
      });
      return;
    }

    setIsLoadingModels(true);
    try {
      const response = await fetch("/api/admin/extraction-settings/local-ai-models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          localAi: {
            baseUrl: localAiBaseUrl.trim(),
            timeoutMs: timeoutSeconds * 1000,
            apiKey: localAiApiKey.trim().length > 0 ? localAiApiKey.trim() : undefined,
          },
        }),
      });

      if (!response.ok) {
        setModelsFeedback({ tone: "error", message: await parseApiError(response) });
        setAvailableModels([]);
        setLoadedModelId(null);
        setHasFetchedModels(true);
        return;
      }

      const payload = (await response.json()) as LocalAiModelsResponse;
      setAvailableModels(payload.models);
      setLoadedModelId(payload.loadedModelId);
      setHasFetchedModels(true);

      if (payload.models.length < 1) {
        setModelsFeedback({
          tone: "error",
          message: "Connection succeeded, but no models were returned by /models.",
        });
        return;
      }

      if (localAiModel.trim().length < 1) {
        const preferredModelId =
          payload.loadedModelId && payload.models.some((model) => model.id === payload.loadedModelId)
            ? payload.loadedModelId
            : payload.models[0]?.id;
        if (preferredModelId) {
          setLocalAiModel(preferredModelId);
        }
      }

      setModelsFeedback({
        tone: "info",
        message: `Loaded ${payload.models.length} model option${payload.models.length === 1 ? "" : "s"}.`,
      });
    } catch {
      setModelsFeedback({ tone: "error", message: "Could not load models from local AI." });
    } finally {
      setIsLoadingModels(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();

    async function loadSettings() {
      try {
        const response = await fetch("/api/admin/extraction-settings", {
          method: "GET",
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) {
          setFeedback({ tone: "error", message: await parseApiError(response) });
          return;
        }

        const payload = (await response.json()) as SettingsResponse;
        setMethod(payload.extractionMethod);
        setLocalAiBaseUrl(payload.localAi.baseUrl);
        setLocalAiModel(payload.localAi.model);
        setLocalAiTimeoutSeconds(String(Math.max(1, Math.round(payload.localAi.timeoutMs / 1000))));
        setApiKeyConfigured(payload.localAi.apiKeyConfigured);
        resetModelDiscoveryState();
        setLocalAiApiKey("");
        setFeedback(null);
      } catch {
        if (controller.signal.aborted) {
          return;
        }
        setFeedback({ tone: "error", message: "Could not load extraction settings." });
      } finally {
        setIsLoading(false);
      }
    }

    void loadSettings();
    return () => controller.abort();
  }, []);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    if (validationError) {
      setFeedback({ tone: "error", message: validationError });
      return;
    }

    const timeoutSeconds = Number.parseInt(localAiTimeoutSeconds.trim(), 10);
    const timeoutMs = timeoutSeconds * 1000;
    setIsSaving(true);
    try {
      const response = await fetch("/api/admin/extraction-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          extractionMethod: method,
          localAi: {
            baseUrl: localAiBaseUrl.trim(),
            model: localAiModel.trim(),
            timeoutMs,
            apiKey: localAiApiKey.trim().length > 0 ? localAiApiKey.trim() : undefined,
          },
        }),
      });
      if (!response.ok) {
        setFeedback({ tone: "error", message: await parseApiError(response) });
        return;
      }

      const payload = (await response.json()) as SettingsResponse;
      setMethod(payload.extractionMethod);
      setLocalAiBaseUrl(payload.localAi.baseUrl);
      setLocalAiModel(payload.localAi.model);
      setLocalAiTimeoutSeconds(String(Math.max(1, Math.round(payload.localAi.timeoutMs / 1000))));
      setApiKeyConfigured(payload.localAi.apiKeyConfigured);
      resetModelDiscoveryState();
      setLocalAiApiKey("");
      setFeedback({ tone: "info", message: "Extraction settings saved." });
    } catch {
      setFeedback({ tone: "error", message: "Could not save extraction settings." });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleTestLocalAi() {
    setFeedback(null);
    if (validationError) {
      setFeedback({ tone: "error", message: validationError });
      return;
    }

    setIsTesting(true);
    try {
      const response = await fetch("/api/admin/extraction-settings/test-local-ai", {
        method: "POST",
      });
      if (!response.ok) {
        setFeedback({ tone: "error", message: await parseApiError(response) });
        return;
      }

      const payload = (await response.json()) as {
        latencyMs: number;
        expectedReplyMatched?: boolean;
        actualReply?: string;
      };
      if (payload.expectedReplyMatched === false) {
        const actualReply = typeof payload.actualReply === "string" ? payload.actualReply : "";
        setFeedback({
          tone: "warning",
          message: `Connection to the AI model has been established. But instead of "Okay" the answer was: ${actualReply || "<empty>"}. (${payload.latencyMs} ms)`,
        });
      } else {
        setFeedback({
          tone: "info",
          message: `Local AI connection test passed (${payload.latencyMs} ms).`,
        });
      }
    } catch {
      setFeedback({ tone: "error", message: "Could not test local AI connection." });
    } finally {
      setIsTesting(false);
    }
  }

  if (isLoading) {
    return (
      <main className="min-h-screen bg-zinc-50 px-6 py-16 text-zinc-900">
        <div className="mx-auto w-full max-w-3xl rounded border border-zinc-300 bg-white p-4 text-sm text-zinc-700">
          Loading extraction settings...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-50 px-6 py-16 text-zinc-900">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight">Extraction Method</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Select how invoice values are prefetched after upload.
          </p>
        </header>

        {feedback ? (
          <p
            className={`whitespace-pre-wrap rounded px-3 py-2 text-sm ${
              feedback.tone === "error"
                ? "border border-red-300 bg-red-50 text-red-700"
                : feedback.tone === "warning"
                  ? "border border-amber-300 bg-amber-50 text-amber-800"
                  : "border border-zinc-300 bg-white text-zinc-700"
            }`}
          >
            {feedback.message}
          </p>
        ) : null}

        <form onSubmit={handleSave} className="flex flex-col gap-4 rounded border border-zinc-300 bg-white p-4">
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium text-zinc-900">Method</legend>
            <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="radio"
                name="method"
                value="none"
                checked={method === "none"}
                onChange={() => setMethod("none")}
              />
              None (manual review only)
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="radio"
                name="method"
                value="gpt-5-mini"
                checked={method === "gpt-5-mini"}
                onChange={() => setMethod("gpt-5-mini")}
              />
              OpenAI gpt-5-mini
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="radio"
                name="method"
                value="local-ai"
                checked={method === "local-ai"}
                onChange={() => setMethod("local-ai")}
              />
              Local AI (LM Studio)
            </label>
          </fieldset>

          {isLocalAi ? (
            <div className="grid gap-3 rounded border border-zinc-200 bg-zinc-50 p-3">
              <h2 className="text-sm font-medium text-zinc-900">Local AI Configuration</h2>

              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Base URL</span>
                <input
                  type="url"
                  value={localAiBaseUrl}
                  onChange={(event) => {
                    setLocalAiBaseUrl(event.target.value);
                    resetModelDiscoveryState();
                  }}
                  className="rounded border border-zinc-300 px-3 py-2"
                  placeholder="http://127.0.0.1:1234"
                />
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Timeout (seconds)</span>
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={localAiTimeoutSeconds}
                  onChange={(event) => {
                    setLocalAiTimeoutSeconds(event.target.value);
                    resetModelDiscoveryState();
                  }}
                  className="rounded border border-zinc-300 px-3 py-2"
                />
              </label>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void handleLoadModels();
                  }}
                  disabled={isLoadingModels}
                  className="rounded border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isLoadingModels ? "Loading models..." : "Load available models"}
                </button>
                <p className="text-xs text-zinc-600">
                  Enter a valid Base URL, then load models from LM Studio `/api/v1/models`.
                </p>
              </div>

              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Model</span>
                {availableModels.length > 0 ? (
                  <select
                    value={localAiModel}
                    onChange={(event) => setLocalAiModel(event.target.value)}
                    className="rounded border border-zinc-300 px-3 py-2"
                  >
                    <option value="" disabled>
                      Select a model
                    </option>
                    {availableModels.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.loaded ? `${model.id} (loaded)` : model.id}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={localAiModel}
                    onChange={(event) => setLocalAiModel(event.target.value)}
                    className="rounded border border-zinc-300 px-3 py-2"
                    placeholder="Load models first, or enter model id manually"
                  />
                )}
              </label>

              {loadedModelId ? (
                <p className="text-xs text-zinc-600">Currently loaded in LM Studio: {loadedModelId}</p>
              ) : hasFetchedModels && availableModels.length > 0 ? (
                <p className="text-xs text-zinc-600">
                  No explicit loaded model reported by LM Studio. You can still choose from the list.
                </p>
              ) : null}

              {hasFetchedModels &&
              availableModels.length > 0 &&
              localAiModel.trim().length > 0 &&
              !availableModels.some((model) => model.id === localAiModel.trim()) ? (
                <p className="text-xs text-amber-700">
                  Selected model is not in the latest discovered list. Reload models or adjust the value.
                </p>
              ) : null}

              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">API key (optional)</span>
                <input
                  type="password"
                  value={localAiApiKey}
                  onChange={(event) => {
                    setLocalAiApiKey(event.target.value);
                    resetModelDiscoveryState();
                  }}
                  className="rounded border border-zinc-300 px-3 py-2"
                  placeholder={apiKeyConfigured ? "Configured (enter new value to replace)" : "Not configured"}
                />
              </label>

              {modelsFeedback ? (
                <p
                  className={`whitespace-pre-wrap rounded px-3 py-2 text-sm ${
                    modelsFeedback.tone === "error"
                      ? "border border-red-300 bg-red-50 text-red-700"
                      : "border border-zinc-300 bg-white text-zinc-700"
                  }`}
                >
                  {modelsFeedback.message}
                </p>
              ) : null}
            </div>
          ) : null}

          {validationError ? (
            <p className="text-sm text-red-700">{validationError}</p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={isSaving || Boolean(validationError)}
              className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-500"
            >
              {isSaving ? "Saving..." : "Save settings"}
            </button>
            <button
              type="button"
              onClick={() => {
                void handleTestLocalAi();
              }}
              disabled={isTesting || !isLocalAi || Boolean(validationError)}
              className="rounded border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isTesting ? "Testing..." : "Test local AI connection"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
