"use client";

import { useCallback, useEffect, useState } from "react";

type TrackedItem = {
  id: string;
  name: string;
  url: string;
  targetPrice: number | null;
  currency: string;
  active: boolean;
  lastPrice: number | null;
  lastStatus: "pending" | "success" | "error";
  lastCheckedAt: string | null;
  nextCheckAt: string;
  createdAt: string;
};

type UserContext = {
  sub: string;
  name?: string;
  email?: string;
  picture?: string;
};

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5000";

export default function TrackedItemsManager({ user }: { user: UserContext }) {
  const [items, setItems] = useState<TrackedItem[]>([]);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [targetPrice, setTargetPrice] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadItems = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/tracked-items`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "x-user-sub": user.sub,
          ...(user.name ? { "x-user-name": user.name } : {}),
          ...(user.email ? { "x-user-email": user.email } : {}),
          ...(user.picture ? { "x-user-picture": user.picture } : {}),
        },
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
  }, [user.email, user.name, user.picture, user.sub]);

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
        headers: {
          "Content-Type": "application/json",
          "x-user-sub": user.sub,
          ...(user.name ? { "x-user-name": user.name } : {}),
          ...(user.email ? { "x-user-email": user.email } : {}),
          ...(user.picture ? { "x-user-picture": user.picture } : {}),
        },
        body: JSON.stringify({
          name: name.trim(),
          url: url.trim(),
          targetPrice: parsedTargetPrice,
          currency: "USD",
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
        headers: {
          "Content-Type": "application/json",
          "x-user-sub": user.sub,
          ...(user.name ? { "x-user-name": user.name } : {}),
          ...(user.email ? { "x-user-email": user.email } : {}),
          ...(user.picture ? { "x-user-picture": user.picture } : {}),
        },
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
            {items.map((item) => (
              <li
                key={item.id}
                className="group bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow flex items-center gap-4"
              >
                <div className="w-12 h-12 flex-shrink-0 rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                  <svg
                    className="w-6 h-6 text-gray-400"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-gray-900 truncate">
                    {item.name}
                  </h3>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-indigo-600 hover:text-indigo-800 hover:underline truncate block"
                  >
                    {item.url}
                  </a>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">
                    Target Price
                  </p>
                  {item.targetPrice ? (
                    <p className="text-sm font-bold text-gray-900">
                      ${item.targetPrice.toFixed(2)}
                    </p>
                  ) : (
                    <p className="text-sm font-semibold text-gray-400">
                      Any drop
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  aria-label={`Remove ${item.name}`}
                  className="flex-shrink-0 p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
