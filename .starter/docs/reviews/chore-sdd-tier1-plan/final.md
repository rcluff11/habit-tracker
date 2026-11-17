# Review: chore/sdd-tier1-plan — final

**Task:** T-009 (executable specs and evidence-based gates — spec-driven development, Tier 1)
**Status:** PASS WITH ITEMS
**Date:** 2026-10-26
**Type:** Major decision, plan only (no code). Full 9-agent cycle, 7 strategic lenses, and unanimous `/docs/*` consensus (ADR 0003).
**Reviewed:** `.starter/docs/decisions/0003-executable-specs-and-evidence-gates.md`, `.starter/tasks/T-009.md`, `.starter/tasks/T-009.1.md` … `T-009.5.md`, `.starter/tasks/T-010.md`, `.starter/tasks/T-011.md`.
**Method:** each specialist ran as a separate read-only agent. Rounds ran in order, and no round started until the previous round's blockers had cleared. Every BLOCK was re-checked by the agent that raised it.

## Summary

The plan turns the starter's prose-and-attestation gates into gates a machine checks from evidence. It has five parts:

- **T-009.1:** one `verify.sh` entrypoint, with its gates loaded from the base branch.
- **T-009.2:** machine-readable contracts, with drift and breaking-change gates.
- **T-009.3:** acceptance-criterion IDs, each traced to a passing JUnit test.
- **T-009.4:** review evidence bound to the exact diff.
- **T-009.5:** an opt-in, isolated reviewer that runs in CI.

Three review rounds turned up 30 specialist blockers, plus 1 process blocker from the Review Coordinator. All were resolved by changing the plan; none required changing direction.

## Blockers (all resolved in the cycle)

**Round 1: Analysis**
- [x] **Architect.** The new trust boundaries had no threat model. Fixed: a STRIDE table in ADR 0003.
- [x] **Architect.** Gate logic, reviewer role briefs and helper scripts were read from the PR head. Fixed: everything gate-related now comes from a snapshot of the base branch (T-009.1 AC-07).
- [x] **Architect.** The model API key wasn't scoped, and the CLI loaded project settings from the PR. Fixed: an isolated job with an env allowlist, with settings, MCP and tools all disabled (T-009.5 AC-03).
- [x] **Architect.** The `persistCredentials` setting and `GITHUB_TOKEN` sat next to code from the PR head. Fixed: the `verify` job has no credentials, and the PR-body check runs as its own job (T-009.1 AC-09).
- [x] **Data Engineer.** The generated contracts inventory dropped flags and per-entry invariants. Fixed: `x-invariant` and `x-blast-radius` are now required on every entry (T-009.2 AC-04/08).
- [x] **Data Engineer.** The adapter interface couldn't describe migrations. Fixed: an interface that also handles directories (T-009.2 AC-07).
- [x] **Data Engineer.** Deleting a spec or removing it from the registry would bypass the breaking-change check. Fixed: the check runs on the union of the base and head registries (T-009.2 AC-06).
- [x] **Data Engineer.** The AC ID format contradicted itself. Fixed: one canonical ID and matching rule (T-009.3).
- [x] **Data Engineer.** The diff hash depended on each machine's git config. Fixed: it now hashes blob IDs from a pinned `--raw` diff (T-009.4).
- [x] **Analyst.** Some ACs had no test. Fixed: every AC now maps to a named suite or a doc-assertion case.
- [x] **Analyst.** The exit codes contradicted each other. Fixed: 0, 77 and 78 are the passing codes (T-009.1 AC-03).
- [x] **Analyst.** "Greenfield passes" contradicted "evidence is always required". Fixed: an empty diff counts as not applicable (T-009.4 AC-11).
- [x] **Analyst.** Some ACs couldn't be tested. Fixed: the deprecation cutoff is a date, with an injectable `VERIFY_TODAY`, and the default model is a single constant.

