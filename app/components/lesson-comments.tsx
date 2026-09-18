import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { MessageSquare, Reply, Shield, Trash2 } from "lucide-react";
import { UserAvatar } from "~/components/user-avatar";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { UserRole } from "~/db/schema";
import { cn, formatRelativeTime } from "~/lib/utils";

// Prop shapes mirror the serialized loader data from getCommentsForLesson.
type Author = {
  id: number;
  name: string;
  avatarUrl: string | null;
  role: UserRole;
};

type Reply = {
  id: number;
  parentId: number;
  body: string | null;
  deleted: boolean;
  createdAt: string;
  author: Author | null;
};

type Thread = {
  id: number;
  body: string | null;
  deleted: boolean;
  createdAt: string;
  author: Author | null;
  replies: Reply[];
};

function RoleBadge({ role }: { role: UserRole }) {
  if (role === UserRole.Student) return null;
  const label = role === UserRole.Instructor ? "Instructor" : "Admin";
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
      <Shield className="size-2.5" />
      {label}
    </span>
  );
}

function Tombstone({ inset = false }: { inset?: boolean }) {
  return (
    <p className={cn("text-sm italic text-muted-foreground", inset && "pl-11")}>
      This comment was removed by a moderator.
    </p>
  );
}

function DeleteButton({
  commentId,
  isModerated,
}: {
  commentId: number;
  isModerated: boolean;
}) {
  const fetcher = useFetcher();
  const busy = fetcher.state !== "idle";
  return (
    <fetcher.Form method="post">
      <input type="hidden" name="intent" value="delete-comment" />
      <input type="hidden" name="commentId" value={commentId} />
      <button
        type="submit"
        disabled={busy}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
        aria-label={isModerated ? "Remove comment" : "Delete comment"}
      >
        <Trash2 className="size-3.5" />
        {isModerated ? "Remove" : "Delete"}
      </button>
    </fetcher.Form>
  );
}

/** Body plus optimistic reset once a submission settles. */
function CommentForm({
  parentId,
  placeholder,
  autoFocus = false,
  compact = false,
  onDone,
}: {
  parentId?: number;
  placeholder: string;
  autoFocus?: boolean;
  compact?: boolean;
  onDone?: () => void;
}) {
  const fetcher = useFetcher();
  const formRef = useRef<HTMLFormElement>(null);
  const busy = fetcher.state !== "idle";
  const submitted = useRef(false);

  useEffect(() => {
    if (busy) {
      submitted.current = true;
      return;
    }
    if (submitted.current && fetcher.data?.commentSuccess) {
      submitted.current = false;
      formRef.current?.reset();
      onDone?.();
    }
  }, [busy, fetcher.data, onDone]);

  return (
    <fetcher.Form ref={formRef} method="post" className="flex flex-col gap-2">
      <input type="hidden" name="intent" value="post-comment" />
      {parentId !== undefined && (
        <input type="hidden" name="parentId" value={parentId} />
      )}
      <Textarea
        name="body"
        required
        rows={compact ? 2 : 3}
        autoFocus={autoFocus}
        placeholder={placeholder}
        className="resize-none"
      />
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? "Posting…" : parentId !== undefined ? "Reply" : "Post"}
        </Button>
        {onDone && (
          <Button type="button" variant="ghost" size="sm" onClick={onDone}>
            Cancel
          </Button>
        )}
      </div>
    </fetcher.Form>
  );
}

