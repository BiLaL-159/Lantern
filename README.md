# Lantern

> For when the docs run out.

![React Router](https://img.shields.io/badge/React_Router-7.12-CA4245?logo=reactrouter&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)
![Drizzle](https://img.shields.io/badge/Drizzle_ORM-SQLite-C5F74F?logo=drizzle&logoColor=black)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)
![Tests](https://img.shields.io/badge/tests-376_passing-success)

Lantern is a self-hosted course platform. Instructors author video courses with modules, lessons and quizzes; students buy them at purchasing-power-adjusted prices and work through them; instructors and admins get analytics on sales, reach, completion and sentiment.

It is a server-rendered React Router 7 application backed by SQLite, with all business logic in a tested service layer.

## Contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Scripts](#scripts)
- [Project structure](#project-structure)
- [Data model](#data-model)
- [Architecture notes](#architecture-notes)
- [Testing](#testing)
- [Database migrations](#database-migrations)
- [Limitations](#limitations)
- [Acknowledgements](#acknowledgements)

## Features

**Learning**

- Courses organised into modules and lessons, with Markdown content, YouTube video, an optional linked GitHub repo and a per-lesson quiz.
- Progress tracking from video watch events through to lesson completion; completing the final lesson completes the course.
- Quizzes with multiple-choice and true/false questions, scored against a per-quiz passing threshold, with attempt history.
- Two-level threaded comments on every lesson, soft-deleted so moderation does not orphan replies.
- Star ratings, one per student per course.

**Authoring**

- Course creation with drag-and-drop ordering of modules, lessons and quiz questions.
- Lesson editing in an embedded Monaco editor with live Markdown preview and Shiki-highlighted code blocks.
- Draft / published / archived course states.
- Per-course student roster with progress.

**Commerce**

- Purchasing power parity pricing: four country tiers (0%, 30%, 50%, 70% off), configurable per course.
- PPP abuse protection — a discounted purchase is bound to the country it was made from, and access is blocked when it is opened from a different one.
- Team purchases: buying in bulk issues redeemable coupon codes, redeemed at `/redeem/:code`, which enroll the redeemer.

**Analytics**

Per course, per instructor, and platform-wide:

| Panel | Metrics |
| --- | --- |
| Sales | Revenue after PPP discounts, purchases split individual vs. team |
| Reach | Enrollments, students not started, team seats sold vs. redeemed |
| Progress | Completion rate, plus a drop-off funnel showing where students stop |
| Sentiment | Average rating and star distribution |
| Trends | Revenue, enrollments and new users over 30d / 90d / all-time, bucketed daily or weekly |

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | React Router 7 (framework mode, SSR) |
| UI | React 19, Tailwind CSS 4, shadcn/ui + Radix, Lucide |
| Language | TypeScript (strict) |
| Database | SQLite via Drizzle ORM and `better-sqlite3` |
| Charts | Recharts |
| Content | Monaco editor, `marked`, Shiki |
| Validation | Zod |
| Testing | Vitest |
| Package manager | pnpm |

## Getting started

### Prerequisites

- Node.js 22 or newer
- pnpm 9 (`corepack enable` will provide it)

### Installation

```bash
git clone https://github.com/BiLaL-159/Lantern.git
cd Lantern
pnpm install
pnpm db:seed    # runs migrations, then seeds demo data
pnpm dev
```

The app runs at <http://localhost:5173>.

### Signing in

Seeded accounts cover all three roles. Log in with an email address alone — there are no passwords (see [Limitations](#limitations)):

| Role | Email |
| --- | --- |
| Admin | `alex.rivera@ralph.dev` |
| Instructor | `sarah.chen@ralph.dev` |
| Student | `emma.wilson@student.dev` |

In development, a floating panel in the corner switches between seeded users and overrides the detected country, which is the quickest way to see role-specific views and PPP pricing side by side.

## Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Start the development server |
| `pnpm build` | Production build |
| `pnpm start` | Serve the production build |
| `pnpm test` | Run the test suite once |
| `pnpm test:watch` | Run tests in watch mode |
| `pnpm typecheck` | Generate route types, then run `tsc` |
| `pnpm db:generate` | Generate a migration from schema changes |
| `pnpm db:migrate` | Apply pending migrations |
| `pnpm db:seed` | Migrate and seed the database |

## Project structure

```
app/
├── routes/         Route modules — loaders read, actions write
├── services/       Database access and business logic, one module per domain concept
├── db/             Drizzle schema and client
├── lib/            Pure logic: PPP pricing, sessions, trend windows, authorisation
├── components/     Shared UI, including chart and analytics primitives
│   └── ui/         shadcn/ui primitives
└── app.css         Tailwind entry point and theme tokens
drizzle/            Generated SQL migrations
scripts/seed.ts     Demo data seeder
```

## Data model

Nineteen tables, defined in `app/db/schema.ts`:

- **Identity** — `users`, `teams`, `team_members`
- **Catalogue** — `courses`, `categories`, `modules`, `lessons`
- **Learning** — `enrollments`, `lesson_progress`, `video_watch_events`
- **Assessment** — `quizzes`, `quiz_questions`, `quiz_options`, `quiz_attempts`, `quiz_answers`
- **Commerce** — `purchases`, `coupons`
- **Feedback** — `course_ratings`, `lesson_comments`

## Architecture notes

- **Routes never query the database.** A route module loads through a service and renders; the service owns the SQL. This keeps business logic testable without a browser.
- **Analytics are computed live.** Funnels, trends and rollups are aggregate SQL queries against SQLite — nothing is precomputed or cached.
- **Authorisation is centralised.** `requireCourseAccess` (`app/lib/courseAccess.ts`) performs the signed-in → role → course-exists → ownership checks, in order and with correct status codes, for every instructor route.
- **The client bundle is guarded by a test.** Importing a runtime value from a service pulls `better-sqlite3`, a native Node module, into the browser bundle and breaks the route. `app/components/client-safety.test.ts` fails if that regression returns; shared constants live in `app/lib/trends.ts` instead.

## Testing

```bash
pnpm test
```

376 tests across 17 files, covering the service layer and pure logic. Each test gets a fresh in-memory SQLite database built from the same migrations as the live one (`app/test/setup.ts`), so the schema under test can never drift from the schema that ships, and the suite runs in a few seconds without touching `data.db`.

## Database migrations

The schema in `app/db/schema.ts` is the source of truth. After changing it:

```bash
pnpm db:generate    # writes a new SQL file to drizzle/
pnpm db:migrate     # applies it
```

Migrations are checked in and applied in order. They may carry data as well as schema — `0005_backfill_course_completion.sql` retroactively completes enrollments that already qualified when course completion was introduced.

## Limitations

This is a demonstration application, not a production deployment:

- **Authentication is email-only.** Sessions and role-based authorisation are real, but there are no passwords, hashing or email verification.
- **Checkout is simulated.** Purchases, discounts, team seats and coupon redemption work end to end as records; no payment provider is integrated.
- **SQLite is a local file**, suited to single-node use.

## Acknowledgements

The initial application was scaffolded from the [AI Hero](https://github.com/ai-hero-dev) cohort starter. Course ratings, threaded comments, course completion tracking, shared instructor authorisation and the analytics suite were built on top of it.

---

No license is currently granted for reuse.