**Round 2: Implementation**
- [x] **Backend.** `verify.sh` itself was run from the PR head. Fixed: CI writes it from the target branch (T-009.1 AC-07).
- [x] **Backend.** Contract adapters were loaded from the PR head. Fixed: they come from the base snapshot, with both sides materialised by core, an empty cwd, `env -i` and a timeout (T-009.2 AC-07).
- [x] **Backend.** Cross-referenced IDs would fail the plan's own traceability rules. Fixed: a defined-vs-referenced rule (T-009.3).
- [x] **Backend.** CI evidence had no lens verdicts. Fixed: the author's lenses are carried over, labelled author-attested (T-009.5 AC-07).
- [x] **Backend.** The model API calls had no timeout, retry or circuit breaker. Fixed in T-009.5 AC-05/10.
- [x] **Frontend.** Devcontainer features conflicted with a single pinned image digest. Fixed: no features, one image digest used by both the devcontainer and CI (T-009.1 AC-11).
- [x] **UX.** FAIL messages didn't say what to do next. Fixed: every FAIL carries a reason code and a `Fix:` line, backed by a remedy table (T-009.1 AC-05).
- [x] **UX.** "Include administrators" branch protection left no way to merge during a reviewer outage. Fixed: a pipeline-level break-glass variable that only an admin can set (T-009.5 AC-12).

**Round 3: Verification**
- [x] **Test Engineer.** The starter's own test suites ran from the base snapshot, so a PR's changes were never tested. Fixed: the core manifest lists gate stages only, and the starter suites run from the working tree (T-009.1 AC-08).
- [x] **Test Engineer.** Report directories leaked between nested runs and fixtures. Fixed: `REPORT_DIR_NESTED` plus `mktemp` isolation (T-009.1 AC-12).
- [x] **Test Engineer.** The test for AC-T009-03 would fail at the point it was added. Fixed: it moves to the T-009.5 PR.
- [x] **Test Engineer.** Malformed JUnit could read as passing. Fixed: `JUNIT_MALFORMED`.
- [x] **Test Engineer.** `assert_suite` had no negative fixtures. Fixed: four added.
- [x] **DevOps.** A broken gate merged to main would judge its own fix. Fixed: the `VERIFY_GATE_REF` pin, a runbook, and a requirement that gate-class PRs also pass their own `HEAD` gate (T-009.1 AC-18).
- [x] **DevOps.** Renaming the required checks would leave branch protection waiting on checks that never report. Fixed: a single aggregate `gate` check plus a migration path (T-009.1 AC-09/19).
- [x] **DevOps.** Azure DevOps sets `TF_BUILD`, not `CI`, so the CI-only checks would never fire. Fixed: CI mode is now defined (T-009.1).
- [x] **DevOps.** Post-merge builds on main would go red with no PR evidence. Fixed: those stages report `N/A (post-merge)`.
- [x] **Review Coordinator (process).** Consensus was needed on the final text, the ledger had to be in sync, and the merge preconditions had to be recorded. Cleared before sign-off; see the "Process" section.

## Warnings (carry into the build reviews)
- [ ] **W1.** T-009.1 is size L (19 ACs). Build it as stacked PRs, with the gate-inventory fixture in the first one.
- [ ] **W2.** The T-009.1 and T-009.4 build artifacts report time-to-first-green on a fresh fork (the Adopter-lens watch item).
- [ ] **W3.** `tool-versions.lock` records licence and terms of use for `oasdiff` and the `claude` CLI (T-009.1 AC-10, T-009.5 AC-11).
- [ ] **W4.** When T-009.4 lands, open the removal task for the `unanimous-consensus:` commit string (cutoff 2027-01-31).

## Suggestions
- If the awk JUnit parser needs any variant-specific workaround, write the pinned-XML-tool ADR instead of growing the awk code (now in the T-009.3 Risks).
- Future review artifacts should map each late item to where it landed. This one does so in the "Late items" section.

## Late items applied after each reviewer's last full check
These are wording-level changes, each confirmed by its owner during the final consensus pass:
- **Architect:** the `HEAD` gate step runs in the credential-free job (T-009.1 AC-18).
- **UX:** pin and break-glass renewal and escalation, plus `ci-review.sh --range` (T-009.1 AC-18, T-009.5 AC-12, ADR row 2a). Diff-confirmed by DevOps as the area owner.
- **Backend:** the empty-tree base for parentless commits (AC-09), and ordering plus a separate report dir for the `HEAD` step (AC-18). Diff-confirmed by DevOps.
- **Test Engineer:** fixtures for `PINNED` and `GATE_REF_INVALID` (AC-18).
- **Analyst:** the T-009 Notes ledger wording.

