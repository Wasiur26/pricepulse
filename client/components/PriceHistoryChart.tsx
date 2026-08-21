"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatPrice } from "@/lib/format";

type UserContext = {
  sub: string;
  name?: string;
  email?: string;
  picture?: string;
};

export type HistoryChartItem = {
  id: string;
  name: string;
  currency: string;
  targetPrice: number | null;
  lastPrice: number | null;
};

type ChartPoint = {
  timestamp: string;
  price: number;
  open: number;
  high: number;
  low: number;
  close: number;
  count: number;
};

type ChartSummary = {
  high: number;
  low: number;
  average: number | null;
  openPrice: number;
  closePrice: number;
  changeAmount: number;
  changePercent: number;
  pointsCount: number;
  rawChecksCount: number;
};

type ChartResponse = {
  timeframe: string;
  interval: string;
  summary: ChartSummary | null;
  points: ChartPoint[];
};

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5000";

const TIME_RANGES = [
  { label: "24H", value: "24h" },
  { label: "7D", value: "7d" },
  { label: "30D", value: "30d" },
  { label: "90D", value: "90d" },
  { label: "6M", value: "180d" },
  { label: "1Y", value: "1y" },
  { label: "All", value: "all" },
] as const;

type TimeframeValue = (typeof TIME_RANGES)[number]["value"];

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const CHART_HEIGHT = 300;
const PAD = { top: 20, right: 64, bottom: 30, left: 14 };

function userHeaders(user: UserContext): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-user-sub": user.sub,
    ...(user.name ? { "x-user-name": user.name } : {}),
    ...(user.email ? { "x-user-email": user.email } : {}),
    ...(user.picture ? { "x-user-picture": user.picture } : {}),
  };
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function formatTickLabel(date: Date, spanMs: number): string {
  if (spanMs <= 48 * HOUR_MS) return `${pad2(date.getHours())}:00`;
  if (spanMs <= 180 * DAY_MS) return `${MONTHS[date.getMonth()]} ${date.getDate()}`;
  return `${MONTHS[date.getMonth()]} ${String(date.getFullYear()).slice(2)}`;
}

