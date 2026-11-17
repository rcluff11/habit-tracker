# ADR 0003 — Executable specs and evidence-based gates (spec-driven development, Tier 1)

**Status:** accepted
**Date:** 2026-10-26
**Deciders:** repo owner + 9-agent review cycle + 7 lenses (branch `chore/sdd-tier1-plan`, task T-009)
**Relates to:** ADR 0002 (CI on Azure DevOps — every new gate here runs in that pipeline and in the parked Actions workflow).

## Context

The starter's goals are right — code-grounded docs, an exhaustive contract inventory, a test per acceptance criterion, a regression-safety check before every commit. But almost every one of those gates is **prose plus attestation**:

| Gate (`AGENTS.md`) | How it is enforced today |
|---|---|
| `contracts.md` exhaustive and current (§ 6.0(3), § 8) | Agent reads the code and says so. Nothing detects drift. |
| Contract change updates `contracts.md` in the same PR (§ 7 step 8, § 8) | Review only. |
| Every acceptance criterion has an automated test (SDET redline) | Review only. ACs are free prose with no link to tests. |
| Agent sign-off before commit (§ 8) | Checkboxes in a Markdown artifact written by the same session that wrote the code. |
| `/docs/*` unanimous consensus (§ 8) | CI checks that the string `unanimous-consensus: T-NNN` appears in the commit message. |
| Tests pass; no manual-only testing (§ 8) | Nothing in the starter runs a project's tests; each stack wires its own. |

The mechanically-enforced set is: Task-ID in commit messages, placeholder scan, a regex secret scan, the presence of the consensus string, and no direct/force push to protected branches.

The stated goal is now **robust, dependable, tested software that can be released with confidence with minimal human interaction.** That is only safe if the gates a human would otherwise apply are **verified by a machine from evidence**, not asserted by the agent that did the work.

### Options considered

- **A. Keep prose gates; tighten wording and checklists.** Cheapest; does not change the trust model. Rejected.
- **B. Adopt an external SDD framework wholesale** (e.g. GitHub Spec Kit, Kiro-style `requirements/design/tasks`). Good phase discipline, but primarily an *authoring* workflow — no CI-verified evidence — and it would replace the task ledger, review cycle and workspace model rather than strengthen them. Phase structure is reconsidered in Tier 2.
- **C. Keep the starter's process; make its existing gates executable**, then move the agent review itself into CI so it is independent of the authoring session. **Chosen.**

## Decision

Five subtasks under T-009, each a stage of one entrypoint, `scripts/verify.sh`, which agents run locally and CI runs identically.

1. **T-009.1 — `verify` entrypoint, pinned toolchain, shared helpers.** Stages in `scripts/verify.d/` run in one lexical order — `00–29` core checks, `30–69` adopter stages (lint, types, tests), `70–99` evidence stages — so evidence always follows the tests that produce it. Every FAIL prints a reason code and a `Fix:` line. Mechanics live in `scripts/verify.d/README.md`; `AGENTS.md` gains pointers only (net growth capped at 40 lines).
2. **T-009.2 — Machine-readable contracts.** Specs under `contracts/` (OpenAPI 3.1; a flat JSON Schema for env vars and feature flags; other kinds — AsyncAPI, protobuf, migrations — through a documented adapter interface). Drift gate (regenerate from code, compare) and breaking-change gate (diff against base; intentional breaks declared in an accepted ADR bound to the exact break report). The inventory section of `contracts.md` is generated; every generated entry must carry its invariant and blast radius.
3. **T-009.3 — Acceptance-criterion IDs traced to passing tests.** Canonical ID `AC-T042-03` for task `T-042`. `verify` reads JUnit XML and fails when an AC on a `completed` task has no passing test, or when a test cites an unknown or superseded AC.
4. **T-009.4 — Structured review evidence bound to the diff.** `evidence.json` per branch with per-role verdicts and two deterministic hashes (reviewed change, reviewed criteria). Required roles are computed from changed paths; a fixed, non-overridable *gate* class covers the enforcement files.
5. **T-009.5 — Independent review in CI.** An opt-in, isolated CI step runs each required role headlessly against only the spec, criteria and diff, and produces the evidence itself.

**Build order:** T-009.1 → T-009.2 → T-009.4 → T-009.5. T-009.3 may proceed any time after T-009.1. (T-009.2 precedes T-009.4 because T-009.4's `/docs` rule must preserve T-009.2's generated-block carve-out.)

### Design rules that apply to every subtask

