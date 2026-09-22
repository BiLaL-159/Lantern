import { and, eq, gte, isNull, sql, type SQL } from "drizzle-orm";
import type { AnySQLiteColumn, AnySQLiteTable } from "drizzle-orm/sqlite-core";
import { db } from "~/db";
import {
  purchases,
  enrollments,
  modules,
  lessons,
  lessonProgress,
  LessonProgressStatus,
  coupons,
  courseRatings,
  lessonComments,
  courses,
  users,
  CourseStatus,
  UserRole,
} from "~/db/schema";

// ─── Analytics Service ───
// Aggregates for Course Performance. Everything is computed live from
// SQLite; nothing is cached or precomputed.
// Uses positional parameters (project convention).

// ─── Sales ───

/**
 * All-time sales for a course: revenue is the sum of every purchase's price
 * paid, in cents; purchases is the number of purchase rows, split into
 * individual and team. A team purchase is a purchase row with seats
 * (coupons) attached; it is a single row created when the team buys, so
 * it counts once at purchase time — redeeming seats adds nothing.
 */
export function getCourseSales(courseId: number) {
  const isTeam = sql<number>`exists (select 1 from ${coupons} where ${coupons.purchaseId} = ${purchases.id})`;
  const row = db
    .select({
      revenue: sql<number>`coalesce(sum(${purchases.pricePaid}), 0)`,
      purchases: sql<number>`count(*)`,
      teamPurchases: sql<number>`coalesce(sum(${isTeam}), 0)`,
    })
    .from(purchases)
    .where(eq(purchases.courseId, courseId))
    .get();

  const total = row?.purchases ?? 0;
  const teamPurchases = row?.teamPurchases ?? 0;
  return {
    revenue: row?.revenue ?? 0,
    purchases: total,
    individualPurchases: total - teamPurchases,
    teamPurchases,
  };
}

// ─── Reach ───

/**
 * All-time reach for a course. enrollments counts every enrollment however
 * it was created (individual purchase, redeemed team seat, or manual).
 * notStarted is enrolled students with no lesson-progress row for any
 * lesson in the course — in progress counts as started. seatsSold is the
 * coupons issued by the course's team purchases; seatsRedeemed those with
 * a redeemer.
 */
export function getCourseReach(courseId: number) {
  const hasStarted = sql<number>`exists (
    select 1 from ${lessonProgress}
    inner join ${lessons} on ${lessons.id} = ${lessonProgress.lessonId}
    inner join ${modules} on ${modules.id} = ${lessons.moduleId}
    where ${lessonProgress.userId} = ${enrollments.userId}
      and ${modules.courseId} = ${enrollments.courseId}
  )`;
  const row = db
    .select({
      enrollments: sql<number>`count(*)`,
      started: sql<number>`coalesce(sum(${hasStarted}), 0)`,
    })
    .from(enrollments)
    .where(eq(enrollments.courseId, courseId))
    .get();
  const total = row?.enrollments ?? 0;
  const notStarted = total - (row?.started ?? 0);

  const seats = db
    .select({
      sold: sql<number>`count(*)`,
      redeemed: sql<number>`count(${coupons.redeemedByUserId})`,
    })
    .from(coupons)
    .where(eq(coupons.courseId, courseId))
    .get();

  return {
    enrollments: total,
    notStarted,
    notStartedPercent: percent(notStarted, total),
    seatsSold: seats?.sold ?? 0,
    seatsRedeemed: seats?.redeemed ?? 0,
  };
}

// ─── Progress ───

export type DropOffStep = {
  lessonId: number;
  title: string;
  moduleTitle: string;
  /** Enrolled students with a completed progress row for this lesson. */
  completed: number;
  /** completed ÷ enrolled, as a whole-number percentage. */
  percent: number;
};

/**
 * Progress for a course. completionRate is enrollments with a completion
 * time (recorded by progressService, ADR-0001) ÷ all enrollments, as a
 * whole-number percentage; 0 when nobody is enrolled.
 *
 * dropOff is the Drop-off funnel: one step per lesson in module order then
 * lesson order, each the share of enrolled students who completed it. The
 * denominator is always every enrolled student, so students who never
 * started show as a cliff at the first lesson rather than being hidden.
 */
