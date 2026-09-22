import { CourseStatus } from "~/db/schema";

// ─── Course status badge ───
// The published / draft / archived pill used wherever courses are listed.

const STYLES: Record<CourseStatus, { label: string; className: string }> = {
  [CourseStatus.Published]: {
    label: "Published",
    className:
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  },
  [CourseStatus.Draft]: {
    label: "Draft",
    className:
      "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  },
  [CourseStatus.Archived]: {
    label: "Archived",
    className:
      "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
  },
};

export function CourseStatusBadge({ status }: { status: CourseStatus }) {
  const { label, className } = STYLES[status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}
    >
      {label}
    </span>
  );
}