- **Gate integrity — gates come from the base branch.** In CI, `verify.sh` itself is written from the target-branch tip and run from a temp dir; it then loads the core stage manifest, core stage scripts, `review-scope.conf`, the review scripts and the role briefs are read from `BASE` (the target branch), never from the PR head — as a BASE gate snapshot extracted to a temp dir, so every helper a gate invokes or sources also comes from `BASE`. A PR cannot weaken the gate that judges it. Steps that need a secret (PR-body check, T-009.5 reviewer) run outside the `verify.sh` job, BASE-loaded, with the secret mapped only into that step. A core stage missing from the run fails `verify`. Only the bootstrap PR that first introduces a file may load it from `HEAD`, and the summary says so (`BOOTSTRAP: <file> loaded from HEAD`). Contract adapters are gate code and also load from `BASE`. Changes to gate files are reviewed under the fixed *gate* class (Architect + DevOps). **Residual risk:** Azure DevOps reads the pipeline YAML from the PR head, so a PR could edit `azure-pipelines.yml` to bypass the BASE `verify.sh`; that file is gate-class (CODEOWNERS + Architect/DevOps approval), and adopters with ADO required-template checks should enable them.
- **Recoverable gates.** A broken gate merged to `main` would judge its own fix. Two defences: a PR touching gate-class paths must also pass its own `HEAD` `verify.sh` before merge; and an administrator can pin the gate snapshot to a known-good commit with the pipeline-level `VERIFY_GATE_REF` while a revert lands (runbook `docs/runbooks/ci-gate-recovery.md`). The pipeline exposes one aggregate required check, `gate`, so job renames never strand branch protection.
- **CI mode** is `CI=true`, `TF_BUILD=True` or `GITHUB_ACTIONS=true`; test-only injection variables (`VERIFY_PHASE`, `VERIFY_TODAY`, `VERIFY_ASSUME_TTY`, `REVIEW_SLEEP_CMD`, `REVIEW_JITTER_SEED`) are rejected in CI mode.
- **Credential scoping.** The job that runs PR-head code (`verify.sh`, adopter stages, contract generators, tests) holds no push-capable credential and no secrets. The model API key exists only in the isolated T-009.5 job. The starter's own test suites run from the working tree (they test the PR's code); only gate stages load from `BASE`.
- **Stack-neutral core, stack-specific adapters.** The starter ships the framework and fixture-tested reference adapters; it does not pick the adopter's language, database or test runner.
- **Tooling floor:** POSIX `sh`, `git`, `awk`, `jq`, `tar`, `xz`, `gzip`, `curl`, and `sha256sum` (or `shasum -a 256`); a preflight fails by tool name if any is missing. Timeouts use a shipped portable `scripts/lib/timeout.sh`. Any other tool (`oasdiff`, `shellcheck`, the `claude` CLI) is pinned by version and per-platform sha256 in `tool-versions.lock`, downloaded only over HTTPS from an allowlisted host, and fetched only when needed. No unpinned fallbacks.
- **No silent outcomes.** Every stage ends `PASS`, `FAIL`, `N/A (<reason>)` or `SKIPPED (<reason>)`. A missing prerequisite that the adopter has declared required (`REVIEW_REQUIRED=true`) is a `FAIL`, never a skip.
- **Every acceptance criterion has a test** — behavioural ACs in each subtask's fixture suite, documentation ACs in a shared `test-doc-assertions.sh` — so T-009's own subtasks pass T-009.3's gate (dogfooding).
- **Untrusted text is sanitised before it is logged.** Test names, tool reports and reviewer findings are attacker-influenceable; CI logging commands (`##vso[`, `##[`) are neutralised before echo.
- **Honest labels.** Until T-009.5 is enabled, sign-offs are **"mechanically checked, author-attested"** — never described as independently reviewed. Human approvers are told this in `AGENTS.md` § 8.

## Threat model (new trust boundaries)

