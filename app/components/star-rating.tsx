import { useState } from "react";
import { useFetcher } from "react-router";
import { Star } from "lucide-react";
import { cn } from "~/lib/utils";

const STAR_VALUES = [1, 2, 3, 4, 5];

/**
 * Renders 5 stars filled to `value` (0–5), supporting fractional fill on the
 * partially-filled star via an absolutely-positioned clipped overlay.
 */
function Stars({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center", className)}>
      {STAR_VALUES.map((star) => {
        const fill = Math.max(0, Math.min(1, value - (star - 1)));
        return (
          <div key={star} className="relative">
            <Star className="size-4 text-muted-foreground/30" />
            {fill > 0 && (
              <div
                className="absolute inset-0 overflow-hidden"
                style={{ width: `${fill * 100}%` }}
              >
                <Star className="size-4 fill-amber-400 text-amber-400" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Read-only average-rating display. Shows muted empty stars and a "No ratings
 * yet" label when there are no ratings (average === null).
 */
export function StarRating({
  average,
  count,
  compact = false,
  className,
}: {
  average: number | null;
  count: number;
  compact?: boolean;
  className?: string;
}) {
  if (average === null || count === 0) {
    if (compact) return null;
    return (
      <div className={cn("flex items-center gap-1.5", className)}>
        <Stars value={0} />
        <span className="text-xs text-muted-foreground">No ratings yet</span>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <Stars value={average} />
      <span className="text-xs text-muted-foreground">
        {average.toFixed(1)}
        {!compact && ` (${count} ${count === 1 ? "rating" : "ratings"})`}
        {compact && ` (${count})`}
      </span>
    </div>
  );
}

/**
 * Interactive star input for enrolled students. Submits to the current route's
 * action via fetcher (intent="rate", rating=N). Highlights on hover and shows
 * an optimistic value while submitting.
 */
export function StarRatingInput({
  currentRating,
  className,
}: {
  currentRating: number | null;
  className?: string;
}) {
  const fetcher = useFetcher();
  const [hovered, setHovered] = useState<number | null>(null);

  const optimistic = fetcher.formData
    ? Number(fetcher.formData.get("rating"))
    : null;
  const active = hovered ?? optimistic ?? currentRating ?? 0;

  return (
    <fetcher.Form
      method="post"
      className={cn("flex items-center gap-1", className)}
      onMouseLeave={() => setHovered(null)}
    >
      <input type="hidden" name="intent" value="rate" />
      {STAR_VALUES.map((star) => (
        <button
          key={star}
          type="submit"
          name="rating"
          value={star}
          aria-label={`Rate ${star} ${star === 1 ? "star" : "stars"}`}
          className="rounded p-0.5 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onMouseEnter={() => setHovered(star)}
          disabled={fetcher.state !== "idle"}
        >
          <Star
            className={cn(
              "size-6 transition-colors",
              star <= active
                ? "fill-amber-400 text-amber-400"
                : "text-muted-foreground/40"
            )}
          />
        </button>
      ))}
    </fetcher.Form>
  );
}
