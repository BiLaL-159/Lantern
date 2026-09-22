import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "~/db";
import {
  purchases,
  enrollments,
  modules,
  lessons,
  lessonProgress,
  LessonProgressStatus,
  coupons,
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

/**
 * Revenue Trend for a course: price paid, in cents, summed per bucket.
 * 30d is bucketed daily; 90d and all-time weekly (see bucketingFor).
 * Bucket boundaries are UTC; an event exactly on a boundary belongs to the
 * bucket that starts there. All-time is empty when the course has no
 * purchases.
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
