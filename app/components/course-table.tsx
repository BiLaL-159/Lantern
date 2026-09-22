import { Link } from "react-router";
import type { CourseSummary } from "~/services/analyticsService";
import { cn, formatCount, formatRating } from "~/lib/utils";
import { CourseStatusBadge } from "~/components/course-status-badge";

// ─── Course table pieces ───
// Cells shared by the tables that list CourseSummary rows (instructor
// rollup, Platform Health) so they read as one system.

export const headerCell =
  "px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground";

export const numberCell = "px-4 py-3 text-right text-sm tabular-nums";

/** Title linking to the course's Course Performance page, with its status. */
export function CourseTitleCell({
  course,
}: {
  course: Pick<CourseSummary, "courseId" | "title" | "status">;
}) {
  return (
    <td className="px-4 py-3">
      <div className="flex items-center gap-2">
        <Link
          to={`/instructor/${course.courseId}/analytics`}
          className="text-sm font-medium hover:text-primary"
        >
          {course.title}
        </Link>
        <CourseStatusBadge status={course.status} />
      </div>
    </td>
  );
}

/** Average rating to one decimal with the rating count, or a dash. */
export function RatingCell({
  average,
  count,
  className,
}: {
  average: number | null;
  count: number;
  className?: string;
}) {
  return (
    <td className={cn(numberCell, className)}>
      {formatRating(average)}
      {count > 0 && (
        <span className="ml-1 text-xs text-muted-foreground">
          ({formatCount(count)})
        </span>
      )}
    </td>
  );
}
