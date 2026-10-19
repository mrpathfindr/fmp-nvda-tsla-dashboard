"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  CartesianGrid,
  ComposedChart,
  XAxis,
  YAxis,
  Tooltip,
  Bar,
  ResponsiveContainer,
} from "recharts";

/*
 * Chart chrome colours for the dark-grey card surface.
 * Recharts defaults its axis text/lines to #666, which is unreadable on a dark
 * background, so these are set explicitly. The tick colour reads at ~10:1
 * against the card background.
 */
const AXIS_TEXT_COLOR = "#d4d4d4";
const AXIS_LINE_COLOR = "rgba(255, 255, 255, 0.35)";
const GRID_LINE_COLOR = "rgba(255, 255, 255, 0.08)";
const CURSOR_FILL = "rgba(255, 255, 255, 0.06)";

/*
 * Layout constants. The Y axis width and horizontal margins are fixed so the
 * pan/zoom handlers can convert between screen pixels and candle indices.
 */
const Y_AXIS_WIDTH = 72;
const CHART_MARGIN = { top: 10, right: 20, left: 0, bottom: 0 };

/* Interaction tuning */
const MIN_VISIBLE_CANDLES = 5;
const WHEEL_ZOOM_SENSITIVITY = 0.0015; // zoom factor = e^(deltaY * sensitivity)
const KEYBOARD_ZOOM_FACTOR = 0.8;
const KEYBOARD_PAN_FRACTION = 0.1;
const Y_TICK_TARGET = 6;

interface OHLCV {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adjclose: number;
  volume: number;
}

interface ChartRow extends OHLCV {
  /** high - low: the height of the candle (wick to wick). */
  range: number;
  /** low - yAxisBase: transparent spacer bar that lifts the candle off 0. */
  lowOffset: number;
  label: string;
}

interface CandlestickChartProps {
  data: OHLCV[];
  title?: string;
  description?: string;
}

/** The window of candles currently on screen. Fractional for smooth panning. */
interface ViewRange {
  start: number;
  count: number;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

/**
 * Keeps a view range inside the dataset and above the minimum zoom level.
 */
function normaliseView(view: ViewRange, total: number): ViewRange {
  const count = clamp(view.count, Math.min(MIN_VISIBLE_CANDLES, total), total);
  const start = clamp(view.start, 0, total - count);
  return { start, count };
}

/**
 * Picks a "nice" tick step (1, 2, 5 × 10^n) so roughly `target` ticks span the
 * given price range.
 */
function niceStep(span: number, target: number) {
  if (span <= 0) return 1;
  const rough = span / target;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const residual = rough / magnitude;
  const factor = residual >= 5 ? 10 : residual >= 2 ? 5 : residual >= 1 ? 2 : 1;
  return factor * magnitude;
}

function formatDate(date: string, opts: Intl.DateTimeFormatOptions) {
  return new Date(date).toLocaleDateString("en-US", opts);
}

function CandlestickShape(props: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: ChartRow;
}) {
  const { x = 0, y = 0, width = 0, height = 0, payload } = props;
  if (!payload) return null;

  const { open, high, low, close } = payload;

  const isBullish = close >= open;
  const color = isBullish ? "#22c55e" : "#ef4444";

  const scale = high > low ? height / (high - low) : 0;
  const priceToY = (price: number) => y + (high - price) * scale;

  const bodyTop = Math.max(open, close);
  const bodyBottom = Math.min(open, close);
  const bodyY = priceToY(bodyTop);
  const bodyHeight = Math.max((bodyTop - bodyBottom) * scale, 1);
  const wickX = x + width / 2;

  return (
    <g>
      <line
        x1={wickX}
        y1={priceToY(high)}
        x2={wickX}
        y2={priceToY(low)}
        stroke={color}
        strokeWidth={1}
      />
      <rect
        x={x + 1}
        y={bodyY}
        width={Math.max(width - 2, 1)}
        height={bodyHeight}
        fill={color}
        stroke={color}
      />
    </g>
  );
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: ChartRow }[];
}) {
  if (!active || !payload || payload.length === 0) return null;

  const row = payload[0].payload;
  const date = formatDate(row.date, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="rounded-md border border-border bg-popover p-3 text-popover-foreground shadow-md">
      <p className="mb-1 text-sm font-semibold">{date}</p>
      <div className="space-y-0.5 text-xs text-muted-foreground">
        <p>Open: {row.open.toFixed(2)}</p>
        <p>High: {row.high.toFixed(2)}</p>
        <p>Low: {row.low.toFixed(2)}</p>
        <p>Close: {row.close.toFixed(2)}</p>
        <p>Volume: {row.volume.toLocaleString()}</p>
      </div>
    </div>
  );
}

