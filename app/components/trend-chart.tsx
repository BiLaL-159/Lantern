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
import { AXIS_TICK, ChartTooltip } from "./chart-primitives";

// ─── Trend Chart ───
// One or more series over time, bucketed daily or weekly (see
// analyticsService). Series share a bucket grid, so a chart can stack
// several of them — new users by role on Platform Health, a lone revenue
// series on Course Performance. Colours come from the theme's chart tokens
// so the chart reads in both light and dark mode.

export type TrendSeries = {
  /** Distinguishes the series within the chart. */
  key: string;
  label: string;
  /** CSS colour, usually one of the theme's chart tokens. */
  color: string;
  points: TrendPoint[];
};

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

type ChartRow = { bucketStart: string } & Record<string, number | string>;

// One row per bucket, each series' value under its own key. Series share a
// grid, but merging on bucketStart rather than position keeps the chart
// honest if one of them is ever shorter.
function toRows(series: TrendSeries[]): ChartRow[] {
  const rows = new Map<string, ChartRow>();
  for (const { key, points } of series) {
    for (const point of points) {
      const row = rows.get(point.bucketStart) ?? {
        bucketStart: point.bucketStart,
      };
      row[key] = point.value;
      rows.set(point.bucketStart, row);
    }
  }
  // ISO timestamps sort lexicographically in time order.
  return [...rows.values()].sort((a, b) =>
    a.bucketStart.localeCompare(b.bucketStart)
  );
}

function TrendTooltip({
  active,
  payload,
  series,
  bucket,
  formatValue,
}: {
  active?: boolean;
  payload?: { payload: ChartRow }[];
  series: TrendSeries[];
  bucket: TrendBucket;
  formatValue: (value: number) => string;
}) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <ChartTooltip>
      {series.length === 1 ? (
        <p className="font-semibold">
          {formatValue(Number(row[series[0].key] ?? 0))}
        </p>
      ) : (
        <ul className="mb-1 space-y-0.5">
          {series.map((s) => (
            <li key={s.key} className="flex items-center gap-2">
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: s.color }}
                aria-hidden
              />
              <span className="text-muted-foreground">{s.label}</span>
              <span className="ml-auto font-semibold">
                {formatValue(Number(row[s.key] ?? 0))}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-muted-foreground">
        {bucketLabel(row.bucketStart, bucket)}
      </p>
    </ChartTooltip>
  );
}

function Legend({ series }: { series: TrendSeries[] }) {
  return (
    <ul className="mb-2 flex flex-wrap gap-4 text-sm text-muted-foreground">
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span
            className="size-2.5 rounded-full"
            style={{ backgroundColor: s.color }}
            aria-hidden
          />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

export function TrendChart({
  series,
  bucket,
  formatValue,
  formatTick = formatValue,
  emptyMessage,
}: {
  series: TrendSeries[];
  bucket: TrendBucket;
  /** Formats a value for the tooltip. */
  formatValue: (value: number) => string;
  /** Formats a value for the Y axis; defaults to formatValue. */
  formatTick?: (value: number) => string;
  /** Shown instead of the chart when no series has any buckets. */
  emptyMessage: string;
}) {
  const rows = toRows(series);

  if (rows.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  const tickInterval = Math.max(0, Math.ceil(rows.length / 6) - 1);

  return (
    <div className="w-full">
      {series.length > 1 && <Legend series={series} />}
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={rows}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          >
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="bucketStart"
              tickFormatter={(value: string) =>
                shortDate.format(new Date(value))
              }
              interval={tickInterval}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              minTickGap={16}
            />
            <YAxis
              tickFormatter={formatTick}
              allowDecimals={false}
              width={56}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
              content={
                <TrendTooltip
                  series={series}
                  bucket={bucket}
                  formatValue={formatValue}
                />
              }
            />
            {series.map((s) => (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                strokeWidth={2}
                fill={s.color}
                fillOpacity={0.1}
                dot={false}
                activeDot={{
                  r: 4,
                  fill: s.color,
                  stroke: "var(--background)",
                  strokeWidth: 2,
                }}
                isAnimationActive={false}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
