import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { setCurrentUserId } from "~/lib/session";

let testDb: ReturnType<typeof createTestDb>;
let base: ReturnType<typeof seedBaseData>;

vi.mock("~/db", () => ({
  get db() {
    return testDb;
  },
}));

import { requireCourseAccess } from "./courseAccess";

async function requestAs(userId: number | null) {
  const anonymous = new Request("http://localhost/instructor/1/students");
  if (userId === null) return anonymous;
  const cookie = await setCurrentUserId(anonymous, userId);
  return new Request("http://localhost/instructor/1/students", {
    headers: { Cookie: cookie },
  });
}

function makeUser(role: schema.UserRole, email: string) {
  return testDb
    .insert(schema.users)
    .values({ name: email, email, role })
    .returning()
    .get();
}

async function expectThrown(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error as { data: unknown; init?: { status?: number } };
  }
  throw new Error("Expected requireCourseAccess to throw");
}

describe("requireCourseAccess", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
  });

  it("returns the user and course for the owning instructor", async () => {
    const request = await requestAs(base.instructor.id);
    const result = await requireCourseAccess(request, String(base.course.id));
    expect(result.user.id).toBe(base.instructor.id);
    expect(result.course.id).toBe(base.course.id);
  });

  it("lets an admin access any course", async () => {
    const admin = makeUser(schema.UserRole.Admin, "admin@example.com");
    const request = await requestAs(admin.id);
    const result = await requireCourseAccess(request, String(base.course.id));
    expect(result.user.id).toBe(admin.id);
    expect(result.course.id).toBe(base.course.id);
  });

  it("throws 401 with the caller's sign-in message when not logged in", async () => {
    const request = await requestAs(null);
    const error = await expectThrown(
      requireCourseAccess(request, String(base.course.id), {
        signInRequired: "Sign in to see this.",
      })
    );
    expect(error.init?.status).toBe(401);
    expect(error.data).toBe("Sign in to see this.");
  });

  it("throws 403 when the session points at a user that no longer exists", async () => {
    const request = await requestAs(9999);
    const error = await expectThrown(
      requireCourseAccess(request, String(base.course.id))
    );
    expect(error.init?.status).toBe(403);
    expect(error.data).toBe("Only instructors and admins can access this page.");
  });

  it("throws 403 for a student", async () => {
    const request = await requestAs(base.user.id);
    const error = await expectThrown(
      requireCourseAccess(request, String(base.course.id))
    );
    expect(error.init?.status).toBe(403);
    expect(error.data).toBe("Only instructors and admins can access this page.");
  });

  it("throws 400 for a non-numeric course id", async () => {
    const request = await requestAs(base.instructor.id);
    const error = await expectThrown(requireCourseAccess(request, "abc"));
    expect(error.init?.status).toBe(400);
    expect(error.data).toBe("Invalid course ID.");
  });

  it("throws 404 for a missing course", async () => {
    const request = await requestAs(base.instructor.id);
    const error = await expectThrown(requireCourseAccess(request, "9999"));
    expect(error.init?.status).toBe(404);
    expect(error.data).toBe("Course not found.");
  });

  it("throws 403 with the caller's message for another instructor's course", async () => {
    const other = makeUser(schema.UserRole.Instructor, "other@example.com");
    const request = await requestAs(other.id);
    const error = await expectThrown(
      requireCourseAccess(request, String(base.course.id), {
        notOwner: "Not your course.",
      })
    );
    expect(error.init?.status).toBe(403);
    expect(error.data).toBe("Not your course.");
  });

  it("checks role before course id, matching the original ordering", async () => {
    const request = await requestAs(base.user.id);
    const error = await expectThrown(requireCourseAccess(request, "abc"));
    expect(error.init?.status).toBe(403);
  });
});
