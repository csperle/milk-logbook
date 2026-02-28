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

type Feedback = {
  tone: "info" | "error";
  message: string;
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
    amountGross: formatRappenAsChfInput(response.draft.amountGross),
    amountNet:
      response.draft.amountNet === null ? "" : formatRappenAsChfInput(response.draft.amountNet),
    amountTax:
      response.draft.amountTax === null ? "" : formatRappenAsChfInput(response.draft.amountTax),
    paymentReceivedDate: response.draft.paymentReceivedDate ?? "",
    typeOfExpenseId:
      response.draft.typeOfExpenseId === null ? "" : String(response.draft.typeOfExpenseId),
  };
}

function formatRappenAsChfInput(value: number): string {
  const francs = Math.floor(value / 100);
  const rappen = value % 100;
  return `${francs}.${String(rappen).padStart(2, "0")}`;
}

function parseChfInputToRappen(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length < 1) {
    return null;
  }

  if (/^-/.test(trimmed) || /[^0-9.,'’\s]/.test(trimmed)) {
    return Number.NaN;
  }

  const noSpaces = trimmed.replace(/\s+/g, "").replace(/['’]/g, "");
  const lastDotIndex = noSpaces.lastIndexOf(".");
  const lastCommaIndex = noSpaces.lastIndexOf(",");
  const decimalIndex = Math.max(lastDotIndex, lastCommaIndex);

  if (decimalIndex < 0) {
    const wholeOnly = noSpaces.replace(/[.,]/g, "");
    if (!/^\d+$/.test(wholeOnly)) {
      return Number.NaN;
    }

    const parsedWhole = Number.parseInt(wholeOnly, 10);
    if (!Number.isSafeInteger(parsedWhole)) {
      return Number.NaN;
    }
    return parsedWhole * 100;
  }

  const wholeRaw = noSpaces.slice(0, decimalIndex).replace(/[.,]/g, "");
  const decimalRaw = noSpaces.slice(decimalIndex + 1).replace(/[.,]/g, "");

  if (!/^\d+$/.test(wholeRaw) || !/^\d*$/.test(decimalRaw) || decimalRaw.length > 2) {
    return Number.NaN;
  }

  const parsedWhole = Number.parseInt(wholeRaw, 10);
  if (!Number.isSafeInteger(parsedWhole)) {
    return Number.NaN;
  }

  const decimalPadded = decimalRaw.padEnd(2, "0");
  const parsedDecimal = decimalPadded.length > 0 ? Number.parseInt(decimalPadded, 10) : 0;
  if (!Number.isSafeInteger(parsedDecimal)) {
    return Number.NaN;
  }

  return parsedWhole * 100 + parsedDecimal;
}

function parsePositiveIntegerString(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length < 1) {
    return null;
  }

  if (!/^\d+$/.test(trimmed)) {
    return Number.NaN;
  }

  return Number.parseInt(trimmed, 10);
}

function getLocaleDecimalSeparator(): string {
  const decimalPart = new Intl.NumberFormat(undefined, {
    useGrouping: false,
    minimumFractionDigits: 1,
  })
    .formatToParts(1.1)
    .find((part) => part.type === "decimal");

  return decimalPart?.value ?? ".";
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

function toUserFacingErrorMessage(message: string): string {
  if (message === "typeOfExpenseId is required for expense entries.") {
    return "Select expense type.";
  }
  return message;
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
  const [feedback, setFeedback] = useState<Feedback | null>(null);
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
  const decimalSeparator = useMemo(() => getLocaleDecimalSeparator(), []);
  const amountPlaceholder = decimalSeparator === "," ? "0,00" : "0.00";

  const draftPayload = useMemo(() => {
    if (!formState) {
      return null;
    }

    const amountGrossParsed = parseChfInputToRappen(formState.amountGross);
    const amountNetParsed = parseChfInputToRappen(formState.amountNet);
    const amountTaxParsed = parseChfInputToRappen(formState.amountTax);
    const typeOfExpenseIdParsed = parsePositiveIntegerString(formState.typeOfExpenseId);

    if (Number.isNaN(amountGrossParsed)) {
      return {
        ok: false as const,
        message: "Amount gross must be a valid CHF amount.",
      };
    }

    if (amountGrossParsed === null) {
      return { ok: false as const, message: "Amount gross is required." };
    }

    const counterpartyNameTrimmed = formState.counterpartyName.trim();
    if (counterpartyNameTrimmed.length < 1) {
      return {
        ok: false as const,
        message: "Counterparty name is required.",
      };
    }

    if (counterpartyNameTrimmed.length > 200) {
      return {
        ok: false as const,
        message: "Counterparty name must be at most 200 characters.",
      };
    }

    if (Number.isNaN(amountNetParsed)) {
      return {
        ok: false as const,
        message: "Amount net must be a valid CHF amount or left empty.",
      };
    }

    if (Number.isNaN(amountTaxParsed)) {
      return {
        ok: false as const,
        message: "Amount tax must be a valid CHF amount or left empty.",
      };
    }

    if (Number.isNaN(typeOfExpenseIdParsed)) {
      return {
        ok: false as const,
        message: "Expense type is invalid. Please select a value from the list.",
      };
    }

    if (isExpense && typeOfExpenseIdParsed === null) {
      return { ok: false as const, message: "Select expense type." };
    }

    return {
      ok: true as const,
      payload: {
        documentDate: formState.documentDate,
        counterpartyName: counterpartyNameTrimmed,
        bookingText: formState.bookingText,
        amountGross: amountGrossParsed,
        amountNet: amountNetParsed,
        amountTax: amountTaxParsed,
        paymentReceivedDate:
          formState.paymentReceivedDate.trim().length < 1 ? null : formState.paymentReceivedDate,
        typeOfExpenseId: typeOfExpenseIdParsed,
      },
    };
  }, [formState, isExpense]);

  async function handleSaveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);

    if (!draftPayload) {
      setFeedback({ tone: "error", message: "Draft form is not ready." });
      return;
    }
    if (!draftPayload.ok) {
      setFeedback({ tone: "error", message: draftPayload.message });
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
        const apiError = await parseApiError(response);
        setFeedback({ tone: "error", message: toUserFacingErrorMessage(apiError.message) });
        return;
      }

      const payload = (await response.json()) as ReviewResponse;
      setReviewData(payload);
      setFormState(toFormState(payload));
      setFeedback({ tone: "info", message: "Draft saved." });
    } catch {
      setFeedback({ tone: "error", message: "Could not save draft." });
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
    setFeedback(null);
    const andNext = options?.andNext ?? false;

    if (!draftPayload) {
      setFeedback({ tone: "error", message: "Draft form is not ready." });
      return;
    }
    if (!draftPayload.ok) {
      setFeedback({ tone: "error", message: draftPayload.message });
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
        const apiError = await parseApiError(draftSaveResponse);
        setFeedback({ tone: "error", message: toUserFacingErrorMessage(apiError.message) });
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
            router.push(`/uploads/${nextUploadId}/review`, { scroll: true });
            return;
          }

          router.push("/uploads?status=pending_review&flash=saved_and_queue_empty", {
            scroll: true,
          });
          return;
        }

        setFeedback({ tone: "error", message: toUserFacingErrorMessage(apiError.message) });
        return;
      }

      window.dispatchEvent(new Event("uploads:changed"));
      if (andNext) {
        const nextUploadId = await findNextPendingUploadId();
        if (nextUploadId) {
          router.push(`/uploads/${nextUploadId}/review`, { scroll: true });
          return;
        }

        router.push("/uploads?status=pending_review&flash=saved_and_queue_empty", {
          scroll: true,
        });
        return;
      }

      const nextPendingUploadId = await findNextPendingUploadId();
      if (nextPendingUploadId) {
        router.push("/uploads?status=pending_review", { scroll: true });
        return;
      }

      router.push("/", { scroll: true });
    } catch {
      setFeedback({ tone: "error", message: "Could not save entry." });
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
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Review Upload</h1>
            <p className="mt-1 text-sm text-zinc-600">
              Company: {activeCompanyName} (#{activeCompanyId})
            </p>
          </div>
        </header>

        {feedback ? (
          <p
            className={`rounded px-3 py-2 text-sm ${
              feedback.tone === "error"
                ? "border border-red-300 bg-red-50 text-red-700"
                : "border border-zinc-300 bg-white text-zinc-700"
            }`}
          >
            {feedback.message}
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

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <section className="order-1 flex flex-col gap-3 rounded border border-zinc-300 bg-white p-4">
            <h2 className="text-sm font-semibold text-zinc-900">Source PDF</h2>
            <p className="text-sm text-zinc-600">
              If your browser cannot render the PDF inline, use the fallback actions below.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/api/uploads/${uploadId}/file`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100"
              >
                Open PDF in new tab
              </Link>
              <Link
                href={`/api/uploads/${uploadId}/file?download=1`}
                className="inline-flex items-center rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100"
              >
                Download PDF
              </Link>
            </div>
            <iframe
              title={`Source PDF for upload ${uploadId}`}
              src={`/api/uploads/${uploadId}/file`}
              className="h-[60vh] w-full rounded border border-zinc-300 bg-zinc-50"
            />
          </section>

          <form
            onSubmit={handleSaveDraft}
            className="order-2 flex flex-col gap-4 rounded border border-zinc-300 bg-white p-4"
          >
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
                <span className="font-medium">Amount gross (CHF)</span>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder={amountPlaceholder}
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
                <span className="font-medium">Amount net (CHF)</span>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder={amountPlaceholder}
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
                <span className="font-medium">Amount tax (CHF)</span>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder={amountPlaceholder}
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
      </div>
    </main>
  );
}
