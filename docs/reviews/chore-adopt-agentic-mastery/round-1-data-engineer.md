## Data Engineer Review — chore/adopt-agentic-mastery (Round 1, Analysis)

**Scope:** Tier 1 docs bootstrap (`docs/data-model.md`, `docs/domain.md`) plus a full review of the existing schema: all 7 files in `pocketbase/pb_migrations/`, `pocketbase/pb_hooks/guards.js`, `pocketbase/pb_hooks/main.pb.js`, and the data paths in `src/lib/stats.js`, `src/lib/DataContext.jsx` and `push/sender.mjs`.
**This branch changes no migration, hook or query.** Every finding below is about code that already exists (Phase 1 deployed; Phase 2 built, not yet deployed).

**Verdict:** PASS WITH ITEMS
**Migration safety:** zero-downtime (no migration on this branch). The recommended index migration (DATA-1) is additive. On SQLite it holds a brief write lock per `CREATE INDEX`, which is negligible at current row counts.
**Query plan concerns:** No relation column has an index (DATA-1). The push sender scans `completions` with an OR + join filter every minute (DATA-2). The client loads every completion ever made on each load (DATA-3).

---

### What was checked and found correct

| Check | Result | Evidence |
|-------|--------|----------|
| Every `down()` reverses its `up()` | Yes, all 7. Each removes exactly the fields and collections its `up()` added, children before parents. | `1761100000_init_schema.js:93–100`, `1761200000_push_subscriptions.js:31–33`, `1761300000_item_reminders.js:29–42`, `1794200000_day_end.js:12–16`, `1794300000_energy.js:36–42`, `1794400000_notification_prefs.js:16–22`, `1794500000_plans_courses.js:114–128` |
| Unique indexes match the documented uniques | Yes. completions `(task, date)`, checkins `(user, date)`, plans `(user, month)`, course_steps `(course, week)`; also `push_subscriptions (endpoint)`, which CLAUDE.md doesn't list | `1761100000:79`, `1794300000:28`, `1794500000:48`, `1794500000:81`, `1761200000:27` |
| Select values match app constants | Yes. `checkins.energy` = `ENERGY_LEVELS`; `tasks.effort` = `EFFORT_LEVELS`; `plan_targets.kind` = the kinds in `targetProgress` and `guards.js` | `1794300000:24,33`, `stats.js:149–150`; `1794500000:96`, `stats.js:521–531`, `guards.js:303–321` |
| `blocks.recurrence` values match `blockOccursOn` | Yes (`""` falls through to one-off) | `1761100000:51`, `stats.js:104–118` |
| Course-window maths in `guards.js` = `activeWindow()` | Yes. Step start, course end (max week over all steps, only when `stop`), and stepped-task start = max(step start, created − 1 day) are the same. For blocks: start is not clamped, weekly anchor → first matching weekday ≥ step start (equivalent to `blockOccursOn`'s weekday test), and `recurUntil = min(own, end)` matches `activeWindow`'s cap. The course end is computed before the delete, so it includes the step being deleted, matching the client view at that moment | `guards.js:37–94`, `stats.js:38–87` |
| Owner checks | All 11 owned collections use the same owner rules, and `update` stops a record being moved to another user. Every relation field except `user` is listed in `RELATIONS` and owner-checked | `1761100000:4–6`; `guards.js:4–11, 214–221` |
| Cascades | `completions.task`, `tasks.block`, `plan_targets.plan`, `plan_targets.task`, `course_steps.course` and every `user` cascade. Step/course deletes stamp dates in one transaction before unlinking. There are no structural orphans | `main.pb.js:18–46`, `guards.js:68–127` |
| Text and JSON size bounds | Every free-text field has a `max`. Text fields with no `max` are all anchored by a pattern (dates, times, months). Every JSON field has a `maxSize` | § 3 of `docs/data-model.md` |
| Stored-vs-derived | Totals, streaks, % and course end are not stored. `completions.points` is a server snapshot. `push_subscriptions.endpoint` is a server-maintained copy for the unique index (acceptable, but not documented as an exception, see DATA-14) | `guards.js:333–337, 339–352` |

---

### Findings

**Blockers:** none on this branch.

**Warnings**

**DATA-1 — WARNING (existing breach of the "every foreign key is indexed" redline).** `pocketbase/pb_migrations/1761100000_init_schema.js:23` (the `user` field on every owned collection), `:50`, `:61`, `:63`, `:88`; `1761200000_push_subscriptions.js:18`; `1794500000_plans_courses.js:33` (as used for courses, course_steps, plan_targets), `:94`, `:98`, `:99`, `:106`, `:111`.
*Failure scenario:* every list request runs `user = @request.auth.id`, and none of `categories`, `blocks`, `tasks`, `rewards`, `push_subscriptions`, `courses`, `course_steps`, `plan_targets` has an index on `user`, so each one scans the whole table across **all** users. Cascades and hook lookups also scan: block delete → `tasks.block`; step delete → `tasks.step` and `blocks.step` (`guards.js:71, 78`); every non-habit task update → `plan_targets.task` (`guards.js:248`). Covered already: completions by `(task, date)`, and checkins and plans by their `(user, …)` uniques. As far as I know PocketBase does not index relation fields automatically; `UNKNOWN — needs human confirmation` against the VM database's index list.
*Fix:* add one new migration `<ts>_relation_indexes.js` that creates `idx_<col>_user` on the 8 collections above, plus `tasks(block)`, `tasks(step)`, `tasks(category)`, `blocks(step)`, `blocks(category)`, `rewards(category)`, `plan_targets(plan)`, `plan_targets(task)`, `plan_targets(category)`, and `completions(user, date)` (see DATA-2). `down()` drops exactly these indexes. This branch adds no schema, so it does not block this branch. **The next migration that adds a relation without an index will be BLOCKED.**

**DATA-2 — WARNING (hot path).** `push/sender.mjs:46` and `:165–176`.
*Failure scenario:* every minute, the sender loads all `blocks` and `tasks` for all users unfiltered, and loads completions with `date >= {:since} || (task.daily = false && task.block = '')`. The `OR` across a joined relation can't use an index, so this is a full scan of `completions` (the fastest-growing table) joined to `tasks`, 1,440 times a day. Fine at today's size; it degrades linearly with history and user count on an e2-micro.
*Fix:* split it into two queries: `date >= {:since}` (served by an index on `completions(date)` or `(user, date)`), and one-off completions only for open one-off task ids. Or add the index and record a row-count threshold in `docs/data-model.md` at which this is revisited. Owner: Backend, with Data Engineer sign-off.

**DATA-3 — WARNING (unbounded client load).** `src/lib/DataContext.jsx:28–33`, `:10`, `:72–75`.
*Failure scenario:* `getFullList` fetches every completion the user has ever made, on every app open **and** after every delete in a collection listed in `RELOAD_ON_DELETE`. At 10 habits a day that's about 3,650 rows a year, refetched on every delete of a block, task or category. It gets slower on phones every year and puts load on the VM.
*Fix:* decide how much history the views actually need (Progress month view, streaks and targets read history; `stats.js` should be audited). Then load completions from a bounded `date >=` cutoff plus the open one-offs, and patch state locally on delete instead of reloading everything. Owner: Frontend, with Data Engineer sign-off on the window.

**DATA-4 — WARNING (snapshot can be rewritten).** `pocketbase/pb_hooks/guards.js:333–337`; update rule `pocketbase/pb_migrations/1761100000_init_schema.js:6`.
*Failure scenario:* `completions` is updatable by its owner. Any update request (for example `PATCH {date: "2025-01-01"}`) makes the hook overwrite `points` with the task's **current** points. That breaks the "snapshot so past weeks don't change" rule, and also lets a completion be moved to any date. The app never updates completions (`toggleTask` only creates and deletes, `DataContext.jsx:82–90`), so this is reachable only through the API, but it breaks a documented invariant.
*Fix:* new migration that sets `completions.updateRule = null` (superuser only); `down()` restores the current rule. Alternatively, in `check()`, throw on `completions` when `!record.isNew()`. Add an api-test case.

**DATA-5 — WARNING (server doesn't enforce block-time rules, despite Principle 5).** `pocketbase/pb_hooks/guards.js:253–255`; `pocketbase/pb_migrations/1761100000_init_schema.js:47–48`.
*Failure scenario:* CLAUDE.md says valid block times are enforced in `pb_hooks` and stored in 15-minute steps. The server only checks `end > start`. `start`/`end` aren't required, so a missing value saves as 0, and `start: 7, end: 8` is accepted. The calendar grid assumes 15-minute slots, and the reminder maths assumes whole slots.
*Fix:* in `check()` for `blocks`, require `start % 15 === 0 && end % 15 === 0`. Before deploying, run a read-only query on the VM to confirm existing rows comply (`UNKNOWN — needs human confirmation`); if any don't, write a snap backfill in the same migration. Keep the rule in sync with `src/lib/time.js` (15-minute snap).

**DATA-6 — WARNING (history-stays-put: block delete).** `src/components/BlockEditor.jsx:103–106`; cascade `1761100000_init_schema.js:63, 75`.
*Failure scenario:* deleting a block deletes its tasks with no confirmation, and their completions go with them through the cascade. Past weeks' totals, streaks and reward claims change silently. "Delete a block" is not one of the three accepted exceptions in CLAUDE.md Principle 3. `TaskEditor.jsx:81–86` does confirm a task delete, but it mentions only monthly targets, not that past check-offs and points disappear.
*Fix (short term):* confirm before deleting a block or task that has completions, saying how many check-offs will be removed. *Longer term:* an archive flag (for example `archivedOn` date) instead of a hard delete for tasks and blocks with history. That is a schema change, so it needs an ADR and the Analyst's scope call. Owners: Frontend, UX, Analyst.

**DATA-7 — WARNING (category delete silently changes rewards and targets).** `src/views/Settings.jsx:331`; non-cascade relations at `1761100000:50, 61, 88` and `1794500000:98`.
*Failure scenario:* deleting a category takes one tap with no confirmation. PocketBase then clears the reference on blocks, tasks, rewards and plan_targets (`UNKNOWN — needs human confirmation` that 0.41.0 clears non-required references rather than refusing). A "50 Fitness points" reward or monthly target becomes "50 points in any category". Past weeks' reward status is recomputed, and the task's points move to "none" in the per-category breakdown.
*Fix:* in a hook (add `categories` to `GUARDED` delete handling, or an `onRecordDeleteRequest` for categories), refuse the delete while a reward or plan target uses the category, or delete those too after a UI warning. Add an api-test case that pins the PocketBase behaviour.

**DATA-8 — WARNING (PII redline: classification done, protections unconfirmed).** Users (`email`, `name`, `avatar`), free-text titles and notes, `checkins.energy`, and `push_subscriptions.subscription` (device endpoint and keys).
*Failure scenario:* the redline requires classification, encryption at rest where required, and access logging. Classification now exists (`docs/data-model.md` § 7). Disk encryption on the VM, PocketBase request-log retention, backups of `pb_data`, and how a deleted account is handled are all `UNKNOWN — needs human confirmation`.
*Fix:* the Architect confirms encryption at rest and the access-logging settings; DevOps documents backup and restore. Deferred to the Architect per conflict defaults.

**Suggestions**

**DATA-9 — SUGGESTION (impossible dates accepted).** `1761100000:46, 52, 64, 76`; `1761300000:20`.
`blocks.date`, `blocks.recurUntil`, `tasks.date`, `tasks.remindDate` and `completions.date` are only pattern-checked, so `2026-02-30` passes. `isRealDate()` already exists (`guards.js:21–25`) and is used for checkins, courses and `tasks.recurUntil`.
*Fix:* apply it to these fields in `check()`.

**DATA-10 — SUGGESTION (number bounds).** `1761100000:87` (`rewards.target`: no max, not `onlyInt`, a `percent` reward can be 5000); `1794500000:97` (`plan_targets.target` for points: no max); `1761100000:77` (`completions.points`: no max, though the hook sets it from a field capped at 1000).
*Fix:* new migration setting `onlyInt` and a max (for example 100000) on these fields, and a hook cap of 100 for `percent` rewards, matching `guards.js:312` for targets.

**DATA-11 — SUGGESTION (unvalidated JSON shape).** `users.palette` (`1761100000:34`, 20 KB) and `rewards.claimedWeeks` (`1761100000:89`, 20 KB) accept any JSON.
*Failure scenario:* a malformed value (for example `claimedWeeks: {"a":1}`) can break the owner's own Progress or Settings view. The size is bounded, so there's no abuse risk beyond that.
*Fix:* in the hook, validate `claimedWeeks` as a de-duplicated array of real ISO dates, and `palette` against the shape the client writes (`scripts/api-test.mjs:81`).

**DATA-12 — SUGGESTION (record-count abuse).** Every collection.
Each field is bounded, but there's no limit on how many records one account can create, and sign-up is open (users `createRule` is the PocketBase default, `UNKNOWN — needs human confirmation`). A scripted account could fill the e2-micro disk.
*Fix:* the Architect confirms PocketBase's built-in rate limiting is on; optionally, a per-user cap in hooks for `tasks`, `blocks` and `completions`.

**DATA-13 — SUGGESTION (duplicate one-off completions).** `1761100000:79`; `src/lib/DataContext.jsx:85`.
The unique index is `(task, date)`, so a one-off to-do can get completions on two different dates, for example from two devices with stale state. `instancesForDate` counts only the latest one (`stats.js:261–264`), so totals don't double. But un-ticking deletes only the first match, so the task stays done.
*Fix:* in `check()`, refuse a second completion for a task that is neither `daily` nor on a `block`.

**DATA-14 — SUGGESTION (doc and code drift).** CLAUDE.md "Data model" and Principle 3 call `completions.points` "the one deliberate exception", but `push_subscriptions.endpoint` (`guards.js:351`) and the step-delete stamping (`guards.js:68–94`) are also stored derivations. CLAUDE.md Principle 5 claims block times are enforced server-side (see DATA-5). `1794200000_day_end.js:4` says `00:00-23:59`, but the hook enforces ≥ 12:00 (`guards.js:267`). Full list in `docs/data-model.md` § 9.
*Fix:* update CLAUDE.md wording, through the consensus gate. Never edit the migration comment, because migrations are immutable; `docs/data-model.md` records the correct rule.

**DATA-15 — SUGGESTION (rollback of migration 7 is lossy).** `1794500000_plans_courses.js:114–128`.
`down()` drops `tasks.step`. Stepped tasks are stored with `daily = true` and `date = ""` (`guards.js:206–212`), so after a rollback they become plain habits that start on their created date and never end. Their course window, and the history it implied, is gone. This is inherent to the change, not a bug.
*Fix:* document "forward-fix, don't roll back, once courses hold data", and back up `pb_data` before the Phase 2 deploy (`UNKNOWN — needs human confirmation` that a backup procedure exists).

**DATA-16 — SUGGESTION (superuser bypass).** `guards.js:199`.
Superuser requests skip every check, including the stepped-task clearing and the points snapshot. Today the sender's only write is deleting expired subscriptions (`push/sender.mjs:98`), so nothing is affected.
*Fix:* add a rule to `docs/data-model.md` § 8 and the DevOps runbook: never create or edit user data in the PocketBase Dashboard.

---

### Counts
- BLOCKER: 0
- WARNING: 8 (DATA-1 to DATA-8)
- SUGGESTION: 8 (DATA-9 to DATA-16)

### Re-check in Round 2
- Backend: DATA-2, DATA-4, DATA-5, DATA-7, DATA-9, DATA-13 (hook and sender changes, in a future feature branch, not this one).
- Frontend: DATA-3, DATA-6, DATA-7 (confirmations and the load window).
- Architect: DATA-8, DATA-12.
- Any new migration must include the DATA-1 indexes or it will be BLOCKED.

### Docs delivered (bootstrap)
- `docs/data-model.md`: current schema after all 7 migrations, every field, index and rule, PII, derived-vs-stored, course windows, safe-change procedure, and CLAUDE.md drift.
- `docs/domain.md`: entities, relations, the three task kinds, history-stays-put, and course windows.
- `docs/contracts.md` data-contract section: **not written in this round**. The data-contract entries and table blast radius are ready to lift from `docs/data-model.md` §§ 3–4 when T-001.17 is drafted together with Backend and Architect.

**Sign-off: PASS WITH ITEMS** — no blockers on this branch. Eight warnings are pre-existing and should become tasks in `/tasks/`. DATA-1 becomes a hard gate on the next migration.
