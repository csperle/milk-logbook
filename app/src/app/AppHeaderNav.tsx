"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type Props = {
  hasActiveCompany: boolean;
  activeCompanyName: string | null;
  pendingInboxCount: number | null;
};

type PrimaryNavItem = {
  label: string;
  href: string;
  key: "inbox" | "upload" | "overview" | "annual_pl";
};

const PRIMARY_NAV_ITEMS: PrimaryNavItem[] = [
  { key: "overview", label: "Yearly Overview", href: "/" },
  { key: "inbox", label: "Inbox", href: "/uploads?status=pending_review" },
  { key: "upload", label: "Upload invoice", href: "/upload" },
  { key: "annual_pl", label: "Annual P&L", href: "/reports/annual-pl" },
];

function resolveActiveNavKey(pathname: string): PrimaryNavItem["key"] | null {
  if (pathname === "/") {
    return "overview";
  }
  if (pathname === "/upload" || pathname.startsWith("/upload/")) {
    return "upload";
  }
  if (pathname === "/uploads" || pathname.startsWith("/uploads/")) {
    return "inbox";
  }
  if (pathname === "/reports/annual-pl" || pathname.startsWith("/reports/annual-pl/")) {
    return "annual_pl";
  }
  return null;
}

function getNavItemClassName(isActive: boolean): string {
  if (isActive) {
    return "inline-flex items-center rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white";
  }
  return "inline-flex items-center rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100";
}

export function AppHeaderNav({ hasActiveCompany, activeCompanyName, pendingInboxCount }: Props) {
  const pathname = usePathname();
  const activeKey = resolveActiveNavKey(pathname);
  const isAdminRoute = pathname.startsWith("/admin/");
  const [currentPendingCount, setCurrentPendingCount] = useState<number | null>(pendingInboxCount);

  useEffect(() => {
    setCurrentPendingCount(pendingInboxCount);
  }, [pendingInboxCount]);

  useEffect(() => {
    if (!hasActiveCompany) {
      setCurrentPendingCount(null);
      return;
    }

    let isActive = true;

    async function refreshPendingCount() {
      try {
        const response = await fetch("/api/uploads?status=pending_review", {
          cache: "no-store",
        });
        if (!response.ok || !isActive) {
          return;
        }

        const payload = (await response.json()) as { items: Array<unknown> };
        if (!isActive) {
          return;
        }

        setCurrentPendingCount(payload.items.length);
      } catch {
        // Keep the previous value on transient fetch failures.
      }
    }

    void refreshPendingCount();

    const handleRefresh = () => {
      void refreshPendingCount();
    };

    window.addEventListener("uploads:changed", handleRefresh);
    window.addEventListener("focus", handleRefresh);

    return () => {
      isActive = false;
      window.removeEventListener("uploads:changed", handleRefresh);
      window.removeEventListener("focus", handleRefresh);
    };
  }, [hasActiveCompany, pathname]);

  return (
    <header className="border-b border-zinc-200 bg-white px-4 py-3 text-zinc-900">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href={hasActiveCompany ? "/" : "/admin/companies"}
            className="text-lg font-bold tracking-tight text-zinc-950"
          >
            Bookkeeping App
          </Link>

          <details className="relative">
            <summary
              className={`inline-flex cursor-pointer list-none items-center rounded-md border px-3 py-1.5 text-xs font-medium ${
                isAdminRoute
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100"
              }`}
            >
              Administration
            </summary>
            <div className="absolute right-0 z-50 mt-2 w-56 rounded-md border border-zinc-200 bg-white p-1 shadow-lg">
              <Link
                href="/admin/companies"
                className="block rounded px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100"
              >
                {hasActiveCompany ? `Active company: ${activeCompanyName}` : "Select active company"}
              </Link>
              <Link
                href="/admin/expense-types"
                className="block rounded px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100"
              >
                Expense types
              </Link>
            </div>
          </details>
        </div>

        <nav className="flex flex-wrap gap-2">
          {PRIMARY_NAV_ITEMS.map((item) => {
            const isActive = activeKey === item.key;
            const className = getNavItemClassName(isActive);

            if (!hasActiveCompany) {
              return (
                <span
                  key={item.key}
                  className="inline-flex cursor-not-allowed items-center rounded-md border border-zinc-200 bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-400"
                >
                  {item.label}
                </span>
              );
            }

            return (
              <Link key={item.key} href={item.href} className={className}>
                {item.label}
                {item.key === "inbox" && currentPendingCount !== null ? (
                  <span
                    className={`ml-2 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-xs ${
                      isActive ? "bg-white text-zinc-900" : "bg-zinc-900 text-white"
                    }`}
                  >
                    {currentPendingCount}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