| # | Boundary | Threat (STRIDE) | Mitigation |
|---|---|---|---|
| 1 | PR-head code (adopter stages, generators, tests) runs in CI | **Elevation / Info disclosure** — exfiltrate secrets or a push token; **Tampering** — edit the gate to pass itself | No secrets in that job; checkout without persisted credentials (`fetchDepth: 0`); `verify.sh` itself loaded from the target branch; generators run under `env -i`; gate files loaded from `BASE`. |
| 2 | CI sends repo content to a third-party model API (T-009.5) | **Info disclosure** — proprietary code or secrets leave the org; **Tampering** — prompt injection in the diff steers the reviewer | Secret-scan stage must pass before the reviewer step runs; data-classification note in `ADOPTING.md` (adopters decide whether their code may leave their systems); reviewer has no tools, no MCP, no project settings, runs in an empty temp dir; inputs delimited as untrusted data; malformed output fails closed; never runs on fork PRs. Residual risk — a reviewer can be argued into a wrong `PASS` — is why human approval stays required for high-risk changes until Tier 2 decides otherwise. |
| 2a | Model vendor availability / lock-in | **Denial of service** — API outage blocks merges; vendor exit | With `REVIEW_REQUIRED=true` an outage fails closed (per-call timeout, bounded retries, circuit breaker). Break-glass is a project administrator temporarily setting the **pipeline-level** `REVIEW_REQUIRED=false` (not settable at queue time; audited by ADO) and merging with human review, time-boxed to 24 h (renewable once, logged) with a CI re-review of every merge commit in the window — never a variable, trailer or file a PR can set. Reviewer is invoked through a pluggable `REVIEW_CMD` (default: `claude` wrapper), proven by a stub, so a different vendor or Codex can be substituted. |
| 3 | Third-party tool downloads | **Tampering** — compromised binary | HTTPS from allowlisted hosts, per-platform sha256, fail closed on mismatch or missing checksum, devcontainer image and features pinned by digest; `tool-versions.lock` records license + source per tool as the SBOM stand-in until Tier 3. |
| 4 | Evidence and declarations committed in the PR | **Repudiation / Spoofing** — evidence forged or reused for a different change | Evidence is bound to deterministic hashes of the change and criteria; breaking-change declarations are bound to the sha256 of the exact break report; author evidence is labelled author-attested until T-009.5. |
| 4a | Test code in the PR (starter suites and adopter tests run from `HEAD`) | **Spoofing** — a test rewritten to emit passing JUnit for an AC without exercising it | Not mechanically detectable in Tier 1 — the same residual every test suite carries. Review of test changes (SDET role required by path class) catches it; Tier 2 mutation testing and red-before-green narrow it. Also covers moving failing reports into `framework/`, which `trace.sh` skips, and the starter's own trace check, which runs from `HEAD`. |
| 4b | Record root (second-ledger directory; see T-009.4) | **Tampering** — a PR relocates its ledger to weaken the bindings | The root must already exist at `BASE`; a repo-root ledger entry wins over one under the root, and a new one can't displace it; required roles ignore the root. |
| 5 | CI log output | **Tampering** — injected `##vso[` commands set variables or fake results | All external text sanitised before echo; fixture cases prove it. |

## Consequences

**Good:**
- Gates currently review-enforced for single-repo changes become mechanically enforced: contract drift and breaking changes **for declared spec kinds**, contract doc kept current, AC → test coverage. Sign-offs become mechanically checked (author-attested), then independent with T-009.5.
- One command defines "done." Agents iterate on `verify.sh` until green.
- Evidence a human can check in seconds (traceability matrix, break report, evidence file) — the prerequisite for risk-tiered auto-merge in Tier 2.

**Bad / accepted trade-offs:**
- **What stays review-enforced:** data contracts without a declared spec (tables and their consumers, events, jobs), cross-repo seams in `integration-map.md`, and anything an adopter has not declared. `AGENTS.md` § 8 says so per gate.
- **New pinned dependencies** (`jq` in the floor; `oasdiff` when OpenAPI specs exist; `claude` CLI only for T-009.5).
- **CI time; API cost per PR with T-009.5.** T-009.5 is opt-in, has pre-call budget caps, and adopters are told to use a dedicated API workspace with a vendor-side spend limit.
- **The lightweight path narrows.** Path-based classification cannot tell a typo from a logic change in the same file, so only paths declared lightweight-only qualify; `AGENTS.md` § 5 and § 12 Knob 2 are updated to say so.
- **The `/docs` consensus rule gains one carve-out:** the generated inventory block in `contracts.md`, accepted only when regenerating it reproduces it byte-for-byte and nothing outside the block changed.
- **Adopter work:** a spec generator hook and the path → change-class map are per-project. Worked examples and fixtures are shipped; it is not zero-config.
- **AC IDs apply to new tasks.** Legacy tasks without IDs are reported, not gated.

## Follow-on (not decided here)

- **Tier 2** (separate ADR): `specs/<feature>/{spec,design,tasks}` phase structure with a clarify step; constitution split of `AGENTS.md`; test-quality gates (red-before-green, mutation testing, property-based tests, spec-driven fuzzing, flake quarantine); consumer-driven contract tests; cross-model adversarial review; risk-tiered auto-merge.
- **Tier 3** (separate ADR): release pipeline — automated versioning/changelog, SBOM + signed provenance (including signed review evidence), progressive delivery with automated rollback, feature-flag wrapper.

## Notes

Supersede — never edit — this record once accepted. If a subtask's design changes materially during build, record a new ADR that supersedes the affected section.
