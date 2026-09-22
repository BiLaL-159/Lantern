import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TrendBucket, TrendPoint } from "~/services/analyticsService";

// ─── Trend Chart ───
// One series over time, bucketed daily or weekly (see analyticsService).
// Colours come from the theme's chart tokens so the chart reads in both
// light and dark mode. Shared by Course Performance and Platform Health.

const shortDate = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

const longDate = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

function bucketLabel(bucketStart: string, bucket: TrendBucket) {
  const date = longDate.format(new Date(bucketStart));
  return bucket === "week" ? `Week of ${date}` : date;
}

function TrendTooltip({
  active,
  payload,
  bucket,
  formatValue,
}: {
  active?: boolean;
  payload?: { payload: TrendPoint }[];
  bucket: TrendBucket;
  formatValue: (value: number) => string;
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md">
      <p className="font-semibold">{formatValue(point.value)}</p>
      <p className="text-muted-foreground">
        {bucketLabel(point.bucketStart, bucket)}
      </p>
    </div>
  );
}

export function TrendChart({
  data,
  bucket,
  formatValue,
  formatTick = formatValue,
  color = "var(--chart-1)",
  emptyMessage = "No data yet.",
}: {
  data: TrendPoint[];
  bucket: TrendBucket;
  /** Formats a value for the tooltip. */
  formatValue: (value: number) => string;
  /** Formats a value for the Y axis; defaults to formatValue. */
  formatTick?: (value: number) => string;
  /** CSS colour for the series; defaults to the theme's first chart token. */
  color?: string;
  emptyMessage?: string;
}) {
  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  const tickInterval = Math.max(0, Math.ceil(data.length / 6) - 1);

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
        >
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="bucketStart"
            tickFormatter={(value: string) => shortDate.format(new Date(value))}
            interval={tickInterval}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            minTickGap={16}
          />
          <YAxis
            tickFormatter={formatTick}
            allowDecimals={false}
            width={56}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
            content={<TrendTooltip bucket={bucket} formatValue={formatValue} />}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            fill={color}
            fillOpacity={0.1}
            dot={false}
            activeDot={{
              r: 4,
              fill: color,
              stroke: "var(--background)",
              strokeWidth: 2,
            }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
