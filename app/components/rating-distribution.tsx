import { Star } from "lucide-react";
import type { RatingBucket } from "~/services/analyticsService";
import { formatCount } from "~/lib/utils";

// ─── Rating distribution ───
// One row per star, highest first, with a bar sized by that star's share
// of all ratings (computed by the service). Shows polarisation the
// average alone hides.

export function RatingDistribution({
  distribution,
}: {
  distribution: RatingBucket[];
}) {
  if (distribution.every((b) => b.count === 0)) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        No ratings yet.
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {distribution.map(({ rating, count, percent }) => (
        <li key={rating} className="flex items-center gap-3 text-sm">
          <span className="flex w-8 shrink-0 items-center gap-1 text-muted-foreground">
            {rating}
            <Star className="size-3 fill-amber-400 text-amber-400" />
          </span>
          <div
            className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted"
            role="meter"
            aria-label={`${rating} star ratings`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
          >
            <div
              className="h-full rounded-full bg-amber-400"
              style={{ width: `${percent}%` }}
            />
          </div>
          <span className="w-20 shrink-0 text-right text-muted-foreground tabular-nums">
            {formatCount(count)} · {percent}%
          </span>
        </li>
      ))}
    </ul>
  );
}
