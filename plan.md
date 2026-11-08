# Notch — Plan (Phase 2)

## Where we left off
- **Last done:** To-do/Calendar header fix, committed. It added `dayLabel` and `weekLabel` to `src/lib/time.js`.
- **Next:** run plan-supervisor on this plan, then build F-1.
- **Watch out:** `time.js` already has `dayLabel` and `weekLabel`, so F-15's month helpers go next to them; don't duplicate them. Every stepped item's start and end must come from `activeWindow()` (F-15), never from `task.date` or `block.date` directly.

## 1. Overview

Notch ("Notch every win") is an installable PWA that combines a 15-minute time-blocking calendar, to-dos, daily habits, points and personal weekly rewards. Phase 1 is finished and deployed: React 19 + Vite on Netlify, PocketBase on a GCP VM, and a per-minute `push/sender.mjs` reminder loop. Phase 2 adds five features:
- a "next 3 hours" view you can open from an app shortcut
- an end-of-day score card with per-habit streaks
- a daily energy check-in with effort-aware task suggestions
- push nudges and affirmations at times the user chooses
- monthly plans with measurable targets, plus week-by-week courses whose steps can hold daily habits and calendar blocks

Each one builds on the existing data model and shared libraries rather than adding parallel systems.

## 2. Assumptions & Open Questions

### Decisions (answered by the user)
- D-1 **Nudge times:** users can set their own times. Three presets are the starting points: Light (6 PM), Regular (12 PM and 6 PM) and Frequent (10 AM, 2 PM and 6 PM). The chosen times are stored on the user, and the server validates them.
- D-2 **Message tone:** when everything is done, send a short celebration. When the day isn't finished, send a short uplifting "you'll get it tomorrow" message rather than nothing.
- D-3 **Affirmations:** a built-in list of about 250, picked pseudo-randomly but **deterministically per local date**, so Home and the push show the same one. There are no user-defined affirmations and no new collection.
- D-4 **Score card:** shown on Home from "day ends at" (default 9 PM) until midnight, or earlier once everything is done, with an optional push at "day ends at".
- D-5 **Streaks are per habit,** derived in `stats.js`. There is no day-level streak.
- D-6 **Course weeks are cumulative.** Week 2 "add the gym" keeps Week 1 "wake by 8" running.
- D-7 **Monthly plans have measurable targets.** Only the target definitions are stored. Progress is derived from completions.
- D-8 **Deleting a course keeps its habits and blocks,** and they keep the dates they had (see B-7).
- D-9 **Tasks get an optional effort tag** (light, medium or heavy), which energy suggestions use.
- D-10 **Plans live inside Progress** (a Week/Month switch), not in a new tab.
- D-11 **No Windows widget.** "Next 3 hours" is delivered as the `/#now` view plus a manifest app shortcut.
- D-12 **Nudges are off by default** (`nudgeTimes` is empty), so existing users don't suddenly get new pushes. Turning nudges on starts from the Regular preset.
- D-13 **How D-2 is applied:**
  - **Nudge time, day unfinished:** a progress nudge with an encouraging tone.
  - **Nudge time, everything done:** one celebration. Later nudge times that day are skipped.
  - **Day-end push (if turned on):** the score headline, plus a celebration line if the day is complete or a "you'll get it tomorrow" line if it isn't.
  - **Days with no tasks at all:** no nudge and no day-end push.
- D-14 **What happens to a course's habits when it ends is a per-course setting.** `courses.onEnd` is `keep` (the default) or `stop`.
  - The course end date is **derived** from the last step: `startDate + (max week × 7) − 1`. **There is no end-date field.** A course with no steps has no end.
  - `stop` **never deletes records**. Deleting tasks would cascade-delete their completions and rewrite past weeks' points. Instead, the shared rule `activeWindow()` gives every stepped task and block an end date, and after it they aren't shown, counted or reminded.
  - To actually remove the records, the course editor has a manual **"Delete these habits"** action. It warns that completions and past points will be deleted too.
- D-15 **Calendar blocks can belong to a course week** through `blocks.step`. A stepped block starts on its step's derived start date, stops with the course when `onEnd` is `stop`, and the tasks on that block follow it.

