import type { ReactNode } from "react";
import { Link, isRouteErrorResponse } from "react-router";
import type { Route } from "./+types/instructor.$courseId.analytics";
import { requireCourseAccess } from "~/lib/courseAccess";
import {
  getCourseSales,
  getCourseReach,
  getCourseRevenueTrend,
  getCourseEnrollmentTrend,
  getCourseProgress,
  getCourseSentiment,
  trendBucketFor,
} from "~/services/analyticsService";
import { formatCount, formatUsd, formatUsdCompact } from "~/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { TrendChart } from "~/components/trend-chart";
import { DropOffFunnel } from "~/components/drop-off-funnel";
import { RatingDistribution } from "~/components/rating-distribution";
import { WindowPicker, parseTrendWindow } from "~/components/window-picker";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  CheckCircle,
  DollarSign,
  MessageSquare,
  ShoppingCart,
  Star,
  Ticket,
  Users,
  UserX,
} from "lucide-react";

export function meta({ data: loaderData }: Route.MetaArgs) {
  const title = loaderData?.course?.title ?? "Course Performance";
  return [
    { title: `Analytics: ${title} — Cadence` },
    { name: "description", content: `Course Performance for ${title}` },
  ];
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const { course } = await requireCourseAccess(request, params.courseId, {
    signInRequired:
      "Select a user from the DevUI panel to view course analytics.",
    notOwner: "You can only view analytics for your own courses.",
  });

  const trendWindow = parseTrendWindow(new URL(request.url));
  const now = new Date();

  const sales = getCourseSales(course.id);
  const reach = getCourseReach(course.id);
  const progress = getCourseProgress(course.id);
  const sentiment = getCourseSentiment(course.id);
  const trends = {
    window: trendWindow,
    bucket: trendBucketFor(trendWindow),
    revenue: getCourseRevenueTrend(course.id, trendWindow, now),
    enrollments: getCourseEnrollmentTrend(course.id, trendWindow, now),
  };

  return { course, sales, reach, progress, sentiment, trends };
}