export function getCourseProgress(courseId: number) {
  const row = db
    .select({
      enrollments: sql<number>`count(*)`,
      completed: sql<number>`count(${enrollments.completedAt})`,
    })
    .from(enrollments)
    .where(eq(enrollments.courseId, courseId))
    .get();
  const total = row?.enrollments ?? 0;
  const completed = row?.completed ?? 0;

  // Only enrolled students count towards a lesson's completions.
  const completedByLesson = db
    .select({
      lessonId: lessonProgress.lessonId,
      completed: sql<number>`count(distinct ${lessonProgress.userId})`,
    })
    .from(lessonProgress)
    .innerJoin(
      enrollments,
      and(
        eq(enrollments.userId, lessonProgress.userId),
        eq(enrollments.courseId, courseId)
      )
    )
    .where(eq(lessonProgress.status, LessonProgressStatus.Completed))
    .groupBy(lessonProgress.lessonId)
    .all();
  const completions = new Map(
    completedByLesson.map((r) => [r.lessonId, r.completed])
  );

  const dropOff: DropOffStep[] = db
    .select({
      lessonId: lessons.id,
      title: lessons.title,
      moduleTitle: modules.title,
    })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(eq(modules.courseId, courseId))
    .orderBy(modules.position, lessons.position)
    .all()
    .map((lesson) => {
      const done = completions.get(lesson.lessonId) ?? 0;
      return { ...lesson, completed: done, percent: percent(done, total) };
    });

  return {
    enrollments: total,
    completed,
    completionRate: percent(completed, total),
    dropOff,
  };
}

function percent(numerator: number, denominator: number) {
  return denominator === 0 ? 0 : Math.round((numerator / denominator) * 100);
}

// ─── Sentiment ───

export type RatingBucket = {
  rating: number;
  count: number;
  /** count ÷ all ratings, as a whole-number percentage. */
  percent: number;
};

// Stars in display order, highest first.
const STARS = [5, 4, 3, 2, 1];

/**
 * Sentiment for a course. average is the mean rating (null with no
 * ratings) and count the number of ratings — one per student, since a
 * student re-rating replaces their earlier rating. distribution has one
 * bucket per star, highest first, every star present even at zero.
 * comments counts non-deleted comments on the course's lessons, replies
 * included; a live reply under a deleted parent still counts.
 *
 * average and count are derived from the per-star rows rather than
 * ratingService.getCourseRatingStats so the section costs one query and
 * the three rating figures cannot disagree.
 */
export function getCourseSentiment(courseId: number) {
  const perStar = db
    .select({
      rating: courseRatings.rating,
      count: sql<number>`count(*)`,
    })
    .from(courseRatings)
    .where(eq(courseRatings.courseId, courseId))
    .groupBy(courseRatings.rating)
    .all();
  const count = perStar.reduce((sum, r) => sum + r.count, 0);
  const ratingSum = perStar.reduce((sum, r) => sum + r.rating * r.count, 0);

  const counts = new Map(perStar.map((r) => [r.rating, r.count]));
  const distribution: RatingBucket[] = STARS.map((rating) => {
    const n = counts.get(rating) ?? 0;
    return { rating, count: n, percent: percent(n, count) };
  });

  const commentRow = db
    .select({ comments: sql<number>`count(*)` })
    .from(lessonComments)
    .innerJoin(lessons, eq(lessons.id, lessonComments.lessonId))
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .where(
      and(eq(modules.courseId, courseId), isNull(lessonComments.deletedAt))
    )
    .get();

  return {
    average: count === 0 ? null : ratingSum / count,
    count,
    distribution,
    comments: commentRow?.comments ?? 0,
  };
}

// ─── Course summaries ───

