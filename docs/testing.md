# Testing — Notch

**Lead author:** Test Engineer (T-001.8). **Status:** descriptive for the suites that exist on branch `chore/adopt-agentic-mastery` (2026-11-14); the gates in § 5 are required, and the ones not yet wired are marked **not enforced yet**. Draft pending the 9-agent consensus (AGENTS.md § 0 Step 4).

Every number below comes from a real run on 2026-11-14 (Windows 11, Node 24.21.0, local PocketBase 0.41.0 on `127.0.0.1:8090`). The run log is in [`reviews/chore-adopt-agentic-mastery/round-3-sdet.md`](reviews/chore-adopt-agentic-mastery/round-3-sdet.md).

---

## 1. Strategy in one paragraph

Notch has no test framework. Every suite is a plain Node ES-module script in `scripts/` that prints `ok    <label>` or `FAIL  <label>` per check and exits `1` if any check failed. The bulk of the logic that matters (scheduling, stats, reminder timing, message wording) lives in Node-safe modules in `src/lib/`, so it is tested directly in Node with fixed dates. Server rules (collection rules and `pb_hooks`) are tested **only against a real, local PocketBase** — never mocked — because the rules live in PocketBase itself. There is no UI or browser test yet; the build is the only check on `src/components` and `src/views`.

## 2. Levels

| Level | What it means here | Suites | Tool |
|---|---|---|---|
| Unit | Pure functions in `src/lib/*.js` and the pure exports of `push/sender.mjs`, with fixed inputs and fixed dates | `scripts/stats-test.mjs`, `scripts/reminders-test.mjs`, the pure parts (§§ 1–8) of `scripts/t4-nudges-attack.mjs`, pure parts of `t3` | plain Node |
| Integration / contract | The real PocketBase REST API with the real migrations and `pb_hooks` loaded: collection rules, ownership, server-owned fields, validation messages, delete stamping | `scripts/api-test.mjs`, `scripts/t3-energy-attack.mjs`, `scripts/t5-courses-attack.mjs`, § 9 of `scripts/t4-nudges-attack.mjs` | plain Node + `pocketbase` SDK, local PocketBase |
| Attack (security negative cases) | Cross-user reads/writes/links, malformed values, boundary values. Lives inside the integration scripts above (`intruder …`, `… (rejected)`) | same as above | same |
| Build | The bundle compiles (catches import and syntax errors in every `.jsx`) | `npm run build` | Vite |
| Component / UI | — | **none** (gap SDET-4) | none chosen |
| End-to-end (browser) | — | **none** (gap SDET-4) | none chosen |
| Service worker / push delivery | — | **none** (gap SDET-5) | none chosen |
| Dependency scan | `npm audit --omit=dev` | run by hand only (Architect SEC-13) | npm |

"Contract test" in AGENTS.md terms = the integration level here: a PocketBase API call that asserts the documented behaviour of a collection, rule or hook in [`contracts.md`](contracts.md).

## 3. Suites and how to run them

All commands run from the repo root.

| Command | Needs | Checks (2026-11-14) | Covers |
|---|---|---|---|
| `npm run build` | nothing | build ok, 55 modules | every import in `src/` resolves and compiles |
| `npm run test:stats` | nothing | 211 | `stats.js` (`activeWindow`, `blockOccursOn`, `instancesForDate`, `weekStats`, `monthStats`, streaks, `dayScore`, `suggestForEnergy`, `openNow`, `courseStats`, `targetProgress`), `time.js` |
| `npm run test:reminders` | nothing | 179 | `reminders.js`, `messages.js`, `affirmations.js`, sender exports `localNow`, `buildMessagesForSub`, `completionsSince`, `COMPLETIONS_FILTER`, `parseSentLog` |
| `npm run test:api` | PocketBase | 162 | rules and hooks on every owned collection, users settings fields, push subscriptions, check-ins, plans, targets, courses, delete stamping, block cascade |
| `node scripts/t3-energy-attack.mjs` | PocketBase | 62 | energy check-ins and effort tags: bad values, impossible dates, cross-user, concurrent create |
| `node scripts/t4-nudges-attack.mjs` | PocketBase for § 9 only | 59 | nudge/affirmation/day-end timing, wording, `cleanNudgeTimes` app vs server, `COMPLETIONS_FILTER` against real data, 30 parallel writes |
| `node scripts/t5-courses-attack.mjs` | PocketBase | 74 | courses, steps, plans, targets: bounds, cross-user, delete stamping |