### Assumptions (the plan uses these until the user says otherwise)
- A-1: There is still one user per account, and no sharing between users.
- A-2: Weeks start on Monday (`time.js startOfWeek`). Courses count weeks from their own `startDate`, which may be any day.
- A-3: Notification preferences are per user, not per device, as `users.remindBefore` is today. Devices still opt in one at a time through `push_subscriptions`.
- A-4: The score card, streaks, nudge content, suggestions, course progress, course end dates, month stats and target progress are **never stored**. They are derived in `src/lib/stats.js`, at render time in the app or at send time in the sender.
- A-5: Nudge times use 15-minute steps (the app's `STEP`), with at most 6 per day. Nudge times at or after "day ends at" are skipped, because the day-end push covers that part of the day.
- A-6: A habit's streak counts consecutive *scheduled* occurrences that were completed. Days when the habit isn't scheduled or isn't active don't break it: a weekday block on a Saturday, before a stepped habit's start, or after a stopped course's end. Today's occurrence only breaks the streak once today is over.
- A-7: "Day ends at" defaults to 9:00 PM (`"21:00"`). An empty value means the app default, the same pattern as `remindBefore`, where `null` means default.
- A-8: A stepped block must repeat (daily, weekdays or weekly), because a one-off block inside a course week isn't meaningful. On a stepped block, `block.date` is used **only as the weekday anchor** for weekly repeats. The step decides when it starts.
- A-9: No new npm dependencies.

### Open questions
None. Every question has been answered (see D-1 to D-15).

## 3. Requirements

### Functional
- [ ] FR-1: A compact "Next 3 hours" view at `/#now` shows the blocks that are live or starting within 180 minutes, including blocks just after midnight. Each block's open tasks can be checked off there, and the view also shows today's top 3.
- [ ] FR-2: Users can launch the "Next 3 hours" view from the installed app's shortcut menu: long-press on Android, right-click or the jump list on Windows and macOS. The help text explains that iOS doesn't support this.
- [ ] FR-3: The end-of-day score card for today appears on Home from "day ends at" until midnight, or earlier once every task is done. It shows done/total, %, points/possible, best category, habit streaks, a comparison with the 7-day average, and the day's energy if checked in.
- [ ] FR-4: The score card for any past day can be opened from the Progress daily chart.
- [ ] FR-5: Users can set "day ends at" (HH:MM) in Settings.
- [ ] FR-6: Each daily habit and block task has a derived streak, shown on the score card (streaks kept, extended and broken) and as a 🔥 count on habit rows in the task lists.
- [ ] FR-7: Users can record today's energy (high, normal or low) once per day from Home and change it later that day.
- [ ] FR-8: Users can tag any task with an optional effort level (light, medium or heavy) in the task editor.
- [ ] FR-9: After a check-in, Home suggests up to 3 open tasks that fit the energy level, using the effort tag first and points as a fallback for untagged tasks.
- [ ] FR-10: An optional daily affirmation push arrives at a user-chosen time. The text comes from a built-in list of about 250, picked per local date, and matches the affirmation on Home that day.
- [ ] FR-11: Optional progress nudges arrive at the user's chosen times. Users can apply the Light, Regular or Frequent preset and add, remove or change individual times. The content is derived from today's progress.
- [ ] FR-12: Message tone follows D-2 and D-13.
- [ ] FR-13: An optional day-end push arrives at "day ends at" with that day's score headline and closing line.
- [ ] FR-14: Settings → Notifications holds the affirmation time, the nudge times (with presets), "day ends at" and the day-end push toggle.
- [ ] FR-15: Progress has a Week/Month switch. Month mode shows that month's plan (intention and notes), derived stats for the month, its targets and the courses active that month.
- [ ] FR-16: A monthly plan can have measurable targets: points (optionally within one category), % complete, or the number of completions of one habit. Progress toward each target is derived from completions.
- [ ] FR-17: Users can create a course with a title, start date, "When the course ends" setting (keep or stop) and numbered weekly steps such as "Week 1: Wake by 8".
- [ ] FR-18: Daily habits can be attached to a course step. Each habit's active window comes from its course: it starts on `course.startDate + (week − 1) × 7`, so steps add up week by week, and if the course's `onEnd` is `stop` it ends on the course's derived end date. Habits are shown, counted and reminded only inside that window.
- [ ] FR-19: A course shows its progress: the current week, the completion % of each week's habits, its derived end date and whether its habits keep going or stop.
- [ ] FR-20: Deleting a course, or one of its steps, keeps the attached habits and blocks. Their start date, and their end date if the course was set to `stop`, are written onto the records so past and future weeks don't change.
- [ ] FR-21: A course's habits and blocks can be deleted on purpose with a "Delete these habits" action. It first warns how many completions will be removed and that past weeks' points will change.
- [ ] FR-22: Repeating calendar blocks can be attached to a course step. A stepped block appears, and reminds, only inside its step's active window, and its tasks follow it.

### Non-functional
- [ ] NFR-1 **Ownership:** every new collection has a required `user` relation. Its list, view, update and delete rules are `user = @request.auth.id`, and the create rule requires `@request.body.user = @request.auth.id`. Hooks check that related records belong to the same user, including the new `tasks.step` and `blocks.step`. `test:api` proves that one user can't read or write another user's records.
- [ ] NFR-2 **Server authority:** the schema and `pb_hooks` enforce every valid value, including energy, effort, nudge times (step, range, count), HH:MM times, week numbers, month format, target kinds and their fields, `onEnd`, which tasks and blocks may join a step, and the dates written when a step or course is deleted. A UI check is never the only check.
- [ ] NFR-3 **Shared libs stay Node-safe:** `stats.js`, `time.js`, `reminders.js`, `messages.js` and `affirmations.js` import nothing browser-only or Vite-only, because `push/sender.mjs` imports them.
- [ ] NFR-4 **Never late:** nudge, affirmation and day-end pushes use a 15-minute grace window (`TASK_GRACE_MINUTES`) with a matching TTL, and go out at most once per device, kind, day and slot.
- [ ] NFR-5 **Mobile and dark mode:** new UI reuses the classes and CSS variables in `src/styles.css` (`card`, `seg`, `btn`, `chip`, `task-list`, `progress-bar`, `--muted` and so on) and works at 360px and with `prefers-color-scheme: dark`.
- [ ] NFR-6 **Accessibility:** segmented choices use `aria-pressed` or `role="group"` labels, score values have text equivalents, and the `#now` view and the Progress day columns work with a keyboard.
- [ ] NFR-7 **Performance:** each sender tick adds at most a few queries, with nothing fetched per user in a loop. Streak calculation uses `completionIndex` and looks back at most 400 days. The schedule index (steps and courses by id) is built once per data change, not once per date.
- [ ] NFR-8 **History is stable:** no phase 2 feature changes past weeks' totals as a side effect. Ending a course, deleting a course or step, and editing nudges or targets leave earlier days' instances and points as they were. Only the explicit "Delete these habits" action (FR-21) removes completions.

## 4. Architecture

- **Pattern:** the existing **REST API + SPA with a layered backend**, extended in place. PocketBase is the data and rules layer: the schema handles ownership and types, and `pb_hooks` handles cross-record rules. `src/lib` is the shared domain layer, made of pure functions used by both the React app and the Node sender. `src/views` and `src/components` are the presentation layer. `push/sender.mjs` is a second client of the same domain layer. Phase 1 already proved this split works. Phase 2 needs no new runtime, service or framework, only new collections, new pure functions and new UI. The simplest correct design is to keep it.

- **Where each kind of logic lives** (this is the rule every task follows):

| Concern | Module | Used by |
|---|---|---|
| Scheduling and derived numbers: schedule index, `activeWindow`, `blockOccursOn`, instances, summaries, upcoming blocks, score card, habit streaks, suggestions, course progress and end dates, month stats, target progress | `src/lib/stats.js` | app, sender, tests |
| Timing: when a push is due, nudge presets and validation, grace, the "day ends at" default | `src/lib/reminders.js` | app (Settings), sender |
| Short wording shared by app and push: nudge text, celebrations, "tomorrow" lines, score headline | `src/lib/messages.js` (new) | app, sender |
| The ~250 affirmations and `affirmationFor(date)` | `src/lib/affirmations.js` (new; a separate file because it's a large content list) | app, sender |
| Date and time units and formatting | `src/lib/time.js` | everyone |
| Validation, ownership, and the dates written when a step or course is deleted | schema rules in `pb_migrations`, plus `pb_hooks/guards.js` | server |

- **The one scheduling rule (D-14, D-15).** `scheduleIndex(courses, courseSteps)` builds `{ stepsById, coursesById, maxWeekByCourse }` once. `activeWindow(record, schedule)` returns `{ start, end }` for any task or block:
  - With a `step`: `start = course.startDate + (week − 1) × 7`, and `end = courseEndDate(course)` if `onEnd` is `stop`, otherwise `null`. For blocks, the end is also capped by `recurUntil` if that's earlier.
  - Without a `step`: tasks use `task.date || created` to `task.recurUntil || null`. Blocks use `block.date` to `block.recurUntil || null`, which is today's behavior.

  `blockOccursOn(block, date, schedule)` and `instancesForDate` check this window. `instancesForDate` reads `data.schedule`. `dueReminders`, `dueDailyMessages` and `habitStreak` all go through it, so the app, the sender and the streaks always agree. `pb_hooks` can't import `src/lib`, so the window maths used when *writing* dates on step or course deletion is repeated in `guards.js`, with a "Keep in sync with activeWindow in stats.js" comment in both places.

- **Diagram:**
  ```mermaid
  flowchart LR
    subgraph Browser["PWA (Netlify)"]
      Views["views/ + components/"] --> DC["DataContext.jsx\n(+ schedule index)"]
      Views --> Lib["lib/: stats.js, reminders.js, messages.js, affirmations.js, time.js"]
      DC --> PBJS["pb.js (PocketBase SDK)"]
      SW["public/sw.js"]
    end
    subgraph VM["GCP VM"]
      PB["PocketBase\nschema rules + pb_hooks"] --> DB[(SQLite)]
      Sender["push/sender.mjs\n(every minute)"] --> PB
      Sender --> Lib2["same src/lib modules"]
    end
    PBJS -- REST --> PB
    Sender -- Web Push --> PushSvc["Apple / Google / Mozilla"] --> SW
  ```

- **Tech stack (unchanged):**
  - React 19 + Vite, plain JSX: the existing frontend. No router library; `App.jsx` hash routing gains one route that isn't a nav tab (`#now`).
  - PocketBase (SQLite): the existing backend. New collections go through migrations, and new rules go in `guards.js`.
  - `web-push` in Node: the existing sender. It gains new kinds of message in the same per-minute loop.
  - Manifest `shortcuts`: the app shortcut for "Next 3 hours". No dependency.

### "Next 3 hours" delivery (D-11)
Neither iOS nor Android can show a home-screen widget for a PWA, and the Windows 11 Widgets Board option was dropped. Notch therefore ships a compact **`/#now` view**, which works on every platform, plus a manifest **`shortcuts`** entry. The shortcut works on Android (long-press the installed app) and on Windows and macOS (right-click or the jump list). **Limits:** it's a launcher, so the user still opens the app. iOS ignores manifest shortcuts. The Settings help says so plainly and doesn't recommend the Shortcuts-app workaround, because that opens Safari with a separate login.

## 5. Folder & File Structure

Only new or changed files are listed. Everything else stays as described in CLAUDE.md.

```
Habit Tracker/
├── plan.md                                   # this plan (single source of truth)
├── package.json                              # + "test:stats" script (no new deps)
├── public/
│   ├── manifest.webmanifest                  # + "shortcuts" → /#now
│   └── shortcut-now-96.png                   # NEW: shortcut icon
├── src/
│   ├── App.jsx                               # route #now that isn't a nav tab
│   ├── lib/
│   │   ├── DataContext.jsx                   # + checkins, plans, plan_targets, courses, course_steps; exposes `schedule`
│   │   ├── stats.js                          # + upcomingBlocks, dayScore, habitStreak, ENERGY_LEVELS, EFFORT_LEVELS,
│   │   │                                     #   suggestForEnergy, scheduleIndex, courseEndDate, activeWindow,
│   │   │                                     #   courseStats, monthStats, targetProgress; blockOccursOn takes schedule
│   │   ├── reminders.js                      # + DEFAULT_DAY_END, dayEndMinutes, NUDGE_PRESETS, NUDGE_STEP,
│   │   │                                     #   MAX_NUDGES, cleanNudgeTimes, dueDailyMessages; uses activeWindow
│   │   ├── messages.js                       # NEW: scoreHeadline, closingLine, nudgeText, CELEBRATIONS, TOMORROW_LINES
│   │   ├── affirmations.js                   # NEW: AFFIRMATIONS (~250) + affirmationFor(date)
│   │   └── time.js                           # + monthDates, monthOf (next to existing dayLabel/weekLabel)
│   ├── components/
│   │   ├── ScoreCard.jsx / ScoreCard.css     # NEW: end-of-day card for today or any past date
│   │   ├── EnergyCheckin.jsx                 # NEW: high/normal/low picker + suggestions
│   │   ├── NudgeTimesPicker.jsx              # NEW: presets + editable list of nudge times
│   │   ├── MonthPlan.jsx / MonthPlan.css     # NEW: month intention, notes, stats, targets
│   │   ├── TargetEditor.jsx                  # NEW: create/edit a monthly target (modal)
│   │   ├── CourseList.jsx                    # NEW: courses active in a month, with progress and end date
│   │   ├── CourseEditor.jsx                  # NEW: title, start, onEnd, weekly steps, "Delete these habits"
│   │   ├── TaskEditor.jsx                    # + effort tag; + course step; + "Ends" for daily habits
│   │   ├── BlockEditor.jsx                   # + course step for repeating blocks
│   │   └── TaskItem.jsx                      # + 🔥 streak chip, effort chip
│   └── views/
│       ├── Home.jsx / Home.css               # uses upcomingBlocks, affirmationFor, ScoreCard, EnergyCheckin
│       ├── Now.jsx / Now.css                 # NEW: compact "Next 3 hours" view at #now
│       ├── Calendar.jsx                      # passes `schedule` to blocksForDate
│       ├── Progress.jsx / Progress.css       # Week/Month switch; day column → ScoreCard modal
│       └── Settings.jsx                      # Notifications: affirmation, nudge times, day end, day-end push
├── pocketbase/
│   ├── pb_migrations/
│   │   ├── 1794200000_day_end.js             # NEW: users.dayEndAt
│   │   ├── 1794300000_energy.js              # NEW: checkins collection + tasks.effort
│   │   ├── 1794400000_notification_prefs.js  # NEW: users.affirmationAt, nudgeTimes, dayEndPush
│   │   └── 1794500000_plans_courses.js       # NEW: plans, plan_targets, courses (+onEnd), course_steps,
│   │                                         #      tasks.step, tasks.recurUntil, blocks.step
│   └── pb_hooks/
│       ├── guards.js                         # + nudgeTimes validation, RELATIONS, step/target/onEnd rules, window maths
│       └── main.pb.js                        # + new collections in GUARDED; delete hooks for courses and course_steps
├── push/
│   ├── sender.mjs                            # + daily messages, wider completions, courses/steps → schedule
│   └── README.md                             # + new notification kinds, course windows
└── scripts/
    ├── api-test.mjs                          # + checks for every new collection/rule
    ├── reminders-test.mjs                    # + dueDailyMessages, nudge times, course window checks
    └── stats-test.mjs                        # NEW: pure tests for stats.js derivations
```

Migration timestamps are suggestions. They must sort after `1761300000` and follow build order. If features ship in a different order, rename **before** a migration is deployed and never after.

## 6. Data Model

### New and changed fields

| Entity | Field | Type | Rules |
|---|---|---|---|
| users | dayEndAt | text | pattern `^(([01]\d\|2[0-3]):[0-5]\d)?$`. `""` = `DEFAULT_DAY_END` ("21:00") |
| users | affirmationAt | text | same HH:MM pattern. `""` = no affirmation push |
| users | nudgeTimes | json | minutes since midnight. The hook normalizes it: `null` → `[]` (off), each value an integer 0–1425 in steps of 15, at most 6, unique, sorted ascending. **Keep `NUDGE_STEP` and `MAX_NUDGES` in sync between `reminders.js` and `guards.js`.** |
| users | dayEndPush | bool | send the day-end push at dayEndAt |
| tasks | effort | select | optional: `light`, `medium`, `heavy`. Empty = untagged. **Values must match `EFFORT_LEVELS` in stats.js.** |
| tasks | step | relation → course_steps | optional, maxSelect 1, cascadeDelete **false** (habits survive, D-8) |
| tasks | recurUntil | text | optional, `^(\d{4}-\d{2}-\d{2})?$`. Last day a daily habit runs, the same meaning as `blocks.recurUntil`. Editable for unstepped daily habits. **Cleared by the hook on stepped tasks**, because the course decides their end. The delete hooks write it when a `stop` course's habit is unlinked. |
| blocks | step | relation → course_steps | optional, maxSelect 1, cascadeDelete **false**. Only allowed when `recurrence` isn't `none` (the hook enforces it). |
| checkins | user | relation → users | required, cascadeDelete |
| checkins | date | text | required, `^\d{4}-\d{2}-\d{2}$` |
| checkins | energy | select | required: `high`, `normal`, `low`. **Values must match `ENERGY_LEVELS` in stats.js.** |
| checkins | — | index | `UNIQUE (user, date)`, one check-in per day |
| plans | user | relation → users | required, cascadeDelete |
| plans | month | text | required, `^\d{4}-(0[1-9]\|1[0-2])$` ("YYYY-MM") |
| plans | intention | text | max 200 |
| plans | notes | text | max 4000 |
| plans | — | index | `UNIQUE (user, month)` |
| plan_targets | user | relation → users | required, cascadeDelete |
| plan_targets | plan | relation → plans | required, cascadeDelete true |
| plan_targets | title | text | required, max 120 (for example "400 Fitness points") |
| plan_targets | kind | select | required: `points`, `percent`, `completions` |
| plan_targets | target | number | required, onlyInt, min 1. The hook enforces max 100 when kind is `percent` |
| plan_targets | category | relation → categories | optional. Allowed only when kind is `points`; the hook clears it otherwise. cascadeDelete false |
| plan_targets | task | relation → tasks | **required by the hook** when kind is `completions` and cleared otherwise. cascadeDelete true: a count target for a deleted habit is meaningless |
| courses | user | relation → users | required, cascadeDelete |
| courses | title | text | required, max 120 |
| courses | startDate | text | required, `^\d{4}-\d{2}-\d{2}$` |
| courses | onEnd | select | `keep`, `stop`. The hook sets `keep` when empty. **There is no end-date field**: the end is derived from the highest step week. |
| courses | notes | text | max 2000 |
| course_steps | user | relation → users | required, cascadeDelete |
| course_steps | course | relation → courses | required, **cascadeDelete true** |
| course_steps | week | number | required, onlyInt, min 1, max 52 |
| course_steps | title | text | required, max 120 (for example "Wake by 8") |
| course_steps | notes | text | max 1000 |
| course_steps | — | index | `UNIQUE (course, week)` |

Every new collection uses the `owned()` rule set from `1761100000_init_schema.js`, copied into each new migration because migrations can't import each other:
- list, view and delete: `user = @request.auth.id`
- create: `@request.auth.id != '' && @request.body.user = @request.auth.id`
- update: `user = @request.auth.id && (@request.body.user:isset = false || @request.body.user = @request.auth.id)`
- `created` and `updated` autodate fields

### Relationships (all point one way)
- `checkins.user → users`. Nothing points back.
- `plan_targets.plan → plans`, `plan_targets.category → categories`, `plan_targets.task → tasks`. A plan does **not** list its targets. A target stores **no progress or current value**.
- `plans` do **not** list courses. "Courses this month" is derived from each course's derived start and end.
- `course_steps.course → courses`. A course does **not** store its steps, its length or its end date. All three are derived.
- `tasks.step → course_steps` and `blocks.step → course_steps`. A step does **not** list its habits or blocks. Tasks on a stepped block don't need their own step, because they follow the block.

### How each principle applies
| Principle | Where it bites in phase 2 |
|---|---|
| One fact, one place | A stepped item's start and end are **derived** from `course.startDate`, `step.week`, the course's highest week and `onEnd`. The hook clears `tasks.date` and `tasks.recurUntil` on stepped tasks so there's no second copy. A stepped block's `date` is only its weekday anchor. The month lives only on `plans`, and targets inherit it through `plan`. Affirmations live only in `affirmations.js`; Home's inline list of 10 moves there. Which nudge preset is selected is derived by comparing `nudgeTimes` to `NUDGE_PRESETS`; there is no stored "level". |
| Relationships point one way | task → step → course, block → step → course, target → plan. No reverse lists. |
| Derive, don't store | Score card, habit streaks, the 7-day average, suggestions, nudge content and tone, course progress and end dates, active windows, month stats and target progress are all computed in `stats.js`, `messages.js` and `reminders.js`. Only the user's *inputs* are stored: energy, effort, preferences, plan text, target definitions, course structure and `onEnd`. "Score card dismissed today" is device UI state in `localStorage`, not domain data. The one case where dates are written is the delete hooks in B-7: once a step is gone there's nothing left to derive from, so the derived window is frozen onto the record. |
| Store the useful unit | `nudgeTimes` are minutes, like `blocks.start`. Single times are `"HH:MM"`, like the existing `remindAt`. Dates are ISO, months are `"YYYY-MM"`, weeks are integers. Target progress uses the snapshotted `completions.points`. |
| Server is the authority | The schema enforces selects and patterns. `guards.js` enforces: valid nudge times, same-owner relations, "only daily habits and repeating blocks can have a step", clearing `block`, `date`, `remindDate` and `recurUntil` on stepped tasks, the field rules for each target kind, the `onEnd` default, and the dates written on deletion. |
| Keep shared rules in sync | **New sync points:** (1) `NUDGE_STEP` and `MAX_NUDGES` in `reminders.js` ↔ `guards.js`; (2) the `checkins.energy` select ↔ `ENERGY_LEVELS`; (3) the `tasks.effort` select ↔ `EFFORT_LEVELS`; (4) the `plan_targets.kind` select ↔ the `targetProgress` switch; (5) `activeWindow()` is the only start/end rule, used by `blockOccursOn`, `instancesForDate`, `habitStreak`, `dueReminders` and `dueDailyMessages`; (6) the window maths in `guards.js` (used when writing dates on delete) ↔ `activeWindow`/`courseEndDate` in `stats.js`. Each pair gets a "Keep in sync with …" comment in both places. |

## 7. API Contract

All calls go through the PocketBase SDK (`pb.collection(name)`) with the standard REST endpoints. In the app, writes go through `DataContext.save` and `remove`, except user preferences, which use `pb.collection("users").update` as Settings does today.

| Method | Path | Request body | Success response | Errors |
|---|---|---|---|---|
| PATCH | `/api/collections/users/records/:id` | any of `{dayEndAt, affirmationAt, nudgeTimes, dayEndPush}` | user (`nudgeTimes` normalized) | 400 bad pattern; 400 "Nudge times must be up to 6 times in 15-minute steps." |
| GET | `/api/collections/checkins/records` | — | owner's check-ins | 401 |
| POST | `/api/collections/checkins/records` | `{user, date, energy}` | record | 400 bad energy/date, 400 duplicate (user,date) |
| PATCH | `/api/collections/checkins/records/:id` | `{energy}` | record | 400, 404 not owner |
| POST/PATCH | `/api/collections/tasks/records[/:id]` | existing fields + `effort`, `step`, `recurUntil` | record. With `step` set: `daily` is forced true, and `block`, `date`, `remindDate` and `recurUntil` are cleared | 400 bad effort or date; 400 "Invalid step." (not owner) |
| POST/PATCH | `/api/collections/blocks/records[/:id]` | existing fields + `step` | record | 400 "Invalid step." (not owner); 400 "A course block must repeat." |
| GET/POST/PATCH/DELETE | `/api/collections/plans/records[/:id]` | `{user, month, intention, notes}` | record. DELETE cascades to targets | 400 bad month, 400 duplicate month, 404 |
| GET/POST/PATCH/DELETE | `/api/collections/plan_targets/records[/:id]` | `{user, plan, title, kind, target, category?, task?}` | record (fields that don't apply to the kind are cleared) | 400 "Invalid plan/category/task."; 400 "A habit target needs a habit."; 400 "A % target must be 1–100." |
| GET/POST/PATCH/DELETE | `/api/collections/courses/records[/:id]` | `{user, title, startDate, onEnd, notes}` | record (`onEnd` defaults to `keep`). DELETE cascades to steps; habits and blocks are kept with their dates written on (B-7) | 400 bad onEnd, 404 |
| GET/POST/PATCH/DELETE | `/api/collections/course_steps/records[/:id]` | `{user, course, week, title, notes}` | record. DELETE unlinks tasks and blocks and writes their dates on (B-7) | 400 "Invalid course.", 400 duplicate week, 404 |

**"Delete these habits" (FR-21)** isn't a new endpoint. The app deletes each linked task and block with the normal DELETE calls, through `DataContext.remove`, after confirmation. The existing cascades remove their completions.

**Push payload (sender → sw.js), unchanged shape:** `{ title, body, url, tag }`. New tags: `affirmation`, `nudge`, `dayend`. Each replaces the previous notification of its kind. All three open `/#home`, where the score card shows after "day ends at". `sw.js` needs no changes.

**Shared function signatures (binding for the F and B tasks):**
- `scheduleIndex(courses = [], courseSteps = [])` → `schedule = { stepsById, coursesById, maxWeekByCourse }`. An empty schedule means "no courses".
- `courseEndDate(course, schedule)` → ISO date, or `null` if the course has no steps
- `activeWindow(record, schedule)` → `{ start, end | null }` for a task or block (see §4)
- `blockOccursOn(block, date, schedule)` and `blocksForDate(blocks, date, schedule)`. `schedule` is optional only so phase 1 callers keep working until F-21; every caller must pass it once Feature 5 ships.
- `instancesForDate(data, date, today)`: reads `data.schedule`. Tasks on a block inherit the block's window. Daily tasks use their own `activeWindow`.
- `upcomingBlocks(blocks, today, nowMinutes, windowMinutes = 180, schedule)` → `[{ block, date, start, end, live }]`. `start` and `end` are relative to today's midnight, so tomorrow's blocks get +1440.
- `habitStreak(data, task, date, today)` → integer. Applies to daily and block tasks only; one-offs return 0.
- `dayScore(data, date, today)` → `{ date, total, done, percent, points, possiblePoints, bestCategory, complete, streaks: [{ task, count, keptToday, broken }], weekAvgPercent, energy }`
- `suggestForEnergy(instances, energy, limit = 3)` → instances
- `courseStats(data, course, today)` → `{ currentWeek, endDate, onEnd, ended, weeks: [{ week, step, startDate, percent }] }`
- `monthStats(data, month, today)` → summary for the month (same fields as `summarize`)
- `targetProgress(data, target, plan, today)` → `{ current, target, percent, reached }`
- `cleanNudgeTimes(value)` → sorted array, or `null` if invalid; `nudgeTimesFor(user)` → array
- `dueReminders({ now, blocks, tasks, completionIndex, userDefault, schedule })` (gains `schedule`) and `dueDailyMessages({ now, user, data })` → `[{ key, title, body, url, tag, topic, ttl }]`
- `affirmationFor(date)`, `nudgeText(summary, nextInstance)`, `closingLine(summary, date)`, `scoreHeadline(summary)` → strings

## 8. Task Breakdown

Features are ordered so each one ships on its own. **Build Feature 1 first.** It needs no schema change and no backend work, it refactors a helper that later features reuse, and it delivers "next 3 hours" on every platform right away.

Recommended order: **1 Next 3 hours → 2 Score card → 3 Energy check-in → 4 Notifications → 5 Plans, targets & courses.**
Notifications come after the score card because the day-end push reuses `scoreHeadline` and `closingLine`. Plans and courses come last because they are the largest feature and change the shared scheduling rule.

**Model guide:** `sonnet` is for well-specified UI, migrations and content tasks. `opus` is for shared scheduling or timing rules, sender changes, hooks with cross-collection checks, and reviews of those.

### Shared groundwork
- [ ] F-1 · Model: sonnet · Stats test harness
  Files: scripts/stats-test.mjs, package.json
  Add `scripts/stats-test.mjs` (same style as `reminders-test.mjs`, pure, no server) and the `"test:stats"` script. Cover the existing `blockOccursOn`, `instancesForDate` and `summarize` first.
  Depends on: — · Covers: NFR-3
  Accepts: `npm run test:stats` passes and exits 1 on failure. No new dependency. CLAUDE.md's Commands section should list `test:stats` (user to approve).
  Tests: `npm run test:stats`

### Feature 1: Next 3 hours
- [ ] F-2 · Model: opus · upcomingBlocks helper (crosses midnight)
  Files: src/lib/stats.js, src/views/Home.jsx, scripts/stats-test.mjs
  Move the inline "next 3 hours" filter in `Home.jsx` into `stats.js upcomingBlocks()`. Include tomorrow's blocks that start before `now + window`, reusing the approach in `dueReminders`. Accept the optional `schedule` argument now so F-21 only has to pass it. Home uses it.
  Depends on: F-1 · Covers: FR-1
  Accepts: Home looks the same. At 11:30 PM a 12:15 AM block appears. Live blocks are flagged.
  Tests: `npm run test:stats`
- [ ] F-3 · Model: sonnet · Now view at #now
  Files: src/views/Now.jsx, src/views/Now.css, src/App.jsx, src/views/Home.jsx
  The view lists upcoming blocks with their open tasks for that date (checkable through `TaskItem`/`toggleTask`) and today's top 3, and refreshes every minute. `App.jsx` supports routes that aren't nav tabs (`hidden: true` in `VIEWS`), and Home's "Next 3 hours" card links to it.
  Depends on: F-2 · Covers: FR-1
  Accepts: works at 360px and in dark mode. No nav tab is highlighted. Checking a task updates Home.
  Tests: `npm run build`, then a manual check at mobile width
- [ ] F-4 · Model: sonnet · App shortcut to #now
  Files: public/manifest.webmanifest, public/shortcut-now-96.png, src/views/Settings.jsx
  Add a manifest `shortcuts` entry for "Next 3 hours" → `/#now`, and a "Quick access" help line in Settings covering long-press on Android, right-click on desktop, and the fact that iOS doesn't support it.
  Depends on: F-3 · Covers: FR-2
  Accepts: the manifest validates in Chrome DevTools → Application. Long-press on Android shows the shortcut once the app is reinstalled or updated.
  Tests: `npm run build`, then a manual check

### Feature 2: End-of-day score card and habit streaks
- [ ] B-1 · Model: sonnet · Migration: users.dayEndAt
  Files: pocketbase/pb_migrations/1794200000_day_end.js, scripts/api-test.mjs
  The up function adds `users.dayEndAt` (HH:MM pattern) and the down function removes it. No hook is needed because the schema pattern is the rule.
  Depends on: — · Covers: FR-5, NFR-2
  Accepts: api-test shows that a valid time saves, `"25:00"` is rejected and `""` is allowed.
  Tests: restart PocketBase, then `npm run test:api`
- [ ] F-5 · Model: sonnet · Affirmations list (~250) and affirmationFor
  Files: src/lib/affirmations.js, src/views/Home.jsx, scripts/stats-test.mjs
  Create `affirmations.js` with about 250 short, original, uplifting affirmations, absorbing Home's existing 10, and remove the inline list from `Home.jsx`. `affirmationFor(date)` turns the local ISO date into a day number and picks `AFFIRMATIONS[(dayNumber * STRIDE) % length]`, where `STRIDE` is coprime with the length. The result looks random, is the same everywhere for a given date, and doesn't repeat for `length` days. Home uses it.
  Depends on: F-1 · Covers: FR-10
  Accepts: the same date always gives the same text, consecutive dates differ, there are no duplicate entries, and every entry is at most 120 characters. It uses no `Date.now()` and no `Math.random()`.
  Tests: `npm run test:stats`
- [ ] F-6 · Model: sonnet · End-of-day score card
  Files: src/lib/stats.js (dayScore, habitStreak, alongside weekStats), src/lib/messages.js, src/lib/reminders.js, scripts/stats-test.mjs
  The score card's derived data and wording:
  - **`stats.js`:** add `habitStreak()` (A-6; uses `completionIndex.byTask`, looks back at most 400 days, and reads windows through `activeWindow` once F-15 exists) and `dayScore()`.
  - **`messages.js` (new):** `scoreHeadline(summary)`; `closingLine(summary, date)`, which is a celebration if the day is complete and a "you'll get it tomorrow" line if not; and `CELEBRATIONS` and `TOMORROW_LINES`, about 20 each, picked per date like affirmations.
  - **`reminders.js`:** add `DEFAULT_DAY_END = "21:00"` and `dayEndMinutes(user)`.

  Depends on: F-1 · Covers: FR-3, FR-4, FR-6, FR-12
  Accepts: streak tests cover a weekdays block over a weekend (no break), an undone habit today (no break yet), a missed yesterday (count 0), and a habit created today. `scoreHeadline` and `closingLine` only need a `summarize` result, so the sender doesn't need completion history. There are no browser globals in the lib files.
  Tests: `npm run test:stats`, `npm run test:reminders`
- [ ] F-7 · Model: sonnet · ScoreCard component, Progress day modal, streak chip
  Files: src/components/ScoreCard.jsx, src/components/ScoreCard.css, src/views/Home.jsx, src/views/Progress.jsx, src/components/TaskItem.jsx
  Add `ScoreCard` with a prop `date`. Home shows today's card when `nowMinutes() >= dayEndMinutes(user)` or the day is complete, with a dismiss button (remembered per date in `localStorage`). In Progress, tapping a day column (a button) opens that day's card in `Modal`. `TaskItem` shows a `chip` with "🔥 N" for habits with a streak of 2 or more.
  Depends on: F-6 · Covers: FR-3, FR-4, FR-6
  Accepts: nothing new is stored. Past cards use the snapshotted `completions.points`. Works with a keyboard and in dark mode.
  Tests: `npm run build`, `npm run test:stats`
- [ ] F-8 · Model: sonnet · Settings: Day ends at
  Files: src/views/Settings.jsx
  Add a "Day ends at" time input, saved to `users.dayEndAt`.
  Depends on: B-1, F-6 · Covers: FR-5
  Accepts: the change takes effect on Home without a reload (the auth store record updates). Server errors are shown.
  Tests: `npm run build`

### Feature 3: Energy check-in and effort tags
- [ ] B-2 · Model: sonnet · Migration: checkins + tasks.effort
  Files: pocketbase/pb_migrations/1794300000_energy.js, pocketbase/pb_hooks/main.pb.js, scripts/api-test.mjs
  Create `checkins` with owner rules, the energy select and `UNIQUE (user, date)`, and add the `tasks.effort` select. The down function removes `tasks.effort` and deletes `checkins`. Add `"checkins"` to `GUARDED`. `check()` needs no special branch.
  Depends on: — · Covers: FR-7, FR-8, NFR-1, NFR-2
  Accepts: api-test can create a check-in and update its energy. It rejects a duplicate date, `"tired"` and `effort: "extreme"`, and shows the intruder can't list, view or update a check-in.
  Tests: restart PocketBase, then `npm run test:api`
- [ ] F-9 · Model: sonnet · Energy data and suggestForEnergy
  Files: src/lib/DataContext.jsx, src/lib/stats.js, scripts/stats-test.mjs
  Add `checkins` to `COLLECTIONS` and the initial state. In `stats.js` add `ENERGY_LEVELS`, `EFFORT_LEVELS` (synced with the selects) and `suggestForEnergy(instances, energy)`, which only considers open instances. Block tasks are included only while their block is live or upcoming today. Untagged tasks are treated by points: ≤ 10 is light, ≥ 50 is heavy, otherwise medium.
  - **low:** light first, then medium. Heavy is excluded. Priority wins ties.
  - **normal:** priority first, then medium and light before heavy.
  - **high:** heavy first, then the most points, including overdue one-offs.

  Depends on: B-2, F-1 · Covers: FR-9
  Tests: `npm run test:stats`
- [ ] F-10 · Model: sonnet · Effort tag in TaskEditor and TaskItem
  Files: src/components/TaskEditor.jsx, src/components/TaskItem.jsx
  Add an optional effort `seg` (None / Light / Medium / Heavy, `aria-pressed`) to the editor, and show a small effort chip on the task row when one is set.
  Depends on: B-2 · Covers: FR-8
  Tests: `npm run build`
- [ ] F-11 · Model: sonnet · EnergyCheckin on Home
  Files: src/components/EnergyCheckin.jsx, src/views/Home.jsx, src/views/Home.css, src/components/ScoreCard.jsx
  A `seg` picker (High / Normal / Low) that creates or updates today's check-in, disables the buttons while saving, and shows up to 3 suggestions as `TaskItem`s. `ScoreCard` shows the day's energy.
  Depends on: F-9, F-7 · Covers: FR-7, FR-9
  Accepts: changing energy updates the existing record rather than creating a second one. Mobile and dark mode work.
  Tests: `npm run build`

### Feature 4: Nudges, affirmations and the day-end push
- [ ] B-3 · Model: sonnet · Migration + guard: notification prefs
  Files: pocketbase/pb_migrations/1794400000_notification_prefs.js, pocketbase/pb_hooks/guards.js, scripts/api-test.mjs
  Add `users.affirmationAt` (HH:MM pattern), `users.nudgeTimes` (json, maxSize 2000) and `users.dayEndPush` (bool); the down function removes all three. In `guards.js`, the existing `users` branch gains `cleanNudgeTimes`: `null` becomes `[]`, otherwise the value must be at most `MAX_NUDGES` (6) integers between 0 and 1425 in steps of `NUDGE_STEP` (15), saved deduplicated and sorted ascending. Add "Keep in sync with reminders.js" comments.
  Depends on: B-1 · Covers: FR-11, FR-14, NFR-2
  Accepts: in api-test, `[720, 1080]` saves and `[1080, 720, 720]` is normalized to `[720, 1080]`. `[725]`, `[1440]`, seven times, `"noon"` and a bad `affirmationAt` are rejected.
  Tests: restart PocketBase, then `npm run test:api`
- [ ] F-12 · Model: opus · dueDailyMessages timing rules
  Files: src/lib/reminders.js, src/lib/messages.js, scripts/reminders-test.mjs
  In `reminders.js` add `NUDGE_STEP`, `MAX_NUDGES`, `NUDGE_PRESETS = { light: [1080], regular: [720, 1080], frequent: [600, 840, 1080] }`, `cleanNudgeTimes`, `nudgeTimesFor(user)` and `dueDailyMessages({ now, user, data })`. That function is pure and returns at most:
  - `affirmation|DATE` at `affirmationAt`, with text from `affirmationFor(now.date)`.
  - `nudge|DATE|SLOT` for each time in `nudgeTimes` before `dayEndMinutes(user)`, when the day has tasks and isn't complete. Body: `nudgeText(summary, next open priority)`, which is encouraging and never guilt-tripping.
  - `nudge-done|DATE` at the first nudge time reached once the day is complete: a celebration, sent once. Later times that day are skipped.
  - `dayend|DATE` at `dayEndMinutes(user)` when `dayEndPush` is on and the day has tasks. Body: `scoreHeadline(summary)` plus `closingLine(summary, date)`.

  Each message uses the `TASK_GRACE_MINUTES` window, clamped at midnight, with a TTL equal to the time left in it. Add `nudgeText` to `messages.js`.
  Depends on: F-5, F-6, B-3 (field names) · Covers: FR-10, FR-11, FR-12, FR-13, NFR-4
  Accepts: `reminders-test.mjs` covers the windows, custom times, presets, the celebration sent once, the "tomorrow" closing line, days with no tasks, nothing after day end, and the affirmation matching `affirmationFor`.
  Tests: `npm run test:reminders`, `npm run test:stats`
- [ ] B-4 · Model: opus · Sender: daily messages + completion loading fix
  Files: push/sender.mjs, push/README.md
  Extend the tick:
  1. Fetch users with `fields: "id,remindBefore,dayEndAt,affirmationAt,nudgeTimes,dayEndPush"`.
  2. **Fix completion loading for progress counts.** Load completions for *all* one-off tasks, not only those with `remindAt`, for example with the relation filter `task.daily = false && task.block = ''`. Otherwise an old, completed one-off shows as open today and the nudge counts are wrong.
  3. For each subscription, build the data for `instancesForDate` and call `dueDailyMessages` alongside `dueReminders`. Dedupe with the existing `sent` map (key `subId|msg.key`).
  4. Document the new kinds, defaults and limits in the README.

  Depends on: F-12 · Covers: FR-10, FR-11, FR-12, FR-13, NFR-7
  Accepts: at most one extra query per tick. `npm run push:test` still works. Users with everything off get only the existing reminders.
  Tests: `npm run test:reminders`, then a manual `npm run push:sender` against local PocketBase
- [ ] F-13 · Model: sonnet · Settings: Notifications card
  Files: src/views/Settings.jsx, src/components/NudgeTimesPicker.jsx
  Turn the "Reminders" card into "Notifications":
  - a daily affirmation toggle and time
  - `NudgeTimesPicker`: an on/off toggle (on applies Regular), preset chips Light, Regular and Frequent (highlighted when `nudgeTimes` equals a preset, so the selection is derived), and the list of times with ✕ to remove and an "Add time" input (`step="900"`)
  - a "Send my day-end score" checkbox next to the F-8 "Day ends at" field

  Depends on: B-3, F-12, F-8 · Covers: FR-14, FR-11
  Accepts: each control saves on change and rolls back with an error if the server rejects it, using the pattern `changeDefaults` already uses. The add button is disabled at 6 times. Works at 360px.
  Tests: `npm run build`
- [ ] F-14 · Model: sonnet · (Optional) Energy-aware nudge wording
  Files: src/lib/reminders.js, src/lib/messages.js, scripts/reminders-test.mjs
  `dueDailyMessages` and `nudgeText` accept today's `energy` and use gentler lines on low-energy days.
  Depends on: B-2, F-12 · Covers: FR-11
  Tests: `npm run test:reminders`
- [ ] B-5 · Model: opus · (Optional) Sender loads today's check-ins
  Files: push/sender.mjs
  Load today's `checkins` (one query, grouped by user) and pass `energy` into `dueDailyMessages`.
  Depends on: B-4, F-14 · Covers: FR-11
  Tests: `npm run test:reminders`

### Feature 5: Monthly plans, targets and courses
- [ ] B-6 · Model: sonnet · Migration: plans, targets, courses, steps
  Files: pocketbase/pb_migrations/1794500000_plans_courses.js
  Create `plans`, `plan_targets`, `courses` (with `onEnd` select `keep|stop`) and `course_steps` with owner rules and unique indexes. Add `tasks.step`, `tasks.recurUntil` and `blocks.step` (cascadeDelete false). The down function removes `blocks.step`, `tasks.recurUntil` and `tasks.step`, then deletes `course_steps`, `courses`, `plan_targets` and `plans` in that order. No end-date field is added to `courses`, because the end is derived (D-14).
  Depends on: — · Covers: FR-15, FR-16, FR-17, FR-22, NFR-1
  Tests: restart PocketBase, then `npm run test:api`
- [ ] B-7 · Model: opus · Hooks: course, step, target rules + delete date-stamping
  Files: pocketbase/pb_hooks/guards.js, pocketbase/pb_hooks/main.pb.js, scripts/api-test.mjs
  - **Relations:** `RELATIONS` gains `plan_targets: { plan: "plans", category: "categories", task: "tasks" }`, `course_steps: { course: "courses" }`, `tasks.step` and `blocks.step` → `"course_steps"`.
  - **Stepped tasks:** force `daily = true` and clear `block`, `date`, `remindDate` and `recurUntil`.
  - **Stepped blocks:** reject `recurrence = "none"` with "A course block must repeat."
  - **Courses:** set `onEnd = "keep"` when it's empty.
  - **Targets, by kind:**
    - `points`: clear `task`.
    - `percent`: clear `category` and `task`, and require target ≤ 100.
    - `completions`: require a `task` that is a daily habit or a block task, and clear `category`.
  - Add `plans`, `plan_targets`, `courses` and `course_steps` to `GUARDED`.
  - **Writing dates on delete (D-8, FR-20):** a step's start date is `addDays(course.startDate, (week − 1) × 7)`. A course's end date is `addDays(course.startDate, maxWeek × 7 − 1)`, using all of its steps. This is the window maths repeated from `stats.js` (sync point 6). Write the dates in `onRecordDelete` hooks, **before `e.next()`**, so every step still exists:
    - `courses` delete: write dates for every linked task and block of every step of the course.
    - `course_steps` delete on its own: write dates for that step's linked tasks and blocks. Skip records already unlinked.
    - For each linked **task:** set `date` to the step's start date, and if `onEnd` is `stop`, set `recurUntil` to the course's end date.
    - For each linked **block:** set `date` to the first date on or after the step's start that keeps a weekly block's weekday. If `onEnd` is `stop`, set `recurUntil` to the earlier of its existing value and the course's end date.

  Depends on: B-6 · Covers: FR-16, FR-18, FR-20, FR-22, NFR-1, NFR-2, NFR-8
  Accepts: api-test checks that:
  - cross-user links are rejected for every relation, including `blocks.step`
  - a stepped task becomes daily with no block or dates
  - a stepped one-off block is rejected
  - a percent target of 150 and a completions target with no task are rejected
  - deleting a `keep` course leaves its habits with the correct start date and no end
  - deleting a `stop` course leaves them with the correct start and end dates
  - a weekly stepped block keeps its weekday after unlinking
  - duplicate weeks and months are rejected
  Tests: `npm run test:api`
  Risk: confirm that a course's delete hook runs before the cascade to its steps. If the order differs, write the dates from the step hook using a course end computed before the cascade.
- [ ] F-15 · Model: opus · Shared course window rule (activeWindow)
  Files: src/lib/stats.js, src/lib/time.js, src/lib/reminders.js, scripts/stats-test.mjs, scripts/reminders-test.mjs
  - **`stats.js`:** add `scheduleIndex`, `courseEndDate`, `activeWindow` (§4), `courseStats`, `monthStats` and `targetProgress`. `blockOccursOn(block, date, schedule)` checks the block's window. For stepped blocks the start comes from the step, and `block.date` is only the weekday anchor. `instancesForDate` uses `data.schedule`: block tasks follow their block, and daily tasks use their own window, which also covers unstepped `tasks.recurUntil`. `habitStreak` and `upcomingBlocks` use the same rule.
  - **`targetProgress`:**
    - points: the sum of `completions.points` dated in the month, filtered to the category's tasks if a category is set
    - percent: `monthStats.percent`
    - completions: the number of completions of that task dated in the month
  - **`time.js`:** add `monthDates` and `monthOf`, next to the existing `dayLabel` and `weekLabel`.
  - **`reminders.js`:** `dueReminders` takes `schedule` and uses `activeWindow` for daily tasks and `blockOccursOn(…, schedule)` for blocks, so stepped items aren't reminded before their week or after a stopped course ends.

  Depends on: B-6, F-1 · Covers: FR-16, FR-18, FR-19, FR-22, NFR-8
  Accepts: tests cover a Week 2 habit hidden in Week 1 and shown in Week 2, a `stop` course's habit hidden the day after the end and still counted on past days, a `keep` course's habit running past the end, a stepped weekly block on the right weekday from its step start, a task on a stepped block following the block, removing the last step moving the end earlier, and no reminders outside the window.
  Tests: `npm run test:stats`, `npm run test:reminders`
- [ ] B-8 · Model: opus · Sender: course schedule
  Files: push/sender.mjs, push/README.md
  Load `courses` and `course_steps` each tick (two queries), group them by user, build `scheduleIndex` per user, and pass `schedule` into `dueReminders` and into the data given to `dueDailyMessages` and `instancesForDate`. Document course windows in the README.
  Depends on: F-15 · Covers: FR-18, FR-22, NFR-7
  Accepts: a stepped block or habit isn't reminded before its week or after a `stop` course ends.
  Tests: `npm run test:reminders`
- [ ] F-16 · Model: sonnet · DataContext + Progress Month mode + MonthPlan
  Files: src/lib/DataContext.jsx, src/views/Progress.jsx, src/views/Progress.css, src/components/MonthPlan.jsx, src/components/MonthPlan.css
  - **DataContext:** add `plans`, `plan_targets`, `courses` and `course_steps`, and expose a memoized `schedule = scheduleIndex(courses, course_steps)` in the context value. Add `plans`, `courses` and `course_steps` to the reload-on-delete list, because those deletes cascade and the hooks write dates.
  - **Progress:** add a Week/Month `seg` switch; Week mode is unchanged. Month mode has a month switcher and renders `MonthPlan`: an inline editor for the intention and notes (creating or updating that month's plan), `monthStats` with a `progress-bar`, and the targets with `targetProgress` bars.

  Depends on: F-15, B-7 · Covers: FR-15, FR-16
  Accepts: no new nav tab. Works at 360px and in dark mode.
  Tests: `npm run build`, `npm run test:stats`
- [ ] F-17 · Model: sonnet · TargetEditor
  Files: src/components/TargetEditor.jsx, src/components/MonthPlan.jsx
  A `Modal` styled like the reward editor. It edits the title, kind (`seg`: Points / % complete / Habit count), target, the category (points only) and the habit picker (completions only, daily habits and block tasks). It creates the month's plan first if none exists.
  Depends on: F-16 · Covers: FR-16
  Tests: `npm run build`
- [ ] F-18 · Model: sonnet · CourseList + CourseEditor (onEnd, manual delete)
  Files: src/components/CourseList.jsx, src/components/CourseEditor.jsx, src/views/Progress.jsx
  - **CourseList (Month mode):** the courses active that month, each with `courseStats`: the current week, per-week %, the derived end date, and "Habits keep going" or "Habits stop on <date>".
  - **CourseEditor (a `Modal`):** edits the title, start date, notes and "When the course ends" (`seg`: Keep habits / Stop habits, with help text "Stopping hides them after <end>; your history stays"), and adds, edits or removes week steps. Each step lists its habits and blocks, with "Add habit to this week" (opens `TaskEditor` with `defaults.step`) and "Add block to this week" (opens `BlockEditor` with `defaults.step`).
  - **Deleting the course:** shows "Its habits and blocks will be kept."
  - **"Delete these habits" (FR-21):** a separate danger button. It counts the linked tasks, blocks (and the tasks on those blocks) and their completions, then confirms: "This permanently deletes N habits and M check-offs. Past weeks' points will go down. To stop them without losing history, choose Stop habits instead." On confirm, it deletes through `DataContext.remove`.

  Depends on: F-16 · Covers: FR-17, FR-19, FR-20, FR-21
  Accepts: nothing is deleted without the confirmation. Choosing Stop never deletes anything. Works at 360px and in dark mode.
  Tests: `npm run build`
- [ ] F-19 · Model: sonnet · TaskEditor: course step and Ends date
  Files: src/components/TaskEditor.jsx
  For daily habits:
  - An optional "Part of course" step selector. With a step chosen, the "Starting" and "Ends" dates are hidden and the derived window is shown instead, for example "Starts Mon Nov 16 (Week 2) · stops with the course on Sun Dec 13" or "· keeps going after the course".
  - Without a step, an optional "Ends" date (`recurUntil`) appears next to "Starting".

  Depends on: F-16 · Covers: FR-18
  Tests: `npm run build`
- [ ] F-20 · Model: sonnet · BlockEditor: course step
  Files: src/components/BlockEditor.jsx
  When the block repeats, show an optional "Part of course" step selector. With a step chosen, the "Starts on" date becomes a weekday picker for weekly blocks (it saves any date with that weekday as the anchor) and is hidden for daily and weekday blocks. The derived window is shown the same way as in F-19. Choosing "Does not repeat" clears the step.
  Depends on: F-16 · Covers: FR-22
  Accepts: server errors ("A course block must repeat.") are shown. Works at 360px.
  Tests: `npm run build`
- [ ] F-21 · Model: sonnet · Pass schedule at every block call site
  Files: src/views/Calendar.jsx, src/views/Home.jsx, src/views/Now.jsx
  Pass `data.schedule` to `blocksForDate` and `upcomingBlocks` wherever they're called. Grep for `blockOccursOn(`, `blocksForDate(` and `upcomingBlocks(` to confirm there are no others. Views that use `instancesForDate` or `weekStats` get it through `data` automatically.
  Depends on: F-16 · Covers: FR-22, FR-18
  Accepts: a stepped block doesn't appear on the Calendar, Home or `#now` before its step's week, or after a `stop` course ends.
  Tests: `npm run build`, `npm run test:stats`

### Review & Testing (owner: reviewer)
- [ ] T-1 · Model: sonnet · Review Feature 1
  Files: src/lib/stats.js, src/views/Now.jsx, src/views/Home.jsx, src/App.jsx, public/manifest.webmanifest
  Check the `#now` view at 360px and 1280px, in light and dark mode, and that the manifest has no errors.
  Depends on: F-1–F-4
  Tests: `npm run test:stats`, `npm run build`
- [ ] T-2 · Model: sonnet · Review Feature 2
  Files: src/lib/stats.js, src/lib/messages.js, src/lib/affirmations.js, src/components/ScoreCard.jsx, pocketbase/pb_migrations/1794200000_day_end.js
  Confirm the score card and streaks are derived, not stored, that past days use `completions.points`, and that the affirmation is stable per date.
  Depends on: B-1, F-5–F-8
  Tests: `npm run test:api`, `npm run test:stats`, `npm run test:reminders`
- [ ] T-3 · Model: sonnet · Review Feature 3
  Files: pocketbase/pb_migrations/1794300000_energy.js, src/lib/stats.js, src/components/EnergyCheckin.jsx, src/components/TaskEditor.jsx
  Check ownership of `checkins` (the intruder cases), that there's one check-in per day, and that the effort select matches `EFFORT_LEVELS`.
  Depends on: B-2, F-9–F-11
  Tests: `npm run test:api`, `npm run test:stats`
- [ ] T-4 · Model: opus · Review Feature 4
  Files: src/lib/reminders.js, src/lib/messages.js, pocketbase/pb_hooks/guards.js, push/sender.mjs, src/views/Settings.jsx
  - `NUDGE_STEP` and `MAX_NUDGES` match between `guards.js` and `reminders.js`, and the TTL matches the grace window.
  - The one-off completion fix works in the sender.
  - The celebration is sent once, and the closing line follows D-13.

  Depends on: B-3, B-4, F-12, F-13
  Tests: `npm run test:reminders`, `npm run test:api`, then a test push
- [ ] T-5 · Model: opus · Review Feature 5
  Files: pocketbase/pb_migrations/1794500000_plans_courses.js, pocketbase/pb_hooks/guards.js, pocketbase/pb_hooks/main.pb.js, src/lib/stats.js, src/lib/reminders.js, push/sender.mjs, src/components/CourseEditor.jsx
  Check that:
  - all four new collections, `tasks.step` and `blocks.step` reject cross-user relations
  - target progress and course end dates are derived; there's no stored current value or end-date field
  - `activeWindow` is the only start/end rule in `stats.js`, `reminders.js` and the sender, and the window maths in `guards.js` matches it
  - choosing `stop` never deletes records, and past weeks' totals are unchanged after a course ends and after it's deleted (NFR-8)
  - "Delete these habits" warns before deleting
  - stepped blocks respect their window on the Calendar, Home and `#now`
  - Progress Month mode fits at 360px

  Depends on: B-6–B-8, F-15–F-21
  Tests: all of `npm run test:api`, `npm run test:stats`, `npm run test:reminders`, `npm run build`

### Task counts
Backend: B-1 to B-8, of which B-5 is optional (8). Frontend: F-1 to F-21, of which F-14 is optional (21). Review: T-1 to T-5 (5).

## 9. Risks & Edge Cases

- **Sender completeness:** today the sender loads only 2 days of completions, plus completions of one-off tasks that have `remindAt`. Nudges and the day-end push summarize *all* of today's instances, so without B-4 (2), completed undated one-offs would count as open. The reviewer should test a one-off completed last week.
- **Sender and streaks:** `scoreHeadline` and `closingLine` take a `summarize` result only. If streaks are ever added to pushes, the sender would need long completion history. Don't do that without revisiting B-4.
- **Timezones:** `dueDailyMessages` must use the subscription's `localNow`, never server UTC. `affirmationFor` and the per-date message picks are keyed on the local ISO date. Home's current `Date.now() / 86400000` changes at UTC midnight, which F-5 fixes.
- **Changing the affirmation list:** adding or removing entries changes which affirmation each future date gets. That's harmless, but the sender and app may briefly differ if they're deployed at different times.
- **Day end vs. midnight:** if `dayEndAt` is `"23:55"`, the push window must be clamped at 1440 so it doesn't fire for the wrong day. Nudge times at or after `dayEndAt` are skipped.
- **Duplicate pushes after a sender restart:** this is an existing limitation (the `sent` map is in memory). Tags make the device replace the notification rather than stack it. A restart could resend the once-a-day celebration. Document this in the README.
- **Missing `schedule` argument:** any caller that forgets `schedule` shows stepped blocks from their anchor date and never stops them. F-21 and T-5 grep every call site. `api-test.mjs` builds its `data` without a schedule, which is fine because it creates no courses.
- **Derived end moves:** removing a course's last step, or changing `startDate`, moves the derived window for every item in the course. Past completions stay, because they're keyed by task and date, but a past day can switch between "scheduled" and "not scheduled" for those habits. Show the new end date in CourseEditor before saving.
- **Window maths kept in two places:** the delete hooks in `guards.js` repeat the window maths because hooks can't import `src/lib`. If the rules drift, unlinked habits get dates that don't match what the app showed. api-test checks both `keep` and `stop` cases (B-7).
- **Cascade order:** whether a course's delete hook runs before its steps' cascade deletes has to be confirmed by `test:api` (B-7).
- **"Delete these habits":** this is the only phase 2 path that changes past weeks. It must list counts, require confirmation, and be visually separate from "Delete course".
- **`block.date` on stepped blocks:** it's only the weekday anchor. Code that reads `block.date` as "first occurrence" (the Calendar editor labels, the TaskEditor block option text) should show the derived start for stepped blocks.
- **Target edge cases:**
  - A points target counts completions dated in the month, so one-offs count on the day they were completed.
  - A % target uses the whole month's instances, like `weekStats` does for weeks, so it starts low and rises.
  - Deleting a habit deletes its count targets (cascade). The task delete confirmation should say so.
- **Streak performance:** calculating many habits × 400 days on every render could be slow on older phones. Memoize per (data, date), keep the lookback cap, and build the schedule index once in DataContext.
- **Energy check-in near midnight:** the check-in uses the device's `todayISO()`. A check-in at 11:59 PM belongs to that day.
- **Unique index races:** a double tap on the energy buttons or the plan's first save could race two creates. The UI disables buttons while saving and updates the existing record, and the unique index is the backstop.
- **iOS:** no manifest shortcuts. Say so plainly in the Settings help.
- **Inputs to attack:**
  - users: `nudgeTimes: [7]`, `[1440]`, `[0,15,30,45,60,75,90]`, `"720"`; `affirmationAt: "7:5"`
  - plans and targets: `month: "2026-13"`, `kind: "percent", target: 101`, a `completions` target with someone else's task
  - courses: `week: 0`, `53`, `1.5`; `onEnd: "pause"`
  - tasks and blocks: `effort: "extreme"`, a `step` owned by another user on a task or block, a stepped task sent with `block`, `date` or `recurUntil` set, a stepped block with `recurrence: "none"`
  - check-ins: `energy: ""`, `checkins.user` set to another user

## 10. Definition of Done

- Every FR-* task is checked off.
- Supervisors PASS on every task.
- `npm run test:api`, `npm run test:reminders` and `npm run test:stats` all pass. `npm run build` succeeds.
- The REVIEW.md verdict is 🟢. The principles are checked, ownership is proven by api-test, and mobile layout and dark mode are verified.
- Migrations and `pb_hooks` are deployed to the VM together, PocketBase is restarted, and the sender is restarted after B-4 and B-8.
- `push/README.md` and the CLAUDE.md Status and Commands sections are updated (CLAUDE.md edits need the user's approval).
- The user has reviewed and signed off.
- **Workflow rule:** at the end of every working session, update **"Where we left off"** at the top of this file (last done, next, watch out) in 3–6 lines.

## Changelog
- 2026-11-08: Initial phase 2 plan, covering the next-3-hours view and widget options, the score card, energy check-in, nudges and affirmations, and monthly plans and courses.
- 2026-11-08: Applied the user's answers to open questions 1–11.
  - **Nudges:** custom `users.nudgeTimes` replaces the nudge-level select.
  - **Message tone:** a celebration when the day is done, and a "you'll get it tomorrow" line when it isn't.
  - **Affirmations:** about 250, deterministic per date.
  - **Streaks:** per habit.
  - **Courses:** weeks are cumulative.
  - **Monthly targets:** new `plan_targets` collection.
  - **Effort tag:** added to tasks.
  - **Plans:** moved inside Progress.
  - **Widget:** dropped.
  - **Renumbering:** tasks and FRs renumbered.
- 2026-11-08: Q-1 and Q-2 answered, and A-5 and A-6 confirmed (now D-12 to D-15). Open questions are now empty.
  - **Course end:** added `courses.onEnd` (keep|stop). The end date is derived from the last step, with no new field, through the new shared rule `activeWindow()`, which replaces `taskStartDate`. `stop` never deletes, and there's a manual "Delete these habits" action with a warning (FR-21).
  - **Blocks in course weeks:** added `blocks.step`. Stepped blocks must repeat, and their tasks follow them.
  - **Unlinked items:** added `tasks.recurUntil`, so habits unlinked from a stopped course keep their end. The delete hooks write start and end dates (B-7).
  - **New tasks:** F-20 (BlockEditor step) and F-21 (pass `schedule` at every call site).
  - **Task format:** switched to the "ID · Model · Title / Files" format, and F-14/B-5 split into separate lines. Added "Where we left off" and the rule to update it every session.
