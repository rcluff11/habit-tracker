# Contracts — Notch

**Lead author:** Backend Engineer (T-001.17), with Data Engineer and Architect as co-authors. **Status:** descriptive — it lists what exists in the code on branch `chore/adopt-agentic-mastery` (2026-11-14). Draft pending the 9-agent consensus (AGENTS.md § 0 Step 4).

**What this doc is for.** Before you change anything, scan this file and answer one question: *does my change touch something listed here, and who depends on it?* Every entry gives the **invariant** (what must stay true) and the **blast radius** (what breaks if it changes). Field-level schema detail lives in [`data-model.md`](data-model.md) § 3; the narrative and the "how to change it safely" rules live in [`api.md`](api.md). This file is the flat index.

**Completeness.** Every list below is exhaustive for the code at the date above. Where a category doesn't apply to this stack it says **N/A** and why. Anything that cannot be confirmed from the repo is marked `UNKNOWN — needs human confirmation`.

---

## 0. Category checklist (T-001.17)

| Category | Where |
|---|---|
| Routes / endpoints | § 1 (PocketBase REST, standard routes only), § 3 (no custom routes) |
| Request / response contracts | § 1 (per collection), § 1.3 (error shape), § 4.3 (push payload) |
| Event / message schemas | § 4.3 push payload, § 4.4 message keys, § 4.5 `.sent.json`, § 5 service worker |
| Public interfaces / signatures | § 2 (hooks, `guards.js` exports), § 9 (`src/lib` modules shared with the sender and tests), § 4.7 (`push/sender.mjs` exports) |
| Data contracts | § 1.2 (every collection with its consumers); columns in `data-model.md` § 3 |
| Third-party integrations | § 7 |
| Environment variables / config keys | § 8 |
| Feature flags | **N/A — none exist.** `grep -rniE "flag|feature_" src` finds nothing. The only runtime switch is the phase 2 404 fallback, listed as a compatibility shim in § 10. |
| Scheduled jobs / cron / queues | § 4 (the `notch-push` sender, the only job). PocketBase cron: **none** (§ 3). Queues: **N/A — none exist.** |
| Cross-cutting invariants | § 12 |
| Client routes, storage keys, manifest | § 6 |
| Shared constants kept in sync | § 11 |

---

## 1. PocketBase REST surface

**Protocol:** PocketBase 0.41.0 (local binary, `pocketbase/pocketbase.exe --version`; VM version `UNKNOWN — needs human confirmation`) standard record API, called only through the JS SDK `pocketbase ^0.28.1` (`package.json`). Base URL: `VITE_PB_URL` in the browser (`src/lib/pb.js:3`), `PB_URL` in the sender (`push/sender.mjs:235`). Both clients set `autoCancellation(false)` (`src/lib/pb.js:4`, `push/sender.mjs:236`).

**Realtime is not used.** No `pb.collection(...).subscribe(` or `pb.realtime` call exists in `src/` or `push/` (the only `.subscribe(` is `pushManager.subscribe`, `src/lib/push.js:50`).

### 1.1 Routes actually called

| SDK call | HTTP route (PocketBase standard) | Caller | Auth |
|---|---|---|---|
| `getFullList(opts)` | `GET /api/collections/{c}/records?page=…&perPage=…` (SDK pages until done) | `DataContext.jsx:31`, `push.js:128`, `sender.mjs:150,165,170–173,240` | user token / superuser |
| `getFirstListItem(filter)` | `GET /api/collections/{c}/records?filter=…&perPage=1&skipTotal=1` | `EnergyCheckin.jsx:43`, `push.js:61,114` | user token |
| `create(body)` | `POST /api/collections/{c}/records` | `DataContext.jsx:42,62`, `push.js:64`, `Auth.jsx:18` (users, anonymous) | user token, or none for sign-up |
| `update(id, body)` | `PATCH /api/collections/{c}/records/{id}` | `DataContext.jsx:61`, `push.js:63,116`, `Settings.jsx:39,159,350` | user token |
| `delete(id)` | `DELETE /api/collections/{c}/records/{id}` | `DataContext.jsx:74`, `push.js:130`, `sender.mjs:98` | user token / superuser |
| `authWithPassword(email, pw)` | `POST /api/collections/users/auth-with-password` | `Auth.jsx:25` | none |
| `authRefresh()` | `POST /api/collections/users/auth-refresh` | `App.jsx:83–84` | user token |
| `_superusers.authWithPassword` | `POST /api/collections/_superusers/auth-with-password` | `sender.mjs:82` | none (credentials from `push/.env`) |

**Exposed by PocketBase but not called by any code in this repo:** realtime (`/api/realtime`), batch (`/api/batch`), files, health, password reset / verification / email change / OTP / OAuth2 routes, and the admin UI `/_/`. Whether batch, OTP, OAuth2, password reset and the admin UI are enabled on the VM: `UNKNOWN — needs human confirmation` (stored in `pb_data`, not in migrations; Architect SEC-5, SEC-7). If batch is enabled, it goes through the same request hooks — untested (Architect T-7).

### 1.2 Every collection: rules, writers, readers, hooks

The owner rule set `OWNER / CREATE / UPDATE` (quoted in `architecture.md` § 5; `1761100000_init_schema.js:4–6`) applies to every collection except `users`. "Hook" = `guards.check()` on create **and** update (`main.pb.js:8–16`) unless stated.