### Running the PocketBase suites locally

```bash
# 1. Start local PocketBase (applies pb_migrations and loads pb_hooks on start)
cd pocketbase && ./pocketbase.exe serve --http=127.0.0.1:8090 &      # Windows; `npm run pb` also works
# 2. Wait for it
until curl -sf http://127.0.0.1:8090/api/health; do sleep 1; done
# 3. Make sure nothing points the scripts elsewhere
unset VITE_PB_URL            # or: export VITE_PB_URL=http://127.0.0.1:8090
# 4. Run
npm run test:api && node scripts/t3-energy-attack.mjs && node scripts/t4-nudges-attack.mjs && node scripts/t5-courses-attack.mjs
# 5. Stop it
taskkill //IM pocketbase.exe //F    # Git Bash on Windows; `kill %1` elsewhere
```

**Never point a suite at production.** `api-test`, `t3` and `t5` read `process.env.VITE_PB_URL` and fall back to `http://127.0.0.1:8090`; Node does not load `.env` files, so they hit production only if `VITE_PB_URL` is exported in your shell. `t4` is hard-coded to `127.0.0.1:8090`. Gap SDET-7 makes this fail closed.

**When PocketBase is down:** `test:api` exits 1 with "Can't reach PocketBase"; `t3` and `t5` crash with exit 1; **`t4` prints `skip  PocketBase not running` and exits 0** — its § 9 silently does not run (gap SDET-3). Check the `skip` line.

## 4. Test data

- **Throwaway accounts only.** Each API suite signs up fresh users with a timestamped email (`<name><Date.now()>@test.invalid`, or `@example.com` in t4) and password `password123`, and deletes them in a `finally` block. Every owned collection's `user` relation has `cascadeDelete: true` (`1761100000_init_schema.js:23`, and the later migrations), so deleting the user removes all of its records.
- **No shared fixtures, no seed data, no production data.** Nothing is copied from the VM. If a production bug needs reproducing, rebuild the shape by hand with throwaway accounts; never export real users' titles, notes, emails or subscriptions (DATA-8 classifies them as personal data).
- **Fixed dates in unit suites.** `stats-test` and `reminders-test` use literal ISO dates (e.g. `2026-10-28`) and literal minutes. Keep it that way: no `new Date()` in a unit assertion.
- **Wall-clock in API suites.** `api-test`, `t3` and `t4` use `todayISO()` / `new Date()` for some records, and the stepped-task start depends on the server's UTC `created`. A run that straddles local or UTC midnight can disagree with itself (flake risk low; SDET-8). New API tests use fixed dates unless "today" is the thing under test.
- **Push endpoints in fixtures** are fake (`https://push.example.test/<stamp>` in `api-test`). Nothing in any suite sends a real push. When the endpoint allowlist (SEC-1/BE-1) lands, fixtures must switch to an allowlisted host with a fake path, e.g. `https://fcm.googleapis.com/fcm/send/test-<stamp>`.
- **Local `pb_data`** is the developer's own dev database. Suites leave it as they found it. Do not commit it.

## 5. Gates

