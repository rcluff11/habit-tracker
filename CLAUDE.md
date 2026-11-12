# Notch — Project Context

Notch ("Notch every win") is a habit tracker and time-blocking calendar: calendar blocks, to-dos, daily habits, points, and personal rewards in one installable PWA.

## Stack

- **Frontend:** React 19 + Vite, plain JS/JSX (no TypeScript). Deployed on Netlify (project `notchedweb`, build config in `netlify.toml`).
- **Backend:** PocketBase (SQLite) on a Google Cloud e2-micro VM behind a DuckDNS subdomain, with automatic HTTPS.
- **Push reminders:** `push/sender.mjs`, a Node service (`web-push`) that runs on the same VM under systemd. Every minute it checks for due block and task reminders and for the opt-in daily messages (affirmation, nudges, day-end score). It records what it sent in `push/.sent.json` (gitignored) so a restart doesn't resend.
- **Env vars:** `VITE_PB_URL` and `VITE_VAPID_PUBLIC_KEY` on the frontend. The private VAPID key and the sender's superuser login live only in `push/.env` on the VM. **Never commit `.env`, `.env.local`, or `push/.env`.**

## Layout

```
src/
  main.jsx, App.jsx    app shell and tab routing
  lib/
    pb.js              PocketBase client
    DataContext.jsx    loads all collections; useData() → save / remove / toggleTask, plus `schedule`
    stats.js           scheduling (activeWindow, blockOccursOn, instancesForDate), weekStats, monthStats,
                       streaks, dayScore, suggestForEnergy, openNow, courseStats, targetProgress
    reminders.js       reminder + daily-message timing rules (shared with the sender)
    messages.js        nudge, score and closing-line wording (shared with the sender)
    affirmations.js    the affirmation list and affirmationFor(date)
    time.js            ISO dates, months, minutes ↔ "6:00 AM", 15-minute snap
    push.js, colors.js
  components/          Modal, ColorPicker, OffsetPicker, TaskItem, TaskEditor, BlockEditor, CategoryChip,
                       ScoreCard, EnergyCheckin, NudgeTimesPicker, StepPicker,
                       MonthPlan, TargetEditor, CourseList, CourseEditor
  views/               Home, Now (#now, "next 3 hours"), Calendar, Tasks, Progress (Week/Month), Settings, Auth
public/                PWA manifest, service worker (sw.js), icons
pocketbase/
  pb_migrations/       schema (applied on start)
  pb_hooks/            server-side rules (guards.js, main.pb.js)
push/                  reminder sender + VM setup guide
scripts/               api-test, reminders-test, stats-test, plus reviewer attack scripts (t3/t4/t5-*.mjs)
```

## Data model (PocketBase collections)

Every collection has a required `user` relation. List, view, update, and delete rules restrict records to their owner.

```
users        + palette (json), remindBefore (json, default [10]),
             dayEndAt ("HH:MM", 12:00 or later; "" = 21:00), dayEndPush (bool),
             affirmationAt ("HH:MM"; "" = off), nudgeTimes (json minutes, 15-min steps, max 6)
categories   name, color (hex)
blocks       title, date (YYYY-MM-DD), start, end (minutes since midnight, 15-min steps),
             color, category → categories, recurrence: none | daily | weekdays | weekly,
             recurUntil (date or ""), notes, remindBefore (null = user default, [] = none),
             step → course_steps (must repeat; date is only the weekday anchor)
tasks        title, category, points, block → blocks (cascade), date, daily (bool),
             priority (bool, ★ top 3), remindAt ("HH:MM"), remindDate,
             effort: light | medium | heavy (optional), recurUntil (daily habits),
             step → course_steps (forces daily; clears block, date, remindDate, recurUntil)
completions  task → tasks (cascade), date, points (snapshot at completion)
             unique index on (task, date)
checkins     date, energy: high | normal | low; unique index on (user, date)
rewards      title, kind: points | percent, target, category (optional),
             claimedWeeks (json array of week-start dates)
plans        month ("YYYY-MM"), intention, notes; unique (user, month)
plan_targets plan → plans (cascade), title, kind: points | percent | completions, target,
             category (points only), task → tasks (cascade; completions only: a habit or block task)
courses      title, startDate, notes, onEnd: keep | stop (no end-date field; the end is derived)
course_steps course → courses (cascade), week (1–52), title, notes; unique (course, week)
push_subscriptions   device subscriptions for reminders
```

**Course windows:** a stepped item is active from its step start, `course.startDate + (week − 1) × 7`, to the course end, `startDate + maxWeek × 7 − 1`. The end only applies if `onEnd` is `stop`, and a block's own `recurUntil` can end it sooner. A stepped *task* never starts before `created date − 1 day`. All of this lives in `activeWindow()`; never read `task.date` or `block.date` for a stepped item. Deleting a course or step keeps its habits and blocks, and the server writes their dates onto them first.