| Collection | Client writes (call site → fields sent) | Client reads | Sender | Hooks | Invariant / blast radius |
|---|---|---|---|---|---|
| `users` (auth) | create `Auth.jsx:18` → `name, email, password, passwordConfirm`; update `Settings.jsx:39` → one of `affirmationAt` (`:73`), `nudgeTimes` (`:141`), `dayEndPush` (`:224`), `dayEndAt` (`:240`); `Settings.jsx:159` → `remindBefore`; `Settings.jsx:350` → `palette` (`:351`), `name` (`:371`) | `authRefresh` record (`App.jsx:83`); the record in `pb.authStore` | `getFullList({fields:"id,remindBefore,dayEndAt,affirmationAt,nudgeTimes,dayEndPush"})` `sender.mjs:170` | check(): `remindBefore` cleaned, default `[10]` (`guards.js:258–261`); `nudgeTimes` cleaned (`:263–264`, `cleanNudgeTimes` `:177–196`); `dayEndAt ≥ "12:00"` (`:266–267`) | API rules not in any migration (`UNKNOWN`, SEC-5). Renaming any of the six sender fields silently disables reminders or daily messages for everyone (the sender reads by name with `fields:`). |
| `categories` | `save` create/update `Settings.jsx:328` (`name`), `:336` (`color`), `:356` (`name, color`); starter seed `DataContext.jsx:42` (`name, color, user`); delete `Settings.jsx:331` (one tap, no confirmation — UX-2) | `DataContext.jsx:31` | not read | **none** (not in `GUARDED`, `main.pb.js:3–6`) | Delete clears `category` on blocks, tasks, rewards, plan_targets (non-cascade; PocketBase behaviour `UNKNOWN`, DATA-7). |
| `blocks` | `BlockEditor.jsx:78` → `title, date, start, end, category, color, recurrence, recurUntil, notes, step, remindBefore`; delete `BlockEditor.jsx:93,104`, `CourseEditor.jsx:109` | `DataContext.jsx:31` | `getFullList()` all fields, all users `sender.mjs:171` | check(): relations `category`, `step` (`guards.js:215–221`); stepped `recurUntil ≥ step start` (`:229–233`); `end > start` (`:253–255`); `remindBefore` cleaned, `null` kept (`:258–261`); stepped must repeat (`:271–274`). Model hook: stamped on step/course delete (`:70–94`) | `start`/`end` are minutes 0–1440. **15-minute steps are not enforced server-side** (BE-8 / DATA-5). Delete cascades to tasks → completions (`1761100000:63,75`). Sender uses `title, start, recurrence, date, recurUntil, step, remindBefore, id, user`. |
| `tasks` | `TaskEditor.jsx:57` → `title, category, points, priority, effort, block, daily, step, recurUntil, date, remindAt, remindDate`; `BlockEditor.jsx:85` → `title, category, points, block`; delete `TaskEditor.jsx:88`, `CourseEditor.jsx:108` | `DataContext.jsx:31` | `getFullList()` all fields, all users `sender.mjs:172` | check(): stepped → `daily=true`, clears `block, date, remindDate, recurUntil` (`:206–212`); relations `category, block, step`; M-2 early check-offs (`:235–242`, update only); m-1 habit used by target (`:247–251`, update only); `recurUntil` cleared unless daily, real date (`:277–281`); `remindAt/remindDate` clearing (`:324–331`). Model hook stamp on step/course delete (`:71–77`) | Sender uses `id, user, title, block, daily, date, remindAt, remindDate, points, recurUntil, step, created`. |
| `completions` | create only: `DataContext.jsx:88` → `task, date, points` (client `points` is overwritten); delete `DataContext.jsx:87` | `DataContext.jsx:31` | `getFullList({sort:"created", filter: COMPLETIONS_FILTER})` `sender.mjs:173`, filter `sender.mjs:46` | check(): relation `task`; `points` := task's current points (`:334–337`) — **also on update** (BE-7 / DATA-4) | Unique `(task, date)` (`1761100000:79`). The client never updates a completion (grep: the only `save("completions"` is `DataContext.jsx:88`, without id). |
| `rewards` | `Progress.jsx:89` create, `:90` update → `title, kind, target, category`; `:112` update → `claimedWeeks`; delete `:102` | `DataContext.jsx:31` | not read | check(): relation `category` | `claimedWeeks` is read-modify-write from the client (`Progress.jsx:109–113`); unvalidated JSON (SEC-10, DATA-11). |
| `push_subscriptions` | `push.js:63` update / `:64` create → `user, subscription, timezone`; `push.js:116` update → `timezone`; delete `push.js:130` | `getFirstListItem("endpoint = …")` `push.js:61,114`; `getFullList` `push.js:128` | `getFullList()` `sender.mjs:165,240`; delete on 404/410 `sender.mjs:98` | check(): `endpoint` := `subscription.endpoint`, must start `https://`, keys present (`:340–352`). **No host allowlist** (SEC-1 / BE-1) | Unique `endpoint` (`1761200000:27`). `timezone` is an IANA name read by `localNow` (`sender.mjs:26–37,197`). |
| `checkins` | `EnergyCheckin.jsx:35` create/update, `:44` update → `date, energy` | `DataContext.jsx:31`; `EnergyCheckin.jsx:43` | `optionalList("checkins", {fields:"user,date,energy", filter:"date >= {:since}"})` `sender.mjs:175` | check(): real date; date immutable on update (`:283–289`) | Unique `(user, date)` (`1794300000:28`). `energy` ∈ `ENERGY_LEVELS`. The client relies on a 400 for "already exists" (`EnergyCheckin.jsx:37–45`). |
| `plans` | `MonthPlan.jsx:46` update, `:47` create; `TargetEditor.jsx:54` create → `month, intention, notes` | `DataContext.jsx:31` | not read | check(): `month` valid `YYYY-MM` (`:291–296`) | Unique `(user, month)` (`1794500000:48`). Delete cascades to plan_targets. |
| `plan_targets` | `TargetEditor.jsx:65` update, `:66` create → `plan, title, kind, target, category, task`; delete `:83` | `DataContext.jsx:31` | not read | check(): relations `plan, category, task`; kind-specific clearing, `percent ≤ 100`, `completions` needs a habit (`:305–321`) | `kind` values = `targetProgress` kinds (`stats.js:517`). |
| `courses` | `CourseEditor.jsx:69` update, `:71` create → `title, startDate, notes, onEnd`; delete `:86` | `DataContext.jsx:31` | `optionalList("courses", {fields:"id,user,startDate,onEnd"})` `sender.mjs:177` | check(): real `startDate`; `onEnd` default `keep` (`:298–301`). Model hook `onRecordDelete` stamps first (`main.pb.js:22–33`, `guards.js:108–113`) | Course end is derived (§ 11). |
| `course_steps` | `CourseEditor.jsx:132` create → `course, week, title`; `:151` update → `week, title`; delete `:175` | `DataContext.jsx:31` | `optionalList("course_steps", {fields:"id,user,course,week"})` `sender.mjs:178` | check(): relation `course`. Model hook `onRecordDelete` stamps first (`main.pb.js:35–46`, `guards.js:117–127`) | Unique `(course, week)` (`1794500000:81`). |

