# Review: feat/workspace-model — final

**Task:** T-003 (workspace model + contracts/grounding upgrades)
**Status:** PASS WITH ITEMS
**Date:** 2026-06-26
**Type:** Major decision — full 9-agent cycle + 7 strategic lenses

## Summary

Two upgrades to the starter: (1) a Tier 1 `contracts.md` + Grounding & Completeness Protocol (§ 6.0) so docs are code-grounded, exhaustive, and verified — with a regression-safety commit gate; (2) a multi-repo **workspace model** (§ 6.5) letting the fork act as a shared playbook over several repos of one project, with a central `integration-map.md`, `workspace.manifest.md`, and `scripts/setup-workspace.sh`.

## Blockers (resolved during the cycle)

- [x] **(Architect) Path traversal + unquoted-glob in `setup-workspace.sh`.** A manifest row `../evil` or `*` reached the shell unfiltered. Fixed: `valid_dir_name` allowlist, `set -f`, newline-only IFS, `core.hooksPath` verification. Proven by fixture test.
- [x] **(Test Engineer) BLOCK: executable security code shipped with no automated test.** Added `scripts/test/test-setup-workspace.sh` (14 assertions) + a CI `scripts` job running `shellcheck` and the test. The test caught a real regression (commented-out template row parsed as a live repo) which was then fixed.

## Warnings (resolved)

- [x] (Data) Shared-store section split into shape-contract + invariant + write-exclusivity; expand/migrate/contract pattern documented; derived-data sub-table added.
- [x] (Backend) Integration-map § 1/§ 2 gained auth/credential, version + deprecation-window, idempotency, and old-schema-tolerance columns. Hard-stop on unreadable consumer + required linked consumer task added to § 7.
- [x] (Frontend) Literal `\n` in script output fixed; all-clear summary added; README workspace tree gained `tasks/`; integration-map relative-link caveat noted.
- [x] (UX) Quickstart block added to README with single-vs-multi-repo branches + skip link; single-repo session-start acknowledgement added; worked-example manifest row added.
- [x] (DevOps) `checks.yml` + PR template documented as required co-installed artifacts (§ 6.5); upstream-sync conflict guidance hardened for enforcement files (§ 7); `checks.yml` added to the synced policy surface.
- [x] (Architect/§ 8) Hard gates now distinguish mechanically-enforced vs review-enforced; integration-map header names its own staleness as an undetectable, review-only risk.

## Suggestions (tracked as follow-ups in T-003 / T-002)

- `setup-workspace.sh` also propagating `checks.yml` + PR template into each repo; `--strict` exit code (DevOps).
- End-to-end demo that an agent in repo A surfaces repo B as blast radius (Analyst).
- Validate the integration-map template against a real workspace; trim fields that don't earn their keep (Builder/Investor lens).
- Hook-version drift stamp after upstream-sync; broader secret-scan patterns (Architect).

## Agent Sign-offs

- [x] Analyst — PASS WITH ITEMS. Scope matches intent, no creep. Added T-003 (delivery task) + persona per its W1/W3.
- [x] Architect — PASS WITH ITEMS. Security flaw fixed + verified by test; no redline crossed; honest-limits framing sound.
- [x] Data Engineer — PASS WITH ITEMS. Shared-store modeling strengthened (shape/invariant/write-exclusivity/expand-migrate-contract).
- [x] Backend — PASS WITH ITEMS. Cross-repo contract workflow feasible; auth/version columns + hard-stop/linked-task added.
- [x] Frontend — PASS WITH ITEMS. Output bug fixed; docs/tables render; single-vs-multi clear.
- [x] UX — PASS WITH ITEMS. Quickstart + skip-link reduce adoption friction (the user's top priority).
- [x] Test Engineer — PASS (block cleared). Automated fixture test + shellcheck in CI; manual-only verification eliminated.
- [x] DevOps — PASS WITH ITEMS. CI mirror layout-agnostic; co-install + upstream-sync risks documented.
- [x] Review Coordinator — PASS. 3 rounds ran in order; blockers resolved before proceeding; artifact filed; ADR recorded.

## Lens Sign-offs (major decision)

- [x] CEO — proceed; align pitch to mechanism (done in README). - [x] Purchasing — strong, no lock-in. - [x] PM — buildable, shipped, scope contained. - [x] Adopter — proceed; map-freshness discipline is the watch item. - [x] Builder — proud-worthy; template heaviness to validate. - [x] Investor — defensible (cross-repo signal); PMF pending real adopter. - [x] Marketing — demos well; lead with "informed, not guaranteed."

**Cross-lens conflict resolved:** "trusted not to break" (pitch) vs "review-enforced, not mechanically guaranteed" (design) — README and § 6.5/§ 8 language aligned to "well-informed cross-repo changes," not a safety guarantee.

## Regression-safety (§ 7)

Contracts touched: this is the starter's own process/docs/tooling — no application routes/schema. New executable artifact (`setup-workspace.sh`) is covered by automated tests + shellcheck in CI. Cross-repo consumers: none (the starter has no siblings). Compatibility: backward-compatible for single-repo users (workspace features are opt-in via `workspace.manifest.md` detection; verified by fixture test).
