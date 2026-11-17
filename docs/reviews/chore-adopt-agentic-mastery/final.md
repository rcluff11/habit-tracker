# Review: chore/adopt-agentic-mastery — final

**Date:** 2026-11-14 · **Coordinator:** review-coordinator · **Tasks:** [T-003](../../../tasks/T-003.md), [T-001](../../../tasks/T-001.md) and T-001.1 to T-001.17
**Round artifacts:** [round-1-analyst](round-1-analyst.md) · [round-1-architect](round-1-architect.md) · [round-1-data-engineer](round-1-data-engineer.md) · [round-2-backend](round-2-backend.md) · [round-2-frontend](round-2-frontend.md) · [round-2-ux](round-2-ux.md) · [round-3-sdet](round-3-sdet.md) · [round-3-devops](round-3-devops.md)

**Status:** BLOCK

This review has two scopes, and each has its own verdict:

| Scope | Verdict | What clears it |
|---|---|---|
| **(a) Landing this branch** (process files, `.claude/`, `tasks/`, Tier 1 and Tier 2 docs; no app code) | **BLOCK, owner items only.** No agent objects to the docs' content after the fixes below. Two items need the owner. | (1) The owner answers the three deploy-state questions (SCOPE-1) and they are recorded in T-003. That lifts the Analyst's BLOCK. (2) The owner approves the T-003 plan, including the two criterion amendments in § "T-003 acceptance status". |
| **(b) Deploying the app** (phase 2, or any deploy) | **BLOCK** (Architect, Backend, Frontend, Test Engineer, DevOps) | The deploy-scope blockers below are closed by T-004, T-005, T-006, T-008, T-009 and T-010, or accepted by ADR. T-011 then runs the single phase deploy. |

**Rounds:** 1 (Analysis), 2 (Implementation) and 3 (Verification) ran in order, with every required agent. No Round 1 blocker applied to code on this branch, so Round 2 could start. The Round 1 docs blocker (SCOPE-1) needs the owner and is still open.

**Regression-safety:** contracts touched = none (docs/process only; `git status` shows no change under `src/`, `public/`, `pocketbase/`, `push/`, `scripts/*.mjs` or `netlify.toml`); reflected in docs = n/a (this branch creates `contracts.md`, `api.md` and `data-model.md` and changes no contract); cross-repo consumers = none (single repo, T-002 cancelled); compatibility = backward-compatible.

**Test evidence (Round 3, SDET, real runs on 2026-11-14, Node 24.21.0, PocketBase 0.41.0):** `build` exit 0; `test:stats` 211/211; `test:reminders` 179 checks; `test:api` 162; t3 62; t4 59; t5 74. All green. Process scripts (Coordinator, this round): `test-ci-wiring.sh` 41/41; `test-commit-msg.sh` 13/14 (see W-P3); `test-task-ledgers.sh` not finished (see § "Coordinator checks").

---

## Blockers (must fix before merge)

### Landing this branch
- [ ] **SCOPE-1 (Analyst): production deploy state is unknown.** Both phase 2 commits are on `origin/main`; `CLAUDE.md` says phase 2 isn't deployed. The owner confirms (a) whether Netlify published `079f486`, (b) which migrations and hooks are on the VM, (c) whether the sender was restarted. The read-only checks are in `docs/deployment.md` § 7.1. The docs now say `UNKNOWN` everywhere for this (one `data-model.md` line that said "not yet deployed" as fact was fixed).
- [ ] **Owner plan approval (`AGENTS.md` § 7 step 4b)** for T-003 (with the amended criteria 3 and 4) and for the fix plan T-004 to T-012. Not yet asked; the ask is returned to the main session.

### Deploying the app (deduplicated)
Each line is one problem. "=" joins the IDs different agents gave it.

