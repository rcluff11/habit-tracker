# Analyst Review — chore/adopt-agentic-mastery (Round 1: Analysis)

**Date:** 2026-11-14 · **Reviewer:** analyst · **Task:** [T-003](../../../tasks/T-003.md), with [T-001](../../../tasks/T-001.md)
**Scope sources read:** `CLAUDE.md` (working copy), `AGENTS.md`, `plan.md`, `tasks/*`, `README.md`, `netlify.toml`, `package.json`, and the views, components and libs named below.
**Method:** for each FR in `plan.md` § 3 I located the implementing code with grep and read the relevant lines. I compared the status claims in `plan.md`, `CLAUDE.md` and `README.md` against `git log` for `main`, `origin/main` and `feature-4`. I ran `npm run test:stats` (211/211 passed) and `npm run test:reminders` (all passed) on 2026-11-14. I did **not** run `test:api` or the t4/t5 attack scripts, because they need PocketBase running; that belongs to the SDET in Round 3.

**Verdict:** BLOCK
**Scope drift detected:** no for this branch. Its diff touches only process files and docs, and no app code (`git status`). There is drift between the phase 2 status records and the repo (SCOPE-1, SCOPE-2).
**Acceptance criteria coverage:** T-003 has 6 criteria, each with a named check (`tasks/T-003.md`). Phase 2 FR-1 to FR-22: 22/22 have an implementation located in code. 1 (FR-3) diverges from its wording. 0/22 are ticked in `plan.md`.

---

## Is phase 2 complete in the code?

**Functionally, yes, with one divergence.** Every FR has code behind it:

| FR | Located at |
|----|-----------|
| FR-1 Next 3 hours | `src/views/Now.jsx:24-44`, `src/lib/stats.js:126` (`upcomingBlocks`), `src/App.jsx:20` (`hidden: true`) |
| FR-2 App shortcut + iOS help | `public/manifest.webmanifest:17-25`; `src/views/Settings.jsx:467-476` |
| FR-3 Score card on Home | `src/views/Home.jsx:90,129-135`; `src/components/ScoreCard.jsx`; `src/lib/stats.js:387` (see SCOPE-6) |
| FR-4 Past-day score card | `src/views/Progress.jsx:223-225` |
| FR-5 Day ends at | `src/views/Settings.jsx` `DayEnd` (≈ line 236-305) |
| FR-6 Streaks + 🔥 chip | `src/lib/stats.js:337`; `src/components/TaskItem.jsx:17,74-75`; `ScoreCard.jsx:67-74` |
| FR-7 Energy check-in | `src/components/EnergyCheckin.jsx:15,35-44` (updates the existing record) |
| FR-8 Effort tag | `src/components/TaskEditor.jsx:111-119`; `TaskItem.jsx:71-72` |
| FR-9 Suggestions | `src/lib/stats.js:198`; `EnergyCheckin.jsx:18` |
| FR-10 Affirmation push | `src/lib/affirmations.js:300`; `src/lib/reminders.js:128`; `Home.jsx:116` |
| FR-11/12/13 Nudges, tone, day-end push | `src/lib/reminders.js:70-128`; `src/lib/messages.js:71-150`; `push/sender.mjs` |
| FR-14 Settings placement | `Settings.jsx:193-218` (Notifications), `Settings.jsx:281-305` (End of day, incl. `DayEndPush`) |
| FR-15 Week/Month switch | `src/views/Progress.jsx:126-149` |
| FR-16 Targets | `src/components/TargetEditor.jsx:6-8,36`; `src/lib/stats.js:517` |
| FR-17 Courses | `src/components/CourseEditor.jsx:218-231,287-288` |
| FR-18 Stepped habits | `src/lib/stats.js:72` (`activeWindow`); `TaskEditor.jsx:47,157` |
| FR-19 Course progress | `src/components/CourseList.jsx:27-78` |
| FR-20 Delete keeps items | `CourseEditor.jsx:82,161-171`; `pocketbase/pb_hooks/guards.js:108-117` |
| FR-21 Delete these habits | `CourseEditor.jsx:46,98-100,306-308` |
| FR-22 Stepped blocks | `src/components/BlockEditor.jsx:53-65,167`; schedule passed at every call site: `Calendar.jsx:79`, `Home.jsx:109`, `Now.jsx:24`, `push/sender.mjs:61` |

