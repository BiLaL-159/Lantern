import { eq, sql } from "drizzle-orm";
import { db } from "~/db";
import { purchases, enrollments } from "~/db/schema";

// ─── Analytics Service ───
// Aggregates for Course Performance (instructors) and Platform Health (admins).
// Everything is computed live from SQLite; nothing is cached or precomputed.
// Uses positional parameters (project convention).

// ─── Sales ───

/**
 * All-time revenue for a course: the sum of every purchase's price paid, in
 * cents. Team purchases are a single purchase row created when the team
 * buys, so they count once at purchase time — redeeming seats adds nothing.
 */
export function getCourseSales(courseId: number) {
  const row = db
    .select({
      revenue: sql<number>`coalesce(sum(${purchases.pricePaid}), 0)`,
    })
    .from(purchases)
    .where(eq(purchases.courseId, courseId))
    .get();

  return { revenue: row?.revenue ?? 0 };
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
