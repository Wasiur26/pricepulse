"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { API_BASE_URL, userHeaders } from "@/lib/api";
import { formatPrice } from "@/lib/format";
import { platformLabel } from "@/lib/platforms";
import type { TrackedItem, UserContext } from "@/lib/types";

type ExtractMetadata = {
  url: string;
  platform: string | null;
  name: string | null;
  image: string | null;
  price: number | null;
  currency: string | null;
  priceStrategy: string | null;
};

export default function TrackedItemsManager({ user }: { user: UserContext }) {
  const [items, setItems] = useState<TrackedItem[]>([]);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [targetPrice, setTargetPrice] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [preview, setPreview] = useState<ExtractMetadata | null>(null);
  const [extractState, setExtractState] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [extractMessage, setExtractMessage] = useState<string | null>(null);

  const loadItems = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/tracked-items`, {
        method: "GET",
        headers: userHeaders(user),
      });

      if (!response.ok) {
        throw new Error(`Failed to load items (${response.status})`);
      }

      const data = (await response.json()) as { items: TrackedItem[] };
      setItems(data.items || []);
    } catch (fetchError) {
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : "Failed to load tracked items.",
      );
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    let isMounted = true;

    const run = async () => {
      await loadItems();
      if (!isMounted) return;
    };

    run();

    return () => {
      isMounted = false;
    };
  }, [loadItems]);

  useEffect(() => {
    const candidate = url.trim();
    const isValidUrl = candidate && /^https?:\/\//i.test(candidate);

    let cancelled = false;
    const timer = setTimeout(async () => {
      if (!isValidUrl) {
        setPreview(null);
        setExtractState("idle");
        setExtractMessage(null);
        return;
      }

      setExtractState("loading");
      setExtractMessage(null);
      try {
        const response = await fetch(`${API_BASE_URL}/api/tracked-items/extract`, {
          method: "POST",
          headers: userHeaders(user),
          body: JSON.stringify({ url: candidate }),
        });

        if (cancelled) return;

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as {
            message?: string;
          } | null;
          throw new Error(
            payload?.message || `Could not read product info (${response.status})`,
          );
        }

        const data = (await response.json()) as { metadata: ExtractMetadata };
        setPreview(data.metadata);
        setExtractState("success");
        const detectedName = data.metadata.name;
        if (detectedName) {
          setName((prev) => (prev.trim() ? prev : detectedName));
        }
      } catch (extractError) {
        if (cancelled) return;
        setPreview(null);
        setExtractState("error");
        setExtractMessage(
          extractError instanceof Error
            ? extractError.message
            : "Could not auto-detect product info. You can still add it manually.",
        );
      }
    }, 700);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [url, user]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!url.trim() || isSaving) return;

    setIsSaving(true);
    setError(null);

    try {
      const parsedTargetPrice = targetPrice.trim()
        ? Number.parseFloat(targetPrice.trim())
        : null;

      if (
        parsedTargetPrice != null &&
        (!Number.isFinite(parsedTargetPrice) || parsedTargetPrice < 0)
      ) {
        throw new Error("Target price must be a non-negative number.");
      }

      const response = await fetch(`${API_BASE_URL}/api/tracked-items`, {
        method: "POST",
        headers: userHeaders(user),
        body: JSON.stringify({
          name: name.trim() || preview?.name || undefined,
          url: preview?.url || url.trim(),
          image: preview?.image || undefined,
          platform: preview?.platform || undefined,
          currency: preview?.currency || "USD",
          initialPrice: preview?.price ?? undefined,
          targetPrice: parsedTargetPrice,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(
          payload?.message || `Failed to create item (${response.status})`,
        );
      }

      const data = (await response.json()) as { item: TrackedItem };
      setItems((prev) => [data.item, ...prev]);
      setName("");
      setUrl("");
      setTargetPrice("");
      setPreview(null);
      setExtractState("idle");
      setExtractMessage(null);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Failed to create tracked item.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function removeItem(id: string) {
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/tracked-items/${id}`, {
        method: "DELETE",
        headers: userHeaders(user),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(
          payload?.message || `Failed to delete item (${response.status})`,
        );
      }

      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Failed to delete tracked item.",
      );
    }
  }

  const previewPlatform = platformLabel(preview?.platform ?? null);

  return (
    <div className="space-y-8">
      <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm">
        <h2 className="text-xl font-bold text-gray-900 mb-1">
          Track a New Product
        </h2>
        <p className="text-sm text-gray-600 mb-6">
          Paste a product link from any supported store to start tracking its
          price.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="product-url"
              className="block text-sm font-semibold text-gray-900 mb-1.5"
            >
              Product URL *
            </label>
            <input
              id="product-url"
              type="text"
              required
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://www.example.com/product-link"
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="product-name"
                className="block text-sm font-semibold text-gray-900 mb-1.5"
              >
                Product Name
              </label>
              <input
                id="product-name"
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Optional, e.g. Sony PS5 Digital"
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div>
              <label
                htmlFor="target-price"
                className="block text-sm font-semibold text-gray-900 mb-1.5"
              >
                Target Price
              </label>
              <input
                id="target-price"
                type="text"
                value={targetPrice}
                onChange={(event) => setTargetPrice(event.target.value)}
                placeholder="Optional, e.g. 399.99"
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-purple-600 rounded-lg shadow-md shadow-indigo-200 hover:shadow-lg hover:-translate-y-0.5 transition-all"
            >
              {isSaving ? "Saving..." : "Start Tracking"}
            </button>
          </div>
        </form>
      </div>

      {extractState === "loading" ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm">
          <h3 className="text-base font-bold text-gray-900 mb-4">
            Product Preview
          </h3>
          <div className="flex items-center gap-4 text-sm text-gray-600">
            <span className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin flex-shrink-0"></span>
            Reading product page...
          </div>
        </div>
      ) : extractState === "success" && preview ? (
        <div className="bg-white border border-indigo-200 ring-1 ring-indigo-100 rounded-2xl p-8 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-base font-bold text-gray-900">
              Product Preview
            </h3>
            <span className="rounded-full bg-emerald-50 border border-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-600 uppercase tracking-wide">
              Auto-detected
            </span>
          </div>
          <div className="flex flex-col sm:flex-row items-start gap-6">
            {preview.image ? (
              <Image
                src={preview.image}
                alt={preview.name ?? "Product"}
                width={112}
                height={112}
                unoptimized
                className="w-28 h-28 rounded-xl object-cover bg-white border border-gray-200 flex-shrink-0"
              />
            ) : (
              <div className="w-28 h-28 rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center flex-shrink-0">
                <svg
                  className="w-12 h-12 text-gray-400"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M21 4H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H3V6h18v12zM8.5 12l-2 3h11l-3.5-4.5-2.5 3.5-2-2z" />
                </svg>
              </div>
            )}
            <div className="flex-1 min-w-0">
              {previewPlatform ? (
                <span className="inline-block rounded-full bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-600 uppercase tracking-wide mb-2">
                  {previewPlatform}
                </span>
              ) : null}
              <p className="text-lg font-bold text-gray-900 leading-snug break-words">
                {preview.name || "Product name not detected"}
              </p>
              <a
                href={preview.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-indigo-600 hover:text-indigo-800 hover:underline break-all"
              >
                {preview.url}
              </a>
              <p className="text-2xl font-bold text-indigo-700 mt-3">
                {formatPrice(preview.price, preview.currency)}
              </p>
            </div>
          </div>
          <p className="mt-5 pt-4 border-t border-gray-100 text-xs text-gray-500">
            Looks right? Click &quot;Start Tracking&quot; above to save it.
          </p>
        </div>
      ) : extractState === "error" ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-700">
          {extractMessage}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">
            Your Tracked Items
          </h2>
          <span className="text-sm font-medium text-gray-500">
            {items.length} {items.length === 1 ? "item" : "items"}
          </span>
        </div>

        {isLoading ? (
          <div className="bg-white border border-gray-200 rounded-2xl p-8 text-sm text-gray-600">
            Loading tracked items...
          </div>
        ) : items.length === 0 ? (
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
              No tracked items yet
            </h3>
            <p className="text-sm text-gray-600">
              Add a product above and we&apos;ll watch its price for you.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {items.map((item) => {
              return (
                <li
                  key={item.id}
                  className="group bg-white border border-gray-200 rounded-2xl shadow-sm hover:shadow-md transition-shadow overflow-hidden"
                >
                  <div className="flex items-center gap-4 p-5">
                    {item.image ? (
                      <Image
                        src={item.image}
                        alt={item.name}
                        width={48}
                        height={48}
                        unoptimized
                        className="w-12 h-12 rounded-xl object-cover bg-gray-50 border border-gray-200 flex-shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-12 flex-shrink-0 rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                        <svg
                          className="w-6 h-6 text-gray-400"
                          fill="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                        </svg>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/tracked-items/${item.id}`}
                          className="text-sm font-bold text-gray-900 truncate hover:text-indigo-600 transition-colors"
                        >
                          {item.name}
                        </Link>
                        {platformLabel(item.platform) ? (
                          <span className="flex-shrink-0 rounded-full bg-indigo-50 border border-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-600 uppercase tracking-wide">
                            {platformLabel(item.platform)}
                          </span>
                        ) : null}
                      </div>
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-indigo-600 hover:text-indigo-800 hover:underline truncate block"
                      >
                        {item.url}
                      </a>
                    </div>
                    <div className="text-right flex-shrink-0 hidden sm:block">
                      {item.lastPrice != null ? (
                        <>
                          <p className="text-xs text-gray-500 uppercase tracking-wide">
                            Current Price
                          </p>
                          <p className="text-sm font-bold text-gray-900">
                            {formatPrice(item.lastPrice, item.currency)}
                          </p>
                        </>
                      ) : null}
                      <p className="text-xs text-gray-500 uppercase tracking-wide">
                        Target Price
                      </p>
                      {item.targetPrice != null ? (
                        <p className="text-sm font-bold text-gray-900">
                          {formatPrice(item.targetPrice, item.currency)}
                        </p>
                      ) : (
                        <p className="text-sm font-semibold text-gray-400">
                          Any drop
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Link
                        href={`/tracked-items/${item.id}`}
                        aria-label={`View details and price history for ${item.name}`}
                        title="View details & price history"
                        className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                      >
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                      </Link>
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        aria-label={`Remove ${item.name}`}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </div>
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
