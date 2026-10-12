"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ComposedChart,
  XAxis,
  YAxis,
  Tooltip,
  Bar,
  ResponsiveContainer,
} from "recharts";

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
  range: number;
  lowOffset: number;
  label: string;
}

interface CandlestickChartProps {
  data: OHLCV[];
  title?: string;
  description?: string;
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

  const scale = height / (high - low);
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
  const date = new Date(row.date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="rounded-md border bg-background p-3 shadow-sm">
      <p className="mb-1 text-sm font-medium text-foreground">{date}</p>
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
  const minLow = Math.min(...data.map((d) => d.low));

  const chartData: ChartRow[] = data.map((d) => ({
    ...d,
    range: d.high - d.low,
    lowOffset: d.low - minLow,
    label: new Date(d.date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
  }));

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[400px] w-full">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
            <ComposedChart
              data={chartData}
              margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
            >
              <XAxis
                dataKey="label"
                tick={{ fontSize: 12 }}
                interval="preserveStartEnd"
                minTickGap={30}
              />
              <YAxis
                domain={["auto", "auto"]}
                tick={{ fontSize: 12 }}
                tickFormatter={(value: number) => `$${value.toFixed(2)}`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="lowOffset" stackId="a" fill="transparent" />
              <Bar dataKey="range" stackId="a" shape={CandlestickShape} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