## Agent sign-offs (unanimous; this PR touches `/docs/`)
- [x] **Analyst:** PASS WITH ITEMS. No scope drift. Every AC is testable, and the deferred items are tracked as T-010 and T-011.
- [x] **Architect:** PASS WITH ITEMS. The security posture is stronger: gates come from the base branch, credentials are scoped, checksums fail closed, and evidence is bound to the diff. Residual risks are documented (ADO reads YAML from the PR head; test code in the PR).
- [x] **Data Engineer:** PASS. Hashes and normalisation are deterministic, and the inventory meets T-001.17.
- [x] **Backend:** PASS WITH ITEMS. Buildable with the stated tooling floor. Sizes: T-009.1 L, T-009.2 L, T-009.3 M, T-009.4 M–L, T-009.5 M–L.
- [x] **Frontend:** PASS. The output, Markdown escaping and devcontainer are feasible.
- [x] **UX:** PASS WITH ITEMS. Every FAIL has a next step, there's an adoption ladder, and an approver summary.
- [x] **Test Engineer:** PASS WITH ITEMS. 68/68 ACs map to tests, and the fixtures are deterministic.
- [x] **DevOps:** PASS. There are paths for recovery, check migration and post-merge builds, and the observability is adequate.
- [x] **Review Coordinator:** PASS WITH ITEMS. The rounds ran in order, every blocker was cleared before the next round, all 7 lenses were run, consensus was obtained on the final text, and the ledger was synced.

## Lens sign-offs (major decision)
- [x] **CEO:** PASS. Follows directly from the owner's goal. The honest labels remove the risk of overclaiming.
- [x] **Purchasing:** PASS WITH ITEMS. The vendor is opt-in and swappable through `REVIEW_CMD`. Licences and terms must be recorded (W3).
- [x] **PM:** PASS WITH ITEMS. The order is clear. T-009.1 is large (W1).
- [x] **Adopter:** PASS WITH ITEMS. Needing evidence on every PR adds real friction. It is softened by the skeleton output, the adoption ladder and the N/A defaults (W2).
- [x] **Builder:** PASS WITH ITEMS. Determinism and gate integrity are things to be proud of. The awk parsing and the two-gate logic will be costly to support (see Suggestions).
- [x] **Investor:** PASS WITH ITEMS. Evidence bound to the diff is a real differentiator. Execution risk is high: about 70 ACs and a solo maintainer.
- [x] **Marketing:** PASS. The hook: "gates verified from evidence, not asserted by the agent that did the work".

**Conflicts between lenses, and how each was resolved:**
1. **Investor/CEO/Marketing vs Adopter**, over "no evidence-free path". Scope is unchanged (the Analyst wins on scope). Friction is measured in the build (W2), and the remedy is tooling, not exemptions.
2. **Builder vs PM/Investor**, over complexity. There is now a concrete trigger for replacing awk with a pinned XML tool.
3. **Marketing vs Purchasing**, over the word "independent". Public copy says "independently reviewed" only when `REVIEW_REQUIRED=true`, matching the § 8 labels.

## Regression-safety (§ 7)
Contracts touched: none. This PR changes the starter's process docs and task ledger only; it adds no routes, schema, events, env vars or code. Reflected in docs: n/a. Cross-repo consumers: none. Compatibility: n/a. The plan changes nothing until its subtasks are built.

## Process
- **Human approval:** solo-repo exception (`AGENTS.md` § 8, `ADOPTING.md` step 5). Every `.github/CODEOWNERS` entry is still a placeholder, so required approvals are 0. The repo owner reviews and merges.
- **CI:** Azure DevOps isn't wired to this repository (ADR 0002 default posture). Local `pre-commit` and `commit-msg` hooks were run against this commit.
- **Ledger:** ADR 0003 is `accepted`. T-009 moves to `in-progress`, effective at merge. Subtasks T-009.1 … T-009.5 stay `in-review` with a "plan approved" log line until each build branch is cut. T-010 and T-011 are `proposed`. `tasks/INDEX.md` is regenerated.
