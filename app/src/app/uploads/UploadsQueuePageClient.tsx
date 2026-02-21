"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type UploadStatusFilter = "pending_review" | "saved" | "all";
type UploadReviewStatus = "pending_review" | "saved";

type QueueItem = {
  id: string;
  companyId: number;
  entryType: "income" | "expense";
  originalFilename: string;
  uploadedAt: string;
  reviewStatus: UploadReviewStatus;
  savedEntry: {
    id: number;
    documentNumber: number;
    createdAt: string;
  } | null;
};

type QueueResponse = {
  items: QueueItem[];
};

type ApiErrorPayload = {
  error?: {
    message?: string;
  };
};

type Props = {
  activeCompanyId: number;
  activeCompanyName: string;
};

function isUploadStatusFilter(value: string | null): value is UploadStatusFilter {
  return value === "pending_review" || value === "saved" || value === "all";
}

function getStatusLabel(status: UploadReviewStatus): string {
  return status === "pending_review" ? "Pending review" : "Saved";
}

function getFlashMessage(flash: string | null): string | null {
  if (flash === "saved_and_opened_next") {
    return "Entry saved. Continuing with the next pending upload.";
  }
  if (flash === "saved_and_queue_empty") {
    return "Entry saved. Pending queue is now empty.";
  }
  return null;
}

async function parseApiError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as ApiErrorPayload;
    if (payload.error?.message) {
      return payload.error.message;
    }
  } catch {
    return "Could not load uploads.";
  }

  return "Could not load uploads.";
}

export function UploadsQueuePageClient({ activeCompanyId, activeCompanyName }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [items, setItems] = useState<QueueItem[]>([]);

  const rawStatus = searchParams.get("status");
  const status: UploadStatusFilter = isUploadStatusFilter(rawStatus) ? rawStatus : "pending_review";
  const flashMessage = getFlashMessage(searchParams.get("flash"));

  useEffect(() => {
    if (rawStatus !== null && !isUploadStatusFilter(rawStatus)) {
      router.replace("/uploads?status=pending_review");
    }
  }, [rawStatus, router]);

  useEffect(() => {
    let isActive = true;

    async function loadUploads() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const response = await fetch(`/api/uploads?status=${status}`, { cache: "no-store" });
        if (!response.ok) {
          if (isActive) {
            setErrorMessage(await parseApiError(response));
          }
          return;
        }

        const payload = (await response.json()) as QueueResponse;
        if (isActive) {
          setItems(payload.items);
        }
      } catch {
        if (isActive) {
          setErrorMessage("Could not load uploads.");
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadUploads();

    return () => {
      isActive = false;
    };
  }, [status]);

  const oldestPendingItem = useMemo(
    () => items.find((item) => item.reviewStatus === "pending_review"),
    [items],
  );

  return (
    <main className="min-h-screen bg-zinc-50 px-6 py-16 text-zinc-900">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Uploads Queue</h1>
            <p className="mt-1 text-sm text-zinc-600">
              Processing mode • Active company: {activeCompanyName} (#{activeCompanyId})
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/upload"
              className="inline-flex items-center rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100"
            >
              Open capture mode
            </Link>
            <Link
              href="/"
              className="inline-flex items-center rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100"
            >
              Back to main page
            </Link>
          </div>
        </header>

        {flashMessage ? (
          <p className="rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {flashMessage}
          </p>
        ) : null}

        {errorMessage ? (
          <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMessage}
          </p>
        ) : null}

        <section className="rounded border border-zinc-300 bg-white p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/uploads?status=pending_review"
              className={`rounded px-3 py-1.5 text-sm font-medium ${
                status === "pending_review"
                  ? "bg-zinc-900 text-white"
                  : "border border-zinc-300 text-zinc-700 hover:bg-zinc-100"
              }`}
            >
              Pending review
            </Link>
            <Link
              href="/uploads?status=all"
              className={`rounded px-3 py-1.5 text-sm font-medium ${
                status === "all"
                  ? "bg-zinc-900 text-white"
                  : "border border-zinc-300 text-zinc-700 hover:bg-zinc-100"
              }`}
            >
              All
            </Link>
            <Link
              href="/uploads?status=saved"
              className={`rounded px-3 py-1.5 text-sm font-medium ${
                status === "saved"
                  ? "bg-zinc-900 text-white"
                  : "border border-zinc-300 text-zinc-700 hover:bg-zinc-100"
              }`}
            >
              Saved
            </Link>
          </div>
        </section>

        <section className="rounded border border-zinc-300 bg-white p-4">
          {status === "saved" ? (
            <p className="text-sm text-zinc-700">
              Showing saved uploads. Switch to <span className="font-medium">Pending review</span>{" "}
              to continue processing.
            </p>
          ) : oldestPendingItem ? (
            <p className="text-sm text-zinc-700">
              Pending uploads are ready. Open a row with <span className="font-medium">Review</span>{" "}
              to continue processing mode.
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/upload"
                className="inline-flex items-center rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
              >
                Upload files
              </Link>
              <Link
                href="/entries"
                className="inline-flex items-center rounded border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
              >
                View entries
              </Link>
            </div>
          )}
        </section>

        <section className="overflow-x-auto rounded border border-zinc-300 bg-white">
          {isLoading ? (
            <p className="px-4 py-3 text-sm text-zinc-600">Loading uploads...</p>
          ) : items.length < 1 ? (
            <p className="px-4 py-3 text-sm text-zinc-600">
              No uploads in this view. Next step: upload new files or switch filters.
            </p>
          ) : (
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead className="bg-zinc-100 text-zinc-700">
                <tr>
                  <th className="px-3 py-2 font-medium">Uploaded at</th>
                  <th className="px-3 py-2 font-medium">Original filename</th>
                  <th className="px-3 py-2 font-medium">Entry type</th>
                  <th className="px-3 py-2 font-medium">Review status</th>
                  <th className="px-3 py-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-t border-zinc-200">
                    <td className="px-3 py-2 text-zinc-700">{item.uploadedAt}</td>
                    <td className="px-3 py-2 font-medium text-zinc-900">{item.originalFilename}</td>
                    <td className="px-3 py-2 text-zinc-700">{item.entryType}</td>
                    <td className="px-3 py-2 text-zinc-700">{getStatusLabel(item.reviewStatus)}</td>
                    <td className="px-3 py-2">
                      {item.reviewStatus === "pending_review" ? (
                        <Link
                          href={`/uploads/${item.id}/review`}
                          className="inline-flex items-center rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100"
                        >
                          Review
                        </Link>
                      ) : (
                        <Link
                          href="/entries"
                          className="inline-flex items-center rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100"
                        >
                          View entry
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </main>
  );
}
