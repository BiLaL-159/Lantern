import { eq, asc, and, isNull } from "drizzle-orm";
import { db } from "~/db";
import { lessonComments, users, type UserRole } from "~/db/schema";

// ─── Comment Service ───
// Handles the per-lesson discussion board: top-level comments and one level of
// replies (a two-level thread). Deleted comments are soft-deleted so replies
// survive moderation. Uses positional parameters (project convention).

export type CommentAuthor = {
  id: number;
  name: string;
  avatarUrl: string | null;
  role: UserRole;
};

export type CommentReply = {
  id: number;
  parentId: number;
  body: string | null;
  deleted: boolean;
  createdAt: string;
  author: CommentAuthor | null;
};

export type CommentThread = {
  id: number;
  body: string | null;
  deleted: boolean;
  createdAt: string;
  author: CommentAuthor | null;
  replies: CommentReply[];
};

/**
 * Creates a comment on a lesson. Pass `parentId` to reply to an existing
 * top-level comment on the same lesson.
 *
 * Throws when the body is empty, or when replying to a comment that doesn't
 * exist, belongs to another lesson, or is itself a reply (threads are capped
 * at two levels).
 */
export function createComment(
  userId: number,
  lessonId: number,
  body: string,
  parentId: number | null = null
) {
  const trimmed = body.trim();
  if (trimmed.length === 0) {
    throw new Error("Comment cannot be empty");
  }

  if (parentId !== null) {
    const parent = getCommentById(parentId);
    if (!parent || parent.deletedAt !== null) {
      throw new Error("Cannot reply to a comment that no longer exists");
    }
    if (parent.lessonId !== lessonId) {
      throw new Error("Reply must belong to the same lesson as its parent");
    }
    if (parent.parentId !== null) {
      throw new Error("Replies cannot be nested more than one level deep");
    }
  }

  return db
    .insert(lessonComments)
    .values({ userId, lessonId, body: trimmed, parentId })
    .returning()
    .get();
}

export function getCommentById(id: number) {
  return db
    .select()
    .from(lessonComments)
    .where(eq(lessonComments.id, id))
    .get();
}

/**
 * Soft-deletes a comment by stamping `deletedAt`. Permission (author,
 * course instructor, or admin) is enforced by the caller. Idempotent.
 */
export function softDeleteComment(id: number) {
  return db
    .update(lessonComments)
    .set({ deletedAt: new Date().toISOString() })
    .where(and(eq(lessonComments.id, id), isNull(lessonComments.deletedAt)))
    .returning()
    .get();
}

/**
 * Returns the lesson's discussion as two-level threads, newest top-level
 * comment first with replies in chronological order.
 *
 * Deleted comments become tombstones (body/author nulled, `deleted: true`).
 * A deleted top-level comment is only kept if it still has replies, so lone
 * removed comments don't leave dangling tombstones.
 */
export function getCommentsForLesson(lessonId: number): CommentThread[] {
  const rows = db
    .select({
      id: lessonComments.id,
      parentId: lessonComments.parentId,
      body: lessonComments.body,
      deletedAt: lessonComments.deletedAt,
      createdAt: lessonComments.createdAt,
      authorId: users.id,
      authorName: users.name,
      authorAvatarUrl: users.avatarUrl,
      authorRole: users.role,
    })
    .from(lessonComments)
    .innerJoin(users, eq(lessonComments.userId, users.id))
    .where(eq(lessonComments.lessonId, lessonId))
    .orderBy(asc(lessonComments.createdAt))
    .all();

  const threadsById = new Map<number, CommentThread>();
  const topLevel: CommentThread[] = [];

  // First pass: top-level comments (rows arrive oldest-first).
  for (const row of rows) {
    if (row.parentId !== null) continue;
    const deleted = row.deletedAt !== null;
    const thread: CommentThread = {
      id: row.id,
      body: deleted ? null : row.body,
      deleted,
      createdAt: row.createdAt,
      author: deleted
        ? null
        : {
            id: row.authorId,
            name: row.authorName,
            avatarUrl: row.authorAvatarUrl,
            role: row.authorRole,
          },
      replies: [],
    };
    threadsById.set(row.id, thread);
    topLevel.push(thread);
  }

  // Second pass: attach replies to their parent thread (chronological).
  for (const row of rows) {
    if (row.parentId === null) continue;
    const parent = threadsById.get(row.parentId);
    if (!parent) continue;
    const deleted = row.deletedAt !== null;
    parent.replies.push({
      id: row.id,
      parentId: row.parentId,
      body: deleted ? null : row.body,
      deleted,
      createdAt: row.createdAt,
      author: deleted
        ? null
        : {
            id: row.authorId,
            name: row.authorName,
            avatarUrl: row.authorAvatarUrl,
            role: row.authorRole,
          },
    });
  }

  // Drop lone deleted top-level comments; keep deleted ones that have replies
  // (as tombstones). Newest thread first.
  return topLevel
    .filter((thread) => !thread.deleted || thread.replies.length > 0)
    .reverse();
}