`DataContext.jsx:10` `RELOAD_ON_DELETE = blocks, tasks, categories, plans, plan_targets, courses, course_steps`: the client reloads everything after these deletes because the server cascades or stamps. **Invariant:** any new server-side cascade or delete hook adds its collection here, or the client shows stale rows.

### 1.3 Error shape

Every hook error is `throw new BadRequestError("<sentence>")` (the only error type used in `guards.js`). PocketBase returns HTTP 400 with `{ "status": 400, "message": "<sentence>", "data": {} }`. Field-validation failures from the schema return 400 with `data.<field>.{code,message}`. Rule failures return 403/404 (list/view hide rows; update/delete of a foreign id returns 404). The client shows `err.message` (`BlockEditor.jsx:99`, `TaskEditor.jsx:77`) or `err.response.data.<field>.message` (`Auth.jsx:27–28`, `Settings.jsx:47`). **Invariant:** hook messages are user-facing sentences; changing them changes UI text. The exhaustive list of hook messages is in § 2.3.

---

## 2. Server hooks (`pocketbase/pb_hooks/`)

### 2.1 `main.pb.js` registrations (exhaustive)

| Line | Hook | Collections | Does |
|---|---|---|---|
| 3–6 | `GUARDED` constant | `users, blocks, tasks, completions, rewards, push_subscriptions, checkins, plans, plan_targets, courses, course_steps` (11; **not** `categories`) | Collections whose create/update requests run `check()` |
| 8–11 | `onRecordCreateRequest` | `GUARDED` | `require(guards.js).check(e)` then `e.next()` |
| 13–16 | `onRecordUpdateRequest` | `GUARDED` | same |
| 22–33 | `onRecordDelete` (model hook, also runs on cascades) | `courses` | In one transaction: `stampCourseDelete(txApp, record)` then `e.next()` |
| 35–46 | `onRecordDelete` (model hook) | `course_steps` | In one transaction: `stampStepDelete(txApp, record)` then `e.next()` |

Request hooks run only for API requests, not for `app.save()` inside hooks, migrations or the admin UI's direct model writes; superuser requests return early (`guards.js:199`). **Invariant:** a new collection with relations or server-owned fields is added to `GUARDED`; a new relation field is added to `RELATIONS`.

### 2.2 `guards.js` exports and module-level names (exhaustive)

Exported (`guards.js:355`): `check`, `stampCourseDelete`, `stampStepDelete`. Everything else is module-private.

| Name | Line | Kind | Contract |
|---|---|---|---|
| `RELATIONS` | 4–11 | const | `{blocks:{category,step}, tasks:{category,block,step}, completions:{task}, rewards:{category}, plan_targets:{plan,category,task}, course_steps:{course}}`. Every non-`user` relation field. |
| `ISO_DATE` | 17 | const | `/^\d{4}-\d{2}-\d{2}$/` |
| `isRealDate(s)` | 21–25 | fn | true for a real calendar date |
| `addDays(iso, n)` | 27–31 | fn | UTC day arithmetic; must agree with `src/lib/time.js` `addDays` |
| `weekday(iso)` | 33–35 | fn | 0 = Sunday; must agree with `time.js` `weekday` |
| `stepStart(course, step)` | 46–48 | fn | `startDate + (week−1)×7`; sync with `stats.js` `stepStartDate` |
| `taskStart(start, task)` | 54–59 | fn | `max(start, created−1 day)`; sync with `activeWindow` |
| `courseEnd(app, course)` | 61–66 | fn | `startDate + maxWeek×7 − 1` or `""`; sync with `courseEndDate` |
| `stampStep(app, step, start, end)` | 70–94 | fn | writes `date`, `recurUntil`, clears `step` on linked tasks and blocks |
| `ownerExists(app, record)` | 96–103 | fn | false during account deletion |
| `stampCourseDelete(app, course)` | 108–113 | **export** | called by `main.pb.js:27` |
| `stampStepDelete(app, step)` | 117–127 | **export** | called by `main.pb.js:40` |
| `exists(collection, filter, params)` | 129–136 | fn | any error → false |
| `ownedBy(collection, id, userId)` | 138–146 | fn | record or null; any error → null |
| `REMINDER_OPTIONS` | 149 | const | `[0, 5, 10, 15, 30, 60]` — sync § 11 |
| `cleanRemindBefore(record)` | 152–167 | fn | null when unset, else unique desc array of allowed values |
| `NUDGE_STEP` | 170 | const | `15` — sync § 11 |
| `MAX_NUDGES` | 171 | const | `6` — sync § 11 |
| `EARLIEST_DAY_END` | 173 | const | `"12:00"` — sync § 11 |
| `cleanNudgeTimes(record)` | 177–196 | fn | sorted unique minutes, `[]` when unset |
| `check(e)` | 198–353 | **export** | called by `main.pb.js:9,14` |

### 2.3 Every error message `check()` and helpers can return (all 400 `BadRequestError`)

| Line | Collection | Message |
|---|---|---|
| 162 | blocks, users | `Reminders must be a list of: 0, 5, 10, 15, 30, 60 minutes.` |
| 191 | users | `Nudge times must be up to 6 times in 15-minute steps.` |
| 219 | any in `RELATIONS` | `Invalid <field>.` (foreign or missing related id) |
| 232 | blocks (stepped) | `Repeat until can't be before the course week starts.` |
| 238–240 | tasks (update, step change) | `This habit has check-offs before that course week starts. Create a new habit for the course instead, so its history stays.` |
| 249 | tasks (update) | `This habit is used by a monthly target. Remove the target first.` |
| 254 | blocks | `A block must end after it starts.` |
| 267 | users | `The day must end at 12:00 PM or later.` |
| 273 | blocks (stepped) | `A course block must repeat.` |
| 280 | tasks | `Invalid end date.` |
| 284 | checkins | `Invalid date.` |
| 287 | checkins (update) | `A check-in's date can't change.` |
| 294 | plans | `Invalid month.` |
| 299 | courses | `Invalid start date.` |
| 312 | plan_targets | `A % target must be 1–100.` |
| 318 | plan_targets | `A habit target needs a habit.` |
| 349 | push_subscriptions | `Invalid push subscription.` |

