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
  getCourseSales,
  getCourseReach,
  getCourseRevenueTrend,
  getCourseEnrollmentTrend,
  getCourseProgress,
} from "./analyticsService";
import { createPurchase, createTeamPurchase } from "./purchaseService";
import { redeemCoupon } from "./couponService";
import { enrollUser, markEnrollmentComplete } from "./enrollmentService";
import { createModule } from "./moduleService";
import { createLesson } from "./lessonService";
import { markLessonComplete, markLessonInProgress } from "./progressService";

function makeStudent(email: string) {
  return testDb
    .insert(schema.users)
    .values({ name: email, email, role: schema.UserRole.Student })
    .returning()
    .get();
}

function makeCourse(slug: string, status = schema.CourseStatus.Published) {
  return testDb
    .insert(schema.courses)
    .values({
      title: slug,
      slug,
      description: "desc",
      instructorId: base.instructor.id,
      categoryId: base.category.id,
      status,
      price: 4999,
    })
    .returning()
    .get();
}

function purchaseAt(
  userId: number,
  courseId: number,
  cents: number,
  iso: string
) {
  return testDb
    .insert(schema.purchases)
    .values({
      userId,
      courseId,
      pricePaid: cents,
      country: "US",
      createdAt: iso,
    })
    .returning()
    .get();
}

function enrollAt(userId: number, courseId: number, iso: string) {
  return testDb
    .insert(schema.enrollments)
    .values({ userId, courseId, enrolledAt: iso })
    .returning()
    .get();
}

function makeLesson(moduleId: number, title: string) {
  return createLesson(moduleId, title, null, null, null, null);
}

const NOW = new Date("2026-09-22T10:00:00.000Z");

