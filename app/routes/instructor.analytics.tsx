import { Link, data, isRouteErrorResponse } from "react-router";
import type { Route } from "./+types/instructor.analytics";
import { getCurrentUserId } from "~/lib/session";
import { getUserById } from "~/services/userService";
import { getInstructorRollup } from "~/services/analyticsService";
import { CourseStatus, UserRole } from "~/db/schema";
import { formatCount, formatUsd } from "~/lib/utils";
import { Card, CardContent } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { SnapshotTile } from "~/components/snapshot-tile";
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  DollarSign,
  Star,
  Users,
} from "lucide-react";

export function meta() {
  return [
    { title: "Analytics — Cadence" },
    { name: "description", content: "Course Performance across your courses" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    throw data("Select a user from the DevUI panel to view analytics.", {
      status: 401,
    });
  }

  const user = getUserById(currentUserId);

  if (!user || user.role !== UserRole.Instructor) {
    throw data("Only instructors can access this page.", { status: 403 });
  }

  return getInstructorRollup(user.id);
}

function statusBadge(status: CourseStatus) {
  switch (status) {
    case CourseStatus.Published:
      return (
        <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-400">
          Published
        </span>
      );
    case CourseStatus.Draft:
      return (
        <span className="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
          Draft
        </span>
      );
    case CourseStatus.Archived:
      return (
        <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800 dark:bg-gray-900/30 dark:text-gray-400">
          Archived
        </span>
      );
  }
}

function formatRating(average: number | null) {
  return average === null ? "—" : average.toFixed(1);
}

const TH =
  "px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground";

export default function InstructorAnalytics({
  loaderData,
}: Route.ComponentProps) {
  const { totals, courses } = loaderData;

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link to="/instructor" className="hover:text-foreground">
          My Courses
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">Analytics</span>
      </nav>

      <div className="mb-8">
        <h1 className="text-3xl font-bold">Analytics</h1>
        <p className="mt-1 text-muted-foreground">
          All-time performance across your courses
        </p>
      </div>

      {courses.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <BarChart3 className="mx-auto mb-3 size-8 text-muted-foreground/50" />
            <p className="text-muted-foreground">
              No courses yet. Numbers will appear here once you create a
              course and students start joining.
            </p>
            <Link to="/instructor/new" className="mt-4 inline-block">
              <Button>Create Course</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          <section>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <SnapshotTile
                icon={DollarSign}
                label="Revenue"
                value={formatUsd(totals.revenue)}
                detail="After PPP discounts"
              />
              <SnapshotTile
                icon={Users}
                label="Students"
                value={formatCount(totals.enrollments)}
                detail="Enrollments across all courses"
              />
              <SnapshotTile
                icon={BookOpen}
                label="Active courses"
                value={formatCount(totals.activeCourses)}
                detail={`${formatCount(courses.length)} total`}
              />
              <SnapshotTile
                icon={Star}
                label="Average rating"
                value={formatRating(totals.averageRating)}
                detail={
                  totals.ratingCount === 0
                    ? "No ratings yet"
                    : `${formatCount(totals.ratingCount)} ${totals.ratingCount === 1 ? "rating" : "ratings"}`
                }
              />
            </div>
          </section>

          <section className="mt-10">
            <div className="mb-4">
              <h2 className="text-xl font-semibold">Courses</h2>
              <p className="text-sm text-muted-foreground">
                Highest revenue first. Open a course for its full Course
                Performance.
              </p>
            </div>
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th className={`${TH} text-left`}>Course</th>
                        <th className={`${TH} text-right`}>Revenue</th>
                        <th className={`${TH} text-right`}>Enrollments</th>
                        <th className={`${TH} text-right`}>Completion</th>
                        <th className={`${TH} text-right`}>Rating</th>
                      </tr>
                    </thead>
                    <tbody>
                      {courses.map((course) => (
                        <tr
                          key={course.courseId}
                          className="border-b border-border last:border-0"
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <Link
                                to={`/instructor/${course.courseId}/analytics`}
                                className="text-sm font-medium hover:text-primary"
                              >
                                {course.title}
                              </Link>
                              {statusBadge(course.status)}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right text-sm tabular-nums">
                            {formatUsd(course.revenue)}
                          </td>
                          <td className="px-4 py-3 text-right text-sm tabular-nums">
                            {formatCount(course.enrollments)}
                          </td>
                          <td className="px-4 py-3 text-right text-sm tabular-nums">
                            {course.completionRate}%
                          </td>
                          <td className="px-4 py-3 text-right text-sm tabular-nums">
                            {formatRating(course.averageRating)}
                            {course.ratingCount > 0 && (
                              <span className="ml-1 text-xs text-muted-foreground">
                                ({formatCount(course.ratingCount)})
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something went wrong";
  let message = "An unexpected error occurred while loading analytics.";

  if (isRouteErrorResponse(error)) {
    if (error.status === 401) {
      title = "Sign in required";
      message =
        typeof error.data === "string"
          ? error.data
          : "Please select a user from the DevUI panel.";
    } else if (error.status === 403) {
      title = "Access denied";
      message =
        typeof error.data === "string"
          ? error.data
          : "You don't have permission to access this page.";
    } else {
      title = `Error ${error.status}`;
      message = typeof error.data === "string" ? error.data : error.statusText;
    }
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="text-center">
        <AlertTriangle className="mx-auto mb-4 size-12 text-muted-foreground" />
        <h1 className="mb-2 text-2xl font-bold">{title}</h1>
        <p className="mb-6 text-muted-foreground">{message}</p>
        <div className="flex items-center justify-center gap-3">
          <Link to="/courses">
            <Button variant="outline">Browse Courses</Button>
          </Link>
          <Link to="/">
            <Button>Go Home</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