function formatFullTimestamp(date: Date, spanMs: number): string {
  const time = `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  const day = `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  if (spanMs <= 48 * HOUR_MS) return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${time}`;
  if (spanMs <= 180 * DAY_MS) return `${day}, ${time}`;
  return day;
}

function niceTicks(min: number, max: number, count = 4): number[] {
  const span = max - min;
  if (!Number.isFinite(span) || span <= 0) return [min];
  const rawStep = span / count;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const normalized = rawStep / magnitude;
  const stepMultiplier = normalized >= 5 ? 5 : normalized >= 2 ? 2 : 1;
  const step = stepMultiplier * magnitude;

  const ticks: number[] = [];
  const start = Math.ceil(min / step) * step;
  for (let value = start; value <= max + step * 1e-6; value += step) {
    ticks.push(Math.round(value * 100) / 100);
  }
  return ticks;
}

function useContainerWidth() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setWidth(entry.contentRect.width);
      }
    });

    observer.observe(element);
    setWidth(element.getBoundingClientRect().width);

    return () => observer.disconnect();
  }, []);

  return { ref, width };
}

export default function PriceHistoryChart({
  item,
  user,
}: {
  item: HistoryChartItem;
  user: UserContext;
}) {
  const [timeframe, setTimeframe] = useState<TimeframeValue>("30d");
  const [data, setData] = useState<ChartResponse | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "empty" | "error">(
    "loading",
  );
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const cacheRef = useRef<Map<string, ChartResponse>>(new Map());

  useEffect(() => {
    const cached = cacheRef.current.get(timeframe);
    if (cached) {
      setData(cached);
      setStatus(cached.points.length > 0 ? "ready" : "empty");
      setHoverIndex(null);
      return;
    }

    const controller = new AbortController();
    setStatus("loading");
    setHoverIndex(null);

    fetch(
      `${API_BASE_URL}/api/tracked-items/${item.id}/history/chart?timeframe=${timeframe}`,
      { headers: userHeaders(user), signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to load price history (${response.status})`);
        }
        return (await response.json()) as ChartResponse;
      })
      .then((payload) => {
        cacheRef.current.set(timeframe, payload);
        setData(payload);
        setStatus(payload.points.length > 0 ? "ready" : "empty");
      })
      .catch((fetchError) => {
        if (controller.signal.aborted) return;
        console.error("Price history chart error:", fetchError);
        setStatus("error");
      });

    return () => controller.abort();
  }, [item.id, timeframe, user]);

  const points = useMemo(() => data?.points ?? [], [data]);
  const summary = data?.summary ?? null;

  const { ref: containerRef, width: containerWidth } = useContainerWidth();

  const geometry = useMemo(() => {
    if (points.length === 0 || containerWidth <= 0) return null;

    const times = points.map((p) => new Date(p.timestamp).getTime());
    const t0 = times[0];
    const t1 = times[times.length - 1];
    const spanMs = Math.max(t1 - t0, 1);

    let lo = Infinity;
    let hi = -Infinity;
    for (const point of points) {
      if (point.low < lo) lo = point.low;
      if (point.high > hi) hi = point.high;
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;

    if (lo === hi) {
      lo -= Math.max(1, lo * 0.05);
      hi += Math.max(1, hi * 0.05);
    }
    const range = hi - lo;
    lo -= range * 0.08;
    hi += range * 0.08;

    const showTarget =
      item.targetPrice != null && item.targetPrice >= lo && item.targetPrice <= hi;

    const plotWidth = Math.max(containerWidth - PAD.left - PAD.right, 10);
    const plotHeight = CHART_HEIGHT - PAD.top - PAD.bottom;

    const xScale = (index: number) =>
      PAD.left + ((times[index] - t0) / spanMs) * plotWidth;
    const yScale = (price: number) =>
      PAD.top + (1 - (price - lo) / (hi - lo)) * plotHeight;

    const linePath = points
      .map((point, index) => `${index === 0 ? "M" : "L"}${xScale(index).toFixed(2)},${yScale(point.close).toFixed(2)}`)
      .join(" ");

    const areaPath = `${linePath} L${xScale(points.length - 1).toFixed(2)},${(PAD.top + plotHeight).toFixed(2)} L${xScale(0).toFixed(2)},${(PAD.top + plotHeight).toFixed(2)} Z`;

    const bandTop = points
      .map((point, index) => `${index === 0 ? "M" : "L"}${xScale(index).toFixed(2)},${yScale(point.high).toFixed(2)}`)
      .join(" ");
    const bandPath = `${bandTop} ${points
      .map((point, index) => {
        const reverseIndex = points.length - 1 - index;
        return `L${xScale(reverseIndex).toFixed(2)},${yScale(points[reverseIndex].low).toFixed(2)}`;
      })
      .join(" ")} Z`;

    let highIdx = 0;
    let lowIdx = 0;
    for (let i = 1; i < points.length; i++) {
      if (points[i].high > points[highIdx].high) highIdx = i;
      if (points[i].low < points[lowIdx].low) lowIdx = i;
    }

    const tickCount = 5;
    const xTickIndices: number[] = [];
    for (let i = 0; i < tickCount; i++) {
      const idx = Math.round((i * (points.length - 1)) / (tickCount - 1));
      if (!xTickIndices.includes(idx)) xTickIndices.push(idx);
    }

    return {
      times,
      t0,
      spanMs,
      lo,
      hi,
      showTarget,
      plotWidth,
      plotHeight,
      xScale,
      yScale,
      linePath,
      areaPath,
      bandPath,
      highIdx,
      lowIdx,
      xTickIndices,
      yTicks: niceTicks(lo, hi, 4),
    };
  }, [points, containerWidth, item.targetPrice]);

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (!geometry || points.length === 0) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const px = event.clientX - rect.left;
      let nearest = 0;
      let bestDistance = Infinity;
      for (let i = 0; i < points.length; i++) {
        const distance = Math.abs(geometry.xScale(i) - px);
        if (distance < bestDistance) {
          bestDistance = distance;
          nearest = i;
        }
      }
      setHoverIndex(nearest);
    },
    [geometry, points.length],
  );

  const hovered = hoverIndex != null ? points[hoverIndex] : null;
  const currency = item.currency || "USD";

  const currentPrice =
    points.length > 0 ? points[points.length - 1].close : item.lastPrice;
  const change = summary?.changePercent ?? null;
  const changeIsDrop = change != null && change < 0;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
      {/* Range tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h4 className="text-sm font-bold text-gray-900">Price History</h4>
        <div className="flex flex-wrap gap-1">
          {TIME_RANGES.map((range) => (
            <button
              key={range.value}
              type="button"
              onClick={() => setTimeframe(range.value)}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                timeframe === range.value
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary stats */}
      {status === "ready" && summary ? (
        <div className="flex flex-wrap gap-x-6 gap-y-2 mb-4 text-xs">
          <div>
            <p className="text-gray-500 uppercase tracking-wide">Current</p>
            <p className="text-sm font-bold text-gray-900">
              {formatPrice(currentPrice, currency)}
            </p>
          </div>
          <div>
            <p className="text-gray-500 uppercase tracking-wide">High</p>
            <p className="text-sm font-semibold text-red-600">
              {formatPrice(summary.high, currency)}
            </p>
          </div>
          <div>
            <p className="text-gray-500 uppercase tracking-wide">Low</p>
            <p className="text-sm font-semibold text-emerald-600">
              {formatPrice(summary.low, currency)}
            </p>
          </div>
          <div>
            <p className="text-gray-500 uppercase tracking-wide">Average</p>
            <p className="text-sm font-semibold text-gray-700">
              {formatPrice(summary.average, currency)}
            </p>
          </div>
          {change != null ? (
            <div>
              <p className="text-gray-500 uppercase tracking-wide">Change</p>
              <p
                className={`text-sm font-bold ${changeIsDrop ? "text-emerald-600" : "text-red-600"}`}
              >
                {changeIsDrop ? "▼" : "▲"} {Math.abs(change).toFixed(2)}%
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Chart body */}
      {status === "loading" ? (
        <div className="flex items-center justify-center h-[300px] text-sm text-gray-500">
          <span className="w-5 h-5 mr-3 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></span>
          Loading price history...
        </div>
      ) : status === "error" ? (
        <div className="flex items-center justify-center h-[300px] text-sm text-red-600">
          Could not load price history.
        </div>
      ) : status === "empty" ? (
        <div className="flex flex-col items-center justify-center h-[300px] text-center">
          <svg
            className="w-8 h-8 text-gray-300 mb-3"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M3.5 18.49l6-6.01 4 4L22 6.92l-1.41-1.41-7.09 7.97-4-4L2 11.99z" />
          </svg>
          <p className="text-sm font-semibold text-gray-700">
            No price data in this period
          </p>
          <p className="text-xs text-gray-500 mt-1">
            PricePulse checks this item hourly — data will appear as it is
            collected.
          </p>
        </div>
      ) : (
        <div ref={containerRef} className="relative select-none">
          {geometry && containerWidth > 0 ? (
            <>
              <svg
                width={containerWidth}
                height={CHART_HEIGHT}
                role="img"
                aria-label={`Price history chart for ${item.name}`}
                className="block touch-none"
                onPointerMove={handlePointerMove}
                onPointerLeave={() => setHoverIndex(null)}
              >
                <defs>
                  <linearGradient id="pp-area-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity="0.28" />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity="0.02" />
                  </linearGradient>
                </defs>

                {/* Horizontal gridlines + right-side price labels */}
                {geometry.yTicks.map((tick) => {
                  const y = geometry.yScale(tick);
                  return (
                    <g key={tick}>
                      <line
                        x1={PAD.left}
                        x2={PAD.left + geometry.plotWidth}
                        y1={y}
                        y2={y}
                        stroke="#e5e7eb"
                        strokeWidth="1"
                      />
                      <text
                        x={PAD.left + geometry.plotWidth + 8}
                        y={y + 3.5}
                        fontSize="10.5"
                        fill="#9ca3af"
                      >
                        {formatPrice(tick, currency)}
                      </text>
                    </g>
                  );
                })}

                {/* High/Low band */}
                <path d={geometry.bandPath} fill="#6366f1" fillOpacity="0.07" />

                {/* Area fill under the price line */}
                <path d={geometry.areaPath} fill="url(#pp-area-fill)" />

                {/* Target price line */}
                {geometry.showTarget ? (
                  <g>
                    <line
                      x1={PAD.left}
                      x2={PAD.left + geometry.plotWidth}
                      y1={geometry.yScale(item.targetPrice as number)}
                      y2={geometry.yScale(item.targetPrice as number)}
                      stroke="#f59e0b"
                      strokeWidth="1.5"
                      strokeDasharray="5 4"
                    />
                    <text
                      x={PAD.left + 4}
                      y={geometry.yScale(item.targetPrice as number) - 5}
                      fontSize="10"
                      fontWeight="600"
                      fill="#d97706"
                    >
                      Target {formatPrice(item.targetPrice, currency)}
                    </text>
                  </g>
                ) : null}

                {/* Main price line */}
                <path
                  d={geometry.linePath}
                  fill="none"
                  stroke="#6366f1"
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />

                {/* All-time (period) high / low markers */}
                {points.length > 4 ? (
                  <>
                    <circle
                      cx={geometry.xScale(geometry.highIdx)}
                      cy={geometry.yScale(points[geometry.highIdx].high)}
                      r="3"
                      fill="#ef4444"
                    />
                    <circle
                      cx={geometry.xScale(geometry.lowIdx)}
                      cy={geometry.yScale(points[geometry.lowIdx].low)}
                      r="3"
                      fill="#10b981"
                    />
                  </>
                ) : null}

                {/* Crosshair */}
                {hovered && hoverIndex != null ? (
                  <g>
                    <line
                      x1={geometry.xScale(hoverIndex)}
                      x2={geometry.xScale(hoverIndex)}
                      y1={PAD.top}
                      y2={PAD.top + geometry.plotHeight}
                      stroke="#9ca3af"
                      strokeWidth="1"
                      strokeDasharray="3 3"
                    />
                    <circle
                      cx={geometry.xScale(hoverIndex)}
                      cy={geometry.yScale(hovered.close)}
                      r="5"
                      fill="#6366f1"
                      stroke="#ffffff"
                      strokeWidth="2"
                    />
                  </g>
                ) : null}

                {/* X-axis labels */}
                {geometry.xTickIndices.map((idx) => (
                  <text
                    key={idx}
                    x={geometry.xScale(idx)}
                    y={CHART_HEIGHT - 8}
                    fontSize="10.5"
                    fill="#9ca3af"
                    textAnchor={
                      idx === 0
                        ? "start"
                        : idx === points.length - 1
                          ? "end"
                          : "middle"
                    }
                  >
                    {formatTickLabel(new Date(points[idx].timestamp), geometry.spanMs)}
                  </text>
                ))}
              </svg>

              {/* Hover tooltip */}
              {hovered && hoverIndex != null ? (
                <div
                  className="pointer-events-none absolute z-10 rounded-lg border border-gray-200 bg-white/95 shadow-lg px-3 py-2 backdrop-blur-sm"
                  style={{
                    left: Math.min(
                      Math.max(geometry.xScale(hoverIndex) - 70, 0),
                      Math.max(containerWidth - 150, 0),
                    ),
                    top: Math.max(
                      geometry.yScale(hovered.close) - 84,
                      0,
                    ),
                    minWidth: 140,
                  }}
                >
                  <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">
                    {formatFullTimestamp(
                      new Date(hovered.timestamp),
                      geometry.spanMs,
                    )}
                  </p>
                  <p className="text-sm font-bold text-gray-900">
                    {formatPrice(hovered.close, currency)}
                  </p>
                  {hovered.count > 1 ? (
                    <p className="text-[10px] text-gray-500">
                      H {formatPrice(hovered.high, currency)} · L{" "}
                      {formatPrice(hovered.low, currency)}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      )}

      {status === "ready" && summary ? (
        <p className="mt-3 text-[11px] text-gray-400">
          {summary.rawChecksCount} check{summary.rawChecksCount === 1 ? "" : "s"}
          {" · "}
          aggregated {data?.interval ?? "hourly"}
        </p>
      ) : null}
    </div>
  );
}
