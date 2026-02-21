"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

type ExpenseTypeOption = {
  id: number;
  expenseTypeText: string;
};

type ReviewResponse = {
  upload: {
    id: string;
    companyId: number;
    entryType: "income" | "expense";
    originalFilename: string;
    uploadedAt: string;
  };
  draft: {
    documentDate: string;
    counterpartyName: string;
    bookingText: string;
    amountGross: number;
    amountNet: number | null;
    amountTax: number | null;
    paymentReceivedDate: string | null;
    typeOfExpenseId: number | null;
  };
  reviewStatus: "pending_review" | "saved";
};

type SaveEntryResponse = {
  entry: {
    id: number;
    documentNumber: number;
  };
};

type ApiErrorPayload = {
  error?: {
    code?: string;
    message?: string;
  };
};

type Props = {
  uploadId: string;
  activeCompanyId: number;
  activeCompanyName: string;
  expenseTypes: ExpenseTypeOption[];
};

type DraftFormState = {
  documentDate: string;
  counterpartyName: string;
  bookingText: string;
  amountGross: string;
  amountNet: string;
  amountTax: string;
  paymentReceivedDate: string;
  typeOfExpenseId: string;
};

function toFormState(response: ReviewResponse): DraftFormState {
  return {
    documentDate: response.draft.documentDate,
    counterpartyName: response.draft.counterpartyName,
    bookingText: response.draft.bookingText,
    amountGross: String(response.draft.amountGross),
    amountNet: response.draft.amountNet === null ? "0" : String(response.draft.amountNet),
    amountTax: response.draft.amountTax === null ? "0" : String(response.draft.amountTax),
    paymentReceivedDate: response.draft.paymentReceivedDate ?? "",
    typeOfExpenseId:
      response.draft.typeOfExpenseId === null ? "" : String(response.draft.typeOfExpenseId),
  };
}

function parseIntegerString(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length < 1) {
    return null;
  }

  if (!/^-?\d+$/.test(trimmed)) {
    return Number.NaN;
  }

  return Number.parseInt(trimmed, 10);
}

async function parseApiError(response: Response): Promise<{ code?: string; message: string }> {
  try {
    const payload = (await response.json()) as ApiErrorPayload;
    if (payload.error?.message) {
      return {
        code: payload.error.code,
        message: payload.error.message,
      };
    }
  } catch {
    return { message: "Request failed." };
  }

  return { message: "Request failed." };
}

