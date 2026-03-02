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
  tone: "info" | "error";
  message: string;
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
  const [localAiBaseUrl, setLocalAiBaseUrl] = useState("http://127.0.0.1:1234/v1");
  const [localAiModel, setLocalAiModel] = useState("");
  const [localAiTimeoutSeconds, setLocalAiTimeoutSeconds] = useState("30");
  const [localAiApiKey, setLocalAiApiKey] = useState("");
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
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

      const payload = (await response.json()) as { latencyMs: number };
      setFeedback({
        tone: "info",
        message: `Local AI connection test passed (${payload.latencyMs} ms).`,
      });
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
                  onChange={(event) => setLocalAiBaseUrl(event.target.value)}
                  className="rounded border border-zinc-300 px-3 py-2"
                  placeholder="http://127.0.0.1:1234/v1"
                />
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Model</span>
                <input
                  type="text"
                  value={localAiModel}
                  onChange={(event) => setLocalAiModel(event.target.value)}
                  className="rounded border border-zinc-300 px-3 py-2"
                  placeholder="qwen2.5-7b-instruct"
                />
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Timeout (seconds)</span>
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={localAiTimeoutSeconds}
                  onChange={(event) => setLocalAiTimeoutSeconds(event.target.value)}
                  className="rounded border border-zinc-300 px-3 py-2"
                />
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">API key (optional)</span>
                <input
                  type="password"
                  value={localAiApiKey}
                  onChange={(event) => setLocalAiApiKey(event.target.value)}
                  className="rounded border border-zinc-300 px-3 py-2"
                  placeholder={apiKeyConfigured ? "Configured (enter new value to replace)" : "Not configured"}
                />
              </label>
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
