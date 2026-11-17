# Architectural Decision Records

One file per significant decision: `NNNN-short-title.md`, numbered in order.

## Rules

- Never edit the substance of an accepted ADR. To change a decision, write a new ADR that supersedes it and set the old one's status to `superseded by NNNN`.
- Any change that weakens the security posture (authentication, authorization, encryption, isolation, audit logging) needs an ADR accepted by the security DRI and leadership before it lands (Architect redlines). For Notch both roles are the sole DRI, GitHub `rcluff11` (`docs/ownership.md`).
- Decisions recorded after the fact use status `accepted — recorded retroactively` and mark unknown reasons `UNKNOWN — needs human confirmation`.
- New ADRs follow the `/docs` unanimous-consensus rule (`AGENTS.md` § 0 Step 4).

## Template

```markdown
# NNNN — Title

**Status:** proposed | accepted | accepted — recorded retroactively | superseded by NNNN
**Date:** YYYY-MM-DD
**Deciders:** …

## Context
## Decision
## Consequences
## Alternatives considered
```

## Index

| # | Title | Status |
|---|---|---|
| [0001](0001-foundational-stack.md) | Foundational stack: React PWA on Netlify, PocketBase on a GCP VM, Node push sender | accepted — recorded retroactively |

## Update this doc when

an ADR is added or its status changes.