### 2.4 Server-owned fields (written by `check()`, client value ignored)

`completions.points` (`:336`); `push_subscriptions.endpoint` (`:351`); `users.remindBefore` normalised and defaulted `[10]` (`:260`); `users.nudgeTimes` normalised (`:264`); `blocks.remindBefore` normalised (`:260`); stepped `tasks.daily/block/date/remindDate/recurUntil` (`:206–212`); non-daily `tasks.recurUntil` cleared (`:278`); `tasks.remindAt/remindDate` cleared by kind (`:324–331`); `courses.onEnd` default (`:300`); `plan_targets.task/category` cleared by kind (`:305–321`). Delete-time writes: `tasks.date/recurUntil/step`, `blocks.date/recurUntil/step` (`:70–94`).

---

## 3. Custom routes and cron in `pb_hooks`

**None.** `grep -rnE "routerAdd|cronAdd|routerUse|onBootstrap|onServe|\$http|onMailer|onRealtime|onRecordAuth" pocketbase/pb_hooks` returns nothing. The only scheduled work is the external sender (§ 4).

---

## 4. Push sender (`push/sender.mjs`) — the only scheduled job

### 4.1 Schedule and run modes

- systemd unit `notch-push`, `ExecStart=/usr/bin/node --env-file=push/.env push/sender.mjs`, `Restart=always`, `RestartSec=10` (`push/README.md:114–128`; the VM unit file itself is `UNKNOWN — needs human confirmation`).
- `TICK_MS = 60_000` (`sender.mjs:19`). Ticks run back to back, never overlap; the gap is `max(1000, 60000 − tick duration)` (`:253–257`). A failed tick logs `Tick failed:` and the loop continues (`:255`).
- `--test` (`:238–248`, `npm run push:test`): sends `{title:"Notch", body:"Reminders are working. Go notch a win! ✅", url:"/", tag:"test"}`, `topic:"test"`, `ttl:3600` to **every** subscription of every user, then exits.
- Runs only when it is the entry script (`:262–270`); importing it (tests) runs nothing.
- Requires Node ≥ 20.6 for `--env-file` (`push/README.md:100`).

### 4.2 Queries per tick (exhaustive, `sender.mjs:163–179`)

| # | Collection | Options | Notes |
|---|---|---|---|
| 1 | `push_subscriptions` | none (all rows, all fields) | if empty, tick ends |
| 2 | `users` | `fields: "id,remindBefore,dayEndAt,affirmationAt,nudgeTimes,dayEndPush"` | |
| 3 | `blocks` | none — all users, all fields | SEC-6 / DATA-2 |
| 4 | `tasks` | none — all users, all fields | SEC-6 / DATA-2 |
| 5 | `completions` | `sort: "created"`, `filter: date >= {:since} \|\| (task.daily = false && task.block = '')` | `since = UTC date − 2 days` (`:47`) |
| 6 | `checkins` (optional) | `fields: "user,date,energy"`, `filter: date >= {:since}` | 404 → `[]` with one warning |
| 7 | `courses` (optional) | `fields: "id,user,startDate,onEnd"` | 404 → `[]` |
| 8 | `course_steps` (optional) | `fields: "id,user,course,week"` | 404 → `[]` |

Write: `push_subscriptions.delete(sub.id)` on a 404/410 from the push service (`:96–99`). Auth: `_superusers.authWithPassword(PB_EMAIL, PB_PASSWORD)` when `pb.authStore.isValid` is false (`:80–84`).

**Invariant:** records are grouped by `user` (`:181–186`) and each subscription only receives messages built from its own `sub.user`'s records (`:191–204`). Breaking this sends one user's titles to another user's device.

### 4.3 Push payload and options (consumed by `public/sw.js`)

- Payload: `JSON.stringify({ title, body, url, tag })` (`sender.mjs:89`). All four are strings. `title` and `body` are plain text and may contain user-entered block and task titles (`reminders.js:245–246,273`). `url` is always a same-origin path: `/` (test), `/#home`, `/#calendar`, `/#tasks` (`reminders.js:142,170,186,199,247,275`; `sender.mjs:243`). `tag` values: `block-<blockId>`, `task-<taskId>`, `affirmation`, `nudge`, `dayend`, `test`.
- `web-push` options: `TTL: ttl` seconds (≥ 60, computed so the message expires at the end of its window), `urgency: "high"`, `topic` (`sender.mjs:90–92`). Topics: `b<blockId>`, `t<taskId>`, `affirmation`, `nudge`, `dayend`, `test`. **Invariant:** a Web Push `Topic` must be at most 32 characters from the URL-safe base64 alphabet. PocketBase ids are 15 characters `[a-z0-9]`, so `b`/`t` + id = 16. A change to the id format or the topic prefixes can make push services reject every block or task reminder.
- **No `timeout` is passed** (BE-2).

### 4.4 Message keys (dedupe identity, `reminders.js:119–124,244,272`)

| Key | Source |
|---|---|
| `block|<blockId>|<YYYY-MM-DD>|<offsetMinutes>` | `dueReminders` (`reminders.js:244`) |
| `task|<taskId>|<YYYY-MM-DD>|at` | `dueReminders` (`:272`) |
| `affirmation|<YYYY-MM-DD>` | `dueDailyMessages` (`:139`) |
| `nudge|<YYYY-MM-DD>|<slotMinutes>` | `dueDailyMessages` (`:183`) |
| `nudge-done|<YYYY-MM-DD>` | `dueDailyMessages` (`:167`) |
| `dayend|<YYYY-MM-DD>` | `dueDailyMessages` (`:196`) |

Dates are the device's local date (`localNow(sub.timezone)`). **Invariant:** a key identifies one message per device. Changing a key's format makes the first tick after deploy resend every message still inside its window (old keys in `.sent.json` no longer match).

### 4.5 `push/.sent.json` (gitignored)

