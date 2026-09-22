import { Link } from "react-router";
import { cn } from "~/lib/utils";
import { TREND_WINDOWS, type TrendWindow } from "~/services/analyticsService";

// ─── Window Picker ───
// Chooses the Trend Window (30d / 90d / all-time). The choice lives in the
// URL's `window` search param so it survives reloads; tiles ignore it.

const LABELS: Record<TrendWindow, string> = {
  "30d": "30 days",
  "90d": "90 days",
  all: "All time",
};

/** Reads the Window from a URL, falling back to all-time. */
export function parseTrendWindow(url: URL): TrendWindow {
  const value = url.searchParams.get("window");
  return TREND_WINDOWS.find((w) => w === value) ?? "all";
}

export function WindowPicker({ value }: { value: TrendWindow }) {
  return (
    <div
      role="group"
      aria-label="Trend window"
      className="inline-flex h-9 items-center rounded-lg bg-muted p-1 text-muted-foreground"
    >
      {TREND_WINDOWS.map((trendWindow) => (
        <Link
          key={trendWindow}
          to={{ search: `?window=${trendWindow}` }}
          replace
          preventScrollReset
          aria-current={trendWindow === value ? "true" : undefined}
          className={cn(
            "rounded-md px-2.5 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] hover:text-foreground",
            trendWindow === value && "bg-background text-foreground shadow-sm"
          )}
        >
          {LABELS[trendWindow]}
        </Link>
      ))}
    </div>
  );
}
