"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

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
  const router = useRouter();
  const [entryType, setEntryType] = useState<"income" | "expense">("expense");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isExpense = entryType === "expense";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

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
      window.dispatchEvent(new Event("uploads:changed"));
      router.push(`/uploads/${payload.id}/review`);
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
              Company: {activeCompanyName} (#{activeCompanyId})
            </p>
          </div>
        </header>

        {errorMessage ? (
          <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMessage}
          </p>
        ) : null}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded border p-4">
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Entry type</span>
              <div className="inline-flex overflow-hidden rounded-md border border-zinc-300">
                <button
                  type="button"
                  aria-pressed={isExpense}
                  onClick={() => {
                    setEntryType("expense");
                  }}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    isExpense
                      ? "bg-red-200 text-red-900"
                      : "bg-red-50 text-red-700 hover:bg-red-100"
                  }`}
                >
                  Expense
                </button>
                <button
                  type="button"
                  aria-pressed={!isExpense}
                  onClick={() => {
                    setEntryType("income");
                  }}
                  className={`border-l border-zinc-300 px-4 py-2 text-sm font-medium transition-colors ${
                    !isExpense
                      ? "bg-emerald-200 text-emerald-900"
                      : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                  }`}
                >
                  Income
                </button>
              </div>
              <input
                type="hidden"
                name="entryType"
                value={entryType}
                readOnly
              />
            </label>

            <label className="min-w-[280px] flex-1 flex flex-col gap-1 text-sm">
              <span className="font-medium">PDF file</span>
              <input
                name="file"
                type="file"
                accept="application/pdf,.pdf"
                className="rounded border border-zinc-300 px-3 py-2"
              />
            </label>
          </div>

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
