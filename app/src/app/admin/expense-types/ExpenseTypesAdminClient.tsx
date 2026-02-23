"use client";

import { DragEvent, FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type ExpenseType = {
  id: number;
  expenseTypeText: string;
  plCategory: ExpensePlCategory;
  createdAt: string;
  updatedAt: string;
};

type ExpensePlCategory =
  | "direct_cost"
  | "operating_expense"
  | "financial_other"
  | "tax";

type ApiError = {
  error?: {
    message?: string;
    field?: string;
    code?: string;
  };
};

const MAX_EXPENSE_TYPE_TEXT_LENGTH = 100;
const DRAG_DROP_DATA_TYPE = "text/plain";
const PL_CATEGORY_OPTIONS: Array<{ value: ExpensePlCategory; label: string }> = [
  { value: "direct_cost", label: "Direct Costs" },
  { value: "operating_expense", label: "Operating Expenses" },
  { value: "financial_other", label: "Financial / Other" },
  { value: "tax", label: "Taxes" },
];

type DropPosition = "before" | "after";

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
  const [plCategory, setPlCategory] = useState<ExpensePlCategory>("operating_expense");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeletingById, setIsDeletingById] = useState<Record<number, boolean>>(
    {},
  );
  const [isUpdatingById, setIsUpdatingById] = useState<Record<number, boolean>>({});
  const [editingExpenseTypeId, setEditingExpenseTypeId] = useState<number | null>(null);
  const [editingExpenseTypeText, setEditingExpenseTypeText] = useState("");
  const [editingPlCategory, setEditingPlCategory] =
    useState<ExpensePlCategory>("operating_expense");
  const [isReordering, setIsReordering] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [draggedExpenseTypeId, setDraggedExpenseTypeId] = useState<number | null>(
    null,
  );
  const [dragOverExpenseTypeId, setDragOverExpenseTypeId] = useState<number | null>(
    null,
  );
  const [dropPosition, setDropPosition] = useState<DropPosition | null>(null);

  const isSubmitDisabled = useMemo(() => {
    const trimmedLength = expenseTypeText.trim().length;
    return (
      isSubmitting ||
      trimmedLength < 1 ||
      trimmedLength > MAX_EXPENSE_TYPE_TEXT_LENGTH
    );
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
        setErrorMessage(null);
      } catch {
        if (controller.signal.aborted) {
          return;
        }

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

    if (expenseTypeText.trim().length > MAX_EXPENSE_TYPE_TEXT_LENGTH) {
      setErrorMessage(
        `Expense type text must be at most ${MAX_EXPENSE_TYPE_TEXT_LENGTH} characters.`,
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/expense-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expenseTypeText, plCategory }),
      });

      if (!response.ok) {
        setErrorMessage(await parseApiError(response));
        return;
      }

      const created = (await response.json()) as ExpenseType;
      setExpenseTypes((current) => [...current, created]);
      setExpenseTypeText("");
      setPlCategory("operating_expense");
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

  function handleStartEdit(expenseType: ExpenseType) {
    setErrorMessage(null);
    setEditingExpenseTypeId(expenseType.id);
    setEditingExpenseTypeText(expenseType.expenseTypeText);
    setEditingPlCategory(expenseType.plCategory);
  }

  function handleCancelEdit() {
    setEditingExpenseTypeId(null);
    setEditingExpenseTypeText("");
    setEditingPlCategory("operating_expense");
  }

  async function handleUpdate(expenseType: ExpenseType) {
    const trimmedText = editingExpenseTypeText.trim();
    if (trimmedText.length < 1) {
      setErrorMessage("Expense type text is required.");
      return;
    }

    if (trimmedText.length > MAX_EXPENSE_TYPE_TEXT_LENGTH) {
      setErrorMessage(
        `Expense type text must be at most ${MAX_EXPENSE_TYPE_TEXT_LENGTH} characters.`,
      );
      return;
    }

    setErrorMessage(null);
    setIsUpdatingById((current) => ({ ...current, [expenseType.id]: true }));

    try {
      const response = await fetch(`/api/expense-types/${expenseType.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expenseTypeText: trimmedText,
          plCategory: editingPlCategory,
        }),
      });

      if (!response.ok) {
        setErrorMessage(await parseApiError(response));
        return;
      }

      const updated = (await response.json()) as ExpenseType;
      setExpenseTypes((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      handleCancelEdit();
    } catch {
      setErrorMessage("Could not update expense type.");
    } finally {
      setIsUpdatingById((current) => ({ ...current, [expenseType.id]: false }));
    }
  }

  async function persistOrder(nextExpenseTypes: ExpenseType[]) {
    const orderedExpenseTypeIds = nextExpenseTypes.map((item) => item.id);
    const response = await fetch("/api/expense-types/reorder", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedExpenseTypeIds }),
    });

    if (!response.ok) {
      throw new Error(await parseApiError(response));
    }
  }

  function cleanupDragState() {
    setDraggedExpenseTypeId(null);
    setDragOverExpenseTypeId(null);
    setDropPosition(null);
  }

  function getDropPosition(
    event: DragEvent<HTMLLIElement>,
    targetElement: HTMLLIElement,
  ): DropPosition {
    const rect = targetElement.getBoundingClientRect();
    const isTopHalf = event.clientY < rect.top + rect.height / 2;
    return isTopHalf ? "before" : "after";
  }

  function buildReorderedExpenseTypes(
    currentExpenseTypes: ExpenseType[],
    draggedId: number,
    targetId: number,
    position: DropPosition,
  ): ExpenseType[] | null {
    const fromIndex = currentExpenseTypes.findIndex((item) => item.id === draggedId);
    const targetIndex = currentExpenseTypes.findIndex((item) => item.id === targetId);
    if (fromIndex < 0 || targetIndex < 0) {
      return null;
    }

    let destinationIndex = targetIndex + (position === "after" ? 1 : 0);
    if (destinationIndex > fromIndex) {
      destinationIndex -= 1;
    }
    if (destinationIndex === fromIndex) {
      return null;
    }

    const nextExpenseTypes = [...currentExpenseTypes];
    const [movedExpenseType] = nextExpenseTypes.splice(fromIndex, 1);
    nextExpenseTypes.splice(destinationIndex, 0, movedExpenseType);
    return nextExpenseTypes;
  }

  function handleDragStart(
    event: DragEvent<HTMLButtonElement>,
    expenseTypeId: number,
  ) {
    if (isReordering || isSubmitting || Boolean(isDeletingById[expenseTypeId])) {
      event.preventDefault();
      return;
    }

    setErrorMessage(null);
    setDraggedExpenseTypeId(expenseTypeId);
    setDragOverExpenseTypeId(null);
    setDropPosition(null);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(DRAG_DROP_DATA_TYPE, String(expenseTypeId));
  }

  function handleDragOver(event: DragEvent<HTMLLIElement>, targetExpenseTypeId: number) {
    if (isReordering || draggedExpenseTypeId === null) {
      return;
    }
    if (draggedExpenseTypeId === targetExpenseTypeId) {
      return;
    }

    event.preventDefault();
    const targetElement = event.currentTarget;
    const nextDropPosition = getDropPosition(event, targetElement);
    setDragOverExpenseTypeId(targetExpenseTypeId);
    setDropPosition(nextDropPosition);
    event.dataTransfer.dropEffect = "move";
  }

  async function handleDrop(event: DragEvent<HTMLLIElement>, targetExpenseTypeId: number) {
    event.preventDefault();
    if (isReordering) {
      cleanupDragState();
      return;
    }

    const draggedId =
      draggedExpenseTypeId ??
      Number.parseInt(event.dataTransfer.getData(DRAG_DROP_DATA_TYPE), 10);
    if (!Number.isInteger(draggedId) || draggedId < 1 || draggedId === targetExpenseTypeId) {
      cleanupDragState();
      return;
    }

    const targetElement = event.currentTarget;
    const nextDropPosition = getDropPosition(event, targetElement);
    const nextExpenseTypes = buildReorderedExpenseTypes(
      expenseTypes,
      draggedId,
      targetExpenseTypeId,
      nextDropPosition,
    );
    cleanupDragState();

    if (!nextExpenseTypes) {
      return;
    }

    const previousExpenseTypes = expenseTypes;

    setExpenseTypes(nextExpenseTypes);
    setIsReordering(true);

    try {
      await persistOrder(nextExpenseTypes);
    } catch (error) {
      setExpenseTypes(previousExpenseTypes);
      if (error instanceof Error && error.message.length > 0) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage("Could not reorder expense types.");
      }
    } finally {
      setIsReordering(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-8 px-6 py-12">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold">Expense Types Admin</h1>
          <p className="text-sm text-zinc-600">
            Manage canonical expense types used by expense entries.
          </p>
        </div>
        <div className="shrink-0">
          <Link
            href="/"
            className="inline-flex items-center rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100"
          >
            Back to main page
          </Link>
        </div>
      </header>

      <form onSubmit={handleCreate} className="flex flex-col gap-3">
        <label htmlFor="expenseTypeText" className="text-sm font-medium">
          Expense type text
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <input
            id="expenseTypeText"
            name="expenseTypeText"
            type="text"
            value={expenseTypeText}
            onChange={(event) => setExpenseTypeText(event.target.value)}
            maxLength={MAX_EXPENSE_TYPE_TEXT_LENGTH}
            className="w-full rounded border border-zinc-300 px-3 py-2 sm:col-span-2"
            placeholder="e.g. Office Supplies"
          />
          <select
            value={plCategory}
            onChange={(event) => setPlCategory(event.target.value as ExpensePlCategory)}
            className="w-full rounded border border-zinc-300 px-3 py-2"
            aria-label="P&L category"
          >
            {PL_CATEGORY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div>
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
              const isDragDisabled = isDeleting || isReordering || isSubmitting;
              const isBeingDragged = draggedExpenseTypeId === expenseType.id;
              const isDropTarget = dragOverExpenseTypeId === expenseType.id;
              const showDropBefore = isDropTarget && dropPosition === "before";
              const showDropAfter = isDropTarget && dropPosition === "after";

              return (
                <li
                  key={expenseType.id}
                  onDragOver={(event) => handleDragOver(event, expenseType.id)}
                  onDrop={(event) => {
                    void handleDrop(event, expenseType.id);
                  }}
                  className={`flex items-center justify-between gap-3 px-3 py-2 ${
                    isBeingDragged ? "opacity-60" : ""
                  } ${showDropBefore ? "border-t-2 border-t-black" : ""} ${
                    showDropAfter ? "border-b-2 border-b-black" : ""
                  }`}
                >
                  <div className="flex flex-1 items-center gap-3">
                    <button
                      type="button"
                      draggable={!isDragDisabled}
                      disabled={isDragDisabled}
                      onDragStart={(event) => handleDragStart(event, expenseType.id)}
                      onDragEnd={cleanupDragState}
                      aria-label={`Drag ${expenseType.expenseTypeText} to reorder`}
                      className="flex h-8 w-8 cursor-grab items-center justify-center rounded border border-zinc-300 bg-zinc-50 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span aria-hidden className="grid grid-cols-2 gap-0.5">
                        {Array.from({ length: 6 }).map((_, index) => (
                          <span key={index} className="h-1 w-1 rounded-full bg-zinc-500" />
                        ))}
                      </span>
                    </button>
                    {editingExpenseTypeId === expenseType.id ? (
                      <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
                        <input
                          type="text"
                          value={editingExpenseTypeText}
                          onChange={(event) => setEditingExpenseTypeText(event.target.value)}
                          maxLength={MAX_EXPENSE_TYPE_TEXT_LENGTH}
                          className="w-full rounded border border-zinc-300 px-3 py-1.5 text-sm"
                        />
                        <select
                          value={editingPlCategory}
                          onChange={(event) =>
                            setEditingPlCategory(event.target.value as ExpensePlCategory)
                          }
                          className="w-full rounded border border-zinc-300 px-3 py-1.5 text-sm"
                        >
                          {PL_CATEGORY_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div className="flex flex-col">
                        <span>{expenseType.expenseTypeText}</span>
                        <span className="text-xs text-zinc-500">
                          {
                            PL_CATEGORY_OPTIONS.find(
                              (option) => option.value === expenseType.plCategory,
                            )?.label
                          }
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {editingExpenseTypeId === expenseType.id ? (
                      <>
                        <button
                          type="button"
                          disabled={Boolean(isUpdatingById[expenseType.id])}
                          onClick={() => {
                            void handleUpdate(expenseType);
                          }}
                          className="rounded border border-zinc-300 px-3 py-1 text-sm disabled:cursor-not-allowed disabled:text-zinc-400"
                        >
                          {isUpdatingById[expenseType.id] ? "Saving..." : "Save"}
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(isUpdatingById[expenseType.id])}
                          onClick={handleCancelEdit}
                          className="rounded border border-zinc-300 px-3 py-1 text-sm disabled:cursor-not-allowed disabled:text-zinc-400"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={isDeleting || isReordering}
                        onClick={() => handleStartEdit(expenseType)}
                        className="rounded border border-zinc-300 px-3 py-1 text-sm disabled:cursor-not-allowed disabled:text-zinc-400"
                      >
                        Edit
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={isDeleting || isReordering || Boolean(isUpdatingById[expenseType.id])}
                      onClick={() => {
                        void handleDelete(expenseType);
                      }}
                      className="rounded border border-red-300 px-3 py-1 text-sm text-red-700 disabled:cursor-not-allowed disabled:text-zinc-400"
                    >
                      {isDeleting ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