**Three kinds of task:**
1. A task with `block` set happens whenever that block occurs.
2. A task with `daily` set to true is a daily habit.
3. Any other task is a one-off to-do, with an optional due `date`.

A one-off task's completion counts regardless of date (see `toggleTask`).

## Principles (enforce these)

1. **One fact, one place.** Refer to other records by id. Don't copy fields between records.
2. **Relationships point one way.** A task points to its block, and a completion points to its task. Never store reverse lists.
3. **Derive, don't store.** Week and month %, totals, streaks, done-today, target progress, and course end dates and progress are computed in `stats.js` at render time. The one deliberate exception is `completions.points`, which is a snapshot so past weeks don't change when a task's points are edited.
   - **History stays put:** no edit should change past weeks' totals as a side effect. The only exceptions are "Delete these habits", removing the last week of a `stop` course, and switching a finished course to `stop`, and the UI warns before each.
4. **Store the useful unit, format at the edges.** Store minutes and ISO dates. Use `time.js` helpers to format.
5. **The server is the authority.** Ownership, points, and valid block times are enforced in `pb_hooks`. A UI check is a convenience, never the only check.
6. **Keep shared rules in sync.** These exist in both the app and `pb_hooks/guards.js`. Change both together:
   - `REMINDER_OPTIONS`, `NUDGE_STEP`, `MAX_NUDGES` and `EARLIEST_DAY_END` (`src/lib/reminders.js`)
   - the course-window maths: step start, course end, and a stepped task's start (`src/lib/stats.js`, which `guards.js` repeats when it writes dates on delete)
   - `ENERGY_LEVELS` and `EFFORT_LEVELS` (`stats.js`) and the target kinds (`targetProgress`), which must also match the select values in the migrations

## Schema changes

Never edit an existing migration. Add a new timestamped file in `pocketbase/pb_migrations/` with both an up and a down function. Restart PocketBase so the change applies. Deploy it to the VM together with `pb_hooks`.

## Commands

```
npm run pb              # local PocketBase (Windows: pocketbase/pocketbase.exe)
npm run dev             # frontend at http://localhost:5173
npm run build
npm run test:api        # DB rules + hooks (needs PocketBase running)
npm run test:reminders  # reminder timing (no server)
npm run test:stats      # scheduling + stats helpers (no server)
npm run push:test       # send a test push to subscribed devices
node scripts/t4-nudges-attack.mjs   # reviewer attack checks (t3/t4/t5; t4/t5 need PocketBase running)
```

Run `test:api` after any change to migrations or hooks. Run `test:reminders` after any change to `reminders.js`, `messages.js` or the sender. Run `test:stats` after any change to `stats.js` or `time.js`.

**Deploy order:** deploy `pb_migrations` and `pb_hooks` to the VM and restart PocketBase first. Then restart the sender (`sudo systemctl restart notch-push`). The Netlify deploy goes out from the push.

## Working with the agents

- **Design agent:** owns `plan.md`. Keep it in step with the roadmap below.
- **Frontend agent:** works in `src/` and `public/`. Reuse the classes and CSS variables in `src/styles.css`. Add only view-specific CSS. Ask before adding dependencies.
- **Backend agent:** works in `pocketbase/` and `push/`. It must follow the schema-change rules above.
- **Reviewer:** reports findings only and never edits. Checks changes against the principles, the ownership rules, mobile layout, and dark mode. Runs the tests.
- When I ask to *learn* something, explain it and give hints instead of writing the full implementation.

## Status

**Phase 1 (done and deployed):** accounts, all views (Home, Calendar, To-do, Progress, Settings), 15-minute calendar grid with drag-to-create, recurring blocks, server-side rules, PWA, push reminders (per-block and per-task), tests, and deployment.

**Phase 2 (built, reviewed and tested; not yet deployed). See `plan.md`:**
- The "Next 3 hours" view at `#now`, with an app shortcut
- The end-of-day score card with habit streaks, plus the "Day ends at" setting
- Energy check-in (high, normal or low), effort tags, and task suggestions
- Affirmation, nudge and day-end pushes at times you choose; nudge wording follows today's energy
- Monthly plans with targets, and week-by-week courses whose steps hold habits and blocks

## Reading the codebase

- Don't explore the repo. Use the Layout and Data model above to find files.
- Read only the files your task names, plus files they import if needed.
- Find functions with Grep, then read just those lines, not the whole file.
- Never read node_modules, dist, package-lock.json, or pocketbase/pb_data.