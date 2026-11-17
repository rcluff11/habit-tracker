# ADR 0004 — The starter's own history lives in `.starter/`, not in adopters' `tasks/` and `docs/`

**Status:** accepted
**Date:** 2026-11-01
**Deciders:** repo owner (delegated the design, explicitly accepted the `/docs` gate trade-off) + full 9-agent cycle with 7 lenses (task T-015)
**Supersedes / relates to:** ADR 0001 (workspace model) and ADR 0002 (CI on Azure DevOps), both moved here by this decision. Numbered after PR #2's planned ADR 0003.

## Context

The starter shipped two kinds of record in one place:

- **Template content for adopters:** the docs-bootstrap seeds `T-001`, `T-001.1`–`T-001.17` and `T-002`, plus the task and doc templates.
- **The starter's own maintenance history:** tasks T-003 onward, ADRs 0001 and 0002, and review artifacts.

`AGENTS.md` makes every session read `tasks/INDEX.md` and all of `docs/`, so adopters' agents treated our completed work, follow-ups and IDs as their project's state. Adopters reported this as confusing.

The seeds also collide with our history. Seed T-001.11 writes the adopter's ADR 0001, and seed T-001.12 builds `docs/reviews/` from scratch.

## Decision

- **Two committed ledgers.** The starter's own history lives in `.starter/` (`tasks/`, `docs/decisions/`, `docs/reviews/`). `tasks/` and `docs/` ship only what an adopter starts from.
- **Not `.gitignore`.** The procedure needs task files committed:
  - Task IDs reference them, and PRs link them.
  - Review artifacts live in them, and completion happens in the work PR.
  - A `.gitignore` line would ship to adopters and stop *their* tasks committing.
- **Keep `T-NNN` IDs; no starter prefix.** A new prefix would mean widening the commit-msg and CI Task-ID gate that every adopter relies on. Instead:
  - Shipped code cites starter tasks as "starter T-0NN".
  - `scripts/test/test-task-ledgers.sh` enforces that qualifier.
  - The `git log --grep` overlap in synced forks is documented.
- **Template users delete `.starter/`; forks that sync upstream keep it.** Keep is the safe default: agents ignore it, and deleting it causes modify/delete conflicts on every sync.

## Consequences

- **Accepted trade-off: `.starter/docs/` is outside the mechanical `/docs` consensus gate.** The hooks and CI gate `docs/` only. The alternatives were worse:
  - hooks naming `.starter/`, which breaks the rule that no gate file references `.starter/`;
  - a broader `(^|/)docs/` pattern, which would gate nested `docs/` folders in adopters' repos.

  Starter records keep the consensus rule by convention, and `CODEOWNERS` routes `/.starter/` to the tech lead and architect. The repo owner accepted this explicitly.
- **New invariant test** (`test-task-ledgers.sh`), safe in adopter repos. A template repo without `.starter/` gets only the seed check. The other checks run when `.starter/` exists, and IDs that also exist in `tasks/` are skipped so synced forks don't fail.
- **Maintenance cost:** a "starter T-0NN" convention (mechanically enforced) and a seven-check test. Keep the test that small.
- **Reverting this change:** every revert (GitHub's Revert button, `git revert`, `git revert -m 1` on the merge commit) must add `unanimous-consensus: T-015` to its message. The revert touches `docs/`, and a "Revert" message only skips the Task-ID check, so without the line CI fails.
- **Whichever of PR #2 and T-015 lands second** moves PR #2's T-009–T-011, ADR 0003 and its review into `.starter/`, following the checklist in starter T-015.
