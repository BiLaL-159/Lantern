import { data } from "react-router";
import { getCurrentUserId } from "~/lib/session";
import { getUserById } from "~/services/userService";
import { getCourseById } from "~/services/courseService";
import { UserRole } from "~/db/schema";

type CourseAccessMessages = {
  /** Shown with a 401 when there is no signed-in user. */
  signInRequired?: string;
  /** Shown with a 403 when an instructor opens a course they do not own. */
  notOwner?: string;
};

const defaultMessages: Required<CourseAccessMessages> = {
  signInRequired: "Select a user from the DevUI panel to view this page.",
  notOwner: "You can only view your own courses.",
};

/**
 * Authorises instructor-or-admin access to a single course.
 *
 * Checks, in order: signed in (401), instructor or admin (403), valid
 * course id (400), course exists (404), instructor owns the course or
 * user is an admin (403). Returns the current user and the course.
 *
 * Callers pass their own `signInRequired` / `notOwner` copy so each page
 * keeps its wording; the other responses are shared verbatim.
 */
export async function requireCourseAccess(
  request: Request,
  rawCourseId: string,
  messages: CourseAccessMessages = {}
) {
  const { signInRequired, notOwner } = { ...defaultMessages, ...messages };

  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    throw data(signInRequired, { status: 401 });
  }

  const user = getUserById(currentUserId);

  if (!user || (user.role !== UserRole.Instructor && user.role !== UserRole.Admin)) {
    throw data("Only instructors and admins can access this page.", {
      status: 403,
    });
  }

  const courseId = parseInt(rawCourseId, 10);
  if (isNaN(courseId)) {
    throw data("Invalid course ID.", { status: 400 });
  }

  const course = getCourseById(courseId);

  if (!course) {
    throw data("Course not found.", { status: 404 });
  }

  if (course.instructorId !== user.id && user.role !== UserRole.Admin) {
    throw data(notOwner, { status: 403 });
  }

  return { user, course };
}