export type CourseSummary = {
  courseId: number;
  title: string;
  status: CourseStatus;
  instructorName: string;
  /** Sum of price paid across the course's purchases, in cents. */
  revenue: number;
  enrollments: number;
  /** Completed enrollments ÷ all enrollments, as a whole-number percentage. */
  completionRate: number;
  /** Mean rating, or null with no ratings. */
  averageRating: number | null;
  ratingCount: number;
};

// One row per course with the same all-time figures the per-course
// aggregates report, for tables that compare courses. Each metric is a
// correlated subquery so a course with nothing to count still gets a row.
// ratingSum comes back so callers can average over ratings, not courses.
//
// The subqueries are built with the query builder rather than written as
// raw sql`` so that the outer courses.id is rendered table-qualified —
// inside a single-table select drizzle would otherwise emit a bare "id",
// which SQLite resolves to the inner table.
function summarizeCourses(where: SQL | undefined) {
  const perCourse = <T extends AnySQLiteTable>(
    table: T,
    courseId: AnySQLiteColumn,
    value: SQL<number>
  ) =>
    sql<number>`${db
      .select({ value })
      .from(table)
      .where(eq(courseId, courses.id))}`;

  const revenue = perCourse(
    purchases,
    purchases.courseId,
    sql`coalesce(sum(${purchases.pricePaid}), 0)`
  );
  return db
    .select({
      courseId: courses.id,
      title: courses.title,
      status: courses.status,
      instructorId: courses.instructorId,
      instructorName: users.name,
      revenue,
      enrollments: perCourse(enrollments, enrollments.courseId, sql`count(*)`),
      completed: perCourse(
        enrollments,
        enrollments.courseId,
        sql`count(${enrollments.completedAt})`
      ),
      ratingSum: perCourse(
        courseRatings,
        courseRatings.courseId,
        sql`coalesce(sum(${courseRatings.rating}), 0)`
      ),
      ratingCount: perCourse(
        courseRatings,
        courseRatings.courseId,
        sql`count(*)`
      ),
    })
    .from(courses)
    .innerJoin(users, eq(users.id, courses.instructorId))
    .where(where)
    .orderBy(courses.title)
    .all();
}

export const COURSE_SORTS = ["revenue", "enrollments", "rating"] as const;

export type CourseSort = (typeof COURSE_SORTS)[number];

// The value each sort key ranks by; null (no ratings) sorts last.
const SORT_VALUE: Record<CourseSort, (c: CourseSummary) => number | null> = {
  revenue: (c) => c.revenue,
  enrollments: (c) => c.enrollments,
  rating: (c) => c.averageRating,
};

// Descending by the sort key, unrated courses last, ties by title
// (the order summarizeCourses already returns, so the sort is stable).
function sortCourseSummaries(rows: CourseSummary[], sort: CourseSort) {
  const value = SORT_VALUE[sort];
  return [...rows].sort((a, b) => {
    const av = value(a);
    const bv = value(b);
    if (av === bv) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    return bv - av;
  });
}

function toCourseSummary(
  row: ReturnType<typeof summarizeCourses>[number]
): CourseSummary {
  const { completed, ratingSum, instructorId, ...rest } = row;
  return {
    ...rest,
    completionRate: percent(completed, row.enrollments),
    averageRating: row.ratingCount === 0 ? null : ratingSum / row.ratingCount,
  };
}

/**
 * Rollup across every course an instructor owns, whatever its status.
 * Draft and archived courses keep their rows and historical numbers;
 * only published courses count as active. averageRating is the mean over
 * all ratings on the instructor's courses — not the mean of per-course
 * means — and null when there are none. Courses are ordered by revenue,
 * highest first, then title.
 */
export function getInstructorRollup(instructorId: number) {
  const rows = summarizeCourses(eq(courses.instructorId, instructorId));

  const ratingCount = rows.reduce((sum, r) => sum + r.ratingCount, 0);
  const ratingSum = rows.reduce((sum, r) => sum + r.ratingSum, 0);

  return {
    totals: {
      revenue: rows.reduce((sum, r) => sum + r.revenue, 0),
      enrollments: rows.reduce((sum, r) => sum + r.enrollments, 0),
      activeCourses: rows.filter((r) => r.status === CourseStatus.Published)
        .length,
      averageRating: ratingCount === 0 ? null : ratingSum / ratingCount,
      ratingCount,
    },
    courses: sortCourseSummaries(rows.map(toCourseSummary), "revenue"),
  };
}

