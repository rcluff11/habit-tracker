# Review: chore/starter-ledger — final

**Status:** PASS WITH ITEMS

Starter T-015: move the starter's own task and decision history out of `tasks/` and `docs/` into `.starter/`. Full cycle (9 agents, 7 lenses). The round-by-round record is in `.starter/tasks/T-015.md`, under Notes.

## Blockers (must fix before merge)
None open. Three were raised at the build review; each was fixed and closed by the agent that raised it.
- [x] **`test-task-ledgers.sh` put a path or filename inside a `sed` script.** A `#` in either made `sed` error and the check pass. Fixed: paths never reach a `sed` or `grep` pattern, with fixtures for both cases. Backend re-verified on 2026-11-08: PASS WITH ITEMS. Round 3 had started before this re-verify; the fix and its red evidence existed, but the blocker wasn't yet closed.
- [x] **`ADOPTING.md` advice turned a synced fork's CI red.** Fixed: keep the file at its `.starter/` path even if it was deleted before, or remove `.starter/` entirely. DevOps re-verified both routes: PASS WITH ITEMS.
- [x] **Checks 3 and 4 had untested branches, and an allowlist glob could match `.starter/` without naming it.** Fixed: fixtures for every path form and gate-file type, and check 4 matches each glob against `.starter/` paths. Test Engineer re-verified: PASS WITH ITEMS.

## Warnings (fix before next review)
- [ ] **Ledger suite runtime:** 40–100 s on a Mac, mostly process forking (101 s when the Coordinator timed it). Record the first CI duration here; if it exceeds about 60 s on the agents, raise it as a DevOps item. Not yet measured, because no Azure DevOps run has happened.
- [ ] **Builder maintenance surface:** `test-ci-wiring.sh` is an eighth invariant, and the ledger suite is 387 lines with 54 cases. Further checks should be pushed back on.
- [ ] **Adopter wiring homework:** every suite an adopter adds must be a step in both CI files, written `sh scripts/test/<name>.sh`. Documented in `ADOPTING.md` § 1.

## Suggestions (consider for polish)
- After #5 merges, retarget this PR to `main` if GitHub hasn't, and rebase onto `origin/main` rather than the stale local `main`. (DevOps)
- `test-task-ledgers.sh` loops over unquoted file lists, so a task filename with a space or glob would split. This only affects matching, and a bad name should surface as a FAIL. (Backend)
- The fence toggles treat ``` and ~~~ as the same marker, so a ~~~ line inside a ``` block flips the state. (Backend)
- Non-ASCII heading slugs are dropped under `LC_ALL=C`, where GitHub keeps them; a documented known gap. (Data)
- The "nothing executed" assertion can only fire on GNU sed; on BSD sed the two failure fixtures do the catching. (Backend)

## Agent Sign-offs
- [x] Analyst — PASS WITH ITEMS, applied; amended criteria CONFIRMED in scope
- [x] Architect — PASS WITH ITEMS; no new bypass, trusted-gate blocks identical
- [x] Data Engineer — PASS WITH ITEMS; 13 renames at R100, INDEX reconciliation exact
- [x] Backend — BLOCK, then PASS WITH ITEMS on re-verify (2026-11-08)
- [x] Frontend — PASS
- [x] UX — PASS WITH ITEMS, applied
- [x] Test Engineer — BLOCK, then PASS WITH ITEMS on re-verify
- [x] DevOps — BLOCK, then PASS WITH ITEMS on re-verify
- [x] Review Coordinator — PASS WITH ITEMS; rounds in order, its conditions recorded in the task Notes

## Lens Sign-offs (major decisions only)
- [x] CEO  - [x] Purchasing  - [x] PM  - [x] Adopter  - [x] Builder  - [x] Investor  - [x] Marketing

Builder and Adopter sign off with the warnings above. Conflicts, all resolved:
- **Builder vs. Adopter/Marketing:** check 5 enforces the "starter T-0NN" convention mechanically, and each check has its own fixture.
- **Keep `.starter/` by default vs. ships clean:** the `AGENTS.md` rule and the banners make a kept `.starter/` inert to agents. Clean for agents is what the reported problem needed.
- **PM vs. Adopter on `/docs` scope:** resolved toward inclusion, since the ADR 0001 collision makes a tasks-only fix incomplete.

## Accepted trade-off
The starter's own ADRs and reviews leave the mechanical `/docs` consensus gate. They are protected by `CODEOWNERS` and by convention instead. The user accepted this on 2026-11-01; see `.starter/docs/decisions/0004-starter-ledger-separation.md`.

## Evidence
- Commit 1 (`2e5c254`, now `8ce1144` after the final rebase) is 13 renames, all R100; `git log --follow` reaches `4f56df1`.
- Red run on `git archive 2e5c254`: check 2 fails 9 times, check 3 11 times, check 5 41 times. Check 6 can't fail there, so its fixtures are its only proof.
- `test-ci-wiring.sh` failed before it was wired into CI.
- Mutants on the ledger suite: 53 run, 49 killed at re-verify; N03, N05 and N09 then killed by new fixtures; N11 is equivalent. All 7 wiring mutants killed.
- All 10 suites pass under `sh` and dash (ledger 54, wiring 8); shellcheck is clean.
- The PR gate (the target's `ci-pr-checks.sh` from `fix/pr-gate-trust`) passes on the two-commit PR.
- Fork simulations pass: keeping the files at `.starter/`, `git rm -r .starter` mid-merge, and an adopter's own forward references.

**Not verified:** a real Azure DevOps run on Ubuntu (runtime and `mawk`; only BSD awk was run), and GitHub branch protection settings.

**Merged without CI:** no check has reported on this stack, so the "CI must pass" gate was not met. The user approved merging anyway on 2026-11-08. The tree that merged is identical to the reviewed one.
