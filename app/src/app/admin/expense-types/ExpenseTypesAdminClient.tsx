"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type ExpenseType = {
  id: number;
  expenseTypeText: string;
  createdAt: string;
  updatedAt: string;
};

type ApiError = {
  error?: {
    message?: string;
    field?: string;
    code?: string;
  };
};

async function parseApiError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as ApiError;
    if (payload.error?.message) {
      return payload.error.message;
    }
  } catch {
    return "Request failed.";
  }

  return "Request failed.";
}

export function ExpenseTypesAdminClient() {
  const [expenseTypes, setExpenseTypes] = useState<ExpenseType[]>([]);
  const [expenseTypeText, setExpenseTypeText] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeletingById, setIsDeletingById] = useState<Record<number, boolean>>(
    {},
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isSubmitDisabled = useMemo(() => {
    return isSubmitting || expenseTypeText.trim().length < 1;
  }, [expenseTypeText, isSubmitting]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadExpenseTypes() {
      try {
        const response = await fetch("/api/expense-types", {
          method: "GET",
          signal: controller.signal,
        });

        if (!response.ok) {
          setErrorMessage("Could not load expense types.");
          return;
        }

        const payload = (await response.json()) as ExpenseType[];
        setExpenseTypes(payload);
      } catch {
        setErrorMessage("Could not load expense types.");
      } finally {
        setIsLoading(false);
      }
    }

    void loadExpenseTypes();
    return () => controller.abort();
  }, []);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    if (expenseTypeText.trim().length < 1) {
      setErrorMessage("Expense type text is required.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/expense-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expenseTypeText }),
      });

      if (!response.ok) {
        setErrorMessage(await parseApiError(response));
        return;
      }

      const created = (await response.json()) as ExpenseType;
      setExpenseTypes((current) => [...current, created]);
      setExpenseTypeText("");
    } catch {
      setErrorMessage("Could not create expense type.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(expenseType: ExpenseType) {
    const shouldDelete = window.confirm(
      `Delete expense type "${expenseType.expenseTypeText}"?`,
    );

    if (!shouldDelete) {
      return;
    }

    setErrorMessage(null);
    setIsDeletingById((current) => ({ ...current, [expenseType.id]: true }));

    try {
      const response = await fetch(`/api/expense-types/${expenseType.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        setErrorMessage(await parseApiError(response));
        return;
      }

      setExpenseTypes((current) =>
        current.filter((item) => item.id !== expenseType.id),
      );
    } catch {
      setErrorMessage("Could not delete expense type.");
    } finally {
      setIsDeletingById((current) => ({ ...current, [expenseType.id]: false }));
    }
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Expense Types Admin</h1>
        <p className="text-sm text-zinc-600">
          Manage canonical expense types used by expense entries.
        </p>
      </header>

      <form onSubmit={handleCreate} className="flex flex-col gap-3">
        <label htmlFor="expenseTypeText" className="text-sm font-medium">
          Expense type text
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            id="expenseTypeText"
            name="expenseTypeText"
            type="text"
            value={expenseTypeText}
            onChange={(event) => setExpenseTypeText(event.target.value)}
            className="w-full rounded border border-zinc-300 px-3 py-2"
            placeholder="e.g. Office Supplies"
          />
          <button
            type="submit"
            disabled={isSubmitDisabled}
            className="rounded bg-black px-4 py-2 text-white disabled:cursor-not-allowed disabled:bg-zinc-400"
          >
            {isSubmitting ? "Creating..." : "Create"}
          </button>
        </div>
      </form>

      {errorMessage ? (
        <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage}
        </p>
      ) : null}

      <section aria-live="polite">
        <h2 className="mb-3 text-lg font-semibold">Existing Expense Types</h2>

        {isLoading ? <p className="text-sm text-zinc-600">Loading...</p> : null}

        {!isLoading && expenseTypes.length === 0 ? (
          <p className="text-sm text-zinc-600">No expense types yet.</p>
        ) : null}

        {!isLoading && expenseTypes.length > 0 ? (
          <ul className="divide-y divide-zinc-200 rounded border border-zinc-200">
            {expenseTypes.map((expenseType) => {
              const isDeleting = Boolean(isDeletingById[expenseType.id]);

              return (
                <li
                  key={expenseType.id}
                  className="flex items-center justify-between gap-3 px-3 py-2"
                >
                  <span>{expenseType.expenseTypeText}</span>
                  <button
                    type="button"
                    disabled={isDeleting}
                    onClick={() => {
                      void handleDelete(expenseType);
                    }}
                    className="rounded border border-red-300 px-3 py-1 text-sm text-red-700 disabled:cursor-not-allowed disabled:text-zinc-400"
                  >
                    {isDeleting ? "Deleting..." : "Delete"}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
