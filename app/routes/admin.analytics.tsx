import {
  Link,
  data,
  isRouteErrorResponse,
  useSearchParams,
} from "react-router";
import type { Route } from "./+types/admin.analytics";
import { getCurrentUserId } from "~/lib/session";
import { getUserById } from "~/services/userService";
import {
  COURSE_SORTS,
  getInstructorSummaries,
  getPlatformTotals,
  getPlatformTrends,
  getTopCourses,
  trendBucketFor,
  type CourseSort,
} from "~/services/analyticsService";
import { UserRole } from "~/db/schema";
import {
  cn,
  formatCount,
  formatEnrollments,
  formatUsd,
  formatUsdCompact,
  withSearchParam,
} from "~/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { SnapshotTile } from "~/components/snapshot-tile";
import {
  TrendChart,
  enrollmentSeries,
  revenueSeries,
  type TrendSeries,
} from "~/components/trend-chart";
import { WindowPicker, parseTrendWindow } from "~/components/window-picker";
import {
  CourseTitleCell,
  RatingCell,
  headerCell,
  numberCell,
} from "~/components/course-table";
import {
  AlertTriangle,
  ArrowDown,
  BookOpen,
  DollarSign,
  GraduationCap,
  Users,
} from "lucide-react";

export function meta() {
  return [
    { title: "Platform Health — Lantern" },
    { name: "description", content: "Platform-wide analytics" },
  ];
}

/** Reads the top-courses sort from a URL, falling back to revenue. */
function parseCourseSort(url: URL): CourseSort {
  const value = url.searchParams.get("sort");
  return COURSE_SORTS.find((s) => s === value) ?? "revenue";
}

export async function loader({ request }: Route.LoaderArgs) {
  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    throw data("Select a user from the DevUI panel to view Platform Health.", {
      status: 401,
    });
  }

  const user = getUserById(currentUserId);

  if (!user || user.role !== UserRole.Admin) {
    throw data("Only admins can access this page.", { status: 403 });
  }

  const url = new URL(request.url);
  const sort = parseCourseSort(url);
  const trendWindow = parseTrendWindow(url);
  const now = new Date();

  return {
    totals: getPlatformTotals(),
    sort,
    courses: getTopCourses(sort),
    instructors: getInstructorSummaries(),
    trends: {
      window: trendWindow,
      bucket: trendBucketFor(trendWindow),
      ...getPlatformTrends(trendWindow, now),
    },
  };
}

// How each role's signups are drawn on the new-users Trend.
const ROLE_SERIES: Record<UserRole, { label: string; color: string }> = {
  [UserRole.Student]: { label: "Students", color: "var(--chart-1)" },
  [UserRole.Instructor]: { label: "Instructors", color: "var(--chart-2)" },
  [UserRole.Admin]: { label: "Admins", color: "var(--chart-3)" },
};

// A right-aligned column header that sorts the table by its key.
function SortHeader({
  sortKey,
  current,
  children,
}: {
  sortKey: CourseSort;
  current: CourseSort;
  children: string;
}) {
  const active = sortKey === current;
  // Keep the Window when re-sorting; the two are independent.
  const [searchParams] = useSearchParams();

  return (
    <th
      className={cn(headerCell, "text-right")}
      aria-sort={active ? "descending" : undefined}
    >
      <Link
        to={{ search: withSearchParam(searchParams, "sort", sortKey) }}
        replace
        preventScrollReset
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground",
          active && "text-foreground"
        )}
      >
        {children}
        <ArrowDown
          className={cn("size-3", active ? "opacity-100" : "opacity-0")}
          aria-hidden
        />
      </Link>
    </th>
  );
}

