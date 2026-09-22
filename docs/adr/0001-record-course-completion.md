---
status: accepted
---

# Course completion is recorded, not derived

The Dashboard, Roster, and Analytics all need to know whether and when a student completed a course. We could derive it on every read (all lessons have a completed progress row), but that answer changes whenever an instructor adds or deletes a lesson, and it carries no timestamp. Instead, the progress service stamps `enrollments.completed_at` the moment a student completes the last remaining lesson; that stamp is the single source of truth and is never overwritten or cleared by later lesson changes. Enrollments that already qualified before this rule existed were stamped once by a backfill migration (`0005_backfill_course_completion`).

## Considered options

- **Derive on read** — rejected: a completion could silently disappear when a lesson is added, appear when one is deleted, and there is no date to plot completions over time.
- **Record on write** (chosen) — completion is something a student did at a point in time, so it is stored as an event on the enrollment.

## Consequences

- Adding, deleting, or reordering lessons never touches `completed_at`.
- A student's progress percentage can drop below 100% after a lesson is added while the course stays completed; this is intended.
- Un-completing an enrollment has no code path and would need a deliberate decision.