| # | Finding | Severity | Closed by |
|---|---|---|---|
| B-1 | **SEC-1 = BE-1 = SDET probe:** push endpoint host not validated; any account can make the VM POST to any HTTPS host, including loopback and internal addresses. Confirmed live (8 hostile endpoints accepted). | BLOCKER | T-004 |
| B-2 | **BE-2 (part of SEC-6, Architect T-9):** no timeout or breaker on sends; one hanging endpoint stops every user's reminders until a manual restart. | BLOCKER | T-004 |
| B-3 | **SDET-1 = SCOPE-7 = OPS-5:** CI runs none of the seven app suites (hard gate "no manual-only testing"). | BLOCKER | T-008 |
| B-4 | **SDET-10:** the cross-user guards that hold today (T-1 to T-4, T-6) have no committed test. | BLOCKER (SDET deploy condition) | T-005 |
| B-5 | **FE-1:** long-lived auth token in `localStorage` with no ADR (frontend redline). Needs an ADR, not code. | BLOCKER | T-009 (ADR 0002) |
| B-6 | **OPS-1 = SCOPE-1:** production may run the phase 2 frontend on a phase 1 backend. | BLOCKER | T-010 |
| B-7 | **OPS-2 (with DATA-15, DATA-8 backups):** no confirmed backup and no tested restore; the phase 2 `down()`s drop data. | BLOCKER | T-010 |
| B-8 | **OPS-3:** the written deploy order can't be followed while Netlify auto-publishes. | BLOCKER | T-010 |
| B-9 | **OPS-4:** nothing alerts on any critical path; a hung sender is invisible. | BLOCKER | T-010 (step 1), T-004 (sender heartbeat) |
| B-10 | **UX-1 = DATA-6 = SCOPE-5:** deleting a block has no confirmation and silently rewrites past weeks. UX asks for it before the phase 2 deploy. | BLOCKER (UX redline) | T-006 |
| B-11 | **UX-2 = DATA-7:** deleting a category takes one tap, no confirmation; rewards and targets silently widen. UX asks for it before the phase 2 deploy. | BLOCKER (UX redline) | T-006 |

UX-3 to UX-11 are also UX-redline BLOCKERs. Per the UX Designer they block the next PR that touches each flow, not the deploy: UX-3 = FE-15, UX-4, UX-5, UX-6, UX-7, UX-8, UX-9, UX-11 → T-007; UX-10 → T-006.

---

## Warnings (fix before next review)