- Path: `SENT_LOG` env var, default `push/.sent.json` next to `sender.mjs` (`:110`).
- Format: one JSON object, `"<subId>|<messageKey>": <sent-at epoch ms>` (`:107,137`).
- Entries older than `SENT_KEEP_MS = 2 days` are dropped on load (`parseSentLog`, `:114–124`) and on each tick (`:216–222`). Malformed file → empty map.
- Written only when something changed, as `<path>.tmp` then `rename` (`:134–142`). A write failure logs a warning and the sender keeps running.
- **Invariant:** the service user can write the `push/` directory; a restart inside a message window does not resend it.

### 4.6 Time zones

`localNow(timeZone)` (`:26–37`) returns `{date, minutes}` in the subscription's IANA zone; an invalid or missing zone uses `FALLBACK_TZ = "America/Denver"` (`:20,33,197`). The VM clock is used only for the UTC date in `completionsSince` (2-day margin) and the sent-log timestamps. The browser writes `timezone` on subscribe (`push.js:57`) and refreshes it on every app open after `authRefresh` (`App.jsx:85–88`, `push.js:106–117`).

### 4.7 `sender.mjs` exports (used by tests)

| Export | Line | Signature | Importers |
|---|---|---|---|
| `FALLBACK_TZ` | 20 | `"America/Denver"` | — |
| `localNow` | 26 | `(timeZone = FALLBACK_TZ, at = new Date()) → {date, minutes}` | `reminders-test.mjs:258`, `t4-nudges-attack.mjs:10` |
| `COMPLETIONS_FILTER` | 46 | string, params `{since}` | same two |
| `completionsSince` | 47 | `(at = new Date()) → "YYYY-MM-DD"` | same two |
| `buildMessagesForSub` | 60 | `({now, user, blocks, tasks, completionIndex, checkins = [], schedule}) → [{key,title,body,url,tag,topic,ttl}]` | same two |
| `parseSentLog` | 114 | `(text, now = Date.now()) → Map` | `reminders-test.mjs:298` |

---

## 5. Service worker (`public/sw.js`)

- Registered at `/sw.js` (`src/main.jsx:7`); served `Cache-Control: no-cache` (`netlify.toml`). No caching or offline logic.
- `install` → `skipWaiting()`; `activate` → `clients.claim()` (`sw.js:3–4`).
- `push` (`:6–22`): parses `event.data.json()`; on parse failure uses the text as `body`. Shows `title || "Notch"`, `body || ""`, `icon`/`badge` `/icon-192.png`, `tag`, and stores `{url: url || "/"}` in `notification.data`. Fields read: **`title`, `body`, `tag`, `url`** — nothing else.
- `notificationclick` (`:25–40`): closes, resolves `data.url` against `self.location.origin`, focuses a same-origin window and calls `navigate(url)` (falls back to focus), else `openWindow(url)`.
- **Invariants:** payload keys stay `title/body/url/tag`; `url` is a same-origin path (the worker does not enforce this today — SEC-4); `tag` reuse replaces the previous notification; `/icon-192.png` exists in `public/`.

---

## 6. Client routes, manifest and storage

### 6.1 Hash routes (`src/App.jsx:13–37`)

`#home` (default), `#calendar`, `#tasks`, `#progress`, `#settings`, `#now` (hidden, not a nav tab). Any other or empty hash renders `home` (`:27–28`). Navigation sets `window.location.hash` (`:36`). The Netlify SPA redirect `/* → /index.html 200` (`netlify.toml`) serves every path.

**Inbound links that depend on these ids:** manifest shortcut `/#now`; notification `url`s `/#home`, `/#calendar`, `/#tasks` (§ 4.3). Renaming a view id breaks those links silently (they fall back to Home).

### 6.2 Manifest (`public/manifest.webmanifest`)

`id: "/"`, `start_url: "/"`, `scope: "/"`, `display: "standalone"`. Icons `/icon-192.png`, `/icon-512.png`, `/icon-maskable-512.png`, `/icon.svg`. One shortcut: `"Next 3 hours"` → `/#now`, icon `/shortcut-now-96.png`. **Invariant:** changing `id` makes installed PWAs a different app.

### 6.3 Browser storage keys (exhaustive)

| Key | Storage | Written by | Contents |
|---|---|---|---|
| `notch.scorecard.dismissed` | localStorage | `src/views/Home.jsx:49,61` (read `:53`) | ISO date of the last dismissed score card |
| PocketBase auth store | localStorage | PocketBase SDK default `LocalAuthStore` (`src/lib/pb.js:3` sets none) | auth token + user record. The key name is the SDK default (believed to be `pocketbase_auth`) — `UNKNOWN — needs human confirmation` (not readable from repo code) |

`sessionStorage` and IndexedDB: not used (`grep -rnE "localStorage|sessionStorage|indexedDB" src public`).

---

## 7. Third-party integrations

