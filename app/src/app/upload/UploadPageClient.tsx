"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

type UploadResponse = {
  id: string;
  companyId: number;
  entryType: "income" | "expense";
  originalFilename: string;
  storedFilename: string;
  uploadedAt: string;
};

type UploadErrorPayload = {
  error?: {
    code?: string;
    message?: string;
  };
};

type Props = {
  activeCompanyId: number;
  activeCompanyName: string;
};

async function parseApiError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as UploadErrorPayload;
    if (payload.error?.message) {
      return payload.error.message;
    }
  } catch {
    return "Upload failed.";
  }

  return "Upload failed.";
}

export function UploadPageClient({ activeCompanyId, activeCompanyName }: Props) {
  const [entryType, setEntryType] = useState<"income" | "expense">("income");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<UploadResponse | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessResult(null);

    const form = event.currentTarget;
    const formData = new FormData(form);
    formData.set("entryType", entryType);

    if (!(formData.get("file") instanceof File)) {
      setErrorMessage("Please select a PDF file.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/uploads", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        setErrorMessage(await parseApiError(response));
        return;
      }

      const payload = (await response.json()) as UploadResponse;
      setSuccessResult(payload);
      form.reset();
    } catch {
      setErrorMessage("Upload failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-50 px-6 py-16 text-zinc-900">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Upload Invoice PDF</h1>
            <p className="mt-1 text-sm text-zinc-600">
              Active company: {activeCompanyName} (#{activeCompanyId})
            </p>
          </div>
          <Link
            href="/"
            className="inline-flex items-center rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100"
          >
            Back to main page
          </Link>
        </header>

        {errorMessage ? (
          <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMessage}
          </p>
        ) : null}

        {successResult ? (
          <p className="rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            Upload succeeded: {successResult.originalFilename} stored as{" "}
            {successResult.storedFilename}.
          </p>
        ) : null}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded border p-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Entry type</span>
            <select
              name="entryType"
              value={entryType}
              onChange={(event) => {
                const nextValue = event.target.value;
                if (nextValue === "income" || nextValue === "expense") {
                  setEntryType(nextValue);
                }
              }}
              className="rounded border border-zinc-300 px-3 py-2"
            >
              <option value="income">income</option>
              <option value="expense">expense</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">PDF file</span>
            <input
              name="file"
              type="file"
              accept="application/pdf,.pdf"
              className="rounded border border-zinc-300 px-3 py-2"
            />
          </label>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-fit rounded bg-black px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-zinc-400"
          >
            {isSubmitting ? "Uploading..." : "Upload"}
          </button>
        </form>
      </div>
    </main>
  );
}
