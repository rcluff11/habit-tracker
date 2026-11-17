# Review: chore/ci-azure-devops — final

**Task:** T-004 (CI provider → Azure DevOps; GitHub Actions parked)
**Status:** PASS WITH ITEMS (all items resolved)
**Date:** 2026-06-26
**Type:** Config/infra change — Architect + DevOps review per AGENTS.md § 5

## Summary

GitHub Actions is not yet approved for general org use. This change makes Azure DevOps the active CI: procedure-gate logic extracted to a shared `scripts/ci-checks.sh`, a new `azure-pipelines.yml`, the GH Actions workflow parked at `.github/workflows-disabled/checks.yml`, and CodeQL default-setup disabled. ADR 0002 records the decision.

## Blockers

None.

## Warnings raised → resolution

- [x] **(DevOps) `pr:` trigger ignored for GitHub-hosted repos in ADO.** Pipeline + AGENTS.md § 7 now state plainly that PR validation must be a Branch Policy → Build Validation; default posture is CI-off until wired. Inline comment added on the `pr:` block.
- [x] **(DevOps) PR-body check hit the Azure Repos API for a GitHub repo (would 404).** Rewritten to call the GitHub API with an opt-in `GITHUB_TOKEN`; skips-with-notice if unset (human review + PR template still cover completeness).
- [x] **(DevOps) Unpinned `apt-get install shellcheck` — network + version drift.** Replaced with a pinned shellcheck binary download (`SHELLCHECK_VERSION`), apt only as a loud fallback.
- [x] **(DevOps) `merge-base HEAD FETCH_HEAD` fragile if ADO checks out a PR merge ref.** Diff now computed against the fetched target-branch merge-base, robust to checkout shape; fails closed if base can't resolve.
- [x] **(DevOps) Per-repo enforcement gap under-stated.** Now a prominent ⚠️ callout in AGENTS.md § 7 + T-004 risks.
- [x] **(DevOps suggestion) `ci-checks.sh` had no failure-path test.** Added `scripts/test/test-ci-checks.sh` (7 assertions: clean pass, placeholder fail, allowlisted pass, secret fail, missing-task-ID fail, docs-without/with-consensus). Wired into both pipelines.
- [x] **(Architect) Task-ID + /docs gates now run on branch builds too (parity tightening).** Confirmed intentional — `main` pushes are also gated.
- [x] **(Architect) `System.AccessToken` prerequisite / topology.** Mooted by switching the PR-body check to the GitHub API; token usage documented as opt-in.
- [x] **(Architect) ADR for the decision.** ADR 0002 written.

## Verification

- `shellcheck` clean on all hooks + scripts + test files (CI command).
- `scripts/test/test-setup-workspace.sh` 14/14 pass; `scripts/test/test-ci-checks.sh` 7/7 pass.
- GH Actions confirmed parked: `.github/workflows/` empty (no tracked file); CodeQL default-setup `not-configured`.

## Agent sign-offs (config/infra scope per § 5)

- [x] Architect — PASS WITH ITEMS. Security same-to-stronger; faithful gate mirror; parking effective; items resolved.
- [x] DevOps — PASS WITH ITEMS. Reliability defects in the ADO pipeline fixed (pr-trigger doc, GitHub API, pinned shellcheck, merge-base, enforcement-gap callout); items resolved.
- [x] Review Coordinator — PASS. Config/infra scope correctly limited to Architect + Ops; artifact filed; ADR recorded.

## Regression-safety (§ 7)

Contracts touched: the CI enforcement mechanism itself. The shared `ci-checks.sh` is a faithful, tested extraction of the prior inline checks — no gate dropped (task-ID + /docs gates actually broadened to branch builds). New executable (`ci-checks.sh`) + its test covered in CI. Accepted, documented trade-off: default enforcement posture is CI-off until each repo wires the ADO pipeline + branch policy (AGENTS.md § 7, ADR 0002).