export default function AdminAnalytics({ loaderData }: Route.ComponentProps) {
  const { totals, sort, courses, instructors, trends } = loaderData;

  const newUsers: TrendSeries[] = trends.newUsers.map(({ role, points }) => ({
    key: role,
    label: ROLE_SERIES[role].label,
    color: ROLE_SERIES[role].color,
    points,
  }));

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link to="/" className="hover:text-foreground">
          Home
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">Platform Health</span>
      </nav>

      <div className="mb-8">
        <h1 className="text-3xl font-bold">Platform Health</h1>
        <p className="mt-1 text-muted-foreground">
          All-time snapshot across the whole platform
        </p>
      </div>

      <section>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SnapshotTile
            icon={DollarSign}
            label="Revenue"
            value={formatUsd(totals.revenue)}
            detail="After PPP discounts, archived courses included"
          />
          <SnapshotTile
            icon={Users}
            label="Users"
            value={formatCount(totals.users)}
            detail="Students, instructors and admins"
          />
          <SnapshotTile
            icon={GraduationCap}
            label="Enrollments"
            value={formatCount(totals.enrollments)}
            detail="Across all courses"
          />
          <SnapshotTile
            icon={BookOpen}
            label="Active courses"
            value={formatCount(totals.activeCourses)}
            detail={`${formatCount(totals.courses)} total including draft and archived`}
          />
        </div>
      </section>

      {/* Trends — the Window scopes only this section */}
      <section className="mt-10">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">Trends</h2>
            <p className="text-sm text-muted-foreground">
              {trends.bucket === "day" ? "Daily" : "Weekly"} totals across the
              platform
            </p>
          </div>
          <WindowPicker value={trends.window} />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>New users</CardTitle>
              <CardDescription>Signups by role</CardDescription>
            </CardHeader>
            <CardContent>
              <TrendChart
                series={newUsers}
                bucket={trends.bucket}
                formatValue={formatCount}
                emptyMessage="No signups yet."
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Revenue</CardTitle>
              <CardDescription>Paid price per purchase</CardDescription>
            </CardHeader>
            <CardContent>
              <TrendChart
                series={[revenueSeries(trends.revenue)]}
                bucket={trends.bucket}
                formatValue={formatUsd}
                formatTick={formatUsdCompact}
                emptyMessage="No purchases yet."
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Enrollments</CardTitle>
              <CardDescription>New enrollments on any course</CardDescription>
            </CardHeader>
            <CardContent>
              <TrendChart
                series={[enrollmentSeries(trends.enrollments)]}
                bucket={trends.bucket}
                formatValue={formatEnrollments}
                formatTick={formatCount}
                emptyMessage="No enrollments yet."
              />
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="mt-10">
        <div className="mb-4">
          <h2 className="text-xl font-semibold">Top courses</h2>
          <p className="text-sm text-muted-foreground">
            Every course on the platform. Sort by a column heading; open a
            course for its Course Performance.
          </p>
        </div>
        {courses.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <BookOpen className="mx-auto mb-3 size-8 text-muted-foreground/50" />
              <p className="text-muted-foreground">No courses yet.</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className={cn(headerCell, "text-left")}>Course</th>
                      <th className={cn(headerCell, "text-left")}>
                        Instructor
                      </th>
                      <SortHeader sortKey="revenue" current={sort}>
                        Revenue
                      </SortHeader>
                      <SortHeader sortKey="enrollments" current={sort}>
                        Enrollments
                      </SortHeader>
                      <SortHeader sortKey="rating" current={sort}>
                        Rating
                      </SortHeader>
                    </tr>
                  </thead>
                  <tbody>
                    {courses.map((course) => (
                      <tr
                        key={course.courseId}
                        className="border-b border-border last:border-0"
                      >
                        <CourseTitleCell course={course} />
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {course.instructorName}
                        </td>
                        <td className={numberCell}>
                          {formatUsd(course.revenue)}
                        </td>
                        <td className={numberCell}>
                          {formatCount(course.enrollments)}
                        </td>
                        <RatingCell
                          average={course.averageRating}
                          count={course.ratingCount}
                        />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </section>

      <section className="mt-10">
        <div className="mb-4">
          <h2 className="text-xl font-semibold">Instructors</h2>
          <p className="text-sm text-muted-foreground">
            Everyone who teaches here, highest revenue first. Rating is the mean
            over every rating on their courses.
          </p>
        </div>
        {instructors.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <Users className="mx-auto mb-3 size-8 text-muted-foreground/50" />
              <p className="text-muted-foreground">No instructors yet.</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className={cn(headerCell, "text-left")}>
                        Instructor
                      </th>
                      <th className={cn(headerCell, "text-right")}>Courses</th>
                      <th className={cn(headerCell, "text-right")}>Students</th>
                      <th className={cn(headerCell, "text-right")}>Revenue</th>
                      <th className={cn(headerCell, "text-right")}>Rating</th>
                    </tr>
                  </thead>
                  <tbody>
                    {instructors.map((instructor) => (
                      <tr
                        key={instructor.instructorId}
                        className="border-b border-border last:border-0"
                      >
                        <td className="px-4 py-3 text-sm font-medium">
                          {instructor.name}
                        </td>
                        <td className={numberCell}>
                          {formatCount(instructor.courses)}
                        </td>
                        <td className={numberCell}>
                          {formatCount(instructor.students)}
                        </td>
                        <td className={numberCell}>
                          {formatUsd(instructor.revenue)}
                        </td>
                        <RatingCell
                          average={instructor.averageRating}
                          count={instructor.ratingCount}
                        />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something went wrong";
  let message = "An unexpected error occurred while loading Platform Health.";

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