### Process and docs (this branch)
- [ ] **W-P1 — T-003 criterion 3 can't be met before merge.** Branch protection can be required only after this branch's CI scripts are on `main` and a check has reported once (OPS-6 order). Proposed amendment: criterion 3's branch-protection step moves to T-008 criterion 9. Needs the owner's approval (material change to T-003).
- [ ] **W-P2 — T-003 criterion 4's literal check is wrong.** `grep -rn "\[insert " docs/` matches `docs/README.md:101`, which is the convention text (the "❌ Leaving unreplaced … placeholders" line), allowlisted in `.placeholder-allow`, and the review artifacts that discuss the rule. No real placeholder exists in `docs/`. Proposed amendment: the check is the gate's own regex `\[insert [^]]+ here\]` over `docs/`, excluding allowlisted files and `docs/reviews/`. Needs the owner's approval.
- [ ] **W-P3 — `scripts/test/test-commit-msg.sh` is 13/14 on Windows.** The failing case creates a `/docs` file with a tab in its name, which NTFS can't hold (`fatal: pathspec 'docs/a\tb.md' did not match`). It's a platform limit of the fixture, not a gate failure. It must pass on the Linux CI runner (T-008); if it doesn't, report it upstream.
- [ ] **W-P4 — committing the hooks.** The hooks and `scripts/*.sh` have CRLF endings in the working copy and would be committed as `100644` (OPS-13). When committing this branch: `git add --chmod=+x .githooks/pre-commit .githooks/commit-msg .githooks/pre-push scripts/*.sh`. `.gitattributes` follows in T-008.
- [ ] **W-P5 — `CLAUDE.md` contradicts the code (owner edits; not changed here):** "6:00 AM" format (code renders "6am" / "6:15pm", `src/lib/time.js:46-52`); principle 5 claims 15-minute block times are enforced server-side (they aren't, DATA-5); "the one deliberate exception" omits `push_subscriptions.endpoint` and step-delete stamping (DATA-14); § Status "not yet deployed" (SCOPE-1); deploy order lacks "lock Netlify publishing first" (OPS-3). Tracked in T-010 and T-011.
- [ ] **W-P6 — the Frontend review's `App.jsx` line numbers are wrong.** `src/App.jsx` has 104 lines; the review cites lines 200–238. The correct lines: error banner `:63` (FE-14, UX-10), `authStore.onChange` `:76`, `authRefresh` `:83–84` (FE-1, FE-11), `<Auth />` `:98`, `<DataProvider key>` `:100–102`. The findings themselves are correct. Round artifacts are a record and aren't rewritten; the fix tasks cite the correct lines.

### App (pre-existing; each in a named task)
| Finding(s) | Summary | Task |
|---|---|---|
| BE-3 | one subscription's bad data aborts the tick for everyone after it | T-004 |
| BE-4 | expired-subscription delete error swallowed, log claims success | T-004 |
| BE-5 | sender never re-authenticates after a 401 | T-004 |
| BE-6 | no watchdog on the tick; PocketBase calls have no timeout | T-004 |
| BE-10 = DATA-2 = SEC-6 (sender) | sender loads every user's blocks and tasks every minute; OR-join scan of completions | T-004 |
| SDET-5 | sender loop, service worker and web-push untested | T-004 (sender), T-009 (sw) |
| DATA-4 = BE-7 | owner can PATCH a completion: points re-snapshotted, date moved (confirmed live) | T-005 |
| DATA-5 = BE-8 | 15-minute block times not enforced server-side (confirmed live) | T-005 |
| SEC-5 = BE-9 | `users` rules and auth settings not in migrations; no auth rate limit (T-8 confirmed absent locally) | T-005 |
| DATA-1 | no relation column is indexed (redline; next migration must add them) | T-005 |
| SDET-6 | no parity test for shared rules | T-005 |
| UX-12 = FE-4 | saves that fail silently, unhandled rejections | T-006 |
| UX-13 | task delete doesn't say history goes with it | T-006 |
| UX-14 | edits that rewrite past weeks without a warning | T-006 |
| UX-15 | unsaved work lost on backdrop tap or Esc; palette replace | T-006 |
| FE-5 | double-submit creates duplicates | T-006 |
| FE-6 | `reload()` can overwrite newer local writes | T-006 |
| FE-11 | expired token mid-session shown as a network error | T-006 |
| FE-14 | failed first load renders empty views that look like data loss | T-006 |
| UX-16, UX-17 = FE-22, UX-18, UX-19, UX-20, UX-22 | toggle semantics, calendar block semantics, reduced motion, dark tokens, input borders, view-change announcements | T-007 |
| SDET-2, SDET-3, SDET-7 | no coverage measure; t4 skips silently; tests follow `VITE_PB_URL` to production | T-008 |
| OPS-6 | branch protection not confirmed | T-008 |
| OPS-9 | Node and PocketBase versions not pinned | T-008 |
| FE-2 = SEC-3 = OPS-8 | no security headers or CSP (policy checked against the build) | T-009 |
| SEC-4 = FE-3 | service worker opens any URL from the payload | T-009 |
| SEC-2 = OPS-7 | sender runs as a full superuser (ADR for the interim) | T-009, T-012 (option 1) |
| OPS-11 | VM is click-ops (IaC redline; ADR) | T-009 (ADR), T-010 (unit files) |
| FE-13 | Google Fonts render-blocking `@import`, third-party IP disclosure | T-009 |
| SEC-8 | production `VITE_PB_URL` falls back to plain HTTP | T-009 |
| SEC-7, DATA-8 | production controls and PII protections can't be confirmed from the repo | T-010 |
| OPS-10 | no staging; previews may write to production | T-010 |
| OPS-12 | production access isn't logged | T-010 |
| SCOPE-2, SCOPE-3, SCOPE-4 | phase 2 DoD unmet and stale; no task in the ledger; `feature-4` naming | T-011 |
| SCOPE-6 | FR-3 "7-day average" vs calendar-week code (owner decides) | T-011 |
| SCOPE-5 | principle 3 vs task/block delete (owner decides; default: add warnings) | T-006 |
| FE-7, FE-8, FE-9, FE-10, DATA-3 = FE-12, SDET-4, UX-21, UX-23, SEC-6 (hooks caps) = DATA-12 | see backlog | T-012 |

---

## Suggestions (consider for polish)
All are listed in T-004 to T-012 so none is lost:
- **T-004:** BE-15 (truncate push-service bodies in logs), BE-16 (structured logs with a tick id), SDET-11 (api-test fixture host), OPS-15 (`push:test --user`).
- **T-005:** SEC-9 = BE-12 (`categories` guarded, colour pattern), DATA-9 = BE-13 (real dates on five fields), BE-11 (`exists()` fails open), SDET-8 (fixed dates in new tests).
- **T-006:** SEC-12 (logout push failure warning).
- **T-008:** SDET-9 (soft observations), SEC-13 (supply chain), OPS-13 (`.gitattributes`, executable bits).
- **T-010:** DATA-15 (forward-fix, don't roll back migration 7 with data), DATA-16 (never edit user data in the admin UI), OPS-14, OPS-16, OPS-17.
- **T-011:** SCOPE-10, SCOPE-11, SCOPE-12, DATA-14.
- **T-012:** DATA-10, DATA-11 = SEC-10, DATA-13 = BE-14, BE-18, SEC-11, FE-16 to FE-21, UX-24 to UX-34.
- **Closed on this branch:** BE-17 (realtime wording fixed in `architecture.md`, `stack.md`, ADR 0001); SCOPE-8 (supersession recorded in T-001); SCOPE-9 (accepted; glossary tracked in T-003); SCOPE-11 (`docs/ux.md` settles 375 px; `plan.md` follows in T-011).

---

## Grounding & Completeness check (`AGENTS.md` § 6.0) — Coordinator, this round

**Method.** Re-checked the docs against the code, not the prose. Commands and reads:

1. **Every `collection(` call site in `src/` and `push/`** (`grep -rnoE 'collection\("[a-z_]+"\)' src push`, plus the non-literal `pb.collection(c)` / `(collection)` / `(COLLECTION)` / `(name)` sites in `DataContext.jsx`, `push.js` and `sender.mjs:150`) and **every `save(`/`remove(` call site in `src/components` and `src/views`** (31 sites) were matched to `contracts.md` § 1.1 / § 1.2. **One omission found and fixed:** the category delete `remove("categories", …)` at `Settings.jsx:331`. (`NudgeTimesPicker.jsx:97` `remove(m)` is a local function, not a collection write.) Everything else is listed.
2. **Every collection in `pb_migrations`** (`users` (fields added), `categories`, `blocks`, `tasks`, `completions`, `rewards`, `push_subscriptions`, `checkins`, `plans`, `courses`, `course_steps`, `plan_targets`) appears in `data-model.md` § 3.1–3.12. None missing.
3. **Contracts spot-check (14 entries, all against source lines):** `sender.mjs:82` superuser auth; `:98` delete on 404/410; `:165,170–173,175,177–178` the eight tick queries and their `fields`/filters; `:46–47` `COMPLETIONS_FILTER`, `completionsSince`; `:19–20` `TICK_MS`, `FALLBACK_TZ`; `:110` `SENT_LOG`; `:227` required env; `:234–236` VAPID, `PB_URL`, `autoCancellation`; `:253–255` loop; `push.js:59–64, 112–116, 126–130` subscribe/timezone/disable; `App.jsx:83–84` `authRefresh`, `:20,27,36` hash routes; `Home.jsx:49,53,61` storage key; `guards.js:4–11` `RELATIONS`, `:149, 170–173` shared constants, `:199` superuser bypass, `:253–255` `end > start` only, `:266–267` day-end, `:334–337` completion snapshot, `:339–352` push endpoint (scheme only), `:355` exports; `main.pb.js:3–6, 8–16, 22–46`; `reminders.js` message-key lines `139,167,183,196,244,272`; every `stats.js`, `time.js` and `reminders.js` export line in § 9. **One error found and fixed:** § 9.4 `formatTime` said `"6:00 AM"`; the code returns `"6am"` / `"6:15pm"`.
4. **Data-model spot-check (8 fields against the migrations):** `users.palette` (json, 20000, `1761100000:34`); `categories.name/color` (60 / 9); `blocks.start/end` (int 0–1440, not required); `tasks.points` (0–1000) and `tasks.block` (cascade); `completions.points` (min 0, no max) and the unique `(task, date)` index; `rewards.target` (required, min 1, not `onlyInt`); `push_subscriptions` (`subscription` 5000, `endpoint` 1000, `timezone` 64, unique endpoint); `plan_targets.kind/target` and `course_steps.week` (1–52). All match.
5. **Known errors fixed:** see § "Doc errors fixed".
6. **Deploy-state assertions** (SCOPE-1): grepped every doc for "deployed / not deployed / live / phase 2". `deployment.md`, `glossary.md` and the runbooks already say `UNKNOWN`; `data-model.md` § 1 stated "not yet deployed" as fact and now says `UNKNOWN` with the evidence.
7. **Placeholders:** `grep -rnE '\[insert [^]]+ here\]' docs` returns only `docs/README.md:101` (the rule text itself, allowlisted) outside `docs/reviews/`. No unreplaced placeholder.
8. **Verification and freshness (§ 6.0 (5), (6)):** checked by grep for each file. Every doc has an "update this doc when" footer, except ADR 0001 (ADRs are superseded, not edited, so N/A). `domain.md` and `ownership.md` had no verification record; one was added to each, stating how the drafter built it and what the Coordinator re-checked. The runbooks (`deploy-phase.md`, `runbooks/README.md`) are procedures, not descriptions of code; they say plainly that the rollback has never been tested (OPS-2) and that the VM facts are `UNKNOWN`.

**Result:** PASS for the docs after the fixes. Remaining `UNKNOWN`s are honest and each maps to an owner question (T-010) rather than a guess.

### Doc errors fixed in this round
1. `docs/domain.md` § task kinds: `blockOccursOn` cited at `stats.js:104–118` → `:93–107`.
2. `docs/data-model.md` § 3.3 `recurrence`: the same stale `stats.js:104–117` citation → `:93–107`.
3. `docs/data-model.md` § 3.3: "see review DATA-6" for the 15-minute step → DATA-5 / BE-8.
4. `docs/data-model.md` § 1: "Migrations 4–7 … are **not yet deployed**" (an unverified fact, SCOPE-1) → `UNKNOWN — needs human confirmation`, with the evidence and the check in `deployment.md` § 7.1.
5. `docs/architecture.md` diagram and § 2 table: "REST + realtime" → REST, realtime available but unused (BE-17).
6. `docs/stack.md` PocketBase row and `docs/decisions/0001-foundational-stack.md` § decision: realtime marked unused (BE-17).
7. `docs/contracts.md` § 9.4: `formatTime` output `"6:00 AM"` → `"6am"` / `"6:15pm"`, with the CLAUDE.md drift noted.
8. `docs/contracts.md` § 1.2 `categories`: added the missing delete call site `Settings.jsx:331`.
9. `docs/domain.md` and `docs/ownership.md`: added the missing "Verification" section (§ 6.0 (5)).

Every fix implements a reviewer's own finding (BE-17, UX notes, SCOPE-1) or a grounding omission; none changes a contract.

---

## T-003 acceptance status
| # | Criterion | Status |
|---|---|---|
| 1 | Old agent pipeline removed | **Met.** `.claude/agents/` holds exactly the 9; the `CLAUDE.md` grep returns nothing. |
| 2 | Notch skills added and loaded | **Met.** All 9 `notch-*` skills exist; each agent file names its skill. |
| 3 | Hooks and CI wired | **Met, except branch protection.** `core.hooksPath` = `.githooks` and the `commit-msg` smoke test (DevOps); `test-ci-wiring.sh` 41/41; `test-commit-msg.sh` 13/14 (W-P3, Windows-only fixture); `test-task-ledgers.sh` not finished (re-run before commit). Branch protection can't precede merge (W-P1): proposed to move to T-008. |
| 4 | Tier 1 docs, no placeholders, 9 sign-offs | **Docs exist and pass grounding. 8 of 9 PASS WITH ITEMS; Analyst BLOCK pending SCOPE-1.** Placeholder check: see W-P2. |
| 5 | All app suites passing | **Met** (SDET, Round 3; output above). |
| 6 | Security findings triaged | **Met.** SEC-1 → T-004; SEC-2 → T-009, T-012; SEC-3 → T-009; SEC-4 → T-009; SEC-5 → T-005; SEC-6 → T-004, T-012; SEC-7 → T-010; SEC-8 → T-009; SEC-9 → T-005; SEC-10 → T-012; SEC-11 → T-012 (proposed accept, owner confirms); SEC-12 → T-006; SEC-13 → T-008. |

### Coordinator checks
- `sh scripts/test/test-ci-wiring.sh`: 41 passed, 0 failed.
- `sh scripts/test/test-commit-msg.sh`: 13 passed, 1 failed (W-P3).
- `sh scripts/test/test-task-ledgers.sh`: **no result.** First run: no summary line; the end of its output shows `awk: fatal: cannot open file /tmp/…/AGENTS.md` and `echo: write error: Permission denied` (its temp tree vanished mid-run). Second run: killed with exit 137 before any output. Both were run on Windows, in a OneDrive folder. Re-run it before committing this branch, and record the result in T-003. A pending test is not a pass.

---

## Fix plan (priority order; all `proposed`)
| Priority | Task | Branch | Closes (main IDs) | Review scope |
|---|---|---|---|---|
| 1 | [T-010](../../../tasks/T-010.md) Deploy safety: confirm live state, backup + restore, lock publishing, alerting | `chore/deploy-safety` | OPS-1 = SCOPE-1, OPS-2, OPS-3, OPS-4, SEC-7, DATA-8 | all 9 |
| 2 | [T-004](../../../tasks/T-004.md) Push sender and subscription hardening | `fix/push-sender-hardening` | SEC-1 = BE-1, BE-2 to BE-6, BE-10 = DATA-2 | all 9 (contract change) |
| 3 | [T-005](../../../tasks/T-005.md) Server data integrity + committed cross-user tests | `fix/server-data-integrity` | DATA-4 = BE-7, DATA-5 = BE-8, SEC-5 = BE-9, DATA-1, SDET-10 | all 9 (schema) |
| 4 | [T-008](../../../tasks/T-008.md) App suites in CI, Node pin, branch protection | `chore/ci-app-tests` | SDET-1 = SCOPE-7 = OPS-5, OPS-6, SDET-3, SDET-7 | all 9 (docs edits) |
| 5 | [T-006](../../../tasks/T-006.md) Destructive-action safety and honest errors | `fix/destructive-action-safety` | UX-1 = DATA-6, UX-2 = DATA-7, UX-10, UX-12 = FE-4, FE-5, FE-6 | all 9 |
| 6 | [T-009](../../../tasks/T-009.md) Security headers, sw.js check, ADRs 0002–0004 | `chore/security-headers-and-adrs` | FE-2 = SEC-3 = OPS-8, SEC-4 = FE-3, FE-1, SEC-2 = OPS-7, OPS-11 | all 9 (ADRs) |
| 7 | [T-007](../../../tasks/T-007.md) Contrast, touch targets, screen-reader gaps | `fix/accessibility-contrast` | UX-3 = FE-15, UX-4 to UX-9, UX-11 | Frontend + UX + Test Engineer |
| 8 | [T-011](../../../tasks/T-011.md) Phase 2 close-out and the single deploy | `chore/phase2-closeout` | SCOPE-2, 3, 4, 6, 10, 11, 12, DATA-14 | all 9 |
| 9 | [T-012](../../../tasks/T-012.md) Backlog | per item | remaining warnings and suggestions | per item |

**Changes from the suggested grouping, and why:** SDET-3 and SDET-7 moved from T-005 to T-008, because the SDET says they "should land with SDET-1". UX-10 moved from T-007 to T-006, because its fix (`friendlyError` plus a retry) is the same work as FE-4, FE-14 and UX-12. T-011 (phase 2 close-out) was added for SCOPE-2/3/6/10/12, which the Analyst asked to be its own task. T-010 is first, because it is mostly read-only owner checks that decide how urgent everything else is.

---

## 7 strategic lenses — adopting the 9-agent framework (major process decision)

| Lens | Verdict | Reason |
|---|---|---|
| **CEO** | PASS | Fits a one-person product that wants to keep shipping with agents without breaking users' history. The first cycle found a live SSRF and an unknown production state, which is the story if it works. If it fails, the cost is process time on a hobby-scale app, not users. |
| **Purchasing** | PASS WITH ITEMS | $0 in tools: GitHub Actions, free uptime and heartbeat tiers, about $0.01–0.60/month for off-VM backups. No new runtime vendor. Two proposed dev dependencies (Playwright, c8) wait for the owner's approval. Google Fonts removal reduces third-party exposure. |
| **PM** | PASS WITH ITEMS | The fix plan is 8 tasks plus a backlog, ordered so cheap owner checks come first. Risk: the full cycle on every task (most touch `/docs`) is slow for one person; `AGENTS.md` § 12 Knob 2 (a wider lightweight path, recorded in an ADR) is the release valve if it bites. |
| **Adopter** (the owner as operator, and Notch's users) | PASS WITH ITEMS | For users: the fixes make deletes safe, errors honest and the app readable. For the owner: more ceremony per change, and several VM chores. It sticks only if the owner can run a cycle without dread; watch the time per task in the first two fixes. |
| **Builder** | PASS | The docs now let an agent see every route, field, hook message and shared constant before editing. CI and branch protection turn "please run the tests" into a gate. A maintainer would rather be on call for this than for the pre-review state (no alerting, no backup). |
| **Investor** | PASS WITH ITEMS | No revenue model, so the value is risk reduction: an exploitable SSRF, untested rollback, and silent history loss are each closed by a named task. Execution risk is the solo DRI's time. |
| **Marketing** | PASS | Before: "it works on my phone." After: "every change is reviewed by nine specialists, tested in CI, and can be rolled back." The predictable objection, "that's a lot of process for a habit app", is answered by the findings list. |

**Conflicts between lenses:** PM and Adopter (operator) both flag the same tension the Builder and CEO lenses accept: the process cost per change is high for one person. This is surfaced, not resolved, for the owner: keep the full cycle for now, and revisit with a lightweight-review ADR (`AGENTS.md` § 12 Knob 2) after T-004 and T-005 if the cost is too high. No lens objects to adopting the framework.

---

## Agent Sign-offs

Docs verdict = the agent's verdict on landing the docs and process files. Deploy verdict = on deploying the app.

- [ ] **Analyst** — docs: **BLOCK** on SCOPE-1 only (deploy state must come from the owner, not a guess). Becomes PASS WITH ITEMS when the owner's three answers are recorded in T-003; SCOPE-2 to SCOPE-7 are now each in a named task (T-006, T-008, T-011). No other objection to the docs.
- [x] **Architect** — docs: **PASS WITH ITEMS** (drafted `architecture.md`, `stack.md`, `ownership.md`, ADR 0001; SEC-7 answers to be recorded in `deployment.md` via T-010). Deploy: **BLOCK** on SEC-1 (T-004).
- [x] **Data Engineer** — docs: **PASS WITH ITEMS** (`data-model.md`, `domain.md`; DATA-14 is CLAUDE.md drift, T-011). Deploy: no blocker of its own; DATA-1 gates the next migration (T-005).
- [x] **Backend** — docs: **PASS WITH ITEMS** (`contracts.md`, `api.md`; BE-17 fixed this round). Deploy: **BLOCK** on BE-1, BE-2 (T-004).
- [x] **Frontend** — docs: **PASS WITH ITEMS** (no objection to any doc; review line numbers for `App.jsx` corrected in W-P6). Deploy: **BLOCK** on FE-1 until ADR 0002 (T-009).
- [x] **UX** — docs: **PASS WITH ITEMS** (`ux.md`; its two doc notes are fixed or tracked: `domain.md` citation fixed, CLAUDE.md time format in T-011). Deploy: asks for UX-1 and UX-2 first (T-006).
- [x] **Test Engineer** — docs: **PASS WITH ITEMS** (`testing.md`; all 7 suites green). Deploy: **BLOCK** until SDET-1 (T-008), the B-1/B-2 fixes with their tests (T-004), and SDET-10 (T-005).
- [x] **DevOps** — docs: **PASS WITH ITEMS** (`deployment.md`, `runbooks/`; incident severity and on-call folded into `runbooks/README.md`, recorded in T-001.10). Deploy: **BLOCK** on OPS-1 to OPS-4 (T-010).
- [ ] **Review Coordinator** — docs grounding: **PASS** after the 9 fixes above. Process: **BLOCK** on landing until SCOPE-1 is answered and the owner approves the plan (T-003 with the W-P1/W-P2 amendments, and T-004 to T-012). Deploy: **BLOCK** until B-1 to B-11 are closed. Rounds, artifacts, lenses and finding triage are complete.

**Count:** 7 of 9 checked (PASS WITH ITEMS on the docs); Analyst and Review Coordinator open on owner-only items. `/docs/*` needs unanimity, so the docs don't land until both clear.

## Lens Sign-offs (major decisions only)
- [x] CEO  - [x] Purchasing  - [x] PM  - [x] Adopter  - [x] Builder  - [x] Investor  - [x] Marketing

(PM and Adopter with items; conflict surfaced above for the owner.)

---

## Addendum — 2026-11-16 (owner items closed)

- **SCOPE-1 answered** by rcluff11 in session; verbatim in [T-003](../../../tasks/T-003.md) Notes. Production is fully on phase 2 (Netlify 079f486; VM migrations through 1794500000; sender restarted 2026-11-12 19:38 UTC). B-6 (OPS-1) is closed: production isn't half-deployed. Docs keep their `UNKNOWN`s on this branch; T-010 replaces them through the docs gate.
- **Plan approved** by rcluff11: "Plan: approved." (T-003 and T-004 to T-012). **Criterion amendments W-P1 and W-P2 approved:** "yes approve both".
- **Owner decisions:** SCOPE-5 → keep principle 3 and add warnings (T-006). SCOPE-6 → rolling 7 days before the shown date, excluding today, label "7-day average" (T-011). No frontend rollback.
- **test-task-ledgers.sh:** first clean run 98/101. Check 8 failed because the root README.md lacked the plan-approval anchors; README.md gained a "How changes are made" section. See T-003 for the re-run result.

**Sign-off changes:**
- [x] **Analyst** — docs: **PASS WITH ITEMS**. The SCOPE-1 answers are recorded in T-003.
- [x] **Review Coordinator** — process: **PASS WITH ITEMS** for landing. The owner approved the plan and the amendments, so this branch can land once the ledger re-run passes. Deploy-scope blockers B-1 to B-5 and B-7 to B-11 stay open in their tasks.

**Count:** 9 of 9 agents PASS WITH ITEMS on landing this branch.