// ─── Platform Health ───

/**
 * All-time platform totals for admins. revenue and enrollments include
 * archived courses so history is preserved; activeCourses counts only
 * published ones; courses is every course whatever its status.
 */
export function getPlatformTotals() {
  const money = db
    .select({ revenue: sql<number>`coalesce(sum(${purchases.pricePaid}), 0)` })
    .from(purchases)
    .get();
  const people = db
    .select({ users: sql<number>`count(*)` })
    .from(users)
    .get();
  const learning = db
    .select({ enrollments: sql<number>`count(*)` })
    .from(enrollments)
    .get();
  const catalogue = db
    .select({
      courses: sql<number>`count(*)`,
      active: sql<number>`coalesce(sum(${courses.status} = ${CourseStatus.Published}), 0)`,
    })
    .from(courses)
    .get();

  return {
    revenue: money?.revenue ?? 0,
    users: people?.users ?? 0,
    enrollments: learning?.enrollments ?? 0,
    activeCourses: catalogue?.active ?? 0,
    courses: catalogue?.courses ?? 0,
  };
}

/**
 * Every course on the platform, whatever its status, as summary rows
 * sorted server-side by the given key: highest first, unrated courses
 * last under "rating", ties by title.
 */
export function getTopCourses(sort: CourseSort): CourseSummary[] {
  return sortCourseSummaries(
    summarizeCourses(undefined).map(toCourseSummary),
    sort
  );
}

// ─── Trends ───

export const TREND_WINDOWS = ["30d", "90d", "all"] as const;

export type TrendWindow = (typeof TREND_WINDOWS)[number];

export type TrendPoint = { bucketStart: string; value: number };

export type TrendBucket = "day" | "week";

// How each Window is reported: how many days back it reaches (null for
// all-time) and the bucket size its Trend is bucketed in.
const WINDOWS: Record<
  TrendWindow,
  { days: number | null; bucket: TrendBucket }
> = {
  "30d": { days: 30, bucket: "day" },
  "90d": { days: 90, bucket: "week" },
  all: { days: null, bucket: "week" },
};

/** The bucket size a Window's Trend is reported in. */
export function trendBucketFor(window: TrendWindow): TrendBucket {
  return WINDOWS[window].bucket;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const BUCKET_MS: Record<TrendBucket, number> = {
  day: DAY_MS,
  week: 7 * DAY_MS,
};

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}

// Weeks start on Monday, UTC.
function startOfUtcWeek(date: Date): Date {
  const day = startOfUtcDay(date);
  const offset = (day.getUTCDay() + 6) % 7; // Monday → 0 … Sunday → 6
  return new Date(day.getTime() - offset * DAY_MS);
}

function startOfBucket(date: Date, bucket: TrendBucket): Date {
  return bucket === "day" ? startOfUtcDay(date) : startOfUtcWeek(date);
}

type Bucketing = { first: Date; last: Date; size: number };

/**
 * The bucket grid for a Window. The grid runs up to today and is aligned
 * to whole buckets, so its first bucket starts at the beginning of the day
 * (30d) or the Monday of the week (90d) that contains the Window's first
 * day, today counting as day one. All-time starts from the week of the
 * earliest event, or is null when there are no events.
 */
function bucketingFor(
  window: TrendWindow,
  now: Date,
  earliest: string | null
): Bucketing | null {
  const { days, bucket } = WINDOWS[window];
  const today = startOfUtcDay(now);

  let firstDay: Date;
  if (days !== null) {
    firstDay = new Date(today.getTime() - (days - 1) * DAY_MS);
  } else if (earliest !== null) {
    firstDay = new Date(earliest);
  } else {
    return null;
  }

  return {
    first: startOfBucket(firstDay, bucket),
    last: startOfBucket(today, bucket),
    size: BUCKET_MS[bucket],
  };
}