**As a deliverable, no.** `plan.md` § 10 (Definition of Done) is not met, and the status claims disagree with each other and with git (SCOPE-1, SCOPE-2).

---

## Findings

### SCOPE-1 — Phase 2 deploy state is contradicted by git and can't be confirmed · **BLOCKER**
**Evidence:**
- `CLAUDE.md:136` says phase 2 is "built, reviewed and tested; not yet deployed".
- `plan.md:4` says "Only Feature 1 is committed", and `plan.md:5-9` lists the commit, push and deploy as "Next".
- `git log origin/main` shows both phase 2 commits already on the remote `main`: `f7b0a31` (2026-11-11, feature 1) and `079f486` (2026-11-12, features 2-5). Local `main`, `feature-4` and `origin/main` all point at `079f486`.
- `CLAUDE.md` § Commands: "The Netlify deploy goes out from the push." `netlify.toml` defines the build. If Netlify auto-builds `main` (the setting isn't in the repo), the phase 2 frontend is live now.
- The deploy order in `CLAUDE.md` § Commands puts migrations and hooks on the VM first. Whether `1794200000`–`1794500000` and the new `pb_hooks` are on the VM is unknown.
- `src/lib/DataContext.jsx:8,34` treats a 404 on the five phase 2 collections as empty. That softens reads against an old backend. Writes (check-ins, plans, courses, the `dayEndAt`/`nudgeTimes`/`affirmationAt`/`dayEndPush` user fields) would still fail or be dropped, and the exact behaviour is `UNKNOWN — needs human confirmation`.

**Why it blocks:** Tier 1 docs (`deployment.md`, `architecture.md`, `contracts.md`) must state what is deployed. With three sources disagreeing, any statement would be an invented fact (`AGENTS.md` § 6.0(2)). It may also mean production is running a frontend ahead of its schema, which breaks the documented deploy order.
**Recommendation:** the DRI confirms three facts: (a) whether Netlify deployed `079f486`; (b) which migrations and hooks are on the VM; (c) whether the sender was restarted. Record the answers in T-003's activity log. Until then every doc says `UNKNOWN — needs human confirmation` for production state. If the frontend is live without the backend, open a `fix/` task to finish the backend deploy (`CLAUDE.md` deploy order). That needs a new task and is out of scope for this branch.

### SCOPE-2 — Phase 2 Definition of Done isn't met, and its record is stale · **WARNING**
**Evidence:**
- `plan.md:660-668` (§ 10) requires every FR to be checked off, but FR-1 to FR-22 and NFR-1 to NFR-8 are all `[ ]` (`plan.md:69-100`), while every F/B/T task is `[x]`.
- § 10 requires "Supervisors PASS" (`plan.md:663`) and "The REVIEW.md verdict is 🟢" (`plan.md:665`). No `REVIEW.md` is tracked (`git ls-files` finds none), and the supervisor pipeline is being replaced by this adoption.
- The T-4 test push is still open (`plan.md:9`).
- No user sign-off is recorded (`plan.md:668`).
- `CLAUDE.md:136` claims "reviewed and tested" with no surviving artifact to point to.

**Recommendation:** open a new task (next free ID, proposed) "Close out phase 2: deploy, test push, and DoD". Restate § 10 in `AGENTS.md` terms there: the review artifact under `docs/reviews/`, DRI approval and the test push. Then tick the FRs in `plan.md` against the table above. Don't tick them silently on this branch.

### SCOPE-3 — Phase 2 work has no task in the ledger · **WARNING**
**Evidence:** `tasks/` holds only T-001, T-001.1-17, T-002 and T-003. The phase 2 commits `f7b0a31` and `079f486` have no `T-NNN` (they predate the `.githooks/commit-msg` rule).
**Recommendation:** the close-out task from SCOPE-2 references `plan.md` as its scope and lists the two commits. Leave history alone; don't rewrite the commits.

### SCOPE-4 — Branch naming: `feature-4` doesn't follow `AGENTS.md` § 7 · **WARNING**
**Evidence:** the phase 2 work was done on `feature-4` (`git branch -a`). `AGENTS.md` § 7 requires `feat/<short-name>`, `fix/…`, `chore/…` or `refactor/…`. `feature-4` is fully merged: it points at the same commit as `main` and `origin/main` (`079f486`). Whether it reached `main` through a pull request is `UNKNOWN — needs human confirmation`. `AGENTS.md` § 7 forbids direct pushes to `main`, but phase 2 predates the adoption.
**Recommendation:** delete the local `feature-4` branch (nothing is lost; it's merged) or leave it, but don't reuse it. Future work uses `feat/<name>`. This branch, `chore/adopt-agentic-mastery`, is correctly named.

### SCOPE-5 — "History stays put" lists three exceptions, but task and block deletes also rewrite past weeks · **WARNING**
**Evidence:**
- `CLAUDE.md:83` (principle 3) says the only edits allowed to change past weeks' totals are "Delete these habits", removing the last week of a `stop` course, and switching a finished course to `stop`, "and the UI warns before each".
- Deleting a task cascades to its completions (`CLAUDE.md` § Data model). `TaskEditor.jsx:82-86` confirms with "Delete “…”?" and mentions targets, but not lost check-offs or changed past points.
- Deleting a block cascades to its tasks, then their completions, then `completions`-kind targets. `BlockEditor.jsx:103-106` deletes **with no confirmation at all**.
- `plan.md:648` asked only the *task* delete to mention targets; the block path isn't covered. That path existed in phase 1, and phase 2 made it wider by adding block-task targets.

**Recommendation:** this is a disagreement between a principle and the code, so the DRI decides. Either (a) amend principle 3 to list task and block deletion as accepted exceptions, or (b) open a `fix/` task giving both deletes a warning with counts, as `courseDeleteImpact` does. Not in this branch's scope.

### SCOPE-6 — FR-3 says "7-day average"; the code shows a calendar-week average · **WARNING**
**Evidence:** FR-3 (`plan.md:71`) and `plan.md:272` say "comparison with the 7-day average". `dayScore` computes `weekAvgPercent` as the mean of the Monday-start week's days up to `today` that had tasks (`src/lib/stats.js:384,407-408`), and the card labels it "Week average" (`ScoreCard.jsx:64`). For a past day opened from Progress, the average also includes days *after* that date in its week, because the filter is `d.date <= today`, not `<= date`. The § 7 contract (`plan.md:306`) names `weekAvgPercent`, so the plan disagrees with itself.
**Recommendation:** the DRI picks one. Either mark FR-3's "7-day average" superseded by "average of the calendar week so far" (code unchanged), or open a `fix/` task to compute a rolling 7 days ending on `date`. In both cases add a `test:stats` case for a past date.

### SCOPE-7 — CI doesn't run the app test suites · **WARNING**
**Evidence:** `.github/workflows/checks.yml` runs `scripts/ci-checks.sh` and the starter's `scripts/test/*.sh`. It doesn't run `npm run test:stats`, `test:reminders` or `build`. T-003 criterion 5 requires the suites to pass, so today that is only checked by hand.
**Recommendation:** DevOps and SDET decide in Round 3 whether to add the two server-free suites and `build` to CI. A new CI step changes the gate, so it gets its own task or an explicit T-003 update. I don't add it to scope here.

### SCOPE-8 — The T-001 review-artifact path differs from this cycle's path · **SUGGESTION**
**Evidence:** `tasks/T-001.md` (Global criteria) expects `/docs/reviews/T-001-tier-1/final.md` and `/docs/reviews/T-001-tier-2/final.md`. This cycle writes to `docs/reviews/chore-adopt-agentic-mastery/`, following the per-branch convention in `AGENTS.md` § 9.
**Recommendation:** the Review Coordinator records the supersession in T-001's Notes ("artifact at `docs/reviews/chore-adopt-agentic-mastery/`") rather than creating duplicate folders.

### SCOPE-9 — `glossary.md` has no seed subtask · **SUGGESTION**
**Evidence:** `AGENTS.md` § 6 Tier 2 item 14 (glossary) has no `T-001.n` file; the seeds stop at T-001.17. I've tracked it in T-003's Notes.
**Recommendation:** acceptable as is. A future upstream sync may add one.

### SCOPE-10 — Stale statements in `plan.md` and `README.md` · **SUGGESTION**
**Evidence:**
- `plan.md:638` says the `sent` map is in memory, which was superseded by T-4 m-5 (`push/.sent.json`; `CLAUDE.md` § Stack).
- `plan.md:449-454` (F-13) puts the day-end push checkbox in the Notifications card "next to" Day ends at, while FR-14 (`plan.md:82`) and the code (`Settings.jsx:305`, inside the End of day card) put it under End of day.
- `README.md` § Tests omits `test:stats`, and its Layout and Settings lists predate phase 2.

**Recommendation:** a docs-only task updates `plan.md` (marking superseded lines rather than deleting them) and `README.md`. That's a good safe first pull request for `onboarding.md` § 6.

### SCOPE-11 — The mobile viewport differs between sources · **SUGGESTION**
**Evidence:** NFR-5 and the T-tasks test at 360px (`plan.md:97`). The `notch-analyst` skill says 375px.
**Recommendation:** UX picks one width in `ux.md` (Round 2), and the other source is updated to match.

### SCOPE-12 — F-14 went beyond its planned scope · **SUGGESTION** (recorded, not drift)
**Evidence:** `plan.md:460` says "This goes further than planned: high was to keep the F-12 wording." That was honestly recorded and the Accepts line was updated (T-4 m-3), but FR-11 and D-13 still describe only the planned behaviour.
**Recommendation:** note the high-energy wording in FR-11 in the same docs-only task as SCOPE-10.

---

## Edge cases and assumptions I'm relying on (falsifiable)
- A-1: no app code changes on this branch. Falsified if `git diff main -- src public pocketbase push scripts/*.mjs` is non-empty at merge.
- A-2: Notch is a single repo. Falsified if a `workspace.manifest.md` or sibling repo appears.
- A-3: the only stakeholder is rcluff11 (`.github/CODEOWNERS`). Falsified if `ownership.md` names another person.
- A-4: no regulated domain is in scope for this branch, which only changes process and docs. Whether privacy law applies to the deployed app's personal data is for the Architect (`UNKNOWN — needs human confirmation`).

## Files I wrote or changed in Round 1
- `docs/README.md`: the Notch docs index (T-001.1).
- `docs/onboarding.md`: the first-day path (T-001.15).
- `docs/glossary.md`: Tier 2.
- `tasks/T-003.md`: new.
- `tasks/T-001.md` and `tasks/T-001.1.md` to `T-001.17.md`: `in-review` on this branch.
- `tasks/T-002.md`: `cancelled`, single repo.
- `tasks/INDEX.md`: regenerated.

## Re-check at later rounds
At Rounds 2 and 3 I re-check: (1) the branch diff still has no app code; (2) no doc states phase 2's production state as fact until SCOPE-1 is answered; (3) every follow-up in SCOPE-2, 5, 6 and 7 is a real task file or is explicitly accepted by the DRI.

## Sign-off
**BLOCK**, on SCOPE-1 only. It clears when the DRI answers the three deploy-state questions and the answers are recorded in `tasks/T-003.md`. After that, my verdict becomes **PASS WITH ITEMS**, provided the WARNINGs SCOPE-2 to SCOPE-7 are each either moved to a named follow-up task or explicitly accepted by the DRI.