export function UploadReviewPageClient({
  uploadId,
  activeCompanyId,
  activeCompanyName,
  expenseTypes,
}: Props) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isSavingEntry, setIsSavingEntry] = useState(false);
  const [isSavingEntryAndNext, setIsSavingEntryAndNext] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [reviewData, setReviewData] = useState<ReviewResponse | null>(null);
  const [formState, setFormState] = useState<DraftFormState | null>(null);

  useEffect(() => {
    let isActive = true;

    async function loadReview() {
      setIsLoading(true);
      setLoadError(null);

      try {
        const response = await fetch(`/api/uploads/${uploadId}/review`, { cache: "no-store" });
        if (!response.ok) {
          if (isActive) {
            setLoadError((await parseApiError(response)).message);
          }
          return;
        }

        const payload = (await response.json()) as ReviewResponse;
        if (isActive) {
          setReviewData(payload);
          setFormState(toFormState(payload));
        }
      } catch {
        if (isActive) {
          setLoadError("Could not load review data.");
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadReview();

    return () => {
      isActive = false;
    };
  }, [uploadId]);

  const isExpense = reviewData?.upload.entryType === "expense";

  const draftPayload = useMemo(() => {
    if (!formState) {
      return null;
    }

    const amountGrossParsed = parseIntegerString(formState.amountGross);
    const amountNetParsed = parseIntegerString(formState.amountNet);
    const amountTaxParsed = parseIntegerString(formState.amountTax);
    const typeOfExpenseIdParsed = parseIntegerString(formState.typeOfExpenseId);

    if (
      Number.isNaN(amountGrossParsed) ||
      Number.isNaN(amountNetParsed) ||
      Number.isNaN(amountTaxParsed) ||
      Number.isNaN(typeOfExpenseIdParsed)
    ) {
      return {
        ok: false as const,
        message: "Amount fields and expense type id must use whole numbers (integers).",
      };
    }

    if (amountGrossParsed === null) {
      return { ok: false as const, message: "amountGross is required." };
    }

    return {
      ok: true as const,
      payload: {
        documentDate: formState.documentDate,
        counterpartyName: formState.counterpartyName,
        bookingText: formState.bookingText,
        amountGross: amountGrossParsed,
        amountNet: amountNetParsed,
        amountTax: amountTaxParsed,
        paymentReceivedDate:
          formState.paymentReceivedDate.trim().length < 1 ? null : formState.paymentReceivedDate,
        typeOfExpenseId: typeOfExpenseIdParsed,
      },
    };
  }, [formState]);

  async function handleSaveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedbackMessage(null);

    if (!draftPayload) {
      setFeedbackMessage("Draft form is not ready.");
      return;
    }
    if (!draftPayload.ok) {
      setFeedbackMessage(draftPayload.message);
      return;
    }

    setIsSavingDraft(true);
    try {
      const response = await fetch(`/api/uploads/${uploadId}/review`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(draftPayload.payload),
      });

      if (!response.ok) {
        setFeedbackMessage((await parseApiError(response)).message);
        return;
      }

      const payload = (await response.json()) as ReviewResponse;
      setReviewData(payload);
      setFormState(toFormState(payload));
      setFeedbackMessage("Draft saved.");
    } catch {
      setFeedbackMessage("Could not save draft.");
    } finally {
      setIsSavingDraft(false);
    }
  }

  async function findNextPendingUploadId(): Promise<string | null> {
    const response = await fetch("/api/uploads?status=pending_review", { cache: "no-store" });
    if (!response.ok) {
      throw new Error((await parseApiError(response)).message);
    }

    const payload = (await response.json()) as {
      items: Array<{ id: string }>;
    };
    return payload.items.find((item) => item.id !== uploadId)?.id ?? null;
  }

  async function handleSaveEntry(options?: { andNext?: boolean }) {
    setFeedbackMessage(null);
    const andNext = options?.andNext ?? false;

    if (!draftPayload) {
      setFeedbackMessage("Draft form is not ready.");
      return;
    }
    if (!draftPayload.ok) {
      setFeedbackMessage(draftPayload.message);
      return;
    }

    if (andNext) {
      setIsSavingEntryAndNext(true);
    } else {
      setIsSavingEntry(true);
    }
    try {
      const draftSaveResponse = await fetch(`/api/uploads/${uploadId}/review`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(draftPayload.payload),
      });

      if (!draftSaveResponse.ok) {
        setFeedbackMessage((await parseApiError(draftSaveResponse)).message);
        return;
      }

      const response = await fetch(`/api/uploads/${uploadId}/save`, {
        method: "POST",
      });

      if (!response.ok) {
        const apiError = await parseApiError(response);
        if (andNext && apiError.code === "ALREADY_SAVED") {
          const nextUploadId = await findNextPendingUploadId();
          if (nextUploadId) {
            router.push(`/uploads/${nextUploadId}/review`);
            return;
          }

          router.push("/uploads?status=pending_review&flash=saved_and_queue_empty");
          return;
        }

        setFeedbackMessage(apiError.message);
        return;
      }

      const payload = (await response.json()) as SaveEntryResponse;
      if (andNext) {
        const nextUploadId = await findNextPendingUploadId();
        if (nextUploadId) {
          router.push(`/uploads/${nextUploadId}/review`);
          return;
        }

        router.push("/uploads?status=pending_review&flash=saved_and_queue_empty");
        return;
      }

      setFeedbackMessage(
        `Entry #${payload.entry.documentNumber} saved. Redirecting to booking entries...`,
      );
      router.push("/entries");
    } catch {
      setFeedbackMessage("Could not save entry.");
    } finally {
      if (andNext) {
        setIsSavingEntryAndNext(false);
      } else {
        setIsSavingEntry(false);
      }
    }
  }

  if (isLoading) {
    return (
      <main className="min-h-screen bg-zinc-50 px-6 py-16 text-zinc-900">
        <div className="mx-auto w-full max-w-4xl rounded border border-zinc-300 bg-white p-4 text-sm text-zinc-700">
          Loading review data...
        </div>
      </main>
    );
  }

  if (loadError || !reviewData || !formState) {
    return (
      <main className="min-h-screen bg-zinc-50 px-6 py-16 text-zinc-900">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
          <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            {loadError ?? "Review data is unavailable."}
          </p>
          <Link
            href="/upload"
            className="inline-flex w-fit items-center rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100"
          >
            Back to upload
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-50 px-6 py-16 text-zinc-900">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Review Upload</h1>
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
              href="/uploads?status=pending_review"
              className="inline-flex items-center rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100"
            >
              Back to queue
            </Link>
            <Link
              href="/entries"
              className="inline-flex items-center rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100"
            >
              View entries
            </Link>
          </div>
        </header>

        {feedbackMessage ? (
          <p className="rounded border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700">
            {feedbackMessage}
          </p>
        ) : null}

        <section className="rounded border border-zinc-300 bg-white p-4 text-sm text-zinc-700">
          <p>
            <span className="font-medium">Upload ID:</span> {reviewData.upload.id}
          </p>
          <p>
            <span className="font-medium">Source file:</span> {reviewData.upload.originalFilename}
          </p>
          <p>
            <span className="font-medium">Entry type:</span> {reviewData.upload.entryType}
          </p>
          <p>
            <span className="font-medium">Uploaded at:</span> {reviewData.upload.uploadedAt}
          </p>
        </section>

        <form onSubmit={handleSaveDraft} className="flex flex-col gap-4 rounded border border-zinc-300 bg-white p-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Document date</span>
            <input
              type="date"
              value={formState.documentDate}
              onChange={(event) => {
                setFormState((current) =>
                  current ? { ...current, documentDate: event.target.value } : current,
                );
              }}
              className="rounded border border-zinc-300 px-3 py-2"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Counterparty name</span>
            <input
              type="text"
              value={formState.counterpartyName}
              onChange={(event) => {
                setFormState((current) =>
                  current ? { ...current, counterpartyName: event.target.value } : current,
                );
              }}
              className="rounded border border-zinc-300 px-3 py-2"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Booking text</span>
            <textarea
              value={formState.bookingText}
              onChange={(event) => {
                setFormState((current) =>
                  current ? { ...current, bookingText: event.target.value } : current,
                );
              }}
              className="min-h-28 rounded border border-zinc-300 px-3 py-2"
            />
          </label>

          <div className="grid gap-4 md:grid-cols-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Amount gross (cents)</span>
              <input
                type="number"
                step="1"
                value={formState.amountGross}
                onChange={(event) => {
                  setFormState((current) =>
                    current ? { ...current, amountGross: event.target.value } : current,
                  );
                }}
                className="rounded border border-zinc-300 px-3 py-2"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Amount net (cents)</span>
              <input
                type="number"
                step="1"
                value={formState.amountNet}
                onChange={(event) => {
                  setFormState((current) =>
                    current ? { ...current, amountNet: event.target.value } : current,
                  );
                }}
                className="rounded border border-zinc-300 px-3 py-2"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Amount tax (cents)</span>
              <input
                type="number"
                step="1"
                value={formState.amountTax}
                onChange={(event) => {
                  setFormState((current) =>
                    current ? { ...current, amountTax: event.target.value } : current,
                  );
                }}
                className="rounded border border-zinc-300 px-3 py-2"
              />
            </label>
          </div>

          {isExpense ? (
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Expense type</span>
              <select
                value={formState.typeOfExpenseId}
                onChange={(event) => {
                  setFormState((current) =>
                    current ? { ...current, typeOfExpenseId: event.target.value } : current,
                  );
                }}
                className="rounded border border-zinc-300 px-3 py-2"
              >
                <option value="">Select expense type</option>
                {expenseTypes.map((expenseType) => (
                  <option key={expenseType.id} value={expenseType.id}>
                    {expenseType.expenseTypeText}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Payment received date</span>
              <input
                type="date"
                value={formState.paymentReceivedDate}
                onChange={(event) => {
                  setFormState((current) =>
                    current ? { ...current, paymentReceivedDate: event.target.value } : current,
                  );
                }}
                className="rounded border border-zinc-300 px-3 py-2"
              />
            </label>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={isSavingDraft}
              className="rounded border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSavingDraft ? "Saving draft..." : "Save draft"}
            </button>
            {reviewData.reviewStatus === "pending_review" ? (
              <button
                type="button"
                onClick={() => {
                  void handleSaveEntry({ andNext: true });
                }}
                disabled={isSavingEntry || isSavingEntryAndNext}
                className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-500"
              >
                {isSavingEntryAndNext ? "Saving and opening next..." : "Save entry and next"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                void handleSaveEntry({ andNext: false });
              }}
              disabled={isSavingEntry || isSavingEntryAndNext}
              className="rounded border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSavingEntry ? "Saving entry..." : "Save entry"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
