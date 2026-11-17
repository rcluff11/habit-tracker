# Glossary

**Status:** in review on `chore/adopt-agentic-mastery` (Tier 2, tracked in T-003). Descriptive.
**Owner:** Analyst. Entities and their relationships are explained in `domain.md`; field-level schema is in `data-model.md`. This file defines each word once and says where it lives.

Paths are relative to the repo root. Line numbers are as of commit `079f486` and drift; search for the named symbol if a line has moved.

## Product terms

| Term | Definition | Where it lives |
|------|------------|----------------|
| **Notch** | The product name. Tagline "Notch every win." | `index.html` (meta description), `src/views/Auth.jsx:37-38`, `public/manifest.webmanifest` |
| **notch** (lower case) | Informal word in user-facing copy for one checked-off item ("Every notch counts"). It is **not** a field or collection; in code the thing is a *completion*. | `src/lib/messages.js:9,20,92,127`, `src/lib/affirmations.js:9,35,253` |
| **Block** | A time slot on the calendar: `date`, `start` and `end` in minutes since midnight on 15-minute steps, optional `recurrence` (`none`, `daily`, `weekdays`, `weekly`) with `recurUntil`, optional `step`. | Collection `blocks` (`pocketbase/pb_migrations/1761100000_init_schema.js`); occurrence rule `blockOccursOn()` in `src/lib/stats.js:93`; editor `src/components/BlockEditor.jsx` |
| **Task** | Anything you can check off. There are exactly three kinds: block task, daily habit, one-off to-do (below). | Collection `tasks`; `src/components/TaskEditor.jsx`, `src/components/TaskItem.jsx` |
| **Block task** | A task with `block` set. It happens whenever its block occurs. Deleting the block deletes the task (cascade). | `tasks.block`; `instancesForDate()` in `src/lib/stats.js:248` |
| **Habit** (daily habit) | A task with `daily: true`. It happens every day inside its active window. "Habit" in streaks and targets also covers block tasks on a repeating block. | `tasks.daily`; `activeWindow()` `src/lib/stats.js:72`; `habitStreak()` `src/lib/stats.js:337` |
| **To-do** (one-off) | A task that is neither a block task nor a daily habit, with an optional due `date`. Its completion counts on the day it was completed, regardless of the due date (plan.md D-16). | `toggleTask()` `src/lib/DataContext.jsx:82`; `instancesForDate()` |
| **Completion** | One check-off of a task on a date. Unique per (task, date). Deleting the task deletes its completions (cascade). | Collection `completions` |
| **Points** | A task's `points` value. When a task is checked off, the server copies the task's points onto the completion (`completions.points`). This snapshot is the one deliberate stored copy, so past weeks don't change when a task's points are edited (`CLAUDE.md` principle 3). | `tasks.points`, `completions.points`; set server-side in `pocketbase/pb_hooks/guards.js:336` |
| **Priority / Top 3** | `tasks.priority` (★). Home and `#now` show up to three priority items for today. | `topThree()` `src/lib/stats.js:142` |
| **Category** | A user-named colour used to group tasks and blocks, and to filter rewards and points targets. | Collection `categories`; `src/components/CategoryChip.jsx` |
| **Reward** | A personal weekly goal. `kind: points` (optionally within one category) or `kind: percent` (% of the week's tasks done), with a `target`. Progress is derived, never stored. | Collection `rewards` (`1761100000_init_schema.js:84`); progress in `src/views/Home.jsx:14` and `src/views/Progress.jsx:208` |
| **claimedWeeks** | JSON array on a reward listing the week-start dates (Mondays, ISO) for which it has been claimed. Claiming adds the current week; a claimed week isn't shown again on Home. | `rewards.claimedWeeks`; `src/views/Progress.jsx:110-111`, `src/views/Home.jsx:112` |
| **Week** | Monday to Sunday, keyed by its Monday's ISO date. | `startOfWeek()` in `src/lib/time.js`; `weekStats()` `src/lib/stats.js:313` |
| **Energy check-in** | Today's energy, `high`, `normal` or `low`, recorded once per day and changeable that day. Unique per (user, date). | Collection `checkins` (`pocketbase/pb_migrations/1794300000_energy.js`); `ENERGY_LEVELS` `src/lib/stats.js:149`; `src/components/EnergyCheckin.jsx` |
| **Effort** | Optional tag on a task: `light`, `medium` or `heavy`. Used by energy suggestions; untagged tasks are bucketed by points (≤ 10 light, ≥ 50 heavy). | `tasks.effort` (`1794300000_energy.js:33`); `EFFORT_LEVELS` `src/lib/stats.js:150`; `suggestForEnergy()` `src/lib/stats.js:198` |
| **Suggestion** | Up to 3 open tasks that fit today's energy, shown on Home after a check-in. | `suggestForEnergy()`, `openNow()` `src/lib/stats.js:178` |
| **Nudge** | An optional push at a user-chosen time, saying how today is going. Times are minutes since midnight in 15-minute steps, at most 6 (`nudgeTimes`; empty = off). Presets: Light, Regular, Frequent. When the day is already complete, the first nudge time sends one celebration (`nudge-done`) and later nudges that day are skipped. Wording follows today's energy. | `users.nudgeTimes` (`1794400000_notification_prefs.js`); `NUDGE_STEP`, `MAX_NUDGES`, `NUDGE_PRESETS`, `dueDailyMessages()` in `src/lib/reminders.js:70-128`; `nudgeText()` `src/lib/messages.js:150`; picker `src/components/NudgeTimesPicker.jsx` |
| **Affirmation** | One short line per local date from a built-in list, the same on Home and in the optional affirmation push. Push time is `affirmationAt` ("HH:MM"; "" = off). | `AFFIRMATIONS`, `affirmationFor()` `src/lib/affirmations.js:4,300`; `users.affirmationAt` |
| **Day end** ("Day ends at") | The local time the user's day ends: `users.dayEndAt` "HH:MM", 12:00 or later; "" means 21:00. It controls when the score card appears and when the optional day-end push (`dayEndPush`) is sent. Nudges at or after it are skipped. | `DEFAULT_DAY_END`, `EARLIEST_DAY_END`, `dayEndMinutes()` `src/lib/reminders.js:57-63`; mirrored in `pocketbase/pb_hooks/guards.js:173` |
| **Score card** | The end-of-day summary: done/total, %, points/possible, best category, habit streaks, the week average and the day's energy. Shown on Home from day end (or once the day is complete) and for any past day from Progress. Derived, never stored. | `dayScore()` `src/lib/stats.js:387`; `src/components/ScoreCard.jsx`; headline and closing line `scoreHeadline()`, `closingLine()` `src/lib/messages.js:71,81` |
| **Streak** | For a habit or a task on a repeating block: consecutive scheduled occurrences completed. Unscheduled days don't break it; today only breaks it once today is over. Shown as "🔥 N" (N ≥ 2). | `habitStreak()` `src/lib/stats.js:337`; `src/components/TaskItem.jsx:74-75` |
| **Next 3 hours / `#now`** | A view listing blocks that are live or start within 180 minutes (crossing midnight), with their open tasks and today's top 3. Not a nav tab; opened from Home or the app shortcut. | `upcomingBlocks()` `src/lib/stats.js:126`; `src/views/Now.jsx`; `src/App.jsx:20`; `public/manifest.webmanifest` `shortcuts` |
| **Plan** (monthly plan) | One record per user per month ("YYYY-MM") with an intention and notes, shown in Progress → Month. | Collection `plans` (`1794500000_plans_courses.js`); `src/components/MonthPlan.jsx` |
| **Target** | A measurable goal inside a plan. Kinds: `points` (optionally one category), `percent` (% complete, 1–100) or `completions` (count of one habit or block task). Progress is derived. | Collection `plan_targets`; `targetProgress()` `src/lib/stats.js:517`; `src/components/TargetEditor.jsx` |
| **Course** | A week-by-week programme with a `startDate`, `notes` and `onEnd`. It has no end-date field; the end is derived from its highest step week. | Collection `courses`; `courseEndDate()` `src/lib/stats.js:43`; `courseStats()` `src/lib/stats.js:452`; `src/components/CourseEditor.jsx`, `CourseList.jsx` |
| **Step** (course step) | One numbered week of a course (week 1–52, unique per course), e.g. "Week 2: add the gym". Starts on `course.startDate + (week − 1) × 7`. Weeks are cumulative: earlier weeks keep running. | Collection `course_steps`; `stepStartDate()` `src/lib/stats.js:38`; `src/components/StepPicker.jsx` |
| **onEnd: keep / stop** | Per-course setting for what happens to its habits and blocks after the derived course end. `keep` (default): they keep going. `stop`: they are no longer shown, counted or reminded after the end. `stop` never deletes records. | `courses.onEnd` (`1794500000_plans_courses.js:60`); `courseOnEnd()` `src/lib/stats.js:35` |
| **Stepped item** | A task or block whose `step` is set. A stepped task is forced to be a daily habit (the server clears `block`, `date`, `remindDate`, `recurUntil`). A stepped block must repeat, and its `date` is only the weekday anchor for weekly repeats. Never read `task.date` or `block.date` for a stepped item. | `tasks.step`, `blocks.step`; rules in `pocketbase/pb_hooks/guards.js` `check()` |
| **Active window** | The inclusive `{ start, end }` date range in which a task or block is shown, counted and reminded. For a stepped item: start = step start (a stepped task never earlier than its created date − 1 day); end = course end if `onEnd` is `stop`, capped by the record's own `recurUntil`. Otherwise `date` (or created date) to `recurUntil`. The single rule; `guards.js` repeats it when it writes dates on delete. | `activeWindow()` `src/lib/stats.js:72`; `stepStart`, `taskStart`, `courseEnd` in `pocketbase/pb_hooks/guards.js:46-61` |
| **"Delete these habits"** | The one deliberate action that deletes a course's habits and blocks with their completions, after a warning with counts. | `courseDeleteImpact()` `src/lib/stats.js:488`; `src/components/CourseEditor.jsx:98-100,306` |
| **Reminder** | A push before a block (`remindBefore` minutes, from `REMINDER_OPTIONS`) or at a task's `remindAt`. Separate from nudges and affirmations. | `dueReminders()` `src/lib/reminders.js:223`; `REMINDER_OPTIONS` `src/lib/reminders.js:9` |
| **Grace window** | The 15 minutes after a reminder or daily message is due during which the sender may still send it (`TASK_GRACE_MINUTES`). | `src/lib/reminders.js:12` |
| **Sender** | The Node service that runs every minute on the VM and sends reminders and daily messages, recording what it sent in `push/.sent.json`. | `push/sender.mjs`, `push/README.md` |

## Process terms

| Term | Definition | Where it lives |
|------|------------|----------------|
| **DRI** | Directly Responsible Individual: the human who owns an area and approves plans for it. For Notch, rcluff11 for every path. | `.github/CODEOWNERS`; `docs/ownership.md`; `AGENTS.md` § 3 |
| **T-NNN** | A task ID. One file per task in `tasks/T-NNN.md`, subtasks as `T-NNN.n`. Every commit message must contain one. | `tasks/README.md`; `.githooks/commit-msg` |
| **Unanimous consensus** | The rule that any `/docs/*` change needs all 9 agents' sign-off; commits carry `unanimous-consensus: T-NNN`. | `docs/README.md`; `.githooks/commit-msg` |
| **Review artifact** | The per-branch record of a review cycle. | `docs/reviews/<branch>/` |
| **Sync point** | A rule that exists both in `src/lib/` and in `pocketbase/pb_hooks/guards.js` and must change in both together. | `CLAUDE.md` principle 6 |
| **Phase 1 / Phase 2** | Phase 1: the original app (done and deployed). Phase 2: Next 3 hours, score card, energy, nudges, plans and courses. Deployment status of phase 2: `UNKNOWN — needs human confirmation` (see the analyst review). | `CLAUDE.md` § Status; `plan.md` |

---
**How this was verified:** each symbol was located with grep in `src/lib/`, `src/components/`, `src/views/`, `pocketbase/pb_migrations/` and `pocketbase/pb_hooks/guards.js`; definitions were checked against the code comments and `CLAUDE.md` § Data model.

*Update this doc when:* a collection or field is added or renamed in `pocketbase/pb_migrations/`; an exported helper named here moves or is renamed in `src/lib/`; a new user-facing concept is added to a view; or the process terms in `AGENTS.md` change.