| Gate | Where | Status |
|---|---|---|
| `npm run build` passes | CI (`.github/workflows/checks.yml`) on every PR | **not enforced yet** — CI runs only the starter's procedure checks (SDET-1, SCOPE-7) |
| `test:stats` and `test:reminders` pass | CI, every PR | **not enforced yet** (SDET-1) |
| `test:api`, `t3`, `t4`, `t5` pass against a PocketBase started in the CI job from the repo's `pb_migrations` + `pb_hooks` and the pinned PocketBase version | CI, every PR | **not enforced yet** (SDET-1). DevOps owns how the binary is fetched and pinned (sha256) |
| t4 fails, not skips, when PocketBase is required and down | CI env flag, e.g. `REQUIRE_PB=1` | **not enforced yet** (SDET-3) |
| Check-count ratchet: a suite's `ok` count may not drop without a stated reason in the PR | CI compares against the base branch; baseline in § 3 | **not enforced yet** (SDET-2). This is the interim coverage gate until line coverage exists |
| No `FAIL` line; exit code 0 | every suite | enforced by each script's `process.exit(failures ? 1 : 0)` |
| No `.only`, `skip(`, `todo` in committed test files (the `skip` print in t4 is a log line, not a skipped test) | review | review-enforced |
| Line coverage on `src/lib/*.js`, `pocketbase/pb_hooks/guards.js` and `push/sender.mjs` | CI | **no tool chosen** (SDET-2). Candidate: `c8` (dev dependency; owner approval needed per CLAUDE.md). Target once measured: no drop on these hot paths; 90 % lines on `stats.js`, `reminders.js`, `messages.js`, `guards.js` |
| `npm audit --omit=dev` has no high/critical | CI | **not enforced yet** (SEC-13) |

**Flake policy.** A test that fails intermittently is a bug. Fix it or delete it in the same PR that notices it. Never add retries.

**Every bug fix** adds a check that fails before the fix and passes after, in the suite that matches the layer (`stats-test` / `reminders-test` for `src/lib`, `api-test` or the matching attack script for rules and hooks). **Every ownership rule** has a cross-user case: user B cannot read, update, delete or link to user A's record, on create **and** update. **Every shared rule** (CLAUDE.md principle 6, `contracts.md` § 11) is tested on both sides: the app side in `stats-test`/`reminders-test`, the server side in `api-test`.

## 6. Regression-safety check (AGENTS.md § 7 step 8)

Before committing a change that touches anything in [`contracts.md`](contracts.md):

1. **Find the entries you touched.** Diff your change against `contracts.md` (search it for the collection, field, hook message, export, env var or key you changed).
2. **Run the suites that guard those sections** (table below). Unit suites alone never satisfy this step for a section whose guard is "API".
3. **If the guard is "none", add one first** at the level shown, or record in the review artifact why it can't be automated yet and what replaces it. A contract change with no guarding test is a Test Engineer BLOCK.
4. **Add a check for the new behaviour** in the same suite, and a negative case for any security-relevant change.
5. **Record it** in the review artifact: *"Regression-safety: contracts touched = […]; suites run = […] (all green, counts …); reflected in docs = yes/no; cross-repo consumers = none; compatibility = …"*.

### Which suite guards which contract