/**
 * Sums `events` into the bucket grid, keyed by each bucket's UTC start.
 * Buckets without events are present with a value of 0; events outside the
 * grid are ignored.
 */
function bucketize(
  events: { at: string; value: number }[],
  { first, last, size }: Bucketing
): TrendPoint[] {
  const totals = new Map<number, number>();
  for (let t = first.getTime(); t <= last.getTime(); t += size)
    totals.set(t, 0);

  for (const event of events) {
    const offset = new Date(event.at).getTime() - first.getTime();
    if (offset < 0) continue;
    const key = first.getTime() + Math.floor(offset / size) * size;
    if (totals.has(key)) totals.set(key, totals.get(key)! + event.value);
  }

  return [...totals].map(([t, value]) => ({
    bucketStart: new Date(t).toISOString(),
    value,
  }));
}

// Counts each row once, for Trends that count events rather than sum money.
const ONE_PER_ROW = sql<number>`1`;

// The events a Trend reports: one table's timestamped rows, each
// contributing a value (price paid for revenue, one for a count). The
// table comes from the timestamp column itself, so a source cannot mix
// columns from two tables. `where` scopes the events to a course, or is
// left out for the whole platform.
type TrendSource = {
  /** The ISO timestamp column the events are dated by. */
  at: AnySQLiteColumn<{ data: string; notNull: true }>;
  value: AnySQLiteColumn<{ data: number; notNull: true }> | SQL<number>;
  where?: SQL;
};

/** When the source's first event happened, or null when it has none. */
function earliestEvent({ at, where }: TrendSource): string | null {
  const row = db
    .select({ at: sql<string | null>`min(${at})` })
    .from(at.table)
    .where(where)
    .get();
  return row?.at ?? null;
}

/** The source's events from the grid's first bucket onwards. */
function eventsSince({ at, value, where }: TrendSource, { first }: Bucketing) {
  return db
    .select({ at, value })
    .from(at.table)
    .where(and(where, gte(at, first.toISOString())))
    .all();
}

/**
 * Sums a source's events into the Window's buckets. 30d is bucketed daily;
 * 90d and all-time weekly (see bucketingFor). Bucket boundaries are UTC; an
 * event exactly on a boundary belongs to the bucket that starts there.
 * All-time is empty when the source has no events at all.
 */
function eventTrend(
  source: TrendSource,
  window: TrendWindow,
  now: Date
): TrendPoint[] {
  const bucketing = bucketingFor(window, now, earliestEvent(source));
  if (!bucketing) return [];
  return bucketize(eventsSince(source, bucketing), bucketing);
}

/** Revenue Trend for a course: price paid, in cents, summed per bucket. */
export function getCourseRevenueTrend(
  courseId: number,
  window: TrendWindow,
  now: Date
): TrendPoint[] {
  return eventTrend(
    {
      at: purchases.createdAt,
      value: purchases.pricePaid,
      where: eq(purchases.courseId, courseId),
    },
    window,
    now
  );
}

/**
 * Enrollments Trend for a course: enrollments created per bucket, however
 * they were created.
 */
export function getCourseEnrollmentTrend(
  courseId: number,
  window: TrendWindow,
  now: Date
): TrendPoint[] {
  return eventTrend(
    {
      at: enrollments.enrolledAt,
      value: ONE_PER_ROW,
      where: eq(enrollments.courseId, courseId),
    },
    window,
    now
  );
}

// ─── Platform Trends ───

const SIGNUPS: TrendSource = { at: users.createdAt, value: ONE_PER_ROW };

const PLATFORM_REVENUE: TrendSource = {
  at: purchases.createdAt,
  value: purchases.pricePaid,
};

const PLATFORM_ENROLLMENTS: TrendSource = {
  at: enrollments.enrolledAt,
  value: ONE_PER_ROW,
};

// The roles a new-users Trend reports, in the order they are drawn.
export const NEW_USER_ROLES = [
  UserRole.Student,
  UserRole.Instructor,
  UserRole.Admin,
] as const;

