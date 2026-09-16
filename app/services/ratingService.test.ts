import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";

let testDb: ReturnType<typeof createTestDb>;
let base: ReturnType<typeof seedBaseData>;

vi.mock("~/db", () => ({
  get db() {
    return testDb;
  },
}));

import {
  getUserRating,
  upsertRating,
  getCourseRatingStats,
  getRatingStatsForCourses,
} from "./ratingService";

function makeStudent(name: string, email: string) {
  return testDb
    .insert(schema.users)
    .values({ name, email, role: schema.UserRole.Student })
    .returning()
    .get();
}

function makeCourse(title: string, slug: string) {
  return testDb
    .insert(schema.courses)
    .values({
      title,
      slug,
      description: "desc",
      instructorId: base.instructor.id,
      categoryId: base.category.id,
      status: schema.CourseStatus.Published,
    })
    .returning()
    .get();
}

describe("ratingService", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
  });

  describe("upsertRating", () => {
    it("inserts a new rating", () => {
      const rating = upsertRating(base.user.id, base.course.id, 4);
      expect(rating).toBeDefined();
      expect(rating!.rating).toBe(4);
      expect(rating!.userId).toBe(base.user.id);
      expect(rating!.courseId).toBe(base.course.id);
    });

    it("updates rather than duplicating when the same user re-rates", () => {
      upsertRating(base.user.id, base.course.id, 3);
      upsertRating(base.user.id, base.course.id, 5);

      const stats = getCourseRatingStats(base.course.id);
      expect(stats.count).toBe(1);
      expect(stats.average).toBe(5);
    });

    it("rejects ratings outside 1–5", () => {
      expect(() => upsertRating(base.user.id, base.course.id, 0)).toThrow();
      expect(() => upsertRating(base.user.id, base.course.id, 6)).toThrow();
    });

    it("rejects non-integer ratings", () => {
      expect(() => upsertRating(base.user.id, base.course.id, 3.5)).toThrow();
    });
  });

  describe("getUserRating", () => {
    it("returns the user's rating row", () => {
      upsertRating(base.user.id, base.course.id, 2);
      const found = getUserRating(base.user.id, base.course.id);
      expect(found).toBeDefined();
      expect(found!.rating).toBe(2);
    });

    it("returns undefined when the user has not rated", () => {
      expect(getUserRating(base.user.id, base.course.id)).toBeUndefined();
    });
  });

  describe("getCourseRatingStats", () => {
    it("returns null average and zero count when there are no ratings", () => {
      const stats = getCourseRatingStats(base.course.id);
      expect(stats.average).toBeNull();
      expect(stats.count).toBe(0);
    });

    it("averages ratings across multiple users", () => {
      const s2 = makeStudent("Student Two", "s2@example.com");
      const s3 = makeStudent("Student Three", "s3@example.com");
      upsertRating(base.user.id, base.course.id, 5);
      upsertRating(s2.id, base.course.id, 4);
      upsertRating(s3.id, base.course.id, 3);

      const stats = getCourseRatingStats(base.course.id);
      expect(stats.count).toBe(3);
      expect(stats.average).toBe(4);
    });
  });

  describe("getRatingStatsForCourses", () => {
    it("returns an empty map for an empty input", () => {
      expect(getRatingStatsForCourses([]).size).toBe(0);
    });

    it("batches stats and omits courses with no ratings", () => {
      const other = makeCourse("Other Course", "other-course");
      const unrated = makeCourse("Unrated Course", "unrated-course");

      const s2 = makeStudent("Student Two", "s2@example.com");
      upsertRating(base.user.id, base.course.id, 4);
      upsertRating(s2.id, base.course.id, 2);
      upsertRating(base.user.id, other.id, 5);

      const stats = getRatingStatsForCourses([
        base.course.id,
        other.id,
        unrated.id,
      ]);

      expect(stats.get(base.course.id)).toEqual({ average: 3, count: 2 });
      expect(stats.get(other.id)).toEqual({ average: 5, count: 1 });
      expect(stats.has(unrated.id)).toBe(false);
    });
  });
});
