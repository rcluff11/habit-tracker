## Test Engineer Review — chore/adopt-agentic-mastery (Round 3, Verification)

**Scope:** run every existing suite for real, probe the Round 1/2 findings against a live local PocketBase, write `docs/testing.md` (Tier 1, T-001.8), and set the test cases every upcoming fix must ship with. No app code or existing test script was changed. Nothing was committed, pushed or deployed. Every request went to `http://127.0.0.1:8090`.

**Verdict:** PASS WITH ITEMS for landing the docs on this branch. **BLOCK for the next deploy** until SDET-1 (CI runs the app suites) is in place and every fix in the plan ships with the tests in § "Tests each fix must ship with".
**acceptance criteria → test mapping:** T-001.8 criteria 1–7 covered by `docs/testing.md` (§§ 2, 3, 4, 5, 6); criterion 8 (sign-offs) pending. For the app, phase 2 features map to checks in `test:stats`, `test:reminders`, `test:api`, t3/t4/t5; no UI-level check exists (SDET-4).
**Coverage delta:** unchanged (no code or test changed; no coverage tool exists to measure it — SDET-2).
**Flake risk:** low — two sources: wall-clock "today" in API suites (SDET-8) and t4's silent skip (SDET-3, a false pass rather than a flake). All suites ran green on the first run.

### Method

Read `CLAUDE.md`, `AGENTS.md` (§§ 0, 7, 8), `docs/contracts.md`, all six Round 1/2 review files, `.github/workflows/checks.yml`, the setup/cleanup parts of `scripts/api-test.mjs` and the PocketBase sections of t3/t4/t5. Ran each suite from the repo root with Node 24.21.0 and PocketBase 0.41.0 (`pocketbase/pocketbase.exe serve --http=127.0.0.1:8090`, health polled until `{"message":"API is healthy.","code":200}`), with `VITE_PB_URL` unset. Then ran a throwaway probe script from the scratchpad (`probe.mjs`, not committed) against the same server, deleted its accounts, and stopped PocketBase with `taskkill //IM pocketbase.exe //F`. Finally re-ran the four PocketBase suites with PocketBase stopped to see how they fail.

### Suite results (2026-11-14, real runs)

| Suite | Exit | Checks | `FAIL` lines | Notes |
|---|---|---|---|---|
| `npm run build` | 0 | — | — | 55 modules; `index-IFR2lA7Y.js` 377.89 kB (113 kB gzip), css 20.33 kB |
| `npm run test:stats` | 0 | 211/211 | 0 | "211/211 passed" |
| `npm run test:reminders` | 0 | 179 | 0 | "All reminder checks passed" |
| `npm run test:api` | 0 | 162 | 0 | "All checks passed" |
| `node scripts/t3-energy-attack.mjs` | 0 | 62 | 0 | "All T-3 attack checks passed"; 20k instances in 198.6 ms |
| `node scripts/t4-nudges-attack.mjs` | 0 | 59 | 0 | "All T-4 probes passed"; § 9 ran (PocketBase up) |
| `node scripts/t5-courses-attack.mjs` | 0 | 74 | 0 | "All T-5 attack checks passed" (the 17 "Failed to create record" strings are expected 400s inside `ok … (rejected …)` lines) |

**With PocketBase stopped:** `test:api` exit 1 ("Can't reach PocketBase at http://127.0.0.1:8090"); `t3` exit 1 and `t5` exit 1 (uncaught fetch error, stack trace); **`t4` exit 0** after printing `skip  PocketBase not running` (SDET-3). No failure was caused by the code; the only environment dependency is PocketBase being up.

**Not run anywhere automatically:** CI (`checks.yml`) runs only the starter's shell/procedure checks; none of the seven commands above (SDET-1).

### Live probe results

Two throwaway users (A, B) plus sign-up attempts; all deleted at the end (the `user` relation cascades, `1761100000_init_schema.js:23`). Production was not touched. **Caveat:** `users` rules, password options, rate limits and batch settings live in `pb_data`, not migrations, so the `users`/T-7/T-8 results describe the **local** database only; production is still `UNKNOWN — needs human confirmation` (SEC-5, SEC-7).