export type RoleTrend = { role: UserRole; points: TrendPoint[] };

export type PlatformTrends = {
  /** Signups per bucket, one series per role. */
  newUsers: RoleTrend[];
  revenue: TrendPoint[];
  enrollments: TrendPoint[];
};

/**
 * The three platform Trends for a Window, all on one bucket grid so the
 * charts under a single Window picker share an x-axis. All-time runs from
 * the earliest of the first signup, purchase or enrollment, which means a
 * series with nothing in it is a flat line over that grid rather than a
 * shorter chart. Every series is empty only when the platform has no
 * events at all.
 *
 * New users are split by role, taken from each user's creation time; every
 * role gets a series, so a role nobody signed up for is all zeros.
 */
export function getPlatformTrends(
  window: TrendWindow,
  now: Date
): PlatformTrends {
  const starts = [SIGNUPS, PLATFORM_REVENUE, PLATFORM_ENROLLMENTS]
    .map((source) => earliestEvent(source))
    .filter((at): at is string => at !== null)
    // ISO timestamps sort lexicographically in time order.
    .sort();

  const bucketing = bucketingFor(window, now, starts[0] ?? null);
  if (!bucketing) {
    return {
      newUsers: NEW_USER_ROLES.map((role) => ({ role, points: [] })),
      revenue: [],
      enrollments: [],
    };
  }

  const signups = db
    .select({ role: users.role, at: users.createdAt, value: ONE_PER_ROW })
    .from(users)
    .where(gte(users.createdAt, bucketing.first.toISOString()))
    .all();

  return {
    newUsers: NEW_USER_ROLES.map((role) => ({
      role,
      points: bucketize(
        signups.filter((signup) => signup.role === role),
        bucketing
      ),
    })),
    revenue: bucketize(eventsSince(PLATFORM_REVENUE, bucketing), bucketing),
    enrollments: bucketize(
      eventsSince(PLATFORM_ENROLLMENTS, bucketing),
      bucketing
    ),
  };
}

// ─── Instructor summaries ───

export type InstructorSummary = {
  instructorId: number;
  name: string;
  /** Courses they own, whatever the status. */
  courses: number;
  /** Enrollments across those courses. */
  students: number;
  /** Sum of price paid across those courses' purchases, in cents. */
  revenue: number;
  /** Mean over every rating on their courses, or null with no ratings. */
  averageRating: number | null;
  ratingCount: number;
};

/**
 * One row per instructor for admins, highest revenue first then name.
 * The list is every user with the instructor role, so someone who has not
 * published anything yet still appears, with zeros — the table is meant to
 * be the whole roster, not only the people with sales.
 *
 * averageRating is the mean over all ratings on the instructor's courses,
 * not the mean of per-course means, so a course with one 1-star rating
 * cannot weigh as much as a course with fifty 5-star ones.
 */
export function getInstructorSummaries(): InstructorSummary[] {
  const owned = new Map<number, ReturnType<typeof summarizeCourses>>();
  for (const course of summarizeCourses(undefined)) {
    const rows = owned.get(course.instructorId) ?? [];
    rows.push(course);
    owned.set(course.instructorId, rows);
  }

  const instructors = db
    .select({ instructorId: users.id, name: users.name })
    .from(users)
    .where(eq(users.role, UserRole.Instructor))
    .all();

  const total = (
    rows: ReturnType<typeof summarizeCourses>,
    of: (row: ReturnType<typeof summarizeCourses>[number]) => number
  ) => rows.reduce((sum, row) => sum + of(row), 0);

  return instructors
    .map(({ instructorId, name }) => {
      const rows = owned.get(instructorId) ?? [];
      const ratingCount = total(rows, (row) => row.ratingCount);
      return {
        instructorId,
        name,
        courses: rows.length,
        students: total(rows, (row) => row.enrollments),
        revenue: total(rows, (row) => row.revenue),
        averageRating:
          ratingCount === 0
            ? null
            : total(rows, (row) => row.ratingSum) / ratingCount,
        ratingCount,
      };
    })
    .sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name));
}
