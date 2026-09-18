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
  createComment,
  getCommentById,
  softDeleteComment,
  getCommentsForLesson,
} from "./commentService";

function makeStudent(name: string, email: string) {
  return testDb
    .insert(schema.users)
    .values({ name, email, role: schema.UserRole.Student })
    .returning()
    .get();
}

function makeLesson(title: string, position: number) {
  const mod = testDb
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: `Module ${position}`, position })
    .returning()
    .get();

  return testDb
    .insert(schema.lessons)
    .values({ moduleId: mod.id, title, position })
    .returning()
    .get();
}

describe("commentService", () => {
  let lesson: ReturnType<typeof makeLesson>;

  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
    lesson = makeLesson("Intro", 1);
  });

  describe("createComment", () => {
    it("creates a top-level comment", () => {
      const comment = createComment(base.user.id, lesson.id, "How does this work?");
      expect(comment).toBeDefined();
      expect(comment!.body).toBe("How does this work?");
      expect(comment!.parentId).toBeNull();
      expect(comment!.deletedAt).toBeNull();
    });

    it("trims whitespace and rejects empty bodies", () => {
      const comment = createComment(base.user.id, lesson.id, "  spaced  ");
      expect(comment!.body).toBe("spaced");

      expect(() => createComment(base.user.id, lesson.id, "   ")).toThrow();
      expect(() => createComment(base.user.id, lesson.id, "")).toThrow();
    });

    it("creates a reply to a top-level comment", () => {
      const parent = createComment(base.user.id, lesson.id, "A question");
      const reply = createComment(
        base.instructor.id,
        lesson.id,
        "An answer",
        parent!.id
      );
      expect(reply!.parentId).toBe(parent!.id);
    });

    it("rejects replies to comments that don't exist", () => {
      expect(() =>
        createComment(base.user.id, lesson.id, "reply", 9999)
      ).toThrow();
    });

    it("rejects replies to a comment on a different lesson", () => {
      const otherLesson = makeLesson("Other", 2);
      const parent = createComment(base.user.id, otherLesson.id, "elsewhere");
      expect(() =>
        createComment(base.user.id, lesson.id, "reply", parent!.id)
      ).toThrow();
    });

    it("rejects replies nested more than one level deep", () => {
      const parent = createComment(base.user.id, lesson.id, "top");
      const reply = createComment(
        base.instructor.id,
        lesson.id,
        "reply",
        parent!.id
      );
      expect(() =>
        createComment(base.user.id, lesson.id, "reply to reply", reply!.id)
      ).toThrow();
    });

    it("rejects replies to a deleted comment", () => {
      const parent = createComment(base.user.id, lesson.id, "top");
      softDeleteComment(parent!.id);
      expect(() =>
        createComment(base.user.id, lesson.id, "late reply", parent!.id)
      ).toThrow();
    });
  });

  describe("getCommentsForLesson", () => {
    it("returns an empty array when there are no comments", () => {
      expect(getCommentsForLesson(lesson.id)).toEqual([]);
    });

    it("returns top-level comments newest-first with author info", () => {
      createComment(base.user.id, lesson.id, "first");
      createComment(base.instructor.id, lesson.id, "second");

      const threads = getCommentsForLesson(lesson.id);
      expect(threads.map((t) => t.body)).toEqual(["second", "first"]);
      expect(threads[0].author).toMatchObject({
        id: base.instructor.id,
        name: base.instructor.name,
        role: schema.UserRole.Instructor,
      });
    });

    it("nests replies chronologically under their parent", () => {
      const parent = createComment(base.user.id, lesson.id, "question");
      const s2 = makeStudent("Student Two", "s2@example.com");
      createComment(base.instructor.id, lesson.id, "answer one", parent!.id);
      createComment(s2.id, lesson.id, "answer two", parent!.id);

      const [thread] = getCommentsForLesson(lesson.id);
      expect(thread.replies.map((r) => r.body)).toEqual([
        "answer one",
        "answer two",
      ]);
    });

    it("scopes comments to a single lesson", () => {
      const otherLesson = makeLesson("Other", 2);
      createComment(base.user.id, lesson.id, "here");
      createComment(base.user.id, otherLesson.id, "there");

      expect(getCommentsForLesson(lesson.id).map((t) => t.body)).toEqual([
        "here",
      ]);
    });
  });

  describe("softDeleteComment", () => {
    it("stamps deletedAt and is idempotent", () => {
      const comment = createComment(base.user.id, lesson.id, "oops");
      const deleted = softDeleteComment(comment!.id);
      expect(deleted!.deletedAt).not.toBeNull();

      // Second delete is a no-op (already deleted → nothing returned).
      expect(softDeleteComment(comment!.id)).toBeUndefined();
      expect(getCommentById(comment!.id)!.deletedAt).toBe(deleted!.deletedAt);
    });

    it("hides a lone deleted top-level comment", () => {
      const comment = createComment(base.user.id, lesson.id, "gone");
      softDeleteComment(comment!.id);
      expect(getCommentsForLesson(lesson.id)).toEqual([]);
    });

    it("keeps a deleted top-level comment as a tombstone when it has replies", () => {
      const parent = createComment(base.user.id, lesson.id, "bad question");
      createComment(base.instructor.id, lesson.id, "still answered", parent!.id);
      softDeleteComment(parent!.id);

      const [thread] = getCommentsForLesson(lesson.id);
      expect(thread.deleted).toBe(true);
      expect(thread.body).toBeNull();
      expect(thread.author).toBeNull();
      expect(thread.replies).toHaveLength(1);
      expect(thread.replies[0].body).toBe("still answered");
    });

    it("renders a deleted reply as a tombstone", () => {
      const parent = createComment(base.user.id, lesson.id, "question");
      const reply = createComment(
        base.instructor.id,
        lesson.id,
        "spam",
        parent!.id
      );
      softDeleteComment(reply!.id);

      const [thread] = getCommentsForLesson(lesson.id);
      expect(thread.replies[0].deleted).toBe(true);
      expect(thread.replies[0].body).toBeNull();
      expect(thread.replies[0].author).toBeNull();
    });
  });
});