| Finding | Result | Evidence |
|---|---|---|
| **SEC-1 / BE-1** push endpoint host | **CONFIRMED** | `push_subscriptions.create` accepted (200) every one of: `https://127.0.0.1/x`, `https://169.254.169.254/computeMetadata/v1/`, `https://localhost:8090/api/health`, `https://10.0.0.1/x`, `https://user:pass@fcm.googleapis.com/x`, `https://fcm.googleapis.com.attacker.example/x`; the stored `endpoint` equals the attacker value. Updating an existing FCM row's `subscription.endpoint` to `https://127.0.0.1/upd…` also returned 200. |
| **DATA-4 / BE-7** completion update re-snapshots points | **CONFIRMED** | Habit created with 10 points; completion snapshot = 10 (client sent 999, ignored). Task points changed to 50. Owner `PATCH completions/{id} {points: 1}` → 200, `points` now **50**. `PATCH {date: "2026-01-06"}` → 200: an old check-off can be moved to any date. |
| **DATA-5 / BE-8** 15-minute steps | **CONFIRMED** | Blocks with `start=7,end=60`, `start=360,end=367` → 200 (stored as sent). `start=0,end=1440` → 200 (valid). Schema bounds work: `start=-15` → 400 `validation_min_number_constraint`; `end=1455` → 400 `validation_max_number_constraint`. |
| **SEC-5** users password minimum | **REFUTED locally** (8 chars enforced) | Sign-up with 7-, 5- and 1-char passwords → 400 `password: validation_min_text_constraint "Must be at least 8 character(s)."`. This is PocketBase's default, not pinned in a migration. |
| **SEC-5** users list/view rules | **REFUTED locally** (owner-only) | B `users.getList` → `totalItems=1`, contains B only; B `users.getOne(A)` → 404 (A had set `emailVisibility: true`); B `users.update(A)` → 404; anonymous `users.getList` → 0; anonymous `getOne(A)` → 404. Exact rule strings can't be read without superuser credentials; behaviour matches `id = @request.auth.id`. |
| **SEC-5** `verified` | **REFUTED locally** | Sign-up with `verified: true` → 400 `verified: validation_values_mismatch`; self-update `verified: true` → 400 same. |
| **SEC-5** auth methods (locally) | info | `listAuthMethods`: password (email) on; OAuth2, MFA, OTP **off**. |
| **T-8** auth rate limit | **CONFIRMED absent locally** | 12 wrong-password logins in a row → `400` × 12, no 429. |
| **T-2** anonymous access | **REFUTED (no leak)** | Anonymous `getList` on all 11 owned collections → `totalItems=0`. |
| **T-4** cross-user relation link on update | **REFUTED (guard works)** | B updating own records to A's ids → 400 every time: task.block "Invalid block.", task.category "Invalid category.", task.step "Invalid step.", block.category, block.step, completion.task "Invalid task.", reward.category, plan_target.task. Creates with A's category on block and reward → 400. B's task afterwards has `block=""`, `category=""`. **Not covered by any committed test** for most of these (SDET-10). |
| **T-6** B updates A's subscription | **REFUTED (no leak)** | 404. |
| **T-7** batch API | **REFUTED locally** | `createBatch().send()` → 403 "Batch requests are not allowed." (local setting; VM unknown). |

---

### Coverage findings

