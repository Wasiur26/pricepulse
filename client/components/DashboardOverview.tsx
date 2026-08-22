"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/format";

type TrackedItem = {
  id: string;
  name: string;
  url: string;
  platform: string | null;
  targetPrice: number | null;
  currency: string;
  active: boolean;
  lastPrice: number | null;
  lastStatus: "pending" | "success" | "error" | "skipped";
  lastCheckedAt: string | null;
  createdAt: string;
};

type OverviewSummaryItem = {
  item: TrackedItem;
  currentPrice: number | null;
  currency: string;
  isTargetReached: boolean;
  change7d: { amount: number; percentage: number } | null;
  sparkline: { timestamp: string; price: number }[];
};

type UserContext = {
  sub: string;
  name?: string;
  email?: string;
  picture?: string;
};

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5000";

const DAY_MS = 24 * 60 * 60 * 1000;

function userHeaders(user: UserContext): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-user-sub": user.sub,
    ...(user.name ? { "x-user-name": user.name } : {}),
    ...(user.email ? { "x-user-email": user.email } : {}),
    ...(user.picture ? { "x-user-picture": user.picture } : {}),
  };
}

function Sparkline({
  points,
  isDrop,
}: {
  points: { price: number }[];
  isDrop: boolean;
}) {
  if (points.length < 2) return null;

  const prices = points.map((point) => point.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min || 1;
  const coords = points
    .map(
      (point, index) =>
        `${((index / (points.length - 1)) * 100).toFixed(2)},${(21 - ((point.price - min) / span) * 18).toFixed(2)}`,
    )
    .join(" ");

  return (
    <svg
      viewBox="0 0 100 24"
      className="w-20 h-6 flex-shrink-0"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polyline
        points={coords}
        fill="none"
        stroke={isDrop ? "#10b981" : "#ef4444"}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StatCard({
  label,
  value,
  subtitle,
  iconPath,
  iconClass,
}: {
  label: string;
  value: string | number;
  subtitle: string;
  iconPath: string;
  iconClass: string;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center gap-3 mb-3">
        <div
          className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${iconClass}`}
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d={iconPath} />
          </svg>
        </div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          {label}
        </p>
      </div>
      <p className="text-3xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
    </div>
  );
}

export default function DashboardOverview({ user }: { user: UserContext }) {
  const [items, setItems] = useState<TrackedItem[]>([]);
  const [movers, setMovers] = useState<OverviewSummaryItem[]>([]);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [itemsResponse, summaryResponse] = await Promise.all([
          fetch(`${API_BASE_URL}/api/tracked-items`, {
            headers: userHeaders(user),
          }),
          fetch(`${API_BASE_URL}/api/tracked-items/history/summary`, {
            headers: userHeaders(user),
          }),
        ]);

        if (!itemsResponse.ok) {
          throw new Error(
            `Failed to load your stats (${itemsResponse.status})`,
          );
        }

        const itemsData = (await itemsResponse.json()) as {
          items: TrackedItem[];
        };
        const summaryData = summaryResponse.ok
          ? ((await summaryResponse.json()) as { items: OverviewSummaryItem[] })
          : { items: [] };

        if (cancelled) return;

        const loadedItems = itemsData.items || [];
        setItems(loadedItems);
        setLoadedAt(Date.now());
        setMovers(
          (summaryData.items || [])
            .filter((entry) => entry.change7d != null)
            .sort(
              (a, b) =>
                Math.abs(b.change7d!.percentage) -
                Math.abs(a.change7d!.percentage),
            )
            .slice(0, 5),
        );
        setStatus("ready");
      } catch (loadError) {
        if (cancelled) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to load your stats.",
        );
        setStatus("error");
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [user]);

  if (status === "loading") {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-8 text-sm text-gray-600">
        Crunching your numbers...
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {error ?? "Failed to load your stats."}
      </div>
    );
  }

  const totalItems = items.length;
  const activeCount = items.filter((item) => item.active).length;
  const pausedCount = totalItems - activeCount;
  const targetsReached = items.filter(
    (item) =>
      item.targetPrice != null &&
      item.lastPrice != null &&
      item.lastPrice <= item.targetPrice,
  ).length;
  const watchingAnyDrop = items.filter(
    (item) => item.targetPrice == null,
  ).length;
  const needsAttention = items.filter(
    (item) => item.lastStatus === "error" || item.lastStatus === "pending",
  ).length;
  const platformCount = new Set(
    items.filter((item) => item.platform).map((item) => item.platform),
  ).size;
  const addedThisWeek = items.filter(
    (item) =>
      item.createdAt &&
      loadedAt != null &&
      loadedAt - new Date(item.createdAt).getTime() <= 7 * DAY_MS,
  ).length;

  if (totalItems === 0) {
    return (
      <div className="bg-white border border-dashed border-gray-300 rounded-2xl p-12 text-center">
        <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center">
          <svg
            className="w-6 h-6 text-indigo-600"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M13 7h-2v4H7v2h4v4h2v-4h4v-2h-4V7zm-1-5C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" />
          </svg>
        </div>
        <h3 className="text-base font-semibold text-gray-900 mb-1">
          Nothing tracked yet
        </h3>
        <p className="text-sm text-gray-600 mb-5">
          Add your first product and this dashboard will fill up with price
          insights.
        </p>
        <Link
            href="/tracked-items"
          className="inline-block px-6 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-purple-600 rounded-lg shadow-md shadow-indigo-200 hover:shadow-lg hover:-translate-y-0.5 transition-all"
        >
          Track Your First Product
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Total Tracked Items"
          value={totalItems}
          subtitle={`${activeCount} active · ${pausedCount} paused`}
          iconPath="M20 7H4V5h16v2zm-2 6H6v-2h12v2zm-4 6H10v-2h4v2z"
          iconClass="bg-indigo-50 text-indigo-600"
        />
        <StatCard
          label="Targets Reached"
          value={targetsReached}
          subtitle={`${watchingAnyDrop} watching for any drop`}
          iconPath="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"
          iconClass="bg-emerald-50 text-emerald-600"
        />
        <StatCard
          label="Needs Attention"
          value={needsAttention}
          subtitle={
            needsAttention === 0
              ? "All checks passing"
              : "Pending or failing checks"
          }
          iconPath="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"
          iconClass="bg-amber-50 text-amber-600"
        />
        <StatCard
          label="Stores Covered"
          value={platformCount}
          subtitle={`${addedThisWeek} added this week`}
          iconPath="M20 4H4v2h16V4zm1 10v-2l-1-5H4l-1 5v2h1v6h10v-6h4v6h2v-6h1zm-9 4H6v-4h6v4z"
          iconClass="bg-purple-50 text-purple-600"
        />
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-gray-900">
            Biggest Movers (7 days)
          </h3>
          <Link
          href="/tracked-items"
            className="text-sm font-semibold text-indigo-600 hover:text-indigo-800"
          >
            Manage items →
          </Link>
        </div>

        {movers.length === 0 ? (
          <p className="text-sm text-gray-500">
            Not enough history yet — movers appear after a few price checks.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {movers.map((entry) => {
              const change = entry.change7d!;
              const isDrop = change.amount < 0;
              return (
                <li
                  key={entry.item.id}
                  className="flex items-center gap-4 py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {entry.item.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {entry.item.platform
                        ? entry.item.platform.charAt(0).toUpperCase() +
                          entry.item.platform.slice(1)
                        : "Direct link"}
                    </p>
                  </div>
                  <Sparkline points={entry.sparkline} isDrop={isDrop} />
                  <div className="text-right w-24 flex-shrink-0">
                    <p className="text-sm font-bold text-gray-900">
                      {formatPrice(entry.currentPrice, entry.currency)}
                    </p>
                    <p
                      className={`text-xs font-bold ${isDrop ? "text-emerald-600" : "text-red-600"}`}
                    >
                      {isDrop ? "▼" : "▲"}{" "}
                      {Math.abs(change.percentage).toFixed(2)}%
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
