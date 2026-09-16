# Lesson Reset Guide

Each lesson that involves code changes needs reset instructions. For each lesson:

- **Reset To Start**: The commit students should reset to before beginning the lesson.
- **Mid-Lesson Resets**: Commits students can reset to during the lesson (e.g. to skip the Problem and jump to the Solution, or to catch up between phases).

---

## 03.04 — Build A Feature

- **Reset To Start**: `main` — clean starting point, no prior lesson work
- **Mid-Lesson Resets**:
  - `03.04.01: Add course star rating system` — skip to solution

## 03.07 — The Plan-Execute-Clear Loop

- **Reset To Start**: `03.04.01` — has star ratings from 03.04
- **Mid-Lesson Resets**:
  - `03.07.01: Add lesson comments with soft-delete and moderation` — skip to solution

## 04.01 — What Is An Agents.md File

- **Reset To Start**: `03.07.01` — has comments from 03.07
- **Mid-Lesson Resets**:
  - `04.01.01: Add CLAUDE.md with steering instructions` — CLAUDE.md added during explainer

## 04.02 — Steering With The Agents.md File

- **Reset To Start**: `04.01.01` — has CLAUDE.md from 04.01
- **Mid-Lesson Resets**:
  - `04.02.01: Add lesson bookmarks for enrolled students` — skip to solution (includes CLAUDE.md updates)

## 04.05 — A Skill For Writing Skills

- **Reset To Start**: `04.02.01` — has bookmarks from 04.02
- **Mid-Lesson Resets**:
  - `04.05.01: Add write-a-skill skill` — first exercise done (write-a-skill skill added)
  - `04.05.02: Add zod-to-valibot skill` — second exercise done (zod-to-valibot skill files added)
  - `04.05.03: Migrate Zod to Valibot` — skip to full solution (Valibot migration applied to app)

## 05.02 — Write Great PRDs With This Skill

- **Reset To Start**: `04.05.03` — fully migrated to Valibot
- **Mid-Lesson Resets**:
  - `05.02.01: Add write-a-prd skill` — first exercise done (write-a-prd skill added)
  - `05.02.02: Add instructor analytics dashboard PRD` — skip to solution (PRD written)

## 05.03 — Split Features Across Multiple Context Windows

- **Reset To Start**: `05.02.02` — has PRD from 05.02
- **Mid-Lesson Resets**:
  - `05.03.01: Add naive multi-phase plan` — skip to solution (naive plan created)

## 05.05 — Use Tracer Bullets In Our Multi-Phase Plan

- **Reset To Start**: `05.03.01` — has naive plan from 05.03
- **Mid-Lesson Resets**:
  - `05.05.01: Add prd-to-plan skill` — first exercise done (prd-to-plan skill added)
  - `05.05.02: Improve plan with tracer bullets` — skip to solution (plan improved with tracer bullets, overwrites naive plan)

## 05.06 — Executing Our Multi-Phase Plan

- **Reset To Start**: `05.05.02` — has tracer-bullet plan
- **Mid-Lesson Resets**:
  - `05.06.01: Instructor analytics Phase 1 — service + route + summary cards` — Phase 1 complete
  - `05.06.02: Instructor analytics Phase 2 — revenue chart + per-course table` — Phase 2 complete
  - `05.06.03: Instructor analytics Phase 3 — admin access + empty states` — skip to full solution

## 06.03 — Building A Do Work Skill

- **Reset To Start**: `05.06.03` — analytics complete from 05.06
- **Mid-Lesson Resets**:
  - `06.03.01: Add do-work skill` — skip to solution

## 06.04 — Using Our Do Work Skill

- **Reset To Start**: `06.03.01` — has do-work skill from 06.03
- **Mid-Lesson Resets**:
  - `06.04.01: Add in-app notifications PRD and plan` — setup for exercise (PRD and plan created)
  - `06.04.02: Add in-app enrollment notifications for instructors` — skip to solution

## 06.05 — Fixing Agents' Broken Formatting With Pre-Commit

- **Reset To Start**: `06.04.02` — has notifications from 06.04
- **Mid-Lesson Resets**:
  - `06.05.01: Add Husky pre-commit hooks with lint-staged` — pre-commit hooks added during explainer

## 06.07 — Red-Green-Refactor

- **Reset To Start**: `06.05.01` — has pre-commit hooks from 06.05
- **Mid-Lesson Resets**:
  - `06.07.01: Update do-work skill with red-green-refactor and add coupon notifications plan` — setup (do-work skill updated + coupon plan added)
  - `06.07.02: Add coupon redemption notifications for team admins` — skip to solution

## 07.03 — Trying HITL RALPH

- **Reset To Start**: `06.07.02` — has coupon notifications from 06.07
- **Mid-Lesson Resets**:
  - `07.03.01: Add admin analytics PRD and plan` — setup (PRD and plan added)
  - `07.03.02: Admin analytics Phase 1 — summary cards via HITL` — skip to solution

## 07.05 — Setting Up And Trying AFK RALPH

- **Reset To Start**: `07.03.02` — has Phase 1 from 07.03
- **Mid-Lesson Resets**:
  - `07.05.01: Admin analytics Phase 2 — revenue chart via AFK` — skip to solution

## 07.08 — Hooking Up RALPH To Your Backlog

- **Reset To Start**: `07.05.01` — has Phase 2 from 07.05
- **Mid-Lesson Resets**:
  - `07.08.01: Hook up RALPH to GitHub issues` — RALPH hooked up to GitHub issues
  - `07.08.02: Admin analytics Phase 3 — course breakdown table` — Phase 3 table added
  - `07.08.03: Change admin analytics default period to 12 months` — skip to full solution

## 07.09 — Updating Our PRD And Plan Skill To Use GitHub

- **Reset To Start**: `07.08.03` — admin analytics complete
- **Mid-Lesson Resets**:
  - `07.09.01: Update PRD and plan skills to use GitHub` — skills updated during explainer

## 08.02 — Don't Plan, Kanban

- **Reset To Start**: `07.09.01` — has GitHub-aware skills from 07.09
- **Mid-Lesson Resets**:
  - `08.02.01: Add prd-to-issues skill` — prd-to-issues skill added (replaces prd-to-plan)

## 08.03 — Using The Kanban Skill

- **Reset To Start**: `08.02.01` — has prd-to-issues skill from 08.02
- **Mid-Lesson Resets**:
  - `08.03.01: Add gamification PRD` — setup (gamification PRD added)
  - `08.03.02: Add XP, streaks, quiz XP, and dashboard gamification` — skip to solution

## 08.05 — Trying Out Research

- **Reset To Start**: `08.03.02` — has gamification from 08.03
- **Mid-Lesson Resets**:
  - `08.05.01: Add live-presence-indicator research` — skip to solution (research doc added)

## 08.07 — Trying Out Prototyping

- **Reset To Start**: `08.05.01` — has research from 08.05
- **Mid-Lesson Resets**:
  - `08.07.01: Add live presence prototype with Ably` — skip to solution

## 08.09 — The Improve My Codebase Skill

- **Reset To Start**: `08.07.01` — has prototype from 08.07
- **Mid-Lesson Resets**:
  - `08.09.01: Add improve-codebase-architecture skill` — skip to solution

## 08.10 — Adding Module Awareness To Our Plan/PRD Skill

- **Reset To Start**: `08.09.01` — has improve-codebase skill from 08.09
- **Mid-Lesson Resets**:
  - `08.10.01: Add module awareness to write-a-prd skill` — module awareness added during explainer
