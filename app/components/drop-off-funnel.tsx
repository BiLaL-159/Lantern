import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DropOffStep } from "~/services/analyticsService";
import { AXIS_TICK, ChartTooltip } from "./chart-primitives";
import { formatCount } from "~/lib/utils";

// ─── Drop-off Funnel ───
// One horizontal bar per lesson in course order, showing the share of
// enrolled students who completed it. Colours come from the theme's chart
// tokens so it reads in both light and dark mode.

const ROW_HEIGHT = 32;

function FunnelTooltip({
  active,
  payload,
  enrolled,
}: {
  active?: boolean;
  payload?: { payload: DropOffStep }[];
  enrolled: number;
}) {
  const step = payload?.[0]?.payload;
  if (!active || !step) return null;
  return (
    <ChartTooltip>
      <p className="font-semibold">
        {step.percent}%{" "}
        <span className="font-normal text-muted-foreground">
          · {formatCount(step.completed)} of {formatCount(enrolled)} enrolled
        </span>
      </p>
      <p className="text-muted-foreground">
        {step.moduleTitle} · {step.title}
      </p>
    </ChartTooltip>
  );
}

export function DropOffFunnel({
  steps,
  enrolled,
}: {
  steps: DropOffStep[];
  /** Denominator for every bar: all enrolled students. */
  enrolled: number;
}) {
  if (steps.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        No lessons yet.
      </div>
    );
  }

  return (
    <div className="w-full" style={{ height: steps.length * ROW_HEIGHT + 40 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={steps}
          layout="vertical"
          margin={{ top: 0, right: 40, bottom: 0, left: 0 }}
          barSize={20}
        >
          <CartesianGrid stroke="var(--border)" horizontal={false} />
          <XAxis
            type="number"
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tickFormatter={(v: number) => `${v}%`}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
          />
          <YAxis
            type="category"
            dataKey="title"
            width={160}
            interval={0}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)" }}
            content={<FunnelTooltip enrolled={enrolled} />}
          />
          <Bar
            dataKey="percent"
            fill="var(--chart-1)"
            radius={[0, 4, 4, 0]}
            isAnimationActive={false}
            label={{
              position: "right",
              fill: "var(--muted-foreground)",
              fontSize: 12,
              formatter: (v) => `${v}%`,
            }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