**SDET-1 — BLOCKER (deploy scope) — CI runs no app test.** `.github/workflows/checks.yml` jobs are shellcheck, fixture suites, the deck build and procedure checks; it never runs `npm run build`, `test:stats`, `test:reminders`, `test:api` or t3/t4/t5 (concurs with SCOPE-7). Hard gate AGENTS.md § 8 "No manual-only testing — every test runs in CI" is crossed for every suite. **Fix (DevOps decides where):** an `app-tests` job: `npm ci`, `npm run build`, `test:stats`, `test:reminders`; then download a pinned PocketBase (0.41.0, sha256-checked), `serve --http=127.0.0.1:8090 --dir $RUNNER_TEMP/pb_data --migrationsDir pocketbase/pb_migrations --hooksDir pocketbase/pb_hooks` in the background, wait on `/api/health`, run `test:api`, t3, t4 (with SDET-3's flag), t5. Make the job a required check on `main`.

**SDET-2 — WARNING — No coverage measurement, so "no coverage regression on hot paths" can't be checked.** Hot paths: `src/lib/stats.js`, `reminders.js`, `messages.js`, `pocketbase/pb_hooks/guards.js`, `push/sender.mjs`. **Replacement strategy until a tool is chosen:** a check-count ratchet per suite (baseline: 211 / 179 / 162 / 62 / 59 / 74) enforced in CI. **Then:** `c8` over the Node suites (new dev dependency — owner approval, CLAUDE.md) for `src/lib` and `sender.mjs`. `guards.js` runs inside PocketBase's JSVM and can't be instrumented by c8; for it, keep a per-branch checklist (every `throw` in `check()` has at least one `(rejected)` case) as a review-enforced gate.

**SDET-3 — WARNING — `t4` silently passes when PocketBase is down.** `scripts/t4-nudges-attack.mjs:294` prints `skip  PocketBase not running` and the script exits 0, so § 9 (the real `COMPLETIONS_FILTER`, 30 parallel writes, check-in wording) can be skipped in CI without anyone noticing. Redline: no test that fails silently. **Fix:** when `process.env.CI` or `REQUIRE_PB=1` is set, a failed health check is a `fail()`.

**SDET-4 — WARNING — No component, UI or end-to-end test.** `src/components` and `src/views` are checked only by the build. Frontend findings FE-4, FE-5, FE-9, FE-10, FE-14 and UX-1, UX-2, UX-8, UX-9, UX-11 are UI behaviour with no test level to catch a regression. **Fix:** adopt one browser tool (Playwright is the usual fit for a Vite PWA; owner approval needed) with a golden path: sign up → create block → check off its task → Progress shows the points → delete account. Add an axe accessibility smoke on each view (UX request). Until then, these fixes must move logic into `src/lib` where Node tests reach it (e.g. FE-18 `rewardProgress`, UX `textOn`).

**SDET-5 — WARNING — Sender send loop, service worker and web-push integration are untested.** `push/sender.mjs` tick, auth, `optionalList` 404 shim, `send()` payload/TTL/topic, expired-subscription delete, and `.sent.json` write have no test; `public/sw.js` has none (contracts § 4–5, § 7). The fixes for BE-1, BE-2, BE-3, BE-4, BE-5 and SEC-4 all land here. **Fix:** export the per-subscription send step and the endpoint check from `sender.mjs` with an injectable `sendNotification`, and test them in `reminders-test` (or a new `sender-test.mjs`) with a fake that hangs, throws 410, or throws; test `sw.js`'s URL resolution by extracting it into a tiny pure function or loading the file in Node with a stubbed `self`.

**SDET-6 — WARNING — No parity test for shared rules (CLAUDE.md principle 6).** Each side is tested on its own, so the two copies of `REMINDER_OPTIONS`, `NUDGE_STEP`, `MAX_NUDGES`, `EARLIEST_DAY_END`, the course-window maths and the select values can drift with both suites still green. `guards.js` is a CommonJS file (`module.exports`, line 355) that also references PocketBase globals, so it can't simply be imported. **Fix:** one `api-test` block that drives the server with the boundary values read from the app modules (e.g. every `REMINDER_OPTIONS` value accepted, the next integer rejected; `MAX_NUDGES` accepted, `+1` rejected; `ENERGY_LEVELS` each accepted) so a drift fails.

**SDET-7 — WARNING — API suites follow `VITE_PB_URL`.** `api-test.mjs:8`, `t3:8`, `t5:11` use `process.env.VITE_PB_URL || "http://127.0.0.1:8090"`. Exporting the production URL in a shell (e.g. to test a build) sends the suites — sign-ups, 30 parallel writes, deletes — to production. Redline: never point tests at production. **Fix:** read a dedicated `TEST_PB_URL`, and refuse any host other than `127.0.0.1`/`localhost` unless `ALLOW_REMOTE_PB=1`.

**SDET-8 — SUGGESTION — Wall-clock dates in API suites.** `api-test` uses `todayISO()` (`:6–10`) for blocks, completions and check-ins; stepped-task starts depend on the server's UTC `created`. A run across midnight could disagree with itself. Not seen; low risk. New API tests use fixed dates unless "today" is under test.

**SDET-9 — SUGGESTION — Soft observations instead of assertions.** t3 (`:59` "impossible date ACCEPTED" is a `note`, not a `fail`), t4 § 9 (`:331–337` server responses to bad nudge inputs are printed, not asserted), t5 (`:165`). They pass whatever happens. Convert each into a `check` with the expected value, or delete it; `test:api` already asserts the t4 ones, so deleting those is fine.

**SDET-10 — WARNING — Cross-user update-path cases and `users` rules are uncommitted.** The probe proved T-2, T-4 and T-6 hold today and that the local `users` rules are owner-only, but no committed test would catch a regression (e.g. someone dropping `tasks` from `GUARDED`, or widening `users.listRule` in the admin UI). **Fix:** add T-1, T-2, T-3, T-4, T-6 to `api-test.mjs` now; they pass today, so they are pure regression guards.

**SDET-11 — SUGGESTION — `api-test` fixture will break with the SEC-1 fix.** `scripts/api-test.mjs` uses `https://push.example.test/<stamp>` as a valid endpoint. Change it to `https://fcm.googleapis.com/fcm/send/test-<stamp>` in the same PR as the allowlist (no push is ever sent by the suite). No current fixture uses non-15-minute block times, so BE-8 breaks no existing check.

### Tests each fix must ship with

Each fix PR adds the listed checks to the named suite, shows them **failing before** the fix and passing after (paste both runs into the review artifact), and keeps every other suite green.

| Finding | Severity (owner) | Suite | Required checks |
|---|---|---|---|
| SEC-1 / BE-1 endpoint allowlist | BLOCKER | `api-test` | create **and** update reject `https://127.0.0.1/x`, `https://169.254.169.254/`, `https://localhost:8090/x`, `https://10.0.0.1/x`, `https://[::1]/x`, `https://user:pass@fcm.googleapis.com/x`, `https://fcm.googleapis.com.attacker.example/x`, `https://fcm.googleapis.com:8443/x`, an endpoint > 1000 chars; accept one each of FCM, Apple (`web.push.apple.com`), Mozilla, WNS hosts. Fixture change per SDET-11. |
| SEC-1 / BE-1 sender-side skip | BLOCKER | `reminders-test` / `sender-test` | a non-allowlisted subscription row is never passed to `sendNotification` (fake records calls) and is logged by id |
| BE-2 / T-9 send timeout | BLOCKER | `sender-test` | a fake endpoint that never resolves: the next subscription is sent within timeout + margin, using fake timers (no real waiting) |
| BE-3 one bad sub aborts the tick | WARNING | `sender-test` | sub 1 throws inside message building; sub 2 still gets its message |
| BE-4 expired delete swallowed | WARNING | `sender-test` | 410 + delete failure → logged as a failure, not "removed" |
| BE-5 re-auth | WARNING | `sender-test` | a 401 from PocketBase triggers one re-auth then retries |
| DATA-4 / BE-7 completion immutable | WARNING | `api-test` | owner PATCH `points` → 400 (hook) / 403 (after migration); owner PATCH `date` → rejected; the record's points and date unchanged; past week's `weekStats` total unchanged after a task points edit |
| DATA-5 / BE-8 15-minute steps | WARNING | `api-test` + `stats-test` | `start=7` → 400, `end=367` → 400, `start=0,end=1440` → 200, `start=1425,end=1440` → 200; update path too; app side asserts `STEP === 15` and the server constant agrees (SDET-6) |
| SEC-5 / BE-9 users rules in a migration | WARNING | `api-test` | T-1 (B lists only B; `getOne(A)` 404 with A's `emailVisibility` on; A's email never appears), T-3 (7-char password 400; `verified` cannot be set on create or update) |
| T-8 rate limit (after SEC-5) | WARNING | `api-test` | N failed logins → 429 (N from the configured limit; suite waits out the window or uses a fresh IP-independent label) |
| SEC-4 / FE-3 SW click URL | WARNING | `sw-test` (new, Node) | `https://evil.example/` → `/`; `//evil.example` → `/`; `/#tasks` → `/#tasks`; `javascript:` → `/` |
| SEC-6 / BE-10 / DATA-2 scoped sender queries | WARNING | t4 § 9 | a user with no subscription has no blocks/tasks fetched (spy on the query or count rows); messages for subscribed users unchanged |
| SEC-8 production `VITE_PB_URL` | WARNING | build check | production build with `VITE_PB_URL` unset or `http://` fails |
| DATA-7 category delete | WARNING | `api-test` | delete of a category used by a reward/target → refused (or the chosen behaviour), cross-user delete 404 |
| DATA-9 / BE-13 real dates | SUGGESTION | `api-test` | `2026-02-30` rejected on `blocks.date`, `blocks.recurUntil`, `tasks.date`, `tasks.remindDate`, `completions.date` |
| DATA-10 number bounds | SUGGESTION | `api-test` | percent reward 101 → 400; points targets above the chosen max → 400 |
| DATA-11 / SEC-10 JSON shape | SUGGESTION | `api-test` | `claimedWeeks: "x"`, `[1]`, `["2026-02-30"]` → 400; palette wrong shape → 400 |
| DATA-13 / BE-14 second one-off completion | SUGGESTION | `api-test` | second completion of a one-off on another date → 400; habit on another date → 200 |
| BE-11 `exists()` fails open | SUGGESTION | `api-test` | not reachable from the API without a DB fault; cover by code review + a unit test if `exists` is extracted |
| SEC-9 / BE-12 categories guarded, colour pattern | SUGGESTION | `api-test` | `color: "red"`, `"#12345"`, `"#1234567"` → 400 on categories and blocks |
| FE-9 completion for an unscheduled date | WARNING (Frontend) | `stats-test` (+ `api-test` if the server rejects it) | per the chosen rule |
| FE-18 `rewardProgress` | SUGGESTION | `stats-test` | string and number targets give the same result |
| UX `textOn` | BLOCKER (UX-4, UX-6) | `stats-test` | every palette colour × `textOn` ≥ 4.5:1 |
| SCOPE-6 7-day average | WARNING (Analyst) | `stats-test` | per the DRI's choice: rolling 7 days or week-so-far, at a week boundary |
| UX/FE UI-only fixes (UX-1, UX-2, FE-4, FE-5, FE-14) | BLOCKER/WARNING | browser e2e (SDET-4) | until a browser tool exists: the logic moves to `src/lib` with a Node test, and the PR states the manual check plus the e2e task that will replace it. Manual QA alone is a BLOCK. |

Every PR above also runs the regression-safety check in `docs/testing.md` § 6 and states it in its artifact.

### Counts

Blockers: 1 (SDET-1, deploy scope). Warnings: 7 (SDET-2, 3, 4, 5, 6, 7, 10). Suggestions: 3 (SDET-8, 9, 11). Probes: 3 findings confirmed (SEC-1/BE-1, DATA-4/BE-7, DATA-5/BE-8), 1 confirmed absent locally (T-8 rate limit), SEC-5 refuted locally on all three points but production unknown, T-2/T-4/T-6/T-7 refuted (guards hold).

### Docs delivered

- `docs/testing.md` (T-001.8, Tier 1): strategy, levels, run instructions, test data, gates with real status, flake policy, regression-safety check with the `contracts.md` section → suite map, known gaps, "Update this doc when".

### Sign-off

**Test Engineer: PASS WITH ITEMS** for landing the docs on `chore/adopt-agentic-mastery` (no code changed; all 7 suites green locally: 211 + 179 + 162 + 62 + 59 + 74 checks, build ok).

**Test Engineer: BLOCK** on the next deploy (including the pending phase 2 deploy) until: (1) SDET-1 — CI runs `build`, `test:stats`, `test:reminders` and the four PocketBase suites against a pinned PocketBase, as a required check; (2) the BLOCKER fixes (SEC-1/BE-1, BE-2) land with the checks in the table above, each shown failing before the fix; (3) SDET-10's committed regression guards for T-1 to T-4 and T-6 are in `api-test`. SDET-3 and SDET-7 should land with SDET-1, since a CI job is what makes them matter.
