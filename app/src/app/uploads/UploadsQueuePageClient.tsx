"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

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

function getFlashMessage(flash: string | null): string | null {
  if (flash === "saved_and_opened_next") {
    return "Entry saved. Continuing with the next pending upload.";
  }
  if (flash === "saved_and_queue_empty") {
    return "Entry saved. Inbox is now empty.";
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
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [items, setItems] = useState<QueueItem[]>([]);

  const flashMessage = getFlashMessage(searchParams.get("flash"));

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    const timeoutId = window.setTimeout(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [searchParams]);

  useEffect(() => {
    let isActive = true;

    async function loadUploads() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const response = await fetch("/api/uploads?status=pending_review", { cache: "no-store" });
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
  }, []);

  return (
    <main className="min-h-screen bg-zinc-50 px-6 py-16 text-zinc-900">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Inbox</h1>
            <p className="mt-1 text-sm text-zinc-600">
              Company: {activeCompanyName} (#{activeCompanyId})
            </p>
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

        <section className="overflow-x-auto rounded border border-zinc-300 bg-white">
          {isLoading ? (
            <p className="px-4 py-3 text-sm text-zinc-600">Loading uploads...</p>
          ) : items.length < 1 ? (
            <p className="px-4 py-3 text-sm text-zinc-600">
              No pending uploads. Next step: upload new files.
            </p>
          ) : (
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead className="bg-zinc-100 text-zinc-700">
                <tr>
                  <th className="px-3 py-2 font-medium">Uploaded at</th>
                  <th className="px-3 py-2 font-medium">Original filename</th>
                  <th className="px-3 py-2 font-medium">Entry type</th>
                  <th className="px-3 py-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-t border-zinc-200">
                    <td className="px-3 py-2 text-zinc-700">{item.uploadedAt}</td>
                    <td className="px-3 py-2 font-medium text-zinc-900">{item.originalFilename}</td>
                    <td className="px-3 py-2 text-zinc-700">{item.entryType}</td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/uploads/${item.id}/review`}
                        className="inline-flex items-center rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100"
                      >
                        Review
                      </Link>
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
