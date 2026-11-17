## Backend Review — chore/adopt-agentic-mastery (Round 2, Implementation)

**Scope:** Tier 1 docs I own (`docs/contracts.md`, T-001.17; `docs/api.md`, T-001.5) plus a review of the existing server side: `pocketbase/pb_hooks/main.pb.js`, `pocketbase/pb_hooks/guards.js` and `push/sender.mjs`, with the parts of `public/sw.js`, `src/lib/push.js`, `src/lib/DataContext.jsx` and `src/lib/reminders.js` that they touch. Review and document only; no app code changed.

**Verdict:** BLOCK — for **deploying the app** (same scope as the Architect's SEC-1 block), on BE-1 and BE-2. **PASS WITH ITEMS for landing the docs on this branch**, which changes no code.
**Feasibility concerns:** none that stop the fixes. One design constraint: goja (the PocketBase JSVM) may not provide the WHATWG `URL` class, so the SEC-1 fix in `guards.js` uses a regex, not `new URL()` (BE-1).
**Contract changes (breaking?):** none on this branch. The proposed fixes change two contracts, both non-breaking for the shipped client: `push_subscriptions` create/update gains a host allowlist (a new 400 for non-push hosts), and `completions` update becomes refused (the client never updates completions, verified below).

### Method

Read in full `main.pb.js`, `guards.js`, `sender.mjs`, `sw.js`, `manifest.webmanifest`, `reminders.js`, `DataContext.jsx`, `push.js`, `pb.js`, `netlify.toml`, `.env.example`, `push/.env.example`, migrations `1761100000` and `1761200000`, `push/README.md` 60–180; read the fields/rules of the other five migrations by grep. Read every `pb.collection(` and `save(`/`remove(` call site in `src/` in context. Grepped `guards.js` for any 15-minute rule (`% 15`, `STEP`, `% NUDGE_STEP`): the only modulo check is for nudges (`guards.js:189`). Ran `npm run test:reminders` (all pass) and `npm run test:stats` (211/211). Did not run `npm run test:api` or the t4/t5 server parts: PocketBase was not running locally (`curl 127.0.0.1:8090/api/health` failed). Did not read `pb_data`, `node_modules` or any `.env`.

Line numbers below are file line numbers (`guards.js` is 355 lines; `check()` is 198–353).

### Checklist results

| Item | Result | Evidence |
|---|---|---|
| Every guard runs on create AND update | **PASS** for the 11 `GUARDED` collections: one `check()` is registered on both `onRecordCreateRequest` and `onRecordUpdateRequest`. Update-only checks are update-only by design (M-2 `:235–242`, m-1 `:247–251`, check-in date `:286–288`). `categories` is not guarded (BE-12). | `main.pb.js:3–16` |
| Delete hooks where they matter | **PASS.** Course and step deletes are model hooks (also run on cascades), stamp dates first, in one transaction. | `main.pb.js:22–46`, `guards.js:70–127` |
| 15-minute block times enforced server-side | **FAIL — DATA-5 confirmed.** Only `end > start` is checked. | `guards.js:253–255`; no other `start`/`end` check in the file (BE-8) |
| `start < end` | PASS | `guards.js:253` |
| Points bounds | PASS for `tasks.points` (schema `min 0, max 1000`, `1761100000:62`) and the `completions.points` snapshot. Snapshot rewritten on update (BE-7). | `guards.js:334–337` |
| `remindBefore` ⊂ `REMINDER_OPTIONS` | PASS (users and blocks) | `guards.js:149–167, 258–261` |
| `nudgeTimes` ≤ `MAX_NUDGES`, `NUDGE_STEP` steps | PASS | `guards.js:177–196, 263–264` |
| `dayEndAt` ≥ `EARLIEST_DAY_END` | PASS (pattern from migration + text compare) | `guards.js:266–267`, `1794200000_day_end.js:9` |
| Shared constants identical | PASS: `[0,5,10,15,30,60]`, `15`, `6`, `"12:00"` match | `reminders.js:9,60,70,71` vs `guards.js:149,170,171,173` |
| Error types | PASS: every hook error is `BadRequestError` with a user-facing sentence (17 messages, `contracts.md` § 2.3). Ownership failures don't reveal whether the id exists. No `ForbiddenError` is needed today. | `guards.js` |
| Sender: one bad subscription doesn't stop the loop | **PARTIAL.** A failed *send* is caught (`sender.mjs:95–104`). A throw while *building* one subscription's messages aborts the whole tick for every later subscription (BE-3). | `sender.mjs:191–213, 255` |
| Sender: 404/410 deletes the subscription | PASS, but the delete error is swallowed and "Removed" is logged even when it failed (BE-4). | `sender.mjs:96–99` |
| Sender: timeout on sends | **FAIL** (BE-2) | `sender.mjs:89–93` |
| `.sent.json` written atomically | PASS: write `<path>.tmp`, then `renameSync` (same directory). No fsync; acceptable. | `sender.mjs:134–142` |
| Time zones | PASS: each device's IANA zone from `sub.timezone`, invalid → `America/Denver`; VM clock used only for the 2-day UTC cutoff. DST gaps are documented limitations. | `sender.mjs:20, 26–37, 47, 197`; `push/README.md:179–180` |
| No endpoint, token or email in logs | PASS: logs carry `sub.id`, collection names and error messages only. `err.body` from the push service is logged unbounded (BE-15). | `sender.mjs:99, 101, 130, 140, 155, 230, 251, 255` |
| Completion-update points (SEC/DATA-4) | **Confirmed** (BE-7). The client never updates a completion: the only `save("completions"` is `DataContext.jsx:88`, called without an id. | `guards.js:334–337`, `1761100000_init_schema.js:6` |
| Push host allowlist (SEC-1) | **Confirmed missing** (BE-1) | `guards.js:347–349` |
| Idempotency of writes | Decided per write path in `docs/api.md` § 4 | — |
| Correlation IDs / structured logs | Not present (BE-16) | `sender.mjs` |

---

### Blockers (deploy scope)

**BE-1 — BLOCKER — Push endpoint host not validated (confirms Architect SEC-1)**
- **Where:** `pocketbase/pb_hooks/guards.js:347–349` (only `startsWith("https://")` and non-empty keys); `push/sender.mjs:89` sends to whatever is stored.
- **Failure scenario:** any self-registered user saves `{"endpoint":"https://10.128.0.2:8443/x","keys":{"p256dh":"a","auth":"b"}}` and turns on an affirmation. Every day the VM POSTs to that internal address. With an endpoint that accepts and never answers, the sequential loop stalls (BE-2) and everyone's reminders stop.
- **Feasibility:** straightforward. Do not depend on `new URL()` in goja (not confirmed to exist in the PocketBase JSVM); a strict regex does the job and also rejects userinfo and ports, because `@` and `:` are not allowed in the host group.
- **Fix design (`guards.js`):**
  ```js
  // Keep in sync with PUSH_HOST in push/sender.mjs. Confirm the list against each browser's docs before shipping.
  const PUSH_ENDPOINT = /^https:\/\/([a-z0-9-]+(?:\.[a-z0-9-]+)+)\/[^\s]*$/i;
  const PUSH_HOST = /^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|([a-z0-9-]+\.)*push\.apple\.com|([a-z0-9-]+\.)*notify\.windows\.com)$/i;
  function validPushEndpoint(endpoint) {
    const m = PUSH_ENDPOINT.exec(endpoint || "");
    return !!m && endpoint.length <= 1000 && PUSH_HOST.test(m[1]);
  }
  // in check(), push_subscriptions branch, replacing the startsWith test:
  if (!validPushEndpoint(endpoint) || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) {
    throw new BadRequestError("This browser's push service isn't supported.");
  }
  ```
  In `sender.mjs`, skip (and log by `sub.id`) any subscription whose endpoint fails the same test before `send()`, so rows saved before the fix are never contacted; optionally delete them. Add the constant pair to `contracts.md` § 11. Tests: Architect T-5 (`https://127.0.0.1/x`, `https://localhost:8090/x`, `https://user:pass@fcm.googleapis.com/x`, `https://fcm.googleapis.com.attacker.example/x`, `https://fcm.googleapis.com:444/x` rejected; real FCM / Apple / Mozilla accepted).
- **Client impact:** `enablePush` (`src/lib/push.js:91–98`) retries once on any save error and then throws, so an unsupported browser sees the 400 message in Settings. Acceptable.

**BE-2 — BLOCKER — No timeout or circuit breaker on outbound push sends (backend redline; Architect SEC-1/SEC-6)**
- **Where:** `push/sender.mjs:89–93` (no `timeout` option), sends awaited one by one at `:205–212`.
- **Failure scenario:** one push host (or a BE-1 endpoint) accepts the TCP connection and never answers. `await send()` never resolves, the tick never ends, the loop at `:253–257` never starts another tick, and **no user gets any reminder** until the process is restarted by hand (systemd sees a live process and does nothing).
- **Fix design:**
  - Pass `timeout: 10_000` in the `sendNotification` options (web-push 3.x accepts a `timeout` in milliseconds; confirm against the installed version's README before shipping — I did not read `node_modules`).
  - A small per-host breaker in module scope of the sender (one process, one loop, so this is not shared request state): `const hostFailures = new Map()`; after 3 consecutive timeouts or 5xx for a host, skip that host for 5 minutes and log once. Reset on success.
  - Retry policy stays as it is (documented in `contracts.md` § 7): a failed send isn't recorded, so the next tick retries until the message's window closes.
  - Bounded concurrency (for example 5 at a time) is optional at today's size.
  - Test: Architect T-9 (one endpoint that never answers does not delay the others beyond the timeout).

### Warnings

**BE-3 — WARNING — One subscription's bad data aborts the tick for everyone after it**
- **Where:** `push/sender.mjs:191–213`; the error escapes to `:255` ("Tick failed").
- **Failure scenario:** a record shape that makes `buildMessagesForSub`, `indexCompletions` or `scheduleIndex` throw (none known today; any future change to `src/lib` could introduce one) fails the tick at that subscription. `getFullList()` returns subscriptions in the same order every minute, so every subscription after it gets no reminders, every minute, until the data or code changes.
- **Fix:** wrap the body of the `for (const sub of subs)` loop in `try { … } catch (err) { console.error(JSON.stringify({ evt: "sub_failed", tick, sub: sub.id, err: err.message })) }` and continue. Same for the `--test` loop.

**BE-4 — WARNING — Expired-subscription delete error is swallowed, and the log claims success**
- **Where:** `push/sender.mjs:98–99` (`.catch(() => {})`, then `console.log("Removed expired subscription …")`).
- **Failure scenario:** the delete fails (PocketBase down, token expired). The log says it was removed; the row stays; the next tick sends to it again and gets 410 again, forever, while the journal looks healthy. Also, after a 410, the rest of that subscription's messages in the same tick are still sent (`:205–212`), each producing another 410 and delete attempt.
- **Fix:** `try { await pb.collection("push_subscriptions").delete(sub.id); log("sub_removed") } catch (e) { log("sub_remove_failed", e.status) }`; have `send()` return `"gone"` and `break` out of that subscription's message loop.

**BE-5 — WARNING — Sender never re-authenticates after its token is rejected**
- **Where:** `push/sender.mjs:80–84` re-authenticates only when `pb.authStore.isValid` is false (token expiry by time).
- **Failure scenario:** the superuser password is changed or tokens are invalidated in the admin UI. The cached token is still "valid" by expiry, every query returns 401, every tick logs "Tick failed", and reminders stop until someone restarts the service.
- **Fix:** in the tick `catch` (`:255`), `if (err?.status === 401 || err?.status === 403) pb.authStore.clear();` so the next tick logs in again.

**BE-6 — WARNING — No watchdog on the tick (PocketBase calls have no timeout)**
- **Where:** `push/sender.mjs:163–179` (eight `getFullList` calls, no timeout), loop `:253–257`.
- **Failure scenario:** PocketBase hangs mid-response (SQLite lock, VM memory pressure — see SEC-6). The awaited query never settles and the sender stops for good, while systemd shows it as running.
- **Fix:** race each tick against a 50-second timer; on timeout log `tick_timeout` and `process.exit(1)`. `Restart=always` (`push/README.md:123`) brings it back in 10 s and `.sent.json` prevents resends of anything already recorded. Monitoring of the journal for `tick_timeout` goes to DevOps.

**BE-7 — WARNING — Updating a completion re-snapshots its points (confirms DATA-4, Architect note)**
- **Where:** `guards.js:334–337` runs on create **and** update; `completions.updateRule` is the owner rule (`1761100000_init_schema.js:6`).
- **Failure scenario:** `PATCH /api/collections/completions/records/<id> {"date":"2025-01-06"}` moves an old check-off to any date and replaces its points with the task's current points, changing past weeks (principle 3) and making rewards claimable after the fact. Reachable only through the API; the app never updates completions (`DataContext.jsx:82–90`).
- **Feasibility:** no client change needed.
- **Fix design:** hook now (ships with `pb_hooks`, no migration):
  ```js
  if (name === "completions") {
    if (!record.isNew()) throw new BadRequestError("A check-off can't be changed. Untick it and tick it again.");
    const task = ownedBy("tasks", record.getString("task"), userId);
    record.set("points", task ? task.getInt("points") : 0);
  }
  ```
  Then, in the next migration (which must also carry the DATA-1 indexes), set `completions.updateRule = null` with `down()` restoring the current `UPDATE` string, so the rule layer refuses it too. api-test: owner PATCH of a completion → 400 (hook) / 403 (after the migration); points unchanged.

**BE-8 — WARNING — 15-minute block times are not enforced server-side (confirms DATA-5)**
- **Where:** `guards.js:253–255` is the only block-time check. Schema: `start`, `end` are `onlyInt`, `min 0`, `max 1440`, not required (`1761100000_init_schema.js:47–48`). CLAUDE.md principle 5 says valid block times are enforced in `pb_hooks`; they aren't.
- **Failure scenario:** an API client saves `start: 7, end: 8`, or omits `start` (stored as 0). The calendar grid renders a 1-minute block at the 15-minute minimum height (`Calendar.jsx:89`), and the block editor's time select (`BlockEditor.jsx:14`, 15-minute options only) can't show the stored value, so the user can't see or keep the real time when editing. Reminder timing still works (it is per minute).
- **Feasibility:** safe for the shipped UI: every UI path already produces multiples of 15 (`BlockEditor.jsx:14`, `Calendar.jsx:47–48,55,60`). Model-level `app.save()` in `stampStep` (`guards.js:76,92`) does not go through request hooks, so delete stamping is unaffected.
- **Fix design:**
  ```js
  // Keep in sync with STEP in src/lib/time.js.
  const BLOCK_STEP = 15;
  if (name === "blocks") {
    const start = record.getInt("start"), end = record.getInt("end");
    if (start % BLOCK_STEP !== 0 || end % BLOCK_STEP !== 0) throw new BadRequestError("Block times must be in 15-minute steps.");
    if (end <= start) throw new BadRequestError("A block must end after it starts.");
  }
  ```
  Before deploying, run read-only on the VM: `SELECT count(*) FROM blocks WHERE start % 15 != 0 OR "end" % 15 != 0;` (`UNKNOWN — needs human confirmation`). If non-zero, those blocks would fail their next edit; add a snap backfill migration (round `start` down, `end` up to the grid). Add `BLOCK_STEP` ↔ `STEP` to CLAUDE.md principle 6 and `contracts.md` § 11. api-test: `start: 7` → 400.

**BE-9 — WARNING — `users` rules and auth settings are not in migrations (feasibility for SEC-5)**
- **Where:** no migration sets `users` rules (`grep -n Rule pocketbase/pb_migrations/*.js`).
- **Failure scenario:** as SEC-5: a change in the admin UI widens `users` list/view and nothing catches it.
- **Feasibility:** yes, with one constraint: the current VM values are unknown, so `down()` cannot restore "whatever was there". Read them from the VM first (admin UI, read-only), record them in the migration comment, and make `down()` restore exactly those.
- **Fix design:** new migration:
  ```js
  migrate((app) => {
    const users = app.findCollectionByNameOrId("users");
    users.listRule = "id = @request.auth.id";
    users.viewRule = "id = @request.auth.id";
    users.updateRule = "id = @request.auth.id";
    users.deleteRule = "id = @request.auth.id";
    users.createRule = ""; // open sign-up — keep only if an ADR accepts it
    users.fields.getByName("password").min = 8; // matches Auth.jsx:58
    app.save(users);
    const s = app.settings();
    s.rateLimits.enabled = true; // add rules for "*:auth" and "*:create"
    app.save(s);
  }, (app) => { /* restore the recorded VM values */ });
  ```
  Property names (`rateLimits`, password field `min`) must be checked against the 0.41 JSVM types (`pb_data/types.d.ts`, which I did not read). If settings can't be set in a migration, record them in `deployment.md` instead. Tests: Architect T-1, T-3, T-8.

**BE-10 — WARNING — Sender loads every user's blocks and tasks every minute (backs SEC-6 / DATA-2)**
- **Where:** `push/sender.mjs:171–172` (no filter, no `fields`).
- **Failure scenario:** one account scripts 50,000 tasks; every tick pulls them all into memory on the e2-micro that also runs PocketBase. Users without push still cost a full read.
- **Fix:** after loading subscriptions, collect the distinct `sub.user` ids and filter `blocks`, `tasks`, `completions` with `user = {:u0} || user = {:u1} …` in chunks of 50 (built with `pb.filter`), and pass a `fields:` list (the fields in `contracts.md` § 1.2). Needs the DATA-1 `user` indexes to be cheap.

### Suggestions

**BE-11 — SUGGESTION — `exists()` fails open on any error.** `guards.js:129–136`. A database error inside the M-2 (`:237`) or m-1 (`:248`) checks is read as "no match", so the guard lets the write through. `ownedBy` fails closed (null → 400), which is right. Fix: only treat "no rows" as false; rethrow anything else.

**BE-12 — SUGGESTION — `categories` is outside `GUARDED` (concurs with SEC-9).** `main.pb.js:3–6`. No gap today; `color` (max 9, no pattern) is unvalidated. Add it to `GUARDED` with a `^#[0-9A-Fa-f]{6}$` check for `categories.color` and `blocks.color`, matching `isHex` in `src/lib/colors.js:11`.

**BE-13 — SUGGESTION — Real-date validation is missing on five date fields (concurs with DATA-9).** `blocks.date`, `blocks.recurUntil`, `tasks.date`, `tasks.remindDate`, `completions.date`. `isRealDate` exists (`guards.js:21–25`); apply it in `check()`.

**BE-14 — SUGGESTION — Second completion of a one-off task (concurs with DATA-13).** In the completions branch on create: if the task is neither `daily` nor on a `block` and `exists("completions", "task = {:id}", …)`, throw `BadRequestError("This to-do is already done.")`.

**BE-15 — SUGGESTION — Push-service response bodies are logged unbounded.** `sender.mjs:101` logs `err.body`. With BE-1 open, an attacker's server picks what goes into the VM journal. Log `String(err.body).slice(0, 200)`.

**BE-16 — SUGGESTION — Sender logs are unstructured and have no correlation id.** `sender.mjs` uses free-text `console.*`. Emit one JSON line per event with a per-tick id (`tick: Date.now().toString(36)`) and `sub.id`, so a failed delivery can be traced across lines. Keep the rule: never log endpoint, keys, email or message text.

**BE-17 — SUGGESTION — Docs drift: realtime is not used.** `docs/architecture.md` §§ 1–2 say "REST + realtime"; no code subscribes to realtime (`grep -rn "\.subscribe(" src push` finds only `pushManager.subscribe`, `src/lib/push.js:50`). Reword to "REST (realtime available, unused)" at the next docs edit.

**BE-18 — SUGGESTION — `rewards.claimedWeeks` is read-modify-write from the client.** `src/views/Progress.jsx:109–113`. Two devices claiming different weeks at once can drop one claim (last write wins). Low impact; fold into the DATA-11 validation work if `claimedWeeks` is ever moved server-side.

---

### Fix designs requested for Round 1 findings

| Finding | Design | Where |
|---|---|---|
| SEC-1 | Host allowlist regex in `guards.js` + same check in the sender before sending + 10 s timeout | BE-1, BE-2 |
| SEC-4 | In `public/sw.js` `notificationclick`: `const target = new URL(event.notification.data?.url || "/", self.location.origin); const url = target.origin === self.location.origin ? target.href : new URL("/", self.location.origin).href;` Same guard in the `push` handler is optional (the URL is only used on click). Frontend owns the file; `sw.js` is served `no-cache`, so it reaches installed phones on their next update check. | — |
| SEC-5 | Migration pinning `users` rules, password minimum and rate limits, after reading the VM's current values | BE-9 |
| DATA-4 | Refuse completion updates in `check()` now; `updateRule = null` in the next migration | BE-7 |
| DATA-5 | `BLOCK_STEP` modulo check in `check()`, VM data check first, optional snap backfill | BE-8 |

### Counts

- BLOCKER: 2 (BE-1, BE-2) — deploy scope; the docs on this branch are not blocked
- WARNING: 8 (BE-3 to BE-10)
- SUGGESTION: 8 (BE-11 to BE-18)

### Docs delivered

- `docs/contracts.md` (T-001.17) — exhaustive inventory: REST surface per collection with every call site, hooks and every `guards.js` name, every hook error message, sender queries / payload / options / message keys / `.sent.json` / env, service worker contract, hash routes, manifest, storage keys, env vars, sync constants, shared `src/lib` signatures with their non-app importers, compatibility shims, cross-cutting invariants, verification and footer.
- `docs/api.md` (T-001.5) — protocol, auth model, error conventions, idempotency decisions, how to change fields/rules/hooks/collections safely, deploy order, the sender's contract with the app.

### Sign-off

**Backend Engineer: BLOCK (deploy scope) / PASS WITH ITEMS (docs on this branch).** Deploying the app — including the pending phase 2 deploy — is blocked on BE-1 (push endpoint host allowlist, with T-5) and BE-2 (send timeout and per-host breaker, with T-9). Landing `contracts.md` and `api.md` on this branch is not blocked. BE-3 to BE-10 should become tasks in `/tasks/` before the next feature branch touches `pb_hooks` or `push/`.