| `contracts.md` section | Guarded by | Level | Gaps |
|---|---|---|---|
| § 1.1 REST routes (record CRUD, `auth-with-password`) | `test:api`, t3, t5 (every call goes through the SDK) | API | `authRefresh` and `_superusers` auth not exercised |
| § 1.2 collection rules — owned collections | `test:api` cross-user cases (list/view/update/delete by an intruder for checkins, plans, plan_targets, courses, course_steps; blocks list, task edit, completion create, device list and claim), t3, t5 | API | anonymous access tested only for `courses` (t5); Round 3 probe confirmed all 11 return 0 rows — add as T-2 |
| § 1.2 `users` rules, password minimum, `verified` | Round 3 probe only | API | **no committed test** (T-1, T-3); rules are not in a migration (SEC-5) |
| § 1.2 relation ownership (I-2) on create and update | `test:api` (task→block, completion→task on create; step/plan/target/course links in t5) | API | update-path cases for task.block/category, block.category, completion.task, reward.category not committed (T-4; probe shows they pass today) |
| § 1.3 error shape, § 2.3 hook messages | partial: suites assert rejection, not the message text | API | message text is UI copy; assert it for any message you change |
| § 2.1–2.2 hook registration, `guards.js` exports | `test:api` (`completion points come from the task` fails with "hooks not loaded?") | API | — |
| § 2.4 server-owned fields | `test:api`: `completions.points` on create, `push_subscriptions.endpoint` | API | `completions.points` on **update** (DATA-4) — confirmed wrong today |
| § 3 custom routes / cron | N/A (none exist) | — | — |
| § 4.1–4.2 sender schedule and queries | t4 § 9 runs the real `COMPLETIONS_FILTER`; reminders-test imports sender helpers | unit + API | the tick loop, auth, `optionalList` 404 shim, send loop: **none** (SDET-5) |
| § 4.3 push payload `{title, body, url, tag}` + options | reminders-test checks message objects (`title`, `body`, `url`) | unit | payload assembly in `send()` and TTL/topic: none (SDET-5) |
| § 4.4 message keys | reminders-test, t4 (`whole-day keys`) | unit | — |
| § 4.5 `.sent.json` | reminders-test (`parseSentLog`) | unit | writing/pruning on save: none |
| § 4.6 time zones (I-8) | reminders-test, t4 (`localNow`) | unit | — |
| § 4.7 sender exports | reminders-test, t4 import them; a removed export fails at import | unit | — |
| § 5 service worker | **none** | — | SDET-5 (click URL origin, SEC-4) |
| § 6 hash routes, manifest, storage keys | build only | — | SDET-4 |
| § 7 third-party integrations (web-push, Netlify, Google Fonts) | none | — | web-push integration path untested (SDET-5) |
| § 8 env vars | build (only that it compiles) | — | `VITE_PB_URL` production check (SEC-8) has no test |
| § 9 shared `src/lib` modules | `test:stats`, `test:reminders`, t3/t4 pure parts | unit | `affirmations.js` only through reminders |
| § 10 compatibility shims | none | — | client and sender 404 → `[]` untested |
| § 11 shared constants | each side tested separately (reminders-test + api-test for `REMINDER_OPTIONS`, nudges, day end; stats-test + api-test/t5 for course windows and stamping; t3 for energy/effort selects) | unit + API | no single parity test that fails when the two copies drift (SDET-6); block 15-minute step not enforced (BE-8) |
| § 12 I-1 … I-14 | I-1, I-2, I-3, I-11, I-12 by `test:api`/t5; I-8, I-9 by reminders-test; I-10 partly (create only) | mixed | I-4, I-5, I-6, I-7, I-13 (beyond import), I-14 have no automated test |

## 7. Known gaps (tracked in the Round 3 review)

SDET-1 CI runs no app suite · SDET-2 no coverage measurement · SDET-3 t4 skips silently · SDET-4 no UI/e2e · SDET-5 sender send loop, service worker and web-push untested · SDET-6 no parity test for shared rules · SDET-7 suites can be pointed at a remote PocketBase · SDET-8 wall-clock in API suites · SDET-9 soft `note()` observations instead of assertions in t3/t4/t5. Details and fix owners: [`reviews/chore-adopt-agentic-mastery/round-3-sdet.md`](reviews/chore-adopt-agentic-mastery/round-3-sdet.md).

---

## Update this doc when

- a test script is added, renamed or removed in `scripts/`, or a `test:*` script changes in `package.json`;
- a suite's check count changes (update § 3 so the ratchet baseline stays true);
- CI starts (or stops) running a suite, or a gate in § 5 changes status;
- a test tool or framework is adopted (coverage, component, browser, service-worker);
- PocketBase is upgraded locally, in CI or on the VM;
- `contracts.md` gains, loses or renumbers a section (keep the § 6 map in step);
- the test-data approach changes (fixtures, seeds, endpoint hosts).
