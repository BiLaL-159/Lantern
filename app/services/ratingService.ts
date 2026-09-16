import { eq, and, inArray, sql } from "drizzle-orm";
import { db } from "~/db";
import { courseRatings } from "~/db/schema";

// ─── Rating Service ───
// Handles course star ratings: one rating (1–5) per student per course.
// Uses positional parameters (project convention).

export function getUserRating(userId: number, courseId: number) {
  return db
    .select()
    .from(courseRatings)
    .where(
      and(
        eq(courseRatings.userId, userId),
        eq(courseRatings.courseId, courseId)
      )
    )
    .get();
}

/**
 * Inserts a new rating or updates the existing one for this (user, course).
 * Rating must be an integer between 1 and 5.
 */
export function upsertRating(userId: number, courseId: number, rating: number) {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new Error("Rating must be an integer between 1 and 5");
  }

  const existing = getUserRating(userId, courseId);

  if (existing) {
    return db
      .update(courseRatings)
      .set({ rating, updatedAt: new Date().toISOString() })
      .where(eq(courseRatings.id, existing.id))
      .returning()
      .get();
  }

  return db
    .insert(courseRatings)
    .values({ userId, courseId, rating })
    .returning()
    .get();
}

/**
 * Average rating and count for a single course.
 * `average` is null when the course has no ratings.
 */
export function getCourseRatingStats(courseId: number): {
  average: number | null;
  count: number;
} {
  const result = db
    .select({
      average: sql<number | null>`avg(${courseRatings.rating})`,
      count: sql<number>`count(*)`,
    })
    .from(courseRatings)
    .where(eq(courseRatings.courseId, courseId))
    .get();

  return {
    average: result?.average ?? null,
    count: result?.count ?? 0,
  };
}

/**
 * Batched rating stats for many courses in a single query.
 * Returns a Map keyed by courseId; courses with no ratings are omitted.
 */
export function getRatingStatsForCourses(
  courseIds: number[]
): Map<number, { average: number; count: number }> {
  const stats = new Map<number, { average: number; count: number }>();

  if (courseIds.length === 0) return stats;

  const rows = db
    .select({
      courseId: courseRatings.courseId,
      average: sql<number>`avg(${courseRatings.rating})`,
      count: sql<number>`count(*)`,
    })
    .from(courseRatings)
    .where(inArray(courseRatings.courseId, courseIds))
    .groupBy(courseRatings.courseId)
    .all();

  for (const row of rows) {
    stats.set(row.courseId, { average: row.average, count: row.count });
  }

  return stats;
}
