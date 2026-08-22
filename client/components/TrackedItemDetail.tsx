"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import PriceHistoryChart from "@/components/PriceHistoryChart";
import { API_BASE_URL, userHeaders } from "@/lib/api";
import { formatPrice } from "@/lib/format";
import { platformLabel } from "@/lib/platforms";
import type { TrackedItem, UserContext } from "@/lib/types";

type LoadState = "loading" | "ready" | "error";

const STATUS_META: Record<
  TrackedItem["lastStatus"],
  { label: string; className: string }
> = {
  success: {
    label: "Last check OK",
    className: "bg-emerald-50 border-emerald-100 text-emerald-600",
  },
  error: {
    label: "Last check failed",
    className: "bg-red-50 border-red-100 text-red-600",
  },
  pending: {
    label: "Waiting for first check",
    className: "bg-amber-50 border-amber-100 text-amber-600",
  },
  skipped: {
    label: "Last check skipped",
    className: "bg-gray-50 border-gray-200 text-gray-500",
  },
};

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function TrackedItemDetail({
  itemId,
  user,
}: {
  itemId: string;
  user: UserContext;
}) {
  const [item, setItem] = useState<TrackedItem | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadItem = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/tracked-items/${itemId}`, {
        method: "GET",
        headers: userHeaders(user),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(
          payload?.message ||
            (response.status === 404
              ? "This tracked item does not exist or was removed."
              : `Failed to load item (${response.status})`),
        );
      }

      const data = (await response.json()) as { item: TrackedItem };
      setItem(data.item);
      setState("ready");
    } catch (loadError) {
      setErrorMessage(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load tracked item.",
      );
      setState("error");
    }
  }, [itemId, user]);

  function handleRetry() {
    setState("loading");
    setErrorMessage(null);
    loadItem();
  }

  useEffect(() => {
    let isMounted = true;

    const run = async () => {
      await loadItem();
      if (!isMounted) return;
    };

    run();

    return () => {
      isMounted = false;
    };
  }, [loadItem]);

  const badge = item ? STATUS_META[item.lastStatus] : null;
  const platform = item ? platformLabel(item.platform) : null;

  return (
    <div className="space-y-8">
      <Link
        href="/tracked-items"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-600 hover:text-indigo-600 transition-colors"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 19l-7-7 7-7"
          />
        </svg>
        Back to tracked items
      </Link>

      {state === "loading" ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm">
          <div className="flex items-center gap-4 text-sm text-gray-600">
            <span className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin flex-shrink-0"></span>
            Loading item...
          </div>
        </div>
      ) : state === "error" ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-5 text-sm text-red-700">
          {errorMessage}
          <button
            type="button"
            onClick={handleRetry}
            className="ml-3 font-semibold underline hover:no-underline"
          >
            Try again
          </button>
        </div>
      ) : item ? (
        <>
          <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm">
            <div className="flex flex-col sm:flex-row items-start gap-6">
              {item.image ? (
                <Image
                  src={item.image}
                  alt={item.name}
                  width={128}
                  height={128}
                  unoptimized
                  className="w-32 h-32 rounded-xl object-cover bg-white border border-gray-200 flex-shrink-0"
                />
              ) : (
                <div className="w-32 h-32 rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center flex-shrink-0">
                  <svg
                    className="w-14 h-14 text-gray-400"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M21 4H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H3V6h18v12zM8.5 12l-2 3h11l-3.5-4.5-2.5 3.5-2-2z" />
                  </svg>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  {platform ? (
                    <span className="rounded-full bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-600 uppercase tracking-wide">
                      {platform}
                    </span>
                  ) : null}
                  {badge ? (
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  ) : null}
                  {!item.active ? (
                    <span className="rounded-full bg-gray-100 border border-gray-200 px-2.5 py-0.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                      Paused
                    </span>
                  ) : null}
                </div>
                <h2 className="text-xl font-bold text-gray-900 leading-snug break-words">
                  {item.name}
                </h2>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-indigo-600 hover:text-indigo-800 hover:underline break-all"
                >
                  {item.url}
                </a>
                <p className="text-3xl font-bold text-indigo-700 mt-4">
                  {formatPrice(item.lastPrice, item.currency)}
                </p>
              </div>
            </div>

            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-gray-100">
              <div>
                <dt className="text-xs text-gray-500 uppercase tracking-wide">
                  Target Price
                </dt>
                <dd className="mt-1 text-sm font-bold text-gray-900">
                  {item.targetPrice != null
                    ? formatPrice(item.targetPrice, item.currency)
                    : "Any drop"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500 uppercase tracking-wide">
                  Last Checked
                </dt>
                <dd className="mt-1 text-sm font-semibold text-gray-900">
                  {formatDateTime(item.lastCheckedAt)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500 uppercase tracking-wide">
                  Next Check
                </dt>
                <dd className="mt-1 text-sm font-semibold text-gray-900">
                  {formatDateTime(item.nextCheckAt)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500 uppercase tracking-wide">
                  Tracking Since
                </dt>
                <dd className="mt-1 text-sm font-semibold text-gray-900">
                  {formatDateTime(item.createdAt)}
                </dd>
              </div>
            </dl>
          </div>

          <PriceHistoryChart item={item} user={user} />
        </>
      ) : null}
    </div>
  );
}
