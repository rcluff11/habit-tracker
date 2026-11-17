# ADR 0001 — Multi-repo support via a shared-playbook workspace model

**Status:** accepted
**Date:** 2026-06-26
**Deciders:** repo owner + 9-agent review cycle (branch `feat/workspace-model`, task T-003)

## Context

The starter was originally modeled as "one fork = one repo = one project." Many real projects are **one product split across several repos** (e.g. `web` / `api` / `infra`) that cannot merge into a monorepo without cost the team can't absorb now. The goal: let AI agents work *across all repos of one project* and make changes trusted not to break a sibling repo — at the lowest adoption friction, with some manual per-repo steps acceptable.

Three topologies were evaluated:
- **A. True monorepo** — strongest cross-repo safety (atomic changes, one enforcement boundary) but requires merging repos: cost/complexity the team can't afford now, and loses independent deploy/access.
- **B. Umbrella + git submodules** — committed cross-repo visibility, but high daily friction (detached HEADs, two-step commits, pin drift) that erodes adoption — the opposite of the goal.
- **C. Per-repo adoption + shared playbook + local workspace** — each repo keeps its own `docs`/`tasks`/hooks/CI; a shared *playbook* fork holds project-wide docs + a central `integration-map.md`; repos are checked out side-by-side locally. Lowest friction; cleanest git; visibility is a local convention.

## Decision

Adopt **C**, the workspace model. The fork becomes a shared playbook governing N sibling repos. Cross-repo safety comes from two playbook-owned artifacts — `workspace.manifest.md` (repo roster) and `docs/integration-map.md` (the authoritative cross-repo seams) — plus a `scripts/setup-workspace.sh` that installs the procedure hooks into every repo. Session-start (`AGENTS.md` § 0 Step 0) detects the workspace and reads the integration map; the regression-safety check (§ 7) consults it to flag cross-repo blast radius. Single-repo projects ignore all of this and behave exactly as before.

## Consequences

**Good:**
- No monorepo migration, no submodules; teams adopt incrementally and keep independent deploy/access.
- An agent in any one repo gains cross-repo blast-radius awareness via the integration map — the core goal.
- The setup script's guards are tested (`scripts/test/test-setup-workspace.sh`) and `shellcheck`-clean in CI.

**Bad / accepted trade-offs:**
- **Enforcement is per-repo.** Hooks install per repo (scripted, re-runnable) and CI must mirror per repo. A repo that skips the CI mirror has no server-side backstop. Documented honestly in § 6.5 "Honest limits" and § 8 (mechanically- vs review-enforced gates).
- **Cross-repo changes are two coordinated PRs**, not one atomic commit; producer-before-consumer sequencing is mandatory and review-enforced, not mechanical.
- **The integration map can go stale** and a missing edge is undetectable by tooling — mitigated only by the § 6.0 review discipline. Stated as a residual risk in the map header.
- **Upstream-sync conflicts** concentrate in enforcement/template files; the merge must go through the review cycle.

## Notes

This ADR lives in the starter itself. A fork's own project decisions live in its bootstrapped `/docs/decisions/` (see `AGENTS.md` § 6, T-001.11). Supersede — never edit — this record if the topology choice changes.
