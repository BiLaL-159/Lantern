import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a price in cents to a display string.
 * 0 or null/undefined → "Free", otherwise "$X.XX".
 */
export function formatPrice(cents: number | null | undefined): string {
  if (!cents) return "Free";
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Format an amount of money in cents as US dollars with thousands separators.
 * Unlike formatPrice, 0 renders as "$0.00" — used for revenue totals.
 */
export function formatUsd(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

/**
 * Format a whole-number count with thousands separators: 1,284.
 */
export function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

/**
 * Format a count of enrollments with its noun: "1 enrollment", "12
 * enrollments" — for the enrollment Trend's tooltip.
 */
export function formatEnrollments(value: number): string {
  return `${formatCount(value)} ${value === 1 ? "enrollment" : "enrollments"}`;
}

/**
 * Format an average rating to one decimal, or an em dash when there are
 * no ratings (average is null).
 */
export function formatRating(average: number | null): string {
  return average === null ? "—" : average.toFixed(1);
}

/**
 * Format an amount of money in cents as compact US dollars for axis ticks:
 * $0, $175, $1.2K, $4.3M.
 */
export function formatUsdCompact(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  });
}

/**
 * Format an ISO timestamp as a short relative time (e.g. "just now",
 * "5m ago", "3h ago", "2d ago"), falling back to a locale date for
 * anything older than a week.
 */
export function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";

  const seconds = Math.floor((Date.now() - then) / 1000);
  if (seconds < 45) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return new Date(iso).toLocaleDateString();
}

export function formatDuration(
  minutes: number,
  showHours: boolean,
  showSeconds: boolean,
  padZeros: boolean
): string {
  if (minutes <= 0) return padZeros ? "00m" : "0m";

  if (showHours && minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    const hStr = padZeros ? String(h).padStart(2, "0") : String(h);
    const mStr = padZeros ? String(m).padStart(2, "0") : String(m);
    if (showSeconds) {
      return `${hStr}h ${mStr}m 00s`;
    }
    return m > 0 ? `${hStr}h ${mStr}m` : `${hStr}h`;
  }

  const mStr = padZeros ? String(minutes).padStart(2, "0") : String(minutes);
  if (showSeconds) {
    return `${mStr}m 00s`;
  }
  return `${mStr}m`;
}

/**
 * A search string with one param set and the rest of the current ones
 * kept, so a control that owns one param doesn't clear the others — the
 * Window picker and the top-courses sort share a URL.
 */
export function withSearchParam(
  current: URLSearchParams,
  key: string,
  value: string
): string {
  const next = new URLSearchParams(current);
  next.set(key, value);
  return `?${next}`;
}
