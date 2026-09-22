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

import { getCourseSales, getCourseReach } from "./analyticsService";
import { createPurchase, createTeamPurchase } from "./purchaseService";
import { redeemCoupon } from "./couponService";
import { enrollUser } from "./enrollmentService";

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

describe("analyticsService", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
  });

  describe("getCourseSales", () => {
    it("returns zero revenue for a course with no purchases", () => {
      expect(getCourseSales(base.course.id)).toEqual({ revenue: 0 });
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
      expect(getCourseSales(base.course.id).revenue).toBe(16999);
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
