# Domain model

> **Status:** descriptive, 2026-11-14. **Owner:** Data Engineer (Tier 2). Schema detail lives in `docs/data-model.md`; this doc explains what the records mean.

## Entities

| Entity | Collection | Meaning |
|--------|-----------|---------|
| User | `users` | An account plus its notification and display preferences |
| Category | `categories` | A life area (Fitness, Career, …) with a colour; groups blocks, tasks, rewards and points targets |
| Block | `blocks` | A time slot on the calendar (minutes since midnight), one-off or repeating (`daily`, `weekdays`, `weekly`) |
| Task | `tasks` | Something to tick off; worth `points` |
| Completion | `completions` | One tick of one task on one date, with the points it earned frozen in |
| Check-in | `checkins` | The user's energy (`high` / `normal` / `low`) for one day; drives suggestions and nudge wording |
| Reward | `rewards` | A weekly goal (points, optionally in a category, or % complete) the user can claim |
| Plan | `plans` | An intention and notes for one month |
| Plan target | `plan_targets` | A measurable goal for that month: `points`, `percent` or `completions` of one habit |
| Course | `courses` | A week-by-week programme with a start date |
| Course step | `course_steps` | Week *n* of a course; habits and blocks hang off it |
| Push subscription | `push_subscriptions` | One device that receives reminders |

Sources: migrations in `pocketbase/pb_migrations/`; meanings from CLAUDE.md "Data model" and `src/lib/stats.js`.

## How they relate

Every record belongs to one user. Relationships point one way (child → parent); there are no reverse lists.

- A task may point to a block, a category, or a course step.
- A completion points to a task. Deleting the task (or its block) deletes its completions.
- A plan target points to its plan, and to a category (`points`) or a habit task (`completions`).
- A course step points to its course. Blocks and tasks may point to a step.

## The three kinds of task (`src/lib/DataContext.jsx:82–90`, CLAUDE.md)

1. **Block task** — `block` is set. It happens whenever the block occurs (`blockOccursOn`, `src/lib/stats.js:93–107`). One completion per occurrence date.
2. **Daily habit** — `daily` is true. Active from `date` (or its created date) to `recurUntil`, or across its course window if it has a `step`. One completion per day.
3. **One-off to-do** — neither. An optional due `date`. Its completion counts **whatever date it carries**: `toggleTask` finds an existing completion on any date.

A stepped task is always a daily habit; the server clears its `block`, `date`, `remindDate` and `recurUntil` (`pocketbase/pb_hooks/guards.js:206–212`).

## Points and history

- Points earned come from the task at the moment of completion and are stored on the completion (`guards.js:333–337`). Editing a task's points later does not change past weeks.
- **History stays put:** no edit should change past weeks' totals as a side effect. Accepted exceptions, each with a UI warning: "Delete these habits", removing the last week of a `stop` course, and switching a finished course to `stop` (CLAUDE.md Principle 3).
- All totals, percentages, streaks and target progress are derived in `src/lib/stats.js`, never stored.

## Course windows

A stepped item (task or block linked to a course step) is active:

- **from** its step start: `course.startDate + (week − 1) × 7`. A stepped task never starts earlier than one day before it was created.
- **to** the course end, `course.startDate + maxWeek × 7 − 1`, but only if `onEnd` is `stop`; otherwise it keeps going. A block's own `recurUntil` can end it sooner.

`activeWindow()` (`src/lib/stats.js:72–87`) is the only implementation the app uses; `guards.js:37–94` repeats the same maths to write dates onto items when their step or course is deleted, so they keep their history. Deleting a course or step never deletes its habits or blocks.

## Verification

Drafted by the Data Engineer from the migrations, `src/lib/stats.js`, `src/lib/DataContext.jsx` and `pocketbase/pb_hooks/guards.js` (`round-1-data-engineer.md`, Method). Re-checked by the Review Coordinator on 2026-11-14: every code citation in this file was opened at its line (`DataContext.jsx:82–90` `toggleTask`, `stats.js:72–87` `activeWindow`, `stats.js:93–107` `blockOccursOn`, `guards.js:37–94`, `:206–212`, `:333–337`); one stale citation was corrected.

## Update this doc when

A collection is added or removed, the meaning of a task kind changes, `activeWindow` or `toggleTask` change, or a history-stays-put exception is added.
