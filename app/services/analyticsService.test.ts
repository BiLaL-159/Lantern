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
  getCourseSentiment,
  getInstructorRollup,
  getPlatformTotals,
  getTopCourses,
  getPlatformRevenueTrend,
  getPlatformEnrollmentTrend,
  getNewUsersTrend,
} from "./analyticsService";
import { createPurchase, createTeamPurchase } from "./purchaseService";
import { redeemCoupon } from "./couponService";
import { enrollUser, markEnrollmentComplete } from "./enrollmentService";
import { createModule } from "./moduleService";
import { createLesson } from "./lessonService";
import { markLessonComplete, markLessonInProgress } from "./progressService";
import { upsertRating } from "./ratingService";
import { createComment, softDeleteComment } from "./commentService";

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

    it("buckets the last 90 days weekly and excludes the second before it opens", () => {
      const a = makeStudent("a@example.com");
      const b = makeStudent("b@example.com");
      const c = makeStudent("c@example.com");
      enrollAt(a.id, base.course.id, "2026-06-22T00:00:00.000Z"); // first Monday
      enrollAt(b.id, base.course.id, "2026-06-21T23:59:59.000Z"); // excluded
      enrollAt(c.id, base.course.id, "2026-09-21T00:00:00.000Z"); // last Monday

      const trend = getCourseEnrollmentTrend(base.course.id, "90d", NOW);

      expect(trend).toHaveLength(14);
      expect(trend[0]).toEqual({
        bucketStart: "2026-06-22T00:00:00.000Z",
        value: 1,
      });
      expect(trend[13]).toEqual({
        bucketStart: "2026-09-21T00:00:00.000Z",
        value: 1,
      });
      expect(trend.reduce((sum, p) => sum + p.value, 0)).toBe(2);
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
        individualPurchases: 0,
        teamPurchases: 0,
      });
    });

    it("returns zero data for a draft course", () => {
      const draft = makeCourse("draft", schema.CourseStatus.Draft);
      expect(getCourseSales(draft.id)).toEqual({
        revenue: 0,
        purchases: 0,
        individualPurchases: 0,
        teamPurchases: 0,
      });
      expect(getCourseReach(draft.id)).toEqual({
        enrollments: 0,
        notStarted: 0,
        notStartedPercent: 0,
        seatsSold: 0,
        seatsRedeemed: 0,
      });
    });

    it("counts a free purchase even though it adds no revenue", () => {
      const a = makeStudent("a@example.com");
      createPurchase(a.id, base.course.id, 0, "US");
      expect(getCourseSales(base.course.id)).toEqual({
        revenue: 0,
        purchases: 1,
        individualPurchases: 1,
        teamPurchases: 0,
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
        individualPurchases: 1,
        teamPurchases: 1,
      });
    });

    it("splits purchases into individual and team by whether seats were issued", () => {
      const a = makeStudent("a@example.com");
      const b = makeStudent("b@example.com");
      const buyer = makeStudent("buyer@example.com");
      createPurchase(a.id, base.course.id, 4999, "US");
      createPurchase(b.id, base.course.id, 2500, "IN");
      createTeamPurchase(buyer.id, base.course.id, 12000, "US", 3);
      const { coupons } = createTeamPurchase(
        buyer.id,
        base.course.id,
        8000,
        "US",
        2
      );
      redeemCoupon(coupons[0].code, a.id, "US");

      const sales = getCourseSales(base.course.id);
      expect(sales.purchases).toBe(4);
      expect(sales.individualPurchases).toBe(2);
      expect(sales.teamPurchases).toBe(2);
    });

    it("reports zero team purchases for a course sold only individually", () => {
      const a = makeStudent("a@example.com");
      createPurchase(a.id, base.course.id, 4999, "US");
      const sales = getCourseSales(base.course.id);
      expect(sales.individualPurchases).toBe(1);
      expect(sales.teamPurchases).toBe(0);
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
      expect(getCourseReach(base.course.id)).toEqual({
        enrollments: 0,
        notStarted: 0,
        notStartedPercent: 0,
        seatsSold: 0,
        seatsRedeemed: 0,
      });
    });

    it("counts enrolled students with no progress on any lesson as not started", () => {
      const mod = createModule(base.course.id, "Only", 1);
      const l1 = makeLesson(mod.id, "Lesson 1");
      const other = makeCourse("other");
      const otherLesson = makeLesson(createModule(other.id, "M", 1).id, "L");

      const [s1, s2, s3] = ["s1", "s2", "s3"].map((n) =>
        makeStudent(`${n}@example.com`)
      );
      for (const s of [s1, s2, s3]) {
        enrollUser(s.id, base.course.id, false, false);
      }
      markLessonComplete(s1.id, l1.id);
      markLessonInProgress(s2.id, l1.id); // in progress still counts as started
      enrollUser(s3.id, other.id, false, false);
      markLessonComplete(s3.id, otherLesson.id); // progress elsewhere doesn't

      const reach = getCourseReach(base.course.id);
      expect(reach.enrollments).toBe(3);
      expect(reach.notStarted).toBe(1);
      expect(reach.notStartedPercent).toBe(33);
    });

    it("reports seats sold vs redeemed across the course's team purchases", () => {
      const buyer = makeStudent("buyer@example.com");
      const m1 = makeStudent("m1@example.com");
      const m2 = makeStudent("m2@example.com");
      const first = createTeamPurchase(
        buyer.id,
        base.course.id,
        12000,
        "US",
        3
      );
      createTeamPurchase(buyer.id, base.course.id, 8000, "US", 2);
      redeemCoupon(first.coupons[0].code, m1.id, "US");
      redeemCoupon(first.coupons[1].code, m2.id, "US");
      // Seats for another course don't count.
      const other = makeCourse("other");
      createTeamPurchase(buyer.id, other.id, 8000, "US", 4);

      const reach = getCourseReach(base.course.id);
      expect(reach.seatsSold).toBe(5);
      expect(reach.seatsRedeemed).toBe(2);
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

  describe("getCourseSentiment", () => {
    it("reports no average, an all-zero distribution and no comments for a fresh course", () => {
      expect(getCourseSentiment(base.course.id)).toEqual({
        average: null,
        count: 0,
        distribution: [
          { rating: 5, count: 0, percent: 0 },
          { rating: 4, count: 0, percent: 0 },
          { rating: 3, count: 0, percent: 0 },
          { rating: 2, count: 0, percent: 0 },
          { rating: 1, count: 0, percent: 0 },
        ],
        comments: 0,
      });
    });

    it("averages ratings and shares each star, highest first, with zeros for unused stars", () => {
      const students = ["a", "b", "c", "d", "e"].map((n) =>
        makeStudent(`${n}@example.com`)
      );
      upsertRating(students[0].id, base.course.id, 5);
      upsertRating(students[1].id, base.course.id, 5);
      upsertRating(students[2].id, base.course.id, 4);
      upsertRating(students[3].id, base.course.id, 1);
      // Re-rating replaces the earlier rating rather than adding one.
      upsertRating(students[4].id, base.course.id, 2);
      upsertRating(students[4].id, base.course.id, 4);

      const sentiment = getCourseSentiment(base.course.id);
      expect(sentiment.average).toBeCloseTo(3.8);
      expect(sentiment.count).toBe(5);
      expect(sentiment.distribution).toEqual([
        { rating: 5, count: 2, percent: 40 },
        { rating: 4, count: 2, percent: 40 },
        { rating: 3, count: 0, percent: 0 },
        { rating: 2, count: 0, percent: 0 },
        { rating: 1, count: 1, percent: 20 },
      ]);
    });

    it("ignores ratings on other courses", () => {
      const other = makeCourse("other");
      const a = makeStudent("a@example.com");
      upsertRating(a.id, other.id, 5);
      const sentiment = getCourseSentiment(base.course.id);
      expect(sentiment.average).toBeNull();
      expect(sentiment.count).toBe(0);
    });

    it("counts comments across every lesson including replies, excluding deleted ones", () => {
      const m1 = createModule(base.course.id, "M1", 1);
      const m2 = createModule(base.course.id, "M2", 2);
      const l1 = makeLesson(m1.id, "L1");
      const l2 = makeLesson(m2.id, "L2");
      const a = makeStudent("a@example.com");
      const b = makeStudent("b@example.com");

      const top = createComment(a.id, l1.id, "Question");
      createComment(b.id, l1.id, "Answer", top.id); // reply counts
      createComment(a.id, l2.id, "Another lesson");
      const gone = createComment(b.id, l2.id, "Removed");
      softDeleteComment(gone.id);
      // A reply under a deleted parent is still a live comment.
      const parent = createComment(a.id, l2.id, "Parent");
      createComment(b.id, l2.id, "Reply", parent.id);
      softDeleteComment(parent.id);
      // Comments on another course's lessons don't count.
      const other = makeCourse("other");
      const otherLesson = makeLesson(createModule(other.id, "M", 1).id, "L");
      createComment(a.id, otherLesson.id, "Elsewhere");

      expect(getCourseSentiment(base.course.id).comments).toBe(4);
    });
  });

  describe("getInstructorRollup", () => {
    function makeInstructor(email: string) {
      return testDb
        .insert(schema.users)
        .values({ name: email, email, role: schema.UserRole.Instructor })
        .returning()
        .get();
    }

    it("returns zero totals and no courses for an instructor with no courses", () => {
      const nobody = makeInstructor("nobody@example.com");
      expect(getInstructorRollup(nobody.id)).toEqual({
        totals: {
          revenue: 0,
          enrollments: 0,
          activeCourses: 0,
          averageRating: null,
          ratingCount: 0,
        },
        courses: [],
      });
    });

    it("aggregates across the instructor's courses, including a draft and an archived one", () => {
      // base.course is published. Add a draft and an archived course.
      const archived = makeCourse("archived", schema.CourseStatus.Archived);
      const draft = makeCourse("draft", schema.CourseStatus.Draft);
      const [a, b, c, d] = ["a", "b", "c", "d"].map((n) =>
        makeStudent(`${n}@example.com`)
      );

      // Published: 2 purchases, 3 enrollments, 1 completed, ratings 5 and 3.
      purchaseAt(a.id, base.course.id, 4999, "2026-09-01T00:00:00.000Z");
      purchaseAt(b.id, base.course.id, 2500, "2026-09-02T00:00:00.000Z");
      for (const s of [a, b, c]) enrollUser(s.id, base.course.id, false, false);
      markEnrollmentComplete(a.id, base.course.id);
      upsertRating(a.id, base.course.id, 5);
      upsertRating(b.id, base.course.id, 3);

      // Archived: history is kept. 1 purchase, 1 enrollment, rating 1.
      purchaseAt(d.id, archived.id, 10000, "2026-01-01T00:00:00.000Z");
      enrollUser(d.id, archived.id, false, false);
      upsertRating(d.id, archived.id, 1);

      // Another instructor's course must not leak in.
      const other = makeInstructor("other@example.com");
      const theirs = testDb
        .insert(schema.courses)
        .values({
          title: "theirs",
          slug: "theirs",
          description: "desc",
          instructorId: other.id,
          categoryId: base.category.id,
          status: schema.CourseStatus.Published,
        })
        .returning()
        .get();
      purchaseAt(c.id, theirs.id, 99999, "2026-09-03T00:00:00.000Z");
      enrollUser(c.id, theirs.id, false, false);
      upsertRating(c.id, theirs.id, 5);

      const rollup = getInstructorRollup(base.instructor.id);

      expect(rollup.totals).toEqual({
        revenue: 17499,
        enrollments: 4,
        activeCourses: 1,
        // Mean over all three ratings (5, 3, 1), not of per-course means.
        averageRating: 3,
        ratingCount: 3,
      });
      // Highest revenue first, then title.
      expect(rollup.courses).toEqual([
        {
          courseId: archived.id,
          title: "archived",
          status: schema.CourseStatus.Archived,
          instructorName: "Test Instructor",
          revenue: 10000,
          enrollments: 1,
          completionRate: 0,
          averageRating: 1,
          ratingCount: 1,
        },
        {
          courseId: base.course.id,
          title: "Test Course",
          status: schema.CourseStatus.Published,
          instructorName: "Test Instructor",
          revenue: 7499,
          enrollments: 3,
          completionRate: 33,
          averageRating: 4,
          ratingCount: 2,
        },
        {
          courseId: draft.id,
          title: "draft",
          status: schema.CourseStatus.Draft,
          instructorName: "Test Instructor",
          revenue: 0,
          enrollments: 0,
          completionRate: 0,
          averageRating: null,
          ratingCount: 0,
        },
      ]);
    });

    it("weights the average rating by ratings, not by courses", () => {
      const second = makeCourse("second");
      const students = ["a", "b", "c", "d"].map((n) =>
        makeStudent(`${n}@example.com`)
      );
      // Four 5-star ratings on one course, one 1-star on the other:
      // mean over ratings is 4.2; mean of course means would be 3.
      for (const s of students.slice(0, 3)) {
        upsertRating(s.id, base.course.id, 5);
      }
      upsertRating(students[3].id, base.course.id, 5);
      upsertRating(students[0].id, second.id, 1);

      const { totals } = getInstructorRollup(base.instructor.id);
      expect(totals.averageRating).toBeCloseTo(4.2);
      expect(totals.ratingCount).toBe(5);
    });
  });

  describe("getPlatformTotals", () => {
    it("returns zeros on an empty platform apart from the seeded users and course", () => {
      expect(getPlatformTotals()).toEqual({
        revenue: 0,
        users: 2, // seedBaseData: one student, one instructor
        enrollments: 0,
        activeCourses: 1,
        courses: 1,
      });
    });

    it("counts archived courses in revenue and enrollments but not as active", () => {
      const archived = makeCourse("archived", schema.CourseStatus.Archived);
      makeCourse("draft", schema.CourseStatus.Draft);
      const [a, b] = ["a", "b"].map((n) => makeStudent(`${n}@example.com`));
      purchaseAt(a.id, base.course.id, 4999, "2026-09-01T00:00:00.000Z");
      purchaseAt(b.id, archived.id, 10000, "2026-01-01T00:00:00.000Z");
      enrollUser(a.id, base.course.id, false, false);
      enrollUser(b.id, archived.id, false, false);
      enrollUser(a.id, archived.id, false, false);

      expect(getPlatformTotals()).toEqual({
        revenue: 14999,
        users: 4,
        enrollments: 3,
        activeCourses: 1,
        courses: 3,
      });
    });
  });

  describe("getTopCourses", () => {
    function seedThreeCourses() {
      const cheap = makeCourse("cheap");
      const popular = makeCourse("popular", schema.CourseStatus.Archived);
      const [a, b, c] = ["a", "b", "c"].map((n) =>
        makeStudent(`${n}@example.com`)
      );
      // base.course: most revenue, one enrollment, rated 3.
      purchaseAt(a.id, base.course.id, 20000, "2026-09-01T00:00:00.000Z");
      enrollUser(a.id, base.course.id, false, false);
      upsertRating(a.id, base.course.id, 3);
      // popular: three enrollments, rated 5 and 4.
      purchaseAt(b.id, popular.id, 100, "2026-09-01T00:00:00.000Z");
      for (const s of [a, b, c]) enrollUser(s.id, popular.id, false, false);
      upsertRating(b.id, popular.id, 5);
      upsertRating(c.id, popular.id, 4);
      // cheap: some revenue, no enrollments, no ratings.
      purchaseAt(c.id, cheap.id, 500, "2026-09-01T00:00:00.000Z");
      return { cheap, popular };
    }

    it("sorts by revenue descending by default, with the instructor named", () => {
      const { cheap, popular } = seedThreeCourses();
      const rows = getTopCourses("revenue");
      expect(rows.map((r) => [r.courseId, r.revenue])).toEqual([
        [base.course.id, 20000],
        [cheap.id, 500],
        [popular.id, 100],
      ]);
      expect(rows[0]).toMatchObject({
        title: "Test Course",
        status: schema.CourseStatus.Published,
        instructorName: "Test Instructor",
        enrollments: 1,
        completionRate: 0,
        averageRating: 3,
        ratingCount: 1,
      });
    });

    it("sorts by enrollments descending, breaking ties by title", () => {
      const { cheap, popular } = seedThreeCourses();
      const rows = getTopCourses("enrollments");
      expect(rows.map((r) => [r.courseId, r.enrollments])).toEqual([
        [popular.id, 3],
        [base.course.id, 1],
        [cheap.id, 0],
      ]);
    });

    it("sorts by average rating descending with unrated courses last", () => {
      const { cheap, popular } = seedThreeCourses();
      const rows = getTopCourses("rating");
      expect(rows.map((r) => [r.courseId, r.averageRating])).toEqual([
        [popular.id, 4.5],
        [base.course.id, 3],
        [cheap.id, null],
      ]);
    });

    it("includes draft and archived courses", () => {
      makeCourse("draft", schema.CourseStatus.Draft);
      makeCourse("archived", schema.CourseStatus.Archived);
      expect(
        getTopCourses("revenue")
          .map((r) => r.title)
          .sort()
      ).toEqual(["Test Course", "archived", "draft"]);
    });
  });

  describe("getPlatformRevenueTrend", () => {
    it("sums purchases across every course into the Window's buckets", () => {
      const second = makeCourse("second");
      const a = makeStudent("a@example.com");
      purchaseAt(a.id, base.course.id, 4999, "2026-09-22T09:00:00.000Z");
      purchaseAt(a.id, second.id, 2500, "2026-09-22T11:00:00.000Z");
      purchaseAt(a.id, second.id, 1000, "2026-09-01T00:00:00.000Z");
      // Before the 30d Window opens: excluded from it.
      purchaseAt(a.id, second.id, 700, "2026-08-23T23:59:59.000Z");

      const trend = getPlatformRevenueTrend("30d", NOW);

      expect(trend).toHaveLength(30);
      expect(trend[8]).toEqual({
        bucketStart: "2026-09-01T00:00:00.000Z",
        value: 1000,
      });
      // Both of today's purchases, on either side of NOW, land in today.
      expect(trend[29]).toEqual({
        bucketStart: "2026-09-22T00:00:00.000Z",
        value: 7499,
      });
      expect(trend.reduce((sum, point) => sum + point.value, 0)).toBe(8499);
    });
  });
  describe("getPlatformEnrollmentTrend", () => {
    it("counts enrollments across every course into weekly buckets", () => {
      const second = makeCourse("second");
      const [a, b] = ["a", "b"].map((n) => makeStudent(`${n}@example.com`));
      // The 90d grid opens on Monday 2026-06-22 (see the course Trends).
      enrollAt(a.id, base.course.id, "2026-06-22T00:00:00.000Z");
      enrollAt(a.id, second.id, "2026-06-21T23:59:59.000Z"); // excluded
      enrollAt(b.id, base.course.id, "2026-09-21T00:00:00.000Z");
      enrollAt(b.id, second.id, "2026-09-22T09:00:00.000Z");

      const trend = getPlatformEnrollmentTrend("90d", NOW);

      expect(trend).toHaveLength(14);
      expect(trend[0]).toEqual({
        bucketStart: "2026-06-22T00:00:00.000Z",
        value: 1,
      });
      // Both of this week's enrollments, on different courses, share a bucket.
      expect(trend[13]).toEqual({
        bucketStart: "2026-09-21T00:00:00.000Z",
        value: 2,
      });
      expect(trend.reduce((sum, point) => sum + point.value, 0)).toBe(3);
    });

    it("is empty all-time when nobody has enrolled", () => {
      expect(getPlatformEnrollmentTrend("all", NOW)).toEqual([]);
    });
  });
  describe("getNewUsersTrend", () => {
    // seedBaseData stamps its student and instructor with the real clock,
    // which would drift against NOW; pin them to a known instant instead.
    function pinSeededUsersTo(iso: string) {
      testDb.update(schema.users).set({ createdAt: iso }).run();
    }

    function makeUserAt(role: schema.UserRole, email: string, iso: string) {
      return testDb
        .insert(schema.users)
        .values({ name: email, email, role, createdAt: iso })
        .returning()
        .get();
    }

    function pointsFor(
      trend: ReturnType<typeof getNewUsersTrend>,
      role: schema.UserRole
    ) {
      return trend.find((series) => series.role === role)!.points;
    }

    it("splits the last 30 days by role, with zeros for empty days", () => {
      pinSeededUsersTo("2026-09-01T00:00:00.000Z");
      makeUserAt(
        schema.UserRole.Admin,
        "admin@example.com",
        "2026-09-22T09:00:00.000Z"
      );
      makeUserAt(
        schema.UserRole.Student,
        "late@example.com",
        "2026-09-22T11:00:00.000Z"
      );
      // Signed up before the Window opens: excluded.
      makeUserAt(
        schema.UserRole.Instructor,
        "old@example.com",
        "2026-08-23T23:59:59.000Z"
      );

      const trend = getNewUsersTrend("30d", NOW);

      expect(trend.map((series) => series.role)).toEqual([
        schema.UserRole.Student,
        schema.UserRole.Instructor,
        schema.UserRole.Admin,
      ]);

      const students = pointsFor(trend, schema.UserRole.Student);
      expect(students).toHaveLength(30);
      expect(students[8]).toEqual({
        bucketStart: "2026-09-01T00:00:00.000Z",
        value: 1,
      });
      expect(students[29]).toEqual({
        bucketStart: "2026-09-22T00:00:00.000Z",
        value: 1,
      });
      expect(students.filter((point) => point.value === 0)).toHaveLength(28);

      // The instructor from outside the Window is not counted.
      const instructors = pointsFor(trend, schema.UserRole.Instructor);
      expect(instructors.reduce((sum, point) => sum + point.value, 0)).toBe(1);
      expect(instructors[8].value).toBe(1);

      const admins = pointsFor(trend, schema.UserRole.Admin);
      expect(admins.reduce((sum, point) => sum + point.value, 0)).toBe(1);
      expect(admins[29].value).toBe(1);
    });

    it("buckets the last 90 days into UTC weeks starting Monday", () => {
      pinSeededUsersTo("2026-06-22T00:00:00.000Z");
      makeUserAt(
        schema.UserRole.Admin,
        "admin@example.com",
        "2026-09-21T00:00:00.000Z"
      );

      const trend = getNewUsersTrend("90d", NOW);

      expect(pointsFor(trend, schema.UserRole.Student)).toHaveLength(14);
      expect(pointsFor(trend, schema.UserRole.Student)[0]).toEqual({
        bucketStart: "2026-06-22T00:00:00.000Z",
        value: 1,
      });
      expect(pointsFor(trend, schema.UserRole.Admin)[13]).toEqual({
        bucketStart: "2026-09-21T00:00:00.000Z",
        value: 1,
      });
      // Every role is reported over the same grid, even with no signups.
      expect(pointsFor(trend, schema.UserRole.Admin)).toHaveLength(14);
      expect(pointsFor(trend, schema.UserRole.Instructor)[0].value).toBe(1);
    });

    it("spans all-time weekly from the week of the first signup", () => {
      pinSeededUsersTo("2026-03-04T12:00:00.000Z"); // Wednesday
      makeUserAt(
        schema.UserRole.Student,
        "late@example.com",
        "2026-09-22T09:00:00.000Z"
      );

      const trend = getNewUsersTrend("all", NOW);

      const students = pointsFor(trend, schema.UserRole.Student);
      expect(students).toHaveLength(30);
      expect(students[0]).toEqual({
        bucketStart: "2026-03-02T00:00:00.000Z",
        value: 1,
      });
      expect(students[29]).toEqual({
        bucketStart: "2026-09-21T00:00:00.000Z",
        value: 1,
      });
      // A role with no signups still spans the grid, all zeros.
      const admins = pointsFor(trend, schema.UserRole.Admin);
      expect(admins).toHaveLength(30);
      expect(admins.every((point) => point.value === 0)).toBe(true);
    });
  });
});
