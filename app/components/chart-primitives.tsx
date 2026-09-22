import type { ReactNode } from "react";

// ─── Chart primitives ───
// Bits shared by the Recharts-based charts so they read as one system:
// axis tick styling and the tooltip shell. Colours come from theme tokens
// so they hold up in light and dark mode.

export const AXIS_TICK = { fill: "var(--muted-foreground)", fontSize: 12 };

export function ChartTooltip({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md">
      {children}
    </div>
  );
}
