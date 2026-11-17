# ADR 0002 — CI runs on Azure DevOps; GitHub Actions parked

**Status:** superseded by [ADR 0005](./0005-ci-on-github-actions-and-azure-devops.md) (T-022)
**Date:** 2026-06-26
**Deciders:** repo owner + config/infra review (Architect + DevOps, task T-004)
**Supersedes / relates to:** the original GitHub-Actions-based CI mirror (now parked).

## Context

GitHub Actions is **not yet approved for general use** in the org (approval expected in the future). Code lives in GitHub, but teams currently run their CI pipelines in **Azure DevOps** via a GitHub service connection. The starter previously shipped its server-side procedure mirror as a GitHub Actions workflow (`.github/workflows/checks.yml`) — which would run on Actions infrastructure, against org policy.

## Decision

Make **Azure DevOps the active CI** for the starter and every fork, while GitHub Actions is unapproved:

- Procedure-gate logic is extracted into a single shared **`scripts/ci-checks.sh`** (placeholders, secrets, task-ID, `/docs/*` consensus), so the CI definition is thin and the two CI systems cannot drift.
- **`azure-pipelines.yml`** is the active pipeline; it runs `ci-checks.sh` + `shellcheck` + the fixture tests, and an opt-in PR-body-template check via the GitHub API.
- The **GitHub Actions workflow is parked** at `.github/workflows-disabled/checks.yml` (GitHub only runs workflows under `.github/workflows/`, so it is inert but preserved).
- The Actions-based **CodeQL default-setup is disabled** for the same policy reason.

## Consequences

**Good:**
- CI no longer runs on GitHub Actions infrastructure → compliant with the current org policy.
- Single source of truth (`ci-checks.sh`) shared by both CI systems; tested by `scripts/test/test-ci-checks.sh`.
- Re-enabling Actions later is a one-line `git mv` of the parked workflow + re-enabling CodeQL in settings. The exit trigger is explicit: **org approval of GitHub Actions**.

**Bad / accepted trade-offs:**
- **Default enforcement posture regresses to CI-OFF-until-wired.** Unlike an Actions workflow (auto-runs once committed), an ADO pipeline enforces nothing until it is created in the ADO project **and** PR validation is enabled. For GitHub-hosted repos ADO **ignores the YAML `pr:` trigger** — PR validation must be a Branch Policy → Build Validation. Until then `--no-verify` fully bypasses gates server-side. Documented prominently in `AGENTS.md` § 7 and `.starter/tasks/T-004.md`; local hooks still run regardless.
- **Per-repo setup**, like the hooks — every repo needs its own pipeline + branch policy.
- The PR-body-template check needs a GitHub token (PR metadata lives in GitHub, not ADO); it is opt-in via a `GITHUB_TOKEN` pipeline secret and skipped-with-notice otherwise (human review + the PR template still cover completeness).
- Security scanning (CodeQL) is dark until Actions is approved or an equivalent is added in ADO.

## Notes

Supersede — never edit — this record if the CI provider changes (e.g. when Actions is approved and the workflow is un-parked). The re-enable runbook is inlined in `.github/workflows-disabled/checks.yml` and `AGENTS.md` § 7.
