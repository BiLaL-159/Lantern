import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "~/db";
import {
  purchases,
  enrollments,
  modules,
  lessons,
  lessonProgress,
  LessonProgressStatus,
} from "~/db/schema";

// ─── Analytics Service ───
// Aggregates for Course Performance. Everything is computed live from
// SQLite; nothing is cached or precomputed.
// Uses positional parameters (project convention).

// ─── Sales ───

/**
 * All-time sales for a course: revenue is the sum of every purchase's price
 * paid, in cents; purchases is the number of purchase rows. Team purchases
 * are a single purchase row created when the team buys, so they count once
 * at purchase time — redeeming seats adds nothing.
 */
export function getCourseSales(courseId: number) {
  const row = db
    .select({
      revenue: sql<number>`coalesce(sum(${purchases.pricePaid}), 0)`,
      purchases: sql<number>`count(*)`,
    })
    .from(purchases)
    .where(eq(purchases.courseId, courseId))
    .get();

  return { revenue: row?.revenue ?? 0, purchases: row?.purchases ?? 0 };
}

// ─── Reach ───

/**
 * All-time enrollment count for a course, however the enrollment was created
 * (individual purchase, redeemed team seat, or manual).
 */
export function getCourseReach(courseId: number) {
  const row = db
    .select({ enrollments: sql<number>`count(*)` })
    .from(enrollments)
    .where(eq(enrollments.courseId, courseId))
    .get();

  return { enrollments: row?.enrollments ?? 0 };
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

// ─── Trends ───

export type TrendWindow = "30d" | "90d" | "all";

export type TrendPoint = { bucketStart: string; value: number };

export type TrendBucket = "day" | "week";

/** The bucket size a Window's Trend is reported in. */
export function trendBucketFor(window: TrendWindow): TrendBucket {
  return window === "30d" ? "day" : "week";
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

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

type Bucketing = { first: Date; last: Date; size: number };

/**
 * The bucket grid for a Window. 30d is the last 30 days bucketed daily.
 * 90d and all-time are bucketed weekly, so every bucket is a whole week:
 * 90d starts from the week containing the day 90 days ago; all-time from
 * the week of the earliest event, or null when there are no events.
 */
function bucketingFor(
  window: TrendWindow,
  now: Date,
  earliest: string | null
): Bucketing | null {
  const today = startOfUtcDay(now);
  if (window === "30d") {
    return {
      first: new Date(today.getTime() - 29 * DAY_MS),
      last: today,
      size: DAY_MS,
    };
  }
  if (window === "90d") {
    return {
      first: startOfUtcWeek(new Date(today.getTime() - 89 * DAY_MS)),
      last: startOfUtcWeek(today),
      size: WEEK_MS,
    };
  }
  if (earliest === null) return null;
  return {
    first: startOfUtcWeek(new Date(earliest)),
    last: startOfUtcWeek(today),
    size: WEEK_MS,
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

/**
 * Revenue Trend for a course: price paid, in cents, summed per bucket.
 * 30d is bucketed daily; 90d and all-time weekly. Bucket boundaries are
 * UTC; an event exactly on a boundary belongs to the bucket that starts
 * there. All-time is empty when the course has no purchases.
 */
export function getCourseRevenueTrend(
  courseId: number,
  window: TrendWindow,
  now: Date
): TrendPoint[] {
  const earliest = db
    .select({ at: sql<string | null>`min(${purchases.createdAt})` })
    .from(purchases)
    .where(eq(purchases.courseId, courseId))
    .get();
  const bucketing = bucketingFor(window, now, earliest?.at ?? null);
  if (!bucketing) return [];

  const rows = db
    .select({ at: purchases.createdAt, value: purchases.pricePaid })
    .from(purchases)
    .where(
      and(
        eq(purchases.courseId, courseId),
        gte(purchases.createdAt, bucketing.first.toISOString())
      )
    )
    .all();

  return bucketize(rows, bucketing);
}

/**
 * Enrollments Trend for a course: enrollments created per bucket, however
 * they were created. Same bucketing rules as the revenue Trend.
 */
export function getCourseEnrollmentTrend(
  courseId: number,
  window: TrendWindow,
  now: Date
): TrendPoint[] {
  const earliest = db
    .select({ at: sql<string | null>`min(${enrollments.enrolledAt})` })
    .from(enrollments)
    .where(eq(enrollments.courseId, courseId))
    .get();
  const bucketing = bucketingFor(window, now, earliest?.at ?? null);
  if (!bucketing) return [];

  const rows = db
    .select({ at: enrollments.enrolledAt, value: sql<number>`1` })
    .from(enrollments)
    .where(
      and(
        eq(enrollments.courseId, courseId),
        gte(enrollments.enrolledAt, bucketing.first.toISOString())
      )
    )
    .all();

  return bucketize(rows, bucketing);
}