| Integration | Used for | Where | Failure / timeout expectation today |
|---|---|---|---|
| PocketBase (self-hosted) | Auth, data, rules, hooks | `src/lib/pb.js`, `push/sender.mjs:235` | Browser: SDK default fetch (no timeout set); errors shown in UI. Sender: no timeout; a hung request stalls the loop (BE-6). |
| Web Push services (Apple, Google FCM, Mozilla, Microsoft — whichever host the subscription's `endpoint` names) | Delivering reminders | `sender.mjs:89` via `web-push ^3.6.7` | **No timeout, no circuit breaker** (BE-2). Retry: a failed send is not recorded, so it is retried each minute until its window ends. 404/410 → delete subscription. |
| Browser Push API | Subscribing a device | `src/lib/push.js:43–133` | Service-worker readiness times out after 10 s (`push.js:35–40`). |
| Netlify | Static hosting, SPA redirect, headers | `netlify.toml` | — |
| DuckDNS + TLS on the VM | Hostname and HTTPS for PocketBase | none in repo | `UNKNOWN — needs human confirmation` |

---

## 8. Environment variables (exhaustive)

| Name | Read at | Required | Default | Secret | Controls |
|---|---|---|---|---|---|
| `VITE_PB_URL` | `src/lib/pb.js:3` (build time); `scripts/api-test.mjs:8`, `scripts/t3-energy-attack.mjs:8`, `scripts/t5-courses-attack.mjs:11` (runtime) | prod: yes | `http://127.0.0.1:8090` | no | PocketBase base URL. Must be `https://` in production (SEC-8). |
| `VITE_VAPID_PUBLIC_KEY` | `src/lib/push.js:3` | for push | none → push shows "missing VAPID key" (`push.js:31`) | no | Must equal `VAPID_PUBLIC_KEY`; changing it forces every device to resubscribe (`push.js:84–88`, `push/README.md:84–89`). |
| `PB_URL` | `push/sender.mjs:235` | yes (`:227`) | none | no | PocketBase URL as seen from the sender; `.env.example` uses loopback. |
| `PB_EMAIL` | `sender.mjs:82` | yes | none | sensitive | Superuser login for the sender. |
| `PB_PASSWORD` | `sender.mjs:82` | yes | none | **secret** | |
| `VAPID_PUBLIC_KEY` | `sender.mjs:234` | yes | none | no | |
| `VAPID_PRIVATE_KEY` | `sender.mjs:234` | yes | none | **secret** | Signs every push. Leak = anyone can push to every device (SEC-4). |
| `VAPID_SUBJECT` | `sender.mjs:234` | yes | none | no | `mailto:` or `https:` contact. |
| `SENT_LOG` | `sender.mjs:110` | no | `push/.sent.json` | no | Sent-log path. |

Sources for the names: `.env.example`, `push/.env.example`, `grep -rnE "import\.meta\.env|process\.env" src push scripts vite.config.js`. `vite.config.js` reads no env. Real values live only in Netlify and `push/.env` on the VM, never in git.

---

## 9. Shared `src/lib` modules (Node-safe; imported by the app, the sender and tests)

**Module invariants:** `reminders.js`, `messages.js`, `stats.js`, `time.js`, `affirmations.js` import nothing from the browser, Vite or `pb.js` (`reminders.js:2`), use explicit `.js` extensions on relative imports (Node ESM; `package.json` `"type": "module"`), and are pure (no network). Changing behaviour here changes the app **and** what the sender pushes; the sender only picks it up after `sudo systemctl restart notch-push` (`push/README.md:138–142`).

Importer key: **S** = `push/sender.mjs` (directly or through `reminders.js`), **A** = `scripts/api-test.mjs`, **R** = `scripts/reminders-test.mjs`, **St** = `scripts/stats-test.mjs`, **T3/T4/T5** = attack scripts. Every export is also usable by the app; app importers are not listed.

### 9.1 `src/lib/reminders.js`

| Export | Line | Signature | Non-app importers |
|---|---|---|---|
| `REMINDER_OPTIONS` | 9 | `[0,5,10,15,30,60]` | (sync § 11) |
| `DEFAULT_REMINDERS` | 10 | `[10]` | — |
| `TASK_GRACE_MINUTES` | 12 | `15` | T4 |
| `offsetLabel` | 14 | `(minutes) → string` | — |
| `describeOffsets` | 20 | `(offsets) → string` | — |
| `cleanOffsets` | 26 | `(value) → number[] \| null` | R |
| `userOffsets` | 32 | `(user) → number[]` | — |
| `blockOffsets` | 37 | `(block, userDefault = DEFAULT_REMINDERS) → number[]` | R |
| `leadText` | 42 | `(minutesLeft) → string` | R |
| `parseHHMM` | 51 | `(value) → minutes \| null` | — |
| `DEFAULT_DAY_END` | 57 | `"21:00"` | St |
| `EARLIEST_DAY_END` | 60 | `"12:00"` | (sync § 11) |
| `dayEndMinutes` | 63 | `(user) → minutes` | St |
| `NUDGE_STEP` | 70 | `15` | R, T4 |
| `MAX_NUDGES` | 71 | `6` | R, T4 |
| `NUDGE_PRESETS` | 72 | `{light, regular, frequent}` | R |
| `cleanNudgeTimes` | 83 | `(value) → number[] \| null` | R, T4 |
| `nudgeTimesFor` | 94 | `(user) → number[]` | R |
| `dueDailyMessages` | 128 | `({now, user, data}) → Message[]` | S, R, T4 |
| `dueReminders` | 223 | `({now, blocks, tasks, completionIndex, userDefault, schedule}) → Message[]` | S, R |

`Message = {key, title, body, url, tag, topic, ttl}` — the shape `sender.mjs:86` destructures. Adding a field is safe; renaming one breaks the sender.

### 9.2 `src/lib/messages.js`

| Export | Line | Signature | Non-app importers |
|---|---|---|---|
| `CELEBRATIONS` | 6 | string[] | R, St, T4 |
| `TOMORROW_LINES` | 29 | string[] | R, St, T4 |
| `QUIET_LINES` | 53 | string[] | St |
| `scoreHeadline` | 71 | `(summary) → string` | S (via reminders), St |
| `closingLine` | 81 | `(summary, date) → string` | S, St |
| `NUDGE_LINES` | 88 | string[] | R, T4 |
| `LOW_ENERGY_LINES` | 104 | string[] | R, T4 |
| `HIGH_ENERGY_LINES` | 119 | string[] | R, T4 |
| `LOW_ENERGY_CELEBRATIONS` | 134 | string[] | R, T4 |
| `nudgeText` | 150 | `(summary, nextInstance, date = "", energy = null) → string` | S, R, T4 |

Invariant (`messages.js:1–3`): no `Date.now` or `Math.random`, so app and sender show the same text for a date.

### 9.3 `src/lib/stats.js`

| Export | Line | Signature | Non-app importers |
|---|---|---|---|
| `scheduleIndex` | 20 | `(courses = [], courseSteps = []) → {stepsById, coursesById, maxWeekByCourse}` | S, R, St, T5 |
| `courseOnEnd` | 35 | `(course) → "stop" \| "keep"` | — |
| `stepStartDate` | 38 | `(course, step) → date` | St |
| `courseEndDate` | 43 | `(course, schedule) → date \| ""` | St, T5 |
| `activeWindow` | 72 | `(record, schedule) → span` | S (via reminders), St, T5 |
| `isActiveOn` | 89 | `(span, date) → bool` | S |
| `blockOccursOn` | 93 | `(block, date, schedule) → bool` | S, St, T5 |
| `blocksForDate` | 109 | `(blocks, date, schedule)` | St |
| `upcomingBlocks` | 126 | `(blocks, today, nowMinutes, schedule, windowMinutes = 180)` | St |
| `topThree` | 142 | `(instances)` | S, St |
| `ENERGY_LEVELS` | 149 | `["high","normal","low"]` | St, T3 (sync § 11) |
| `EFFORT_LEVELS` | 150 | `["light","medium","heavy"]` | St, T3 (sync § 11) |
| `energyOn` | 153 | `(checkins, date) → level \| null` | S |
| `levelLabel` | 158 | `(level) → string` | — |
| `openNow` | 178 | `(instances, ctx = {})` | S |
| `suggestForEnergy` | 198 | `(instances, energy, limit = 3, ctx = {})` | S, St, T3 |
| `indexCompletions` | 229 | `(completions) → {byKey: Map<"taskId|date", c>, byTask: Map<taskId, c[]>}` | S, A, R, St, T3, T4, T5 |
| `instancesForDate` | 248 | `({tasks, blocks, completionIndex, schedule}, date, today) → [{task, date, done, completion}]` | S, A, St, T3, T5 |
| `isDayComplete` | 277 | `(summary) → bool` | — |
| `summarize` | 281 | `(instances, categoriesById)` | S, St |
| `weekStats` | 313 | `(data, weekStart, today)` | A, St, T5 |
| `habitStreak` | 337 | `(data, task, date, today)` | St |
| `dayScore` | 387 | `(data, date, today)` | St, T3 |
| `courseStats` | 452 | `(data, course, today)` | St |
| `courseDeleteImpact` | 488 | `(data, course)` | St, T5 |
| `monthStats` | 499 | `(data, month, today)` | St, T5 |
| `targetProgress` | 517 | `(data, target, plan, today)` | St, T5 |

The `byKey` key format `"<taskId>|<date>"` is relied on directly by `reminders.js:241,264`.

### 9.4 `src/lib/time.js`

| Export | Line | Signature | Non-app importers |
|---|---|---|---|
| `STEP` | 3 | `15` | (sync § 11) |
| `toISODate` | 5 | `(Date) → iso` | — |
| `parseISODate` | 12 | `(iso) → Date` | — |
| `todayISO` | 17 | `() → iso` (local clock) | A, T3, T5 |
| `addDays` | 21 | `(iso, n) → iso` | S, St, T3, T4, T5 |
| `weekday` | 27 | `(iso) → 0–6` | S (via stats), T5 |
| `startOfWeek` | 32 | `(iso) → iso` | A |
| `weekDates` | 37 | `(weekStart) → iso[]` | — |
| `nowMinutes` | 41 | `() → minutes` | — |
| `formatTime` | 46 | `(minutes) → "6am" / "6:15pm"` (12-hour, lowercase, no space; `CLAUDE.md` § Layout says "6:00 AM", which is drift) | — |
| `formatRange` | 54 | `(start, end)` | — |
| `formatDate` | 58 | `(iso, opts)` | — |
| `dayLabel` | 63 | `(iso, today = todayISO())` | — |
| `weekLabel` | 71 | `(iso, today = todayISO())` | — |
| `monthOf` | 82 | `(iso) → "YYYY-MM"` | St |
| `monthDates` | 87 | `(month) → iso[]` | St |
| `addMonths` | 94 | `(month, delta)` | St |
| `monthLabel` | 101 | `(month)` | — |
| `snap` | 105 | `(minutes) → minutes` | — |
| `toTimeInput` | 110 | `(minutes) → "HH:MM"` | — |
| `fromTimeInput` | 114 | `("HH:MM") → minutes` | — |
| `greeting` | 119 | `() → string` | — |

### 9.5 `src/lib/affirmations.js` (imported by `reminders.js`, `messages.js`, `stats.js`)

`AFFIRMATIONS` (`:4`, St), `STRIDE = 97` (`:284`, St), `dayNumber(isoDate)` (`:288`), `affirmationFor(isoDate)` (`:300`, S, R, St). Invariant: same date → same text everywhere; never throws.

---

## 10. Compatibility shims (behaviour switches that are not feature flags)

| Shim | Where | Behaviour | Remove when |
|---|---|---|---|
| Phase 2 collections may 404 (client) | `DataContext.jsx:8,32–34` | `checkins, plans, plan_targets, courses, course_steps` list 404 → `[]` | the phase 2 migrations are on the VM everywhere |
| Phase 2 collections may 404 (sender) | `sender.mjs:144–159` | `checkins, courses, course_steps` 404 → `[]`, warn once | same |
| Check-in 404 message | `EnergyCheckin.jsx:50–54` | "Energy check-ins aren't available yet." | same |

---

## 11. Shared constants and rules that must stay in sync (CLAUDE.md principle 6)

| Rule | App location | Server / other location | Breaks if they drift |
|---|---|---|---|
| `REMINDER_OPTIONS = [0,5,10,15,30,60]` | `src/lib/reminders.js:9` | `guards.js:149` | UI offers a value the server rejects (400), or the server accepts one the sender ignores (`cleanOffsets` filters it) |
| `NUDGE_STEP = 15` | `reminders.js:70` | `guards.js:170` | nudge saves fail or the sender's window math (`windowFor`) misses slots |
| `MAX_NUDGES = 6` | `reminders.js:71` | `guards.js:171` | same |
| `cleanNudgeTimes` rule (int, `0..1425`, step, unique, sorted) | `reminders.js:83–91` | `guards.js:177–196` | same |
| `EARLIEST_DAY_END = "12:00"` | `reminders.js:60` | `guards.js:173` | saved day-end treated as default by `dayEndMinutes` |
| Default user reminders `[10]` | `reminders.js:10` | `guards.js:260` | new users' default differs between app and push |
| Step start `startDate + (week−1)×7` | `stats.js:38` `stepStartDate` | `guards.js:46–48` `stepStart` | delete-time stamped dates differ from what the user saw; history changes |
| Course end `startDate + maxWeek×7 − 1` (only `stop`) | `stats.js:43` `courseEndDate` | `guards.js:61–66` `courseEnd` | same |
| Stepped task start `max(step start, created − 1 day)` | `stats.js:72` `activeWindow` | `guards.js:54–59` `taskStart` | same |
| `ENERGY_LEVELS` | `stats.js:149` | `checkins.energy` select, `1794300000_energy.js:24` | 400 on save, or a level the stats never match |
| `EFFORT_LEVELS` | `stats.js:150` | `tasks.effort` select, `1794300000_energy.js:33` | same |
| Target kinds `points/percent/completions` | `stats.js:517` `targetProgress` | `plan_targets.kind` select `1794500000:96`; `guards.js:305–321` | target ignored or rejected |
| Block 15-minute grid | `time.js:3` `STEP`, `BlockEditor.jsx:14`, `Calendar.jsx:47` | **not enforced** in `guards.js` (BE-8 / DATA-5) | — (the rule is a UI convention only today) |
| `addDays`, `weekday` date math | `time.js:21,27` (local) | `guards.js:27–35` (UTC) | stamped dates off by one |

---

## 12. Cross-cutting invariants

| # | Invariant | Enforced at | Breaks if violated |
|---|---|---|---|
| I-1 | Every owned collection uses the exact owner rule set; a new collection copies it | migrations (`architecture.md` § 5) | cross-user read/write |
| I-2 | Every relation id belongs to the requester, on create **and** update | `RELATIONS` + `check()` (`guards.js:4–11,215–221`; `main.pb.js:8–16`) | a user links to (and leaks titles via) another user's records |
| I-3 | Server-owned fields (§ 2.4) are never taken from the client | `check()` | points inflation, endpoint spoofing |
| I-4 | Superuser requests bypass all hooks (`guards.js:199`); the sender's only write is deleting expired subscriptions | code review | unvalidated data if the sender ever writes user data |
| I-5 | A subscription only receives its own user's data | `sender.mjs:191–204` | cross-user disclosure on the lock screen |
| I-6 | Push `url` is a same-origin path; `title`/`body` plain text | `reminders.js` (producer); not checked in `sw.js` (SEC-4) | phishing on tap |
| I-7 | `push_subscriptions.endpoint` is an HTTPS push-service URL | `guards.js:348` (scheme only; host allowlist missing, SEC-1) | SSRF from the VM |
| I-8 | All reminder timing uses the device's IANA zone, never the VM clock | `sender.mjs:197` | reminders at the wrong hour |
| I-9 | Each message goes out at most once per device per key, across restarts | `.sent.json` (§ 4.5) | duplicate pushes |
| I-10 | History stays put: no edit changes past weeks' totals except the three warned exceptions (CLAUDE.md principle 3) | `completions.points` snapshot (`guards.js:334–337`) — **re-snapshotted on update** (BE-7 / DATA-4) | past weeks change |
| I-11 | Course and step deletes stamp derived dates before deleting, in one transaction | `main.pb.js:22–46` | stepped habits jump to "always on" after delete |
| I-12 | Dates are `YYYY-MM-DD` strings, times are minutes since midnight | schema patterns, `time.js` | every stats and reminder function |
| I-13 | The shared `src/lib` modules stay Node-safe | `reminders.js:2` | the sender fails to start |
| I-14 | Deploy order: migrations + hooks → restart PocketBase → restart sender → Netlify | CLAUDE.md, `push/README.md:138–142` | sender or app queries collections that don't exist (shims § 10 soften this) |

---

## Verification

How this inventory was built (2026-11-14, Backend Engineer):

- Read in full: `pocketbase/pb_hooks/main.pb.js`, `pocketbase/pb_hooks/guards.js`, `push/sender.mjs`, `public/sw.js`, `public/manifest.webmanifest`, `src/lib/reminders.js`, `src/lib/DataContext.jsx`, `src/lib/push.js`, `src/lib/pb.js`, `netlify.toml`, `.env.example`, `push/.env.example`, `push/README.md` lines 60–180, migrations `1761100000` and `1761200000`; field and rule lines of the other five migrations via grep.
- Collection call sites: `grep -rn "collection(" src push`; `grep -rnoE "(save|remove)\(\s*\"[a-z_]+\"" src`, plus the two non-literal `save(` calls (`BlockEditor.jsx:78`, `TaskEditor.jsx:57`); each call read in context for its fields.
- SDK features: `grep -rnE "pb\.(authStore|filter|files|realtime|send|autoCancellation|health|batch)|\.subscribe\(|createBatch" src push`.
- Hooks/routes/cron: `grep -rnE "routerAdd|cronAdd|routerUse|onBootstrap|onServe|\$http|onMailer|onRealtime|onRecordAuth" pocketbase/pb_hooks` (no matches).
- Storage: `grep -rnE "localStorage|sessionStorage|indexedDB" src public`. Routes: `src/App.jsx:13–37`, `grep -rnE "location\.hash|hashchange" src`.
- Env: `grep -rnE "import\.meta\.env|process\.env" src push scripts vite.config.js`.
- Exports: `grep -nE "^export " src/lib/{reminders,messages,stats,time,affirmations}.js`; importers: `grep -rnE "from \"\.\./src/lib|from \"\.\./push" scripts push` plus the multi-line imports in `scripts/reminders-test.mjs:2–10` and `scripts/t5-courses-attack.mjs:5–9`.
- Ran `npm run test:reminders` (all passed) and `npm run test:stats` (211/211). `npm run test:api` and the t4/t5 server parts were not run (PocketBase was not running).
- Not read: `pb_data`, `node_modules`, any real `.env`. Facts that need those are marked UNKNOWN.

## Update this doc when

Update in the **same pull request** when any of these change:

- `pocketbase/pb_migrations/**` (a collection, rule, field used by the sender, index, select value)
- `pocketbase/pb_hooks/**` (a hook, `GUARDED`, `RELATIONS`, a message in § 2.3, a server-owned field, a constant)
- `push/sender.mjs` (a query, field list, payload key, option, message key, `.sent.json` format, env var, export)
- `public/sw.js`, `public/manifest.webmanifest`
- `src/App.jsx` `VIEWS` (hash routes)
- any `pb.collection(` call or `save(`/`remove(` call in `src/` that adds a collection or changes the fields sent
- `src/lib/reminders.js`, `messages.js`, `stats.js`, `time.js`, `affirmations.js` exports or signatures
- any new `import.meta.env.*` / `process.env.*`, `.env.example`, `push/.env.example`
- any new `localStorage` / `sessionStorage` key
- `netlify.toml` redirects or headers
