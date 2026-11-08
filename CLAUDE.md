# Notch — Project Context

Notch ("Notch every win") is a habit tracker and time-blocking calendar: calendar blocks, to-dos, daily habits, points, and personal rewards in one installable PWA.

## Stack

- **Frontend:** React 19 + Vite, plain JS/JSX (no TypeScript). Deployed on Netlify (project `notchedweb`, build config in `netlify.toml`).
- **Backend:** PocketBase (SQLite) on a Google Cloud e2-micro VM behind a DuckDNS subdomain, with automatic HTTPS.
- **Push reminders:** `push/sender.mjs`, a Node service (`web-push`) that runs on the same VM under systemd and checks for due reminders every minute.
- **Env vars:** `VITE_PB_URL` and `VITE_VAPID_PUBLIC_KEY` on the frontend. The private VAPID key and the sender's superuser login live only in `push/.env` on the VM. **Never commit `.env`, `.env.local`, or `push/.env`.**

## Layout

```
src/
  main.jsx, App.jsx    app shell and tab routing
  lib/
    pb.js              PocketBase client
    DataContext.jsx    loads all collections; useData() → save / remove / toggleTask
    stats.js           scheduling (blockOccursOn, instancesForDate) + weekStats
    reminders.js       reminder timing rules (shared with the sender)
    time.js            ISO dates, minutes ↔ "6:00 AM", 15-minute snap
    push.js, colors.js
  components/          Modal, ColorPicker, OffsetPicker, TaskItem, TaskEditor, BlockEditor, CategoryChip
  views/               Home, Calendar, Tasks, Progress, Settings, Auth
public/                PWA manifest, service worker (sw.js), icons
pocketbase/
  pb_migrations/       schema (applied on start)
  pb_hooks/            server-side rules (guards.js, main.pb.js)
push/                  reminder sender + VM setup guide
scripts/               api-test.mjs, reminders-test.mjs
```

## Data model (PocketBase collections)

Every collection has a required `user` relation. List, view, update, and delete rules restrict records to their owner.

```
users        + palette (json), remindBefore (json, default [10])
categories   name, color (hex)
blocks       title, date (YYYY-MM-DD), start, end (minutes since midnight, 15-min steps),
             color, category → categories, recurrence: none | daily | weekdays | weekly,
             recurUntil (date or ""), notes, remindBefore (null = user default, [] = none)
tasks        title, category, points, block → blocks (cascade), date, daily (bool),
             priority (bool, ★ top 3), remindAt ("HH:MM"), remindDate
completions  task → tasks (cascade), date, points (snapshot at completion)
             unique index on (task, date)
rewards      title, kind: points | percent, target, category (optional),
             claimedWeeks (json array of week-start dates)
push_subscriptions   device subscriptions for reminders
```

**Three kinds of task:**
1. A task with `block` set happens whenever that block occurs.
2. A task with `daily` set to true is a daily habit.
3. Any other task is a one-off to-do, with an optional due `date`.

A one-off task's completion counts regardless of date (see `toggleTask`).

## Principles (enforce these)

1. **One fact, one place.** Refer to other records by id. Don't copy fields between records.
2. **Relationships point one way.** A task points to its block, and a completion points to its task. Never store reverse lists.
3. **Derive, don't store.** Week %, totals, streaks, and done-today are computed in `stats.js` at render time. The one deliberate exception is `completions.points`, which is a snapshot so past weeks don't change when a task's points are edited.
4. **Store the useful unit, format at the edges.** Store minutes and ISO dates. Use `time.js` helpers to format.
5. **The server is the authority.** Ownership, points, and valid block times are enforced in `pb_hooks`. A UI check is a convenience, never the only check.
6. **Keep shared rules in sync.** `REMINDER_OPTIONS` exists in both `src/lib/reminders.js` and `pb_hooks/guards.js`. Change both together.

## Schema changes

Never edit an existing migration. Add a new timestamped file in `pocketbase/pb_migrations/` with both an up and a down function. Restart PocketBase so the change applies. Deploy it to the VM together with `pb_hooks`.

## Commands

```
npm run pb              # local PocketBase (Windows: pocketbase/pocketbase.exe)
npm run dev             # frontend at http://localhost:5173
npm run build
npm run test:api        # DB rules + hooks (needs PocketBase running)
npm run test:reminders  # reminder timing (no server)
npm run push:test       # send a test push to subscribed devices
```

Run `test:api` after any change to migrations or hooks. Run `test:reminders` after any change to `reminders.js` or the sender.

## Working with the agents

- **Design agent:** owns `plan.md`. Keep it in step with the roadmap below.
- **Frontend agent:** works in `src/` and `public/`. Reuse the classes and CSS variables in `src/styles.css`. Add only view-specific CSS. Ask before adding dependencies.
- **Backend agent:** works in `pocketbase/` and `push/`. It must follow the schema-change rules above.
- **Reviewer:** reports findings only and never edits. Checks changes against the principles, the ownership rules, mobile layout, and dark mode. Runs the tests.
- When I ask to *learn* something, explain it and give hints instead of writing the full implementation.

## Status

**Done:** accounts, all views (Home, Calendar, To-do, Progress, Settings), 15-minute calendar grid with drag-to-create, recurring blocks, server-side rules, PWA, push reminders (per-block and per-task), tests, and deployment.

**Roadmap (phase 2):**
- Progress nudges and daily affirmation notifications, with adjustable frequency
- Monthly plans and week-long "courses" (for example, Week 1: wake by 8; Week 2: add the gym)
- Energy check-in (high, normal, or low) with task suggestions
- End-of-day score card
- Phone and desktop widget for "next 3 hours"