function ReplyItem({
  reply,
  currentUserId,
  canModerate,
}: {
  reply: Reply;
  currentUserId: number | null;
  canModerate: boolean;
}) {
  if (reply.deleted) {
    return <Tombstone />;
  }

  const author = reply.author!;
  const canDelete = canModerate || author.id === currentUserId;

  return (
    <div className="flex gap-3">
      <UserAvatar
        name={author.name}
        avatarUrl={author.avatarUrl}
        className="size-7 shrink-0"
      />
      <div className="flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{author.name}</span>
          <RoleBadge role={author.role} />
          <span className="text-xs text-muted-foreground">
            {formatRelativeTime(reply.createdAt)}
          </span>
        </div>
        <p className="mt-0.5 whitespace-pre-wrap text-sm text-foreground/90">
          {reply.body}
        </p>
        {canDelete && (
          <div className="mt-1">
            <DeleteButton
              commentId={reply.id}
              isModerated={canModerate && author.id !== currentUserId}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function ThreadItem({
  thread,
  currentUserId,
  canPost,
  canModerate,
}: {
  thread: Thread;
  currentUserId: number | null;
  canPost: boolean;
  canModerate: boolean;
}) {
  const [replying, setReplying] = useState(false);
  const author = thread.author;
  const canDelete =
    !thread.deleted &&
    (canModerate || (author != null && author.id === currentUserId));

  return (
    <div className="rounded-lg border p-4">
      {thread.deleted ? (
        <Tombstone />
      ) : (
        <div className="flex gap-3">
          <UserAvatar
            name={author!.name}
            avatarUrl={author!.avatarUrl}
            className="size-8 shrink-0"
          />
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{author!.name}</span>
              <RoleBadge role={author!.role} />
              <span className="text-xs text-muted-foreground">
                {formatRelativeTime(thread.createdAt)}
              </span>
            </div>
            <p className="mt-0.5 whitespace-pre-wrap text-sm text-foreground/90">
              {thread.body}
            </p>
            <div className="mt-1 flex items-center gap-4">
              {canPost && (
                <button
                  type="button"
                  onClick={() => setReplying((v) => !v)}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Reply className="size-3.5" />
                  Reply
                </button>
              )}
              {canDelete && (
                <DeleteButton
                  commentId={thread.id}
                  isModerated={
                    canModerate && author != null && author.id !== currentUserId
                  }
                />
              )}
            </div>
          </div>
        </div>
      )}

      {(thread.replies.length > 0 || replying) && (
        <div className="mt-4 space-y-4 border-l-2 border-border pl-4">
          {thread.replies.map((reply) => (
            <ReplyItem
              key={reply.id}
              reply={reply}
              currentUserId={currentUserId}
              canModerate={canModerate}
            />
          ))}
          {replying && canPost && (
            <CommentForm
              parentId={thread.id}
              placeholder="Write a reply…"
              autoFocus
              compact
              onDone={() => setReplying(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Per-lesson discussion board: enrolled students (plus the instructor and
 * admins) can post questions and reply to one another. Moderators can remove
 * any comment; authors can delete their own.
 */
export function LessonComments({
  threads,
  currentUserId,
  canPost,
  canModerate,
}: {
  threads: Thread[];
  currentUserId: number | null;
  canPost: boolean;
  canModerate: boolean;
}) {
  const commentCount = threads.reduce(
    (sum, t) => sum + (t.deleted ? 0 : 1) + t.replies.filter((r) => !r.deleted).length,
    0
  );

  return (
    <section className="mt-12 border-t pt-8">
      <div className="mb-6 flex items-center gap-2">
        <MessageSquare className="size-5 text-primary" />
        <h2 className="text-xl font-semibold">
          Discussion
          {commentCount > 0 && (
            <span className="ml-2 text-base font-normal text-muted-foreground">
              ({commentCount})
            </span>
          )}
        </h2>
      </div>

      {canPost ? (
        <div className="mb-8">
          <CommentForm placeholder="Ask a question or share something with the class…" />
        </div>
      ) : (
        <p className="mb-8 text-sm text-muted-foreground">
          Enroll in this course to join the discussion.
        </p>
      )}

      {threads.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No comments yet. {canPost && "Be the first to start the discussion!"}
        </p>
      ) : (
        <div className="space-y-4">
          {threads.map((thread) => (
            <ThreadItem
              key={thread.id}
              thread={thread}
              currentUserId={currentUserId}
              canPost={canPost}
              canModerate={canModerate}
            />
          ))}
        </div>
      )}
    </section>
  );
}