export default function CandlestickChart({
  data,
  title = "NVDA Daily Candlestick Chart",
  description = "Daily OHLCV data for NVIDIA (2024)",
}: CandlestickChartProps) {
  const total = data.length;

  /* ------------------------------------------------------------------ */
  /* Viewport state                                                      */
  /* ------------------------------------------------------------------ */
  // Mount with the whole year visible. (If the dataset prop is swapped at
  // runtime, give the component a `key` so it remounts with a fresh view.)
  const [view, setView] = useState<ViewRange>({ start: 0, count: total });
  const [isDragging, setIsDragging] = useState(false);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    originX: number;
    originStart: number;
  } | null>(null);

  const updateView = useCallback(
    (updater: (current: ViewRange) => ViewRange) => {
      setView((current) => normaliseView(updater(current), total));
    },
    [total],
  );

  const resetView = useCallback(() => {
    setView({ start: 0, count: total });
  }, [total]);

  /** Width in CSS pixels of the area the candles are drawn in. */
  const getPlotWidth = useCallback(() => {
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (!rect) return 1;
    return Math.max(
      rect.width - Y_AXIS_WIDTH - CHART_MARGIN.left - CHART_MARGIN.right,
      1,
    );
  }, []);

  /* ------------------------------------------------------------------ */
  /* Zoom (mouse wheel / trackpad)                                       */
  /* ------------------------------------------------------------------ */
  // React registers `wheel` as a passive listener, which means
  // `preventDefault()` would be ignored and the page would scroll as well as
  // the chart zooming. Attach a native, non-passive listener instead.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();

      // Normalise "line" and "page" scroll units to pixels.
      let delta = event.deltaY;
      if (event.deltaMode === 1) delta *= 20;
      else if (event.deltaMode === 2) delta *= 400;
      delta = clamp(delta, -300, 300);

      // Scroll forward (deltaY < 0) zooms in; scroll back zooms out.
      const factor = Math.exp(delta * WHEEL_ZOOM_SENSITIVITY);

      // Zoom about the candle under the cursor so it stays put.
      const rect = el.getBoundingClientRect();
      const plotWidth = getPlotWidth();
      const fraction = clamp(
        (event.clientX - rect.left - Y_AXIS_WIDTH - CHART_MARGIN.left) /
          plotWidth,
        0,
        1,
      );

      setView((current) => {
        const anchorIndex = current.start + fraction * current.count;
        const nextCount = clamp(
          current.count * factor,
          Math.min(MIN_VISIBLE_CANDLES, total),
          total,
        );
        const nextStart = anchorIndex - fraction * nextCount;
        return normaliseView({ start: nextStart, count: nextCount }, total);
      });
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [getPlotWidth, total]);

  /* ------------------------------------------------------------------ */
  /* Pan (click + drag, also works with touch via pointer events)         */
  /* ------------------------------------------------------------------ */
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    // Primary button / single touch only.
    if (event.button !== 0) return;
    dragRef.current = {
      pointerId: event.pointerId,
      originX: event.clientX,
      originStart: view.start,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDragging(true);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const dx = event.clientX - drag.originX;
    const plotWidth = getPlotWidth();

    updateView((current) => {
      const candlesPerPixel = current.count / plotWidth;
      // Dragging right reveals earlier candles, so the start index decreases.
      return { ...current, start: drag.originStart - dx * candlesPerPixel };
    });
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setIsDragging(false);
  };

  /* ------------------------------------------------------------------ */
  /* Keyboard (accessibility parity with mouse controls)                 */
  /* ------------------------------------------------------------------ */
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const panStep = (v: ViewRange) =>
      Math.max(v.count * KEYBOARD_PAN_FRACTION, 1);

    switch (event.key) {
      case "ArrowLeft":
        updateView((v) => ({ ...v, start: v.start - panStep(v) }));
        break;
      case "ArrowRight":
        updateView((v) => ({ ...v, start: v.start + panStep(v) }));
        break;
      case "+":
      case "=":
      case "ArrowUp":
        updateView((v) => {
          const nextCount = v.count * KEYBOARD_ZOOM_FACTOR;
          const centre = v.start + v.count / 2;
          return { start: centre - nextCount / 2, count: nextCount };
        });
        break;
      case "-":
      case "_":
      case "ArrowDown":
        updateView((v) => {
          const nextCount = v.count / KEYBOARD_ZOOM_FACTOR;
          const centre = v.start + v.count / 2;
          return { start: centre - nextCount / 2, count: nextCount };
        });
        break;
      case "Home":
      case "0":
        resetView();
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  /* ------------------------------------------------------------------ */
  /* Derived data for the visible window                                 */
  /* ------------------------------------------------------------------ */
  const {
    chartData,
    yDomainTop,
    yTicks,
    yBase,
    firstVisible,
    lastVisible,
    visibleCount,
  } = useMemo(() => {
    const startIdx = clamp(Math.round(view.start), 0, Math.max(total - 1, 0));
    const endIdx = clamp(Math.round(view.start + view.count), startIdx + 1, total);
    const slice = data.slice(startIdx, endIdx);

    if (slice.length === 0) {
      return {
        chartData: [] as ChartRow[],
        yDomainTop: 1,
        yTicks: [0, 1],
        yBase: 0,
        firstVisible: undefined,
        lastVisible: undefined,
        visibleCount: 0,
      };
    }

    // Fit the Y axis to the visible candles, snapped to round-number ticks.
    const visibleLow = Math.min(...slice.map((d) => d.low));
    const visibleHigh = Math.max(...slice.map((d) => d.high));
    const step = niceStep(visibleHigh - visibleLow, Y_TICK_TARGET);
    const base = Math.floor(visibleLow / step) * step;
    const top = Math.ceil(visibleHigh / step) * step;
    const domainTop = Math.max(top - base, step);

    // Build ticks by index rather than accumulating floats so the last tick
    // is never lost to rounding error.
    const tickCount = Math.round(domainTop / step);
    const ticks = Array.from({ length: tickCount + 1 }, (_, i) => i * step);

    const rows: ChartRow[] = slice.map((d) => ({
      ...d,
      range: d.high - d.low,
      lowOffset: d.low - base,
      label: formatDate(d.date, { month: "short", day: "numeric" }),
    }));

    return {
      chartData: rows,
      yDomainTop: domainTop,
      yTicks: ticks,
      yBase: base,
      firstVisible: slice[0],
      lastVisible: slice[slice.length - 1],
      visibleCount: slice.length,
    };
  }, [data, view, total]);

  const isZoomed = visibleCount < total || Math.round(view.start) !== 0;

  const rangeLabel =
    firstVisible && lastVisible
      ? `${formatDate(firstVisible.date, { month: "short", day: "numeric" })} – ${formatDate(
          lastVisible.date,
          { month: "short", day: "numeric", year: "numeric" },
        )}`
      : "";

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
        <CardAction>
          <Button
            variant="outline"
            size="sm"
            onClick={resetView}
            disabled={!isZoomed}
            aria-label="Reset chart zoom and position"
          >
            Reset view
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-2">
        <div
          ref={wrapperRef}
          role="application"
          tabIndex={0}
          aria-label={`${title}. Drag to pan, scroll to zoom. Use arrow keys to pan and zoom, Home to reset. Showing ${rangeLabel}.`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onDoubleClick={resetView}
          onKeyDown={onKeyDown}
          className={`h-[400px] w-full select-none rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/60 ${
            isDragging ? "cursor-grabbing" : "cursor-grab"
          }`}
          // Let vertical touch scrolling through to the page; we handle
          // horizontal drags ourselves.
          style={{ touchAction: "pan-y pinch-zoom" }}
        >
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
            <ComposedChart data={chartData} margin={CHART_MARGIN}>
              <CartesianGrid stroke={GRID_LINE_COLOR} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 12, fill: AXIS_TEXT_COLOR }}
                axisLine={{ stroke: AXIS_LINE_COLOR }}
                tickLine={{ stroke: AXIS_LINE_COLOR }}
                interval="preserveStartEnd"
                minTickGap={30}
              />
              <YAxis
                width={Y_AXIS_WIDTH}
                domain={[0, yDomainTop]}
                ticks={yTicks}
                tick={{ fontSize: 12, fill: AXIS_TEXT_COLOR }}
                axisLine={{ stroke: AXIS_LINE_COLOR }}
                tickLine={{ stroke: AXIS_LINE_COLOR }}
                // Bars are stacked on a transparent spacer measured from
                // `yBase`, so add it back to show the real price.
                tickFormatter={(value: number) =>
                  `$${(value + yBase).toFixed(2)}`
                }
              />
              <Tooltip
                content={<CustomTooltip />}
                cursor={{ fill: CURSOR_FILL }}
              />
              <Bar
                dataKey="lowOffset"
                stackId="a"
                fill="transparent"
                isAnimationActive={false}
              />
              <Bar
                dataKey="range"
                stackId="a"
                shape={CandlestickShape}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <p
          className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground"
          aria-live="polite"
        >
          <span>
            Showing <span className="font-medium text-foreground">{rangeLabel}</span>{" "}
            ({visibleCount} of {total} sessions)
          </span>
          <span>Drag to pan · Scroll to zoom · Double-click to reset</span>
        </p>
      </CardContent>
    </Card>
  );
}