describe("analyticsService", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
  });

  describe("getCourseRevenueTrend", () => {
    it("buckets the last 30 days daily with zeros for empty days", () => {
      const a = makeStudent("a@example.com");
      purchaseAt(a.id, base.course.id, 4999, "2026-09-22T09:00:00.000Z");
      // Exactly on a bucket boundary: belongs to that day, not the day before.
      purchaseAt(a.id, base.course.id, 2500, "2026-09-01T00:00:00.000Z");
      // One second before the window opens: excluded.
      purchaseAt(a.id, base.course.id, 1000, "2026-08-23T23:59:59.000Z");

      const trend = getCourseRevenueTrend(base.course.id, "30d", NOW);

      expect(trend).toHaveLength(30);
      expect(trend[0]).toEqual({
        bucketStart: "2026-08-24T00:00:00.000Z",
        value: 0,
      });
      expect(trend[8]).toEqual({
        bucketStart: "2026-09-01T00:00:00.000Z",
        value: 2500,
      });
      expect(trend[29]).toEqual({
        bucketStart: "2026-09-22T00:00:00.000Z",
        value: 4999,
      });
      expect(trend.reduce((sum, p) => sum + p.value, 0)).toBe(7499);
    });

    it("buckets the last 90 days into UTC weeks starting Monday", () => {
      const a = makeStudent("a@example.com");
      // NOW is Tuesday 2026-09-22; 89 days earlier is Thursday 2026-06-25,
      // whose week starts Monday 2026-06-22.
      purchaseAt(a.id, base.course.id, 100, "2026-06-22T00:00:00.000Z");
      purchaseAt(a.id, base.course.id, 7, "2026-06-21T23:59:59.000Z"); // excluded
      purchaseAt(a.id, base.course.id, 200, "2026-09-20T23:59:59.000Z"); // Sunday
      purchaseAt(a.id, base.course.id, 300, "2026-09-21T00:00:00.000Z"); // Monday

      const trend = getCourseRevenueTrend(base.course.id, "90d", NOW);

      expect(trend).toHaveLength(14);
      expect(trend[0]).toEqual({
        bucketStart: "2026-06-22T00:00:00.000Z",
        value: 100,
      });
      expect(trend[12]).toEqual({
        bucketStart: "2026-09-14T00:00:00.000Z",
        value: 200,
      });
      expect(trend[13]).toEqual({
        bucketStart: "2026-09-21T00:00:00.000Z",
        value: 300,
      });
      expect(trend.reduce((sum, p) => sum + p.value, 0)).toBe(600);
    });

    it("spans all-time weekly from the week of the first purchase", () => {
      const a = makeStudent("a@example.com");
      purchaseAt(a.id, base.course.id, 100, "2026-03-04T12:00:00.000Z"); // Wed
      purchaseAt(a.id, base.course.id, 200, "2026-09-22T09:00:00.000Z");

      const trend = getCourseRevenueTrend(base.course.id, "all", NOW);

      expect(trend).toHaveLength(30);
      expect(trend[0]).toEqual({
        bucketStart: "2026-03-02T00:00:00.000Z",
        value: 100,
      });
      expect(trend[29]).toEqual({
        bucketStart: "2026-09-21T00:00:00.000Z",
        value: 200,
      });
      expect(trend.filter((p) => p.value === 0)).toHaveLength(28);
    });

    it("is empty all-time when the course has no purchases", () => {
      expect(getCourseRevenueTrend(base.course.id, "all", NOW)).toEqual([]);
    });

    it("ignores purchases of other courses", () => {
      const other = makeCourse("other");
      const a = makeStudent("a@example.com");
      purchaseAt(a.id, other.id, 4999, "2026-09-22T09:00:00.000Z");
      const trend = getCourseRevenueTrend(base.course.id, "30d", NOW);
      expect(trend.every((p) => p.value === 0)).toBe(true);
    });
  });

  describe("getCourseEnrollmentTrend", () => {
    it("counts enrollments per day over 30d, whatever created them", () => {
      const a = makeStudent("a@example.com");
      const b = makeStudent("b@example.com");
      const c = makeStudent("c@example.com");
      enrollAt(a.id, base.course.id, "2026-09-22T01:00:00.000Z");
      enrollAt(b.id, base.course.id, "2026-09-22T08:00:00.000Z");
      enrollAt(c.id, base.course.id, "2026-08-24T00:00:00.000Z");
      const other = makeCourse("other");
      enrollAt(a.id, other.id, "2026-09-22T01:00:00.000Z");

      const trend = getCourseEnrollmentTrend(base.course.id, "30d", NOW);

      expect(trend).toHaveLength(30);
      expect(trend[0]).toEqual({
        bucketStart: "2026-08-24T00:00:00.000Z",
        value: 1,
      });
      expect(trend[29]).toEqual({
        bucketStart: "2026-09-22T00:00:00.000Z",
        value: 2,
      });
      expect(trend.reduce((sum, p) => sum + p.value, 0)).toBe(3);
    });

    it("spans all-time weekly from the week of the first enrollment", () => {
      const a = makeStudent("a@example.com");
      const b = makeStudent("b@example.com");
      enrollAt(a.id, base.course.id, "2026-08-30T12:00:00.000Z"); // Sunday
      enrollAt(b.id, base.course.id, "2026-09-22T09:00:00.000Z");

      const trend = getCourseEnrollmentTrend(base.course.id, "all", NOW);

      expect(trend.map((p) => p.bucketStart)).toEqual([
        "2026-08-24T00:00:00.000Z",
        "2026-08-31T00:00:00.000Z",
        "2026-09-07T00:00:00.000Z",
        "2026-09-14T00:00:00.000Z",
        "2026-09-21T00:00:00.000Z",
      ]);
      expect(trend.map((p) => p.value)).toEqual([1, 0, 0, 0, 1]);
    });

    it("is empty all-time when the course has no enrollments", () => {
      expect(getCourseEnrollmentTrend(base.course.id, "all", NOW)).toEqual([]);
    });
  });

  describe("getCourseProgress", () => {
    it("reports 0% completion and an empty funnel for a course with no enrollments", () => {
      const progress = getCourseProgress(base.course.id);
      expect(progress.enrollments).toBe(0);
      expect(progress.completed).toBe(0);
      expect(progress.completionRate).toBe(0);
      expect(progress.dropOff).toEqual([]);
    });

    it("computes completion rate as completed enrollments over all enrollments", () => {
      const students = ["a", "b", "c", "d"].map((n) =>
        makeStudent(`${n}@example.com`)
      );
      for (const s of students) enrollUser(s.id, base.course.id, false, false);
      markEnrollmentComplete(students[0].id, base.course.id);
      markEnrollmentComplete(students[1].id, base.course.id);

      const progress = getCourseProgress(base.course.id);
      expect(progress.enrollments).toBe(4);
      expect(progress.completed).toBe(2);
      expect(progress.completionRate).toBe(50);
    });

    it("lists every lesson in module then lesson order with enrolled as the denominator", () => {
      // Created out of order so position, not id, must drive the ordering.
      const second = createModule(base.course.id, "Second", 2);
      const first = createModule(base.course.id, "First", 1);
      const l3 = makeLesson(second.id, "Lesson 3");
      const l2 = createLesson(first.id, "Lesson 2", null, null, 2, null);
      const l1 = createLesson(first.id, "Lesson 1", null, null, 1, null);

      const [s1, s2, s3, s4] = ["s1", "s2", "s3", "s4"].map((n) =>
        makeStudent(`${n}@example.com`)
      );
      for (const s of [s1, s2, s3, s4]) {
        enrollUser(s.id, base.course.id, false, false);
      }
      markLessonComplete(s1.id, l1.id);
      markLessonComplete(s1.id, l2.id);
      markLessonComplete(s1.id, l3.id);
      markLessonComplete(s2.id, l1.id);
      markLessonComplete(s2.id, l2.id);
      markLessonComplete(s3.id, l1.id);
      markLessonInProgress(s3.id, l2.id); // in progress is not completed
      // Progress from someone who is not enrolled does not count.
      const outsider = makeStudent("outsider@example.com");
      markLessonComplete(outsider.id, l1.id);

      const { dropOff } = getCourseProgress(base.course.id);

      expect(dropOff).toEqual([
        {
          lessonId: l1.id,
          title: "Lesson 1",
          moduleTitle: "First",
          completed: 3,
          percent: 75,
        },
        {
          lessonId: l2.id,
          title: "Lesson 2",
          moduleTitle: "First",
          completed: 2,
          percent: 50,
        },
        {
          lessonId: l3.id,
          title: "Lesson 3",
          moduleTitle: "Second",
          completed: 1,
          percent: 25,
        },
      ]);
    });

    it("shows every lesson at 0% when the course has lessons but no enrollments", () => {
      const mod = createModule(base.course.id, "Only", 1);
      makeLesson(mod.id, "Lesson 1");
      makeLesson(mod.id, "Lesson 2");
      const { dropOff } = getCourseProgress(base.course.id);
      expect(dropOff.map((d) => [d.title, d.completed, d.percent])).toEqual([
        ["Lesson 1", 0, 0],
        ["Lesson 2", 0, 0],
      ]);
    });
  });

  describe("getCourseSales", () => {
    it("returns zero revenue and purchases for a course with no purchases", () => {
      expect(getCourseSales(base.course.id)).toEqual({
        revenue: 0,
        purchases: 0,
      });
    });

    it("returns zero data for a draft course", () => {
      const draft = makeCourse("draft", schema.CourseStatus.Draft);
      expect(getCourseSales(draft.id)).toEqual({ revenue: 0, purchases: 0 });
      expect(getCourseReach(draft.id)).toEqual({ enrollments: 0 });
    });

    it("counts a free purchase even though it adds no revenue", () => {
      const a = makeStudent("a@example.com");
      createPurchase(a.id, base.course.id, 0, "US");
      expect(getCourseSales(base.course.id)).toEqual({
        revenue: 0,
        purchases: 1,
      });
    });

    it("sums individual purchases at the price actually paid", () => {
      const a = makeStudent("a@example.com");
      const b = makeStudent("b@example.com");
      createPurchase(a.id, base.course.id, 4999, "US");
      createPurchase(b.id, base.course.id, 2500, "IN"); // PPP-discounted
      expect(getCourseSales(base.course.id).revenue).toBe(7499);
    });

    it("counts a team purchase once at purchase time, not per redeemed seat", () => {
      const buyer = makeStudent("buyer@example.com");
      const { coupons } = createTeamPurchase(
        buyer.id,
        base.course.id,
        12000,
        "US",
        3
      );
      expect(getCourseSales(base.course.id).revenue).toBe(12000);

      const member = makeStudent("member@example.com");
      const result = redeemCoupon(coupons[0].code, member.id, "US");
      expect(result.ok).toBe(true);
      expect(getCourseSales(base.course.id).revenue).toBe(12000);
    });

    it("mixes individual and team purchases", () => {
      const a = makeStudent("a@example.com");
      const buyer = makeStudent("buyer@example.com");
      createPurchase(a.id, base.course.id, 4999, "US");
      createTeamPurchase(buyer.id, base.course.id, 12000, "US", 3);
      expect(getCourseSales(base.course.id)).toEqual({
        revenue: 16999,
        purchases: 2,
      });
    });

    it("ignores purchases of other courses", () => {
      const other = makeCourse("other");
      const a = makeStudent("a@example.com");
      createPurchase(a.id, other.id, 4999, "US");
      expect(getCourseSales(base.course.id).revenue).toBe(0);
    });

    it("still reports revenue for an archived course", () => {
      const archived = makeCourse("archived", schema.CourseStatus.Archived);
      const a = makeStudent("a@example.com");
      createPurchase(a.id, archived.id, 4999, "US");
      expect(getCourseSales(archived.id).revenue).toBe(4999);
    });
  });

  describe("getCourseReach", () => {
    it("returns zero enrollments for a course with no students", () => {
      expect(getCourseReach(base.course.id)).toEqual({ enrollments: 0 });
    });

    it("counts enrollments regardless of how they were created", () => {
      const a = makeStudent("a@example.com");
      const buyer = makeStudent("buyer@example.com");
      const member = makeStudent("member@example.com");
      enrollUser(a.id, base.course.id, false, false);
      const { coupons } = createTeamPurchase(
        buyer.id,
        base.course.id,
        12000,
        "US",
        2
      );
      redeemCoupon(coupons[0].code, member.id, "US");
      expect(getCourseReach(base.course.id).enrollments).toBe(2);
    });

    it("ignores enrollments in other courses", () => {
      const other = makeCourse("other");
      const a = makeStudent("a@example.com");
      enrollUser(a.id, other.id, false, false);
      expect(getCourseReach(base.course.id).enrollments).toBe(0);
    });
  });
});
