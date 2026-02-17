"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ACTIVE_COMPANY_COOKIE_MAX_AGE_SECONDS,
  ACTIVE_COMPANY_COOKIE_NAME,
  parseActiveCompanyId,
} from "@/lib/active-company";

type Company = {
  id: number;
  name: string;
  createdAt: string;
  updatedAt: string;
};

type ApiError = {
  error?: {
    message?: string;
  };
};

const MAX_COMPANY_NAME_LENGTH = 100;

function readActiveCompanyIdFromCookie(): number | null {
  const cookies = document.cookie.split(";");
  for (const cookie of cookies) {
    const [rawName, ...rest] = cookie.trim().split("=");
    if (rawName !== ACTIVE_COMPANY_COOKIE_NAME) {
      continue;
    }

    return parseActiveCompanyId(rest.join("="));
  }

  return null;
}

function setActiveCompanyCookie(companyId: number): void {
  document.cookie = `${ACTIVE_COMPANY_COOKIE_NAME}=${companyId}; Path=/; Max-Age=${ACTIVE_COMPANY_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
}

function clearActiveCompanyCookie(): void {
  document.cookie = `${ACTIVE_COMPANY_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`;
}

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

export function CompaniesAdminClient() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyName, setCompanyName] = useState("");
  const [activeCompanyId, setActiveCompanyId] = useState<number | null>(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeletingById, setIsDeletingById] = useState<Record<number, boolean>>(
    {},
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const hasCompanies = companies.length > 0;
  const hasValidActiveCompany =
    activeCompanyId !== null && companies.some((company) => company.id === activeCompanyId);
  const requiresImmediateSelection = hasCompanies && !hasValidActiveCompany;
  const warningMessage = useMemo(() => {
    if (isLoading) {
      return null;
    }

    if (!hasCompanies) {
      return "No company exists yet. Create at least one company to unlock the rest of the app.";
    }

    if (requiresImmediateSelection) {
      return "No active company is selected. Select a company below to continue to use the app.";
    }

    return null;
  }, [hasCompanies, isLoading, requiresImmediateSelection]);

  const isSubmitDisabled = useMemo(() => {
    const trimmedLength = companyName.trim().length;
    return isSubmitting || trimmedLength < 1 || trimmedLength > MAX_COMPANY_NAME_LENGTH;
  }, [companyName, isSubmitting]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadCompanies() {
      try {
        const response = await fetch("/api/companies", {
          method: "GET",
          signal: controller.signal,
        });

        if (!response.ok) {
          setErrorMessage("Could not load companies.");
          return;
        }

        const payload = (await response.json()) as Company[];
        const cookieCompanyId = readActiveCompanyIdFromCookie();
        const validCookieCompanyId = payload.some(
          (company) => company.id === cookieCompanyId,
        )
          ? cookieCompanyId
          : null;

        if (validCookieCompanyId !== null) {
          setActiveCompanyId(validCookieCompanyId);
          setSelectedCompanyId(validCookieCompanyId);
        } else if (payload.length === 1) {
          const firstCompanyId = payload[0].id;
          setActiveCompanyCookie(firstCompanyId);
          setActiveCompanyId(firstCompanyId);
          setSelectedCompanyId(firstCompanyId);
        } else {
          clearActiveCompanyCookie();
          setActiveCompanyId(null);
          setSelectedCompanyId(payload.length > 0 ? payload[0].id : null);
        }

        setCompanies(payload);
        setErrorMessage(null);
      } catch {
        if (!controller.signal.aborted) {
          setErrorMessage("Could not load companies.");
        }
      } finally {
        setIsLoading(false);
      }
    }

    void loadCompanies();
    return () => controller.abort();
  }, []);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    if (companyName.trim().length < 1) {
      setErrorMessage("Company name is required.");
      return;
    }

    if (companyName.trim().length > MAX_COMPANY_NAME_LENGTH) {
      setErrorMessage(
        `Company name must be at most ${MAX_COMPANY_NAME_LENGTH} characters.`,
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: companyName }),
      });

      if (!response.ok) {
        setErrorMessage(await parseApiError(response));
        return;
      }

      const createdCompany = (await response.json()) as Company;
      setCompanies((current) => {
        const nextCompanies = [...current, createdCompany];

        if (nextCompanies.length === 1) {
          setActiveCompanyCookie(createdCompany.id);
          setActiveCompanyId(createdCompany.id);
          setSelectedCompanyId(createdCompany.id);
        } else if (selectedCompanyId === null) {
          setSelectedCompanyId(nextCompanies[0].id);
        }

        return nextCompanies;
      });
      setCompanyName("");
    } catch {
      setErrorMessage("Could not create company.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleSelectActiveCompany() {
    if (selectedCompanyId === null) {
      setErrorMessage("Please choose an active company.");
      return;
    }

    setActiveCompanyCookie(selectedCompanyId);
    setActiveCompanyId(selectedCompanyId);
    setErrorMessage(null);
  }

  async function handleDelete(company: Company) {
    const shouldDelete = window.confirm(`Delete company "${company.name}"?`);
    if (!shouldDelete) {
      return;
    }

    setErrorMessage(null);
    setIsDeletingById((current) => ({ ...current, [company.id]: true }));

    try {
      const response = await fetch(`/api/companies/${company.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        setErrorMessage(await parseApiError(response));
        return;
      }

      setCompanies((current) => {
        const nextCompanies = current.filter((item) => item.id !== company.id);

        if (nextCompanies.length < 1) {
          clearActiveCompanyCookie();
          setActiveCompanyId(null);
          setSelectedCompanyId(null);
          return nextCompanies;
        }

        const fallbackCompanyId = nextCompanies[0].id;

        if (activeCompanyId === company.id) {
          setActiveCompanyCookie(fallbackCompanyId);
          setActiveCompanyId(fallbackCompanyId);
          setSelectedCompanyId(fallbackCompanyId);
          return nextCompanies;
        }

        if (selectedCompanyId === company.id) {
          setSelectedCompanyId(fallbackCompanyId);
        }

        return nextCompanies;
      });
    } catch {
      setErrorMessage("Could not delete company.");
    } finally {
      setIsDeletingById((current) => ({ ...current, [company.id]: false }));
    }
  }

  function handleSetActiveCompany(companyId: number) {
    setSelectedCompanyId(companyId);
    setActiveCompanyCookie(companyId);
    setActiveCompanyId(companyId);
    setErrorMessage(null);
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Company Admin</h1>
        <p className="text-sm text-zinc-600">
          Manage companies and select the active company used by the app.
        </p>
      </header>

      {errorMessage ? (
        <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage}
        </p>
      ) : null}

      {warningMessage ? (
        <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {warningMessage}
        </p>
      ) : null}

      {isLoading ? <p className="text-sm text-zinc-600">Loading...</p> : null}

      {!isLoading && hasCompanies && requiresImmediateSelection ? (
        <section className="flex flex-col gap-4 rounded border border-zinc-300 bg-zinc-50 px-4 py-4">
          <h2 className="text-lg font-semibold">Select active company</h2>
          <p className="text-sm text-zinc-600">
            You must select an active company before using other app pages.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <select
              value={selectedCompanyId ?? ""}
              onChange={(event) => {
                const parsedId = Number(event.target.value);
                setSelectedCompanyId(Number.isInteger(parsedId) ? parsedId : null);
              }}
              className="rounded border border-zinc-300 px-3 py-2"
            >
              <option value="" disabled>
                Select company
              </option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleSelectActiveCompany}
              className="rounded bg-black px-4 py-2 text-white"
            >
              Set active company
            </button>
          </div>
        </section>
      ) : null}

      {!isLoading && !requiresImmediateSelection ? (
        <>
          <form onSubmit={handleCreate} className="flex flex-col gap-3">
            <label htmlFor="companyName" className="text-sm font-medium">
              Company name
            </label>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                id="companyName"
                name="companyName"
                type="text"
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                maxLength={MAX_COMPANY_NAME_LENGTH}
                className="w-full rounded border border-zinc-300 px-3 py-2"
                placeholder="e.g. Acme GmbH"
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

          <section aria-live="polite">
            <h2 className="mb-3 text-lg font-semibold">Existing Companies</h2>

            {!hasCompanies ? (
              <p className="text-sm text-zinc-600">No companies yet.</p>
            ) : (
              <ul className="divide-y divide-zinc-200 rounded border border-zinc-200">
                {companies.map((company) => {
                  const isDeleting = Boolean(isDeletingById[company.id]);
                  const isActive = company.id === activeCompanyId;

                  return (
                    <li
                      key={company.id}
                      className="flex items-center justify-between gap-3 px-3 py-2"
                    >
                      <div className="flex items-center gap-3">
                        <span>{company.name}</span>
                        {isActive ? (
                          <span className="rounded bg-zinc-900 px-2 py-0.5 text-xs text-white">
                            Active
                          </span>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-2">
                        {!isActive ? (
                          <button
                            type="button"
                            onClick={() => {
                              handleSetActiveCompany(company.id);
                            }}
                            className="rounded border border-zinc-300 px-3 py-1 text-sm"
                          >
                            Set active
                          </button>
                        ) : null}
                        <button
                          type="button"
                          disabled={isDeleting}
                          onClick={() => {
                            void handleDelete(company);
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
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
