# ADR 0005 — CI runs on GitHub Actions by default, or Azure DevOps

**Status:** accepted
**Date:** 2026-11-09
**Deciders:** repo owner + full review cycle (Analyst, Architect, DevOps, SDET, UX; task T-022)
**Supersedes:** [ADR 0002](./0002-ci-on-azure-devops.md) (CI runs on Azure DevOps; GitHub Actions parked)

## Context

ADR 0002 parked the GitHub Actions workflow because one organization using the starter hadn't approved Actions. That organization keeps its own separate copy of the starter, so the restriction doesn't belong in the public starter. Parked, the starter shipped with no server-side checks running until an adopter set up Azure DevOps. The owner asked that GitHub Actions not be disabled or discouraged for adopters.

ADR 0002 also said Azure DevOps ignores the YAML `pr:` trigger for GitHub repos and needs a Build Validation branch policy. T-021's live runs showed the opposite: the `pr:` trigger builds GitHub PRs on its own, and Build Validation is an Azure Repos feature.

## Decision

- **GitHub Actions is the default CI.** The workflow lives at `.github/workflows/checks.yml` and runs on every PR and push to `main` with nothing to set up.
- **Azure DevOps stays fully supported** for teams whose pipelines live there (`azure-pipelines.yml`, one pipeline per repo). A team that runs only Azure parks the Actions workflow at `.github/workflows-disabled/checks.yml`; the tests accept either path, never both.
- **Both run the same checks.** Both call `scripts/ci-checks.sh` through the target branch's `scripts/ci-pr-checks.sh`, pin the same Ubuntu image (`ubuntu-24.04`) and the same checksummed shellcheck, and `scripts/test/test-ci-wiring.sh` checks that they match.
- **Which checks to require:** the checks of every system a repo runs, each pinned to its source app in branch protection: the three Actions job checks with source GitHub Actions, and Azure's overall `<pipeline name>` check with source Azure Pipelines. A system a repo doesn't require is parked. Pinning the source stops a check of the same name from another app (for example a workflow a PR adds) from satisfying the requirement.

## Security model

- **`pull_request`, never `pull_request_target`.** A fork's PR runs with a read-only token and no secrets. `pull_request_target` would run fork code with the base repo's secrets and a write token.
- **Least privilege in the Actions workflow:** `permissions: {}` at the top, `contents: read` per job, `persist-credentials: false` on every checkout, actions pinned by commit SHA, and no `${{ }}` expressions inside `run:` scripts (values go through `env:`). Pins are bumped deliberately, like the shellcheck pin: the maintainers bump `actions/checkout` when a Dependabot alert or release note calls for it (ADOPTING § 4a asks adopters to turn alerts on). Dependabot version-update PRs aren't used, because their commits carry no Task ID and would fail the procedure gate.
- **Azure differs:** its procedure job checks out with `persistCredentials: true` (it fetches the target branch), so ADOPTING § 4b keeps fork-build secrets off and asks for a team member's comment before a fork build runs. Azure's predefined values reach the scripts as environment variables, not pasted macro text, and the steps fail closed when a PR build lacks its target, number or repo name.
- **CI is a procedural gate, not a security boundary.** A PR can edit either CI file. The gate logic and allowlist come from the target branch, so weakening them takes a visible edit, and `CODEOWNERS` with Code-Owner review is what catches that edit.

## Consequences

**Good:**
- Adopters get server-side checks from the first PR, with no CI setup when Actions is allowed.
- Teams on Azure DevOps lose nothing, and the setup docs now match how Azure actually behaves with GitHub.
- Both systems are pinned and checked for drift, so a PR gets the same result on either.

**Bad / accepted trade-offs:**
- **Running isn't enforcing.** Checks block nothing until branch protection requires them (ADOPTING § 5). An org that disables Actions gets no checks and no warning; ADOPTING § 4a says to use Azure then.
- **Existing forks** see Actions start running when they sync. ADOPTING § 1 tells Azure-only teams to keep it parked.
- **Cost:** free on public repos. On private repos each push to a PR uses about 3 billed Actions minutes (three jobs, each rounded up to a minute; measured in T-019), plus about 2 when the deck job builds. It builds only on PRs that touch the deck or its CI wiring (`scripts/ci-deck-needed.sh`, decided by the target branch's copy), and on every push to `main`. Running both systems pays twice.
- **Pinned images and actions need deliberate bumps.** That's the price of reproducible results.

## Notes

Supersede — never edit — this record if the CI providers change.