function SectionHeading({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
      <div>
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

function SnapshotTile({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof DollarSign;
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 py-6">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon className="size-5" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold">{value}</p>
          {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export default function InstructorCourseAnalytics({
  loaderData,
}: Route.ComponentProps) {
  const { course, sales, reach, progress, sentiment, trends } = loaderData;
  const hasData = sales.purchases > 0 || reach.enrollments > 0;

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link to="/instructor" className="hover:text-foreground">
          My Courses
        </Link>
        <span className="mx-2">/</span>
        <Link to={`/instructor/${course.id}`} className="hover:text-foreground">
          {course.title}
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">Analytics</span>
      </nav>

      <Link
        to={`/instructor/${course.id}`}
        className="mb-4 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="mr-1 size-4" />
        Back to Course Editor
      </Link>

      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Course Performance</h1>
          <p className="mt-1 text-muted-foreground">
            All-time snapshot for {course.title}
          </p>
        </div>
        <Link to={`/instructor/${course.id}/students`}>
          <Button variant="outline">
            <Users className="size-4" />
            Roster
          </Button>
        </Link>
      </div>

      {hasData ? (
        <>
          {/* Sales */}
          <section>
            <SectionHeading title="Sales" subtitle="All-time" />
            <div className="grid gap-4 sm:grid-cols-2">
              <SnapshotTile
                icon={DollarSign}
                label="Revenue"
                value={formatUsd(sales.revenue)}
                detail="After PPP discounts"
              />
              <SnapshotTile
                icon={ShoppingCart}
                label="Purchases"
                value={formatCount(sales.purchases)}
                detail={`${formatCount(sales.individualPurchases)} individual · ${formatCount(sales.teamPurchases)} team`}
              />
            </div>
          </section>

          {/* Reach */}
          <section className="mt-10">
            <SectionHeading title="Reach" subtitle="All-time" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <SnapshotTile
                icon={Users}
                label="Enrollments"
                value={formatCount(reach.enrollments)}
              />
              <SnapshotTile
                icon={UserX}
                label="Not started"
                value={formatCount(reach.notStarted)}
                detail={`${reach.notStartedPercent}% of enrollments never opened a lesson`}
              />
              {sales.teamPurchases > 0 && (
                <SnapshotTile
                  icon={Ticket}
                  label="Team seats redeemed"
                  value={`${formatCount(reach.seatsRedeemed)} of ${formatCount(reach.seatsSold)}`}
                  detail={`${formatCount(reach.seatsSold - reach.seatsRedeemed)} paid-for seats unused`}
                />
              )}
            </div>
          </section>

          {/* Trends — the Window scopes only this section */}
          <section className="mt-10">
            <SectionHeading
              title="Trends"
              subtitle={`${trends.bucket === "day" ? "Daily" : "Weekly"} totals`}
              action={<WindowPicker value={trends.window} />}
            />
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Revenue</CardTitle>
                  <CardDescription>Paid price per purchase</CardDescription>
                </CardHeader>
                <CardContent>
                  <TrendChart
                    data={trends.revenue}
                    bucket={trends.bucket}
                    formatValue={formatUsd}
                    formatTick={formatUsdCompact}
                    color="var(--chart-1)"
                    emptyMessage="No purchases yet."
                  />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Enrollments</CardTitle>
                  <CardDescription>New enrollments</CardDescription>
                </CardHeader>
                <CardContent>
                  <TrendChart
                    data={trends.enrollments}
                    bucket={trends.bucket}
                    formatValue={(v) =>
                      `${formatCount(v)} ${v === 1 ? "enrollment" : "enrollments"}`
                    }
                    formatTick={formatCount}
                    color="var(--chart-2)"
                    emptyMessage="No enrollments yet."
                  />
                </CardContent>
              </Card>
            </div>
          </section>

          {/* Progress */}
          <section className="mt-10">
            <SectionHeading title="Progress" subtitle="All-time" />
            <div className="mb-4 grid gap-4 sm:grid-cols-2">
              <SnapshotTile
                icon={CheckCircle}
                label="Completion rate"
                value={`${progress.completionRate}%`}
                detail={`${formatCount(progress.completed)} of ${formatCount(progress.enrollments)} enrolled finished the course`}
              />
            </div>
            <Card>
              <CardHeader>
                <CardTitle>Drop-off</CardTitle>
                <CardDescription>
                  Share of all enrolled students who completed each lesson, in
                  course order
                </CardDescription>
              </CardHeader>
              <CardContent>
                <DropOffFunnel
                  steps={progress.dropOff}
                  enrolled={progress.enrollments}
                />
              </CardContent>
            </Card>
          </section>

          {/* Sentiment */}
          <section className="mt-10">
            <SectionHeading title="Sentiment" subtitle="All-time" />
            <div className="mb-4 grid gap-4 sm:grid-cols-2">
              <SnapshotTile
                icon={Star}
                label="Average rating"
                value={
                  sentiment.average === null
                    ? "—"
                    : sentiment.average.toFixed(1)
                }
                detail={
                  sentiment.count === 0
                    ? "No ratings yet"
                    : `${formatCount(sentiment.count)} ${sentiment.count === 1 ? "rating" : "ratings"}`
                }
              />
              <SnapshotTile
                icon={MessageSquare}
                label="Comments"
                value={formatCount(sentiment.comments)}
                detail="Across all lessons, replies included"
              />
            </div>
            <Card>
              <CardHeader>
                <CardTitle>Rating distribution</CardTitle>
                <CardDescription>
                  How many students gave each star
                </CardDescription>
              </CardHeader>
              <CardContent>
                <RatingDistribution distribution={sentiment.distribution} />
              </CardContent>
            </Card>
          </section>
        </>
      ) : (
        <Card>
          <CardContent className="py-8 text-center">
            <BarChart3 className="mx-auto mb-3 size-8 text-muted-foreground/50" />
            <p className="text-muted-foreground">
              No sales or enrollments yet. Numbers will appear here once
              students start joining this course.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something went wrong";
  let message = "An unexpected error occurred while loading course analytics.";

  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      title = "Course not found";
      message =
        "The course you're looking for doesn't exist or may have been removed.";
    } else if (error.status === 401) {
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
          : "You don't have permission to view these analytics.";
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
          <Link to="/instructor">
            <Button variant="outline">My Courses</Button>
          </Link>
          <Link to="/">
            <Button>Go Home</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
