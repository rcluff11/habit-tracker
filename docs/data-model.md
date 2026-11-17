# Data model

> **Status:** descriptive (what exists on branch `chore/adopt-agentic-mastery`, 2026-11-14).
> **Owner:** Data Engineer. **Database:** SQLite via PocketBase (local binary `pocketbase/pocketbase.exe` reports `0.41.0`; the VM's PocketBase version is `UNKNOWN — needs human confirmation`).
> **Source of truth:** `pocketbase/pb_migrations/*.js`, applied in filename order. Server rules that the schema cannot express live in `pocketbase/pb_hooks/guards.js` and `pocketbase/pb_hooks/main.pb.js`. If this doc and the migrations disagree, the migrations win and this doc is wrong.

**How this doc was verified:** every field, index and rule below was read line by line from the seven migration files listed in § 1, and every hook rule from `pocketbase/pb_hooks/guards.js` (lines 1–355) and `pocketbase/pb_hooks/main.pb.js` (lines 1–46). Nothing comes from `pocketbase/pb_data` (not read). Where PocketBase supplies a default that no migration sets (the `users` auth collection), it is marked `UNKNOWN — needs human confirmation`.

---

## 1. Migrations, in order

| # | File | What it does | down() |
|---|------|--------------|--------|
| 1 | `pocketbase/pb_migrations/1761100000_init_schema.js` | Adds `users.palette`; creates `categories`, `blocks`, `tasks`, `completions` (+ unique `(task, date)`), `rewards` | Deletes the five collections (reverse order), removes `users.palette` |
| 2 | `pocketbase/pb_migrations/1761200000_push_subscriptions.js` | Creates `push_subscriptions` (+ unique `endpoint`) | Deletes `push_subscriptions` |
| 3 | `pocketbase/pb_migrations/1761300000_item_reminders.js` | Adds `users.remindBefore`, `blocks.remindBefore`, `tasks.remindAt`, `tasks.remindDate`; **backfills** `remindBefore = [10]` on every existing user (lines 24–27, `saveNoValidate`) | Removes the four fields |
| 4 | `pocketbase/pb_migrations/1794200000_day_end.js` | Adds `users.dayEndAt` | Removes it |
| 5 | `pocketbase/pb_migrations/1794300000_energy.js` | Creates `checkins` (+ unique `(user, date)`); adds `tasks.effort` | Removes `tasks.effort`, deletes `checkins` |
| 6 | `pocketbase/pb_migrations/1794400000_notification_prefs.js` | Adds `users.affirmationAt`, `users.nudgeTimes`, `users.dayEndPush` | Removes the three fields |
| 7 | `pocketbase/pb_migrations/1794500000_plans_courses.js` | Creates `plans` (+ unique `(user, month)`), `courses`, `course_steps` (+ unique `(course, week)`), `plan_targets`; adds `tasks.step`, `tasks.recurUntil`, `blocks.step` | Removes `blocks.step`, `tasks.recurUntil`, `tasks.step`; deletes `course_steps`, `courses`, `plan_targets`, `plans` |

Migrations 4–7 are Phase 2. Whether they are applied on the VM is `UNKNOWN — needs human confirmation`: `CLAUDE.md` "Status" says phase 2 is not yet deployed, but both phase 2 commits are on `origin/main` (review finding SCOPE-1 / OPS-1; the read-only check is in `deployment.md` § 7.1).

---

## 2. Conventions shared by every owned collection

Every collection except `users` is a PocketBase `base` collection with:

- `id` — PocketBase system primary key (text, auto-generated).
- `user` — relation → `users`, `maxSelect: 1`, **required**, **`cascadeDelete: true`** (deleting an account deletes all of its records).
- `created` (autodate, on create) and `updated` (autodate, on create + update).

**API rules (identical on all 11 owned collections):**

| Rule | Expression | Source |
|------|-----------|--------|
| list | `user = @request.auth.id` | `1761100000_init_schema.js:4` (repeated in `1761200000:7`, `1794300000:11`, `1794500000:21`) |
| view | `user = @request.auth.id` | same |
| create | `@request.auth.id != '' && @request.body.user = @request.auth.id` | `1761100000_init_schema.js:5` |
| update | `user = @request.auth.id && (@request.body.user:isset = false \|\| @request.body.user = @request.auth.id)` | `1761100000_init_schema.js:6` |
| delete | `user = @request.auth.id` | `1761100000_init_schema.js:4` |

The rules only check the record's own `user`. **Relations to other records are owner-checked in `guards.js`** (`RELATIONS`, lines 4–11; check at lines 214–221) for create and update requests on the collections in `GUARDED` (`main.pb.js:3–6`). `categories` is not in `GUARDED`; it has no relation fields besides `user`, so nothing is skipped. Superuser requests skip every hook check (`guards.js:199`).

**Stored units:** times of day as minutes since midnight (`blocks.start/end`, `users.nudgeTimes`) or `"HH:MM"` text (`tasks.remindAt`, `users.dayEndAt`, `users.affirmationAt`); dates as `"YYYY-MM-DD"` text; months as `"YYYY-MM"` text. Format at the edges with `src/lib/time.js`.

**PocketBase relation behaviour on delete (applies to every `cascadeDelete: false` relation below):** when the referenced record is deleted, PocketBase clears the reference on non-required relation fields. `UNKNOWN — needs human confirmation` that 0.41.0 (and the VM version) behave this way; no test in `scripts/api-test.mjs` asserts it for categories.

---

## 3. Collections (current state after migration 7)

### 3.1 `users` (auth collection, PocketBase built-in)

No migration creates `users`; migrations only add fields to it.

| Field | Type | Constraints | Added by |
|-------|------|-------------|----------|
| `id`, `email`, `emailVisibility`, `verified`, `password`, `tokenKey`, `name`, `avatar`, `created`, `updated` | PocketBase default auth fields | `UNKNOWN — needs human confirmation` (PocketBase default; `name` is set at sign-up in `scripts/api-test.mjs:45`) | PocketBase |
| `palette` | json | `maxSize: 20000`; no shape validation | `1761100000_init_schema.js:34` |
| `remindBefore` | json | `maxSize: 2000`; hook: list of `REMINDER_OPTIONS` `[0,5,10,15,30,60]`, de-duplicated, sorted descending; unset → `[10]` (`guards.js:148–167, 258–261`) | `1761300000_item_reminders.js:11` |
| `dayEndAt` | text | pattern `^(([01]\d\|2[0-3]):[0-5]\d)?$`; hook: `""` or ≥ `"12:00"` (`guards.js:172–173, 265–267`); `""` = 21:00 | `1794200000_day_end.js:9` |
| `affirmationAt` | text | pattern `^(([01]\d\|2[0-3]):[0-5]\d)?$`; `""` = off | `1794400000_notification_prefs.js:11` |
| `nudgeTimes` | json | `maxSize: 2000`; hook: ≤ 6 integers, 0–1425, multiples of 15, de-duplicated, sorted; unset → `[]` (`guards.js:169–196, 264`) | `1794400000_notification_prefs.js:12` |
| `dayEndPush` | bool | — | `1794400000_notification_prefs.js:13` |

**Indexes:** PocketBase auth defaults (`UNKNOWN — needs human confirmation`). **API rules:** not set by any migration, so they are PocketBase's defaults for the `users` collection — `UNKNOWN — needs human confirmation` (check the Dashboard on the VM). Tests show another user cannot update your record (`scripts/api-test.mjs:149–150`).

### 3.2 `categories`

| Field | Type | Constraints |
|-------|------|-------------|
| `user` | relation → users | required, cascade (§ 2) |
| `name` | text | required, max 60 |
| `color` | text | max 9 (no pattern) |

Source: `1761100000_init_schema.js:37–41`. Indexes: none. Not hook-guarded (`main.pb.js:3–6`). Referenced (non-cascade) by `blocks.category`, `tasks.category`, `rewards.category`, `plan_targets.category`. New accounts get six starter categories from the client (`src/lib/DataContext.jsx:12–19, 40–43`).

### 3.3 `blocks`

| Field | Type | Constraints |
|-------|------|-------------|
| `user` | relation → users | required, cascade |
| `title` | text | required, max 120 |
| `date` | text | required, pattern `^\d{4}-\d{2}-\d{2}$` (for a stepped block: only the weekday anchor) |
| `start` | number | int, 0–1440 (not required) |
| `end` | number | int, 0–1440 (not required); hook: `end > start` (`guards.js:253–255`) |
| `color` | text | max 9 |
| `category` | relation → categories | optional, `cascadeDelete: false`; hook owner check |
| `recurrence` | select | `none`, `daily`, `weekdays`, `weekly` (not required; `""` behaves as one-off, `src/lib/stats.js:93–107`, `blockOccursOn`) |
| `recurUntil` | text | pattern `^(\d{4}-\d{2}-\d{2})?$`; hook: a stepped block's `recurUntil` can't be before its step start (`guards.js:230–233`) |
| `notes` | text | max 2000 |
| `remindBefore` | json | `maxSize: 2000`; `null` = user default, `[]` = none; hook validates as for users but keeps `null` (`guards.js:258–261`) — `1761300000:15` |
| `step` | relation → course_steps | optional, `cascadeDelete: false`; hook owner check; a stepped block must repeat (`guards.js:270–274`) — `1794500000:111` |

Source: `1761100000_init_schema.js:44–55` plus the migrations noted. Indexes: none. The 15-minute step is **not** enforced server-side (see review DATA-5 / BE-8).

### 3.4 `tasks`

| Field | Type | Constraints |
|-------|------|-------------|
| `user` | relation → users | required, cascade |
| `title` | text | required, max 160 |
| `category` | relation → categories | optional, `cascadeDelete: false`; owner check |
| `points` | number | int, 0–1000 |
| `block` | relation → blocks | optional, **`cascadeDelete: true`**; owner check |
| `date` | text | pattern `^(\d{4}-\d{2}-\d{2})?$` (one-off due date; daily habit start) |
| `daily` | bool | — |
| `priority` | bool | — |
| `remindAt` | text | pattern `^(([01]\d\|2[0-3]):[0-5]\d)?$`; hook clears it on block tasks (`guards.js:323–331`) — `1761300000:19` |
| `remindDate` | text | pattern `^(\d{4}-\d{2}-\d{2})?$`; hook keeps it only on one-offs with no due date — `1761300000:20` |
| `effort` | select | `light`, `medium`, `heavy` (optional) — `1794300000:33` |
| `step` | relation → course_steps | optional, `cascadeDelete: false`; hook forces `daily = true` and clears `block`, `date`, `remindDate`, `recurUntil` (`guards.js:206–212`) — `1794500000:106` |
| `recurUntil` | text | pattern `^(\d{4}-\d{2}-\d{2})?$`; hook clears it unless `daily`, rejects unreal dates (`guards.js:276–281`) — `1794500000:107` |

Source: `1761100000_init_schema.js:59–68` plus the migrations noted. Indexes: none. Other hook rules: a task used by a `completions` plan target must stay a habit (`guards.js:246–251`); relinking a habit to a step is refused if it has check-offs before the step's window (`guards.js:234–242`).

### 3.5 `completions`

| Field | Type | Constraints |
|-------|------|-------------|
| `user` | relation → users | required, cascade |
| `task` | relation → tasks | required, **`cascadeDelete: true`**; owner check |
| `date` | text | required, pattern `^\d{4}-\d{2}-\d{2}$` |
| `points` | number | int, min 0, no max. **Snapshot:** the hook overwrites it with the task's current `points` on every create and update request (`guards.js:333–337`) |

Source: `1761100000_init_schema.js:71–81`. **Index:** `CREATE UNIQUE INDEX idx_completions_task_date ON completions (task, date)` (line 79).

### 3.6 `rewards`

| Field | Type | Constraints |
|-------|------|-------------|
| `user` | relation → users | required, cascade |
| `title` | text | required, max 120 |
| `kind` | select | required; `points`, `percent` |
| `target` | number | required, min 1 (no max, not `onlyInt`) |
| `category` | relation → categories | optional, `cascadeDelete: false`; owner check |
| `claimedWeeks` | json | `maxSize: 20000`; array of week-start dates (no shape validation) |

Source: `1761100000_init_schema.js:84–91`. Indexes: none.

### 3.7 `push_subscriptions`

| Field | Type | Constraints |
|-------|------|-------------|
| `user` | relation → users | required, cascade |
| `subscription` | json | required, `maxSize: 5000`; hook: must have an `https://` `endpoint` and `keys.p256dh`, `keys.auth` (`guards.js:339–352`) |
| `endpoint` | text | max 1000; **copied by the hook from `subscription.endpoint`** on every create/update (`guards.js:351`) |
| `timezone` | text | max 64 (IANA zone; not validated server-side) |

Source: `1761200000_push_subscriptions.js:8–29`. **Index:** `CREATE UNIQUE INDEX idx_push_endpoint ON push_subscriptions (endpoint)` (line 27) — unique across all users. Read and pruned by `push/sender.mjs` (lines 98, 165) as superuser.

### 3.8 `checkins`

| Field | Type | Constraints |
|-------|------|-------------|
| `user` | relation → users | required, cascade |
| `date` | text | required, pattern `^\d{4}-\d{2}-\d{2}$`; hook: real date, cannot change on update (`guards.js:283–289`) |
| `energy` | select | required; `high`, `normal`, `low` (= `ENERGY_LEVELS`, `src/lib/stats.js:149`) |

Source: `1794300000_energy.js:12–30`. **Index:** `CREATE UNIQUE INDEX idx_checkins_user_date ON checkins (user, date)` (line 28).

### 3.9 `plans`

| Field | Type | Constraints |
|-------|------|-------------|
| `user` | relation → users | required, cascade |
| `month` | text | required, pattern `^\d{4}-(0[1-9]\|1[0-2])$`; hook re-checks (`guards.js:291–296`) |
| `intention` | text | max 200 |
| `notes` | text | max 4000 |

Source: `1794500000_plans_courses.js:36–50`. **Index:** `CREATE UNIQUE INDEX idx_plans_user_month ON plans (user, month)` (line 48).

### 3.10 `plan_targets`

| Field | Type | Constraints |
|-------|------|-------------|
| `user` | relation → users | required, cascade |
| `plan` | relation → plans | required, **`cascadeDelete: true`**; owner check |
| `title` | text | required, max 120 |
| `kind` | select | required; `points`, `percent`, `completions` |
| `target` | number | required, int, min 1 (no max; hook caps `percent` at 100, `guards.js:312`) |
| `category` | relation → categories | optional, `cascadeDelete: false`; kept only for `points` |
| `task` | relation → tasks | optional, **`cascadeDelete: true`**; kept only for `completions`, and must be a habit (daily or on a block) (`guards.js:303–321`) |

Source: `1794500000_plans_courses.js:87–103`. Indexes: none.

### 3.11 `courses`

| Field | Type | Constraints |
|-------|------|-------------|
| `user` | relation → users | required, cascade |
| `title` | text | required, max 120 |
| `startDate` | text | required, pattern ISO date; hook: real date (`guards.js:298–301`) |
| `onEnd` | select | `keep`, `stop` (not required; hook sets `keep` when empty; the client treats anything but `stop` as `keep`, `src/lib/stats.js:35`) |
| `notes` | text | max 2000 |

Source: `1794500000_plans_courses.js:52–65`. Indexes: none. **There is no end-date field**; the end is derived (§ 6).

### 3.12 `course_steps`

| Field | Type | Constraints |
|-------|------|-------------|
| `user` | relation → users | required, cascade |
| `course` | relation → courses | required, **`cascadeDelete: true`**; owner check |
| `week` | number | required, int, 1–52 |
| `title` | text | required, max 120 |
| `notes` | text | max 1000 |

Source: `1794500000_plans_courses.js:68–83`. **Index:** `CREATE UNIQUE INDEX idx_course_steps_course_week ON course_steps (course, week)` (line 81).

---

## 4. Relationship map and delete behaviour

```
users ─┬─< every collection (user, cascade)
categories <── blocks.category, tasks.category, rewards.category, plan_targets.category   (no cascade: reference cleared)
blocks     <── tasks.block            (cascade: deleting a block deletes its tasks → their completions)
tasks      <── completions.task       (cascade)
tasks      <── plan_targets.task      (cascade)
plans      <── plan_targets.plan      (cascade)
courses    <── course_steps.course    (cascade)
course_steps <── tasks.step, blocks.step   (no cascade: hook stamps dates first, then unlinks)
```

Relationships point one way only; there are no reverse lists (CLAUDE.md Principle 2).

**Course / step delete hooks** (`main.pb.js:18–46`, `guards.js:68–127`): model hooks (`onRecordDelete`), so they also run on cascaded deletes, inside one transaction. Before the delete, every task and block still linked to the step(s) gets its derived window written on it (§ 6) and its `step` cleared. They skip the work when the owner no longer exists (account deletion).

---

## 5. Derived vs stored

CLAUDE.md Principle 3: week/month %, totals, streaks, done-today, target progress, course end dates and progress are **computed in `src/lib/stats.js` at render time**, never stored.

Deliberately stored copies (each has one writer that keeps it consistent):

| Stored value | Why | Writer |
|--------------|-----|--------|
| `completions.points` | Snapshot so editing a task's points doesn't change past weeks | `guards.js:333–337` (overwrites any client value) |
| `push_subscriptions.endpoint` | Copy of `subscription.endpoint` so the unique index can stop a device being stored twice | `guards.js:339–352` |
| `tasks.date` / `tasks.recurUntil` / `blocks.date` / `blocks.recurUntil` written when a course or step is deleted | Freezes the derived course window so the habit keeps its history after its step is gone | `guards.js:68–94` |
| `users.remindBefore = [10]` | Default made explicit (backfill `1761300000:24–27`, hook `guards.js:260`) | migration + hook |

CLAUDE.md calls `completions.points` "the one deliberate exception"; the endpoint copy and the delete-time stamping are also stored derivations (see § 9).

**History stays put:** no edit should change past weeks' totals as a side effect. The accepted exceptions (CLAUDE.md Principle 3): "Delete these habits", removing the last week of a `stop` course, and switching a finished course to `stop` — each with a UI warning.

---

## 6. Course-window rule

One definition, in two places that must match (CLAUDE.md Principle 6):

- `src/lib/stats.js:38–87` — `stepStartDate`, `courseEndDate`, `activeWindow`.
- `pocketbase/pb_hooks/guards.js:37–94` — `stepStart`, `taskStart`, `courseEnd`, `stampStep` (used only when a step or course is deleted).

```
step start   = course.startDate + (week − 1) × 7
course end   = course.startDate + maxWeek × 7 − 1        (only if onEnd = "stop"; else open-ended)
stepped TASK start  = max(step start, created date − 1 day)   (ISO text compare)
stepped BLOCK start = step start; its own recurUntil caps the end if earlier;
                      for weekly blocks, block.date is only the weekday anchor
```

Never read `task.date` or `block.date` for a stepped item; go through `activeWindow()`. When a step is deleted, `stampStep` writes the same window onto the item: tasks get `date = taskStart`, `recurUntil = end`; blocks get `date = step start` (weekly: first date ≥ step start on the anchor weekday) and `recurUntil = min(own, end)` when `stop`.

---

## 7. PII and sensitive data classification

| Data | Where | Class | Notes |
|------|-------|-------|-------|
| Email, password hash, name, avatar | `users` (PocketBase auth fields) | PII | Exact field set `UNKNOWN — needs human confirmation` |
| Free-text titles and notes | `blocks.title/notes`, `tasks.title`, `rewards.title`, `categories.name`, `plans.intention/notes`, `plan_targets.title`, `courses.title/notes`, `course_steps.title/notes` | Personal, possibly sensitive (habits, health, relationships) | Sent in push payloads by `push/sender.mjs`; must never be logged |
| Energy check-ins | `checkins.energy` | Personal wellbeing data | — |
| Push endpoint + keys | `push_subscriptions.subscription`, `.endpoint` | Device identifier + secret keys | Anyone holding them can push to the device (with the VAPID key) |
| Timezone | `push_subscriptions.timezone` | Coarse location | — |

Encryption at rest: the SQLite file lives in `pb_data` on the VM disk. Disk encryption, access logging, backups and retention are `UNKNOWN — needs human confirmation` (Architect / DevOps). No production data may be copied into a non-production environment without scrubbing.

---

## 8. Changing the schema safely

1. **Never edit an existing migration.** Add a new file `pocketbase/pb_migrations/<unix-timestamp>_<name>.js` with a timestamp later than the last one (`1794500000`), containing both `up` and `down`.
2. **`down` must restore the previous schema exactly** — fields, select values, rules, indexes. Removing a field in `down` loses its data; say so in the file comment.
3. **Prefer additive changes.** A destructive change (drop, rename, narrowing) needs a deprecation plan, a dual-read/dual-write period and a forward-fix path. A new required field on a populated collection needs a tested backfill in the same migration (pattern: `1761300000_item_reminders.js:23–27`).
4. **Every new relation field gets an index** in the same migration, and every new `listRule`/filter pattern gets an index that matches it.
5. **Select values must match the app constants:** `ENERGY_LEVELS`, `EFFORT_LEVELS` (`src/lib/stats.js:149–150`) and the target kinds in `targetProgress` (`src/lib/stats.js:517–546`) and `guards.js:303–321`. Change them together.
6. **Cross-record rules go in `pb_hooks/guards.js`,** not only in the UI (Principle 5). Add the collection to `GUARDED` (`main.pb.js:3–6`) and relations to `RELATIONS` (`guards.js:4–11`).
7. **Don't change the schema in the PocketBase Dashboard** on the VM; changes must come from a migration file in git. (Whether the deployed binary auto-generates migration files from Dashboard edits is `UNKNOWN — needs human confirmation`.)
8. **Test:** restart PocketBase locally (`npm run pb`) so the migration applies, then `npm run test:api`; `npm run test:stats` if `stats.js` changed. Test `down` by reverting (`pocketbase migrate down 1`) on a scratch copy, never on production.
9. **Deploy order:** copy `pb_migrations` and `pb_hooks` to the VM and restart PocketBase first; then restart the sender (`sudo systemctl restart notch-push`); the Netlify deploy goes last (CLAUDE.md "Commands"). Back up `pb_data` before restarting (procedure `UNKNOWN — needs human confirmation`).
10. Update this doc, CLAUDE.md "Data model", and `docs/contracts.md` in the same PR.

---

## 9. Where CLAUDE.md's "Data model" section disagrees with the code

| CLAUDE.md says | Code says |
|----------------|-----------|
| `completions.points` is "the one deliberate exception" to derive-don't-store | `push_subscriptions.endpoint` is also a stored copy (`guards.js:339–352`), and course/step deletion stamps derived dates onto tasks and blocks (`guards.js:68–94`) |
| Principle 5: "valid block times are enforced in `pb_hooks`"; blocks `start, end` in "15-minute steps" | The hook only checks `end > start` (`guards.js:253–255`); the 15-minute step is not enforced server-side |
| `push_subscriptions`: "device subscriptions for reminders" | Fields `subscription`, `endpoint`, `timezone` and a global unique index on `endpoint` are not listed |
| `users.dayEndAt` "12:00 or later" | Correct, but enforced only by the hook (`guards.js:267`); the migration comment says `00:00-23:59` (`1794200000_day_end.js:4`) |
| `courses.onEnd: keep \| stop` | Not required; empty means `keep` (`guards.js:300`, `stats.js:35`) |
| Field limits not listed | e.g. `tasks.points` 0–1000, `course_steps.week` 1–52, text max lengths (§ 3) |
| `created` / `updated` not listed | Every owned collection has both autodate fields; `activeWindow` reads `created` |
| Indexes: lists the four composite uniques | Correct; also `idx_push_endpoint`. No other indexes exist (no index on any `user` or other relation column) |

---

## Update this doc when

- any file is added to `pocketbase/pb_migrations/`;
- `pocketbase/pb_hooks/guards.js` or `main.pb.js` changes a validation, relation check, default or stamp;
- `activeWindow`, `stepStartDate`, `courseEndDate`, `ENERGY_LEVELS`, `EFFORT_LEVELS` or `targetProgress` in `src/lib/stats.js` change;
- `push/sender.mjs` changes what it reads or writes;
- PocketBase is upgraded (locally or on the VM).
