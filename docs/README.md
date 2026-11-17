# `/docs` — Notch Living Memory

This folder is the **living memory and source of truth** for **Notch** ("Notch every win"), a habit tracker and time-blocking calendar delivered as an installable PWA. Every AI agent (Claude Code, Codex, Cursor, etc.) is required by `AGENTS.md` to read every file here at the start of every session before doing any work.

**Notch at a glance** (each fact grounded in the file named):

| Area | What Notch uses | Source |
|------|-----------------|--------|
| Product | Notch: calendar blocks, to-dos, daily habits, points, rewards, monthly plans and week-by-week courses | `CLAUDE.md`, `index.html` (meta description) |
| Frontend | React 19 + Vite, plain JS/JSX (no TypeScript) | `package.json`, `CLAUDE.md` § Stack |
| Database | SQLite via PocketBase (schema in `pocketbase/pb_migrations/`, server rules in `pocketbase/pb_hooks/`) | `CLAUDE.md` § Stack, `README.md` § Local development |
| Cloud / hosting | Google Cloud (e2-micro VM, behind a DuckDNS subdomain) for PocketBase and the push sender; Netlify for the static frontend | `CLAUDE.md` § Stack, `netlify.toml`, `README.md` § Deployment |
| Push reminders | `push/sender.mjs` (Node, `web-push`) under systemd on the same VM | `CLAUDE.md` § Stack, `push/README.md` |
| Continuous Integration | GitHub Actions (`.github/workflows/checks.yml`, which runs `scripts/ci-checks.sh`) | `.github/workflows/checks.yml` |
| DRI | rcluff11, sole maintainer | `.github/CODEOWNERS` |
| Repo shape | Single repo (no workspace model; `T-002` cancelled) | `tasks/T-002.md` |

## The bar this folder must meet

The test for whether `/docs/` is good enough is a single sentence:

> **An agent who has read only `/docs/` should be able to make a commit with high confidence that it will not break an existing route, data contract, integration, or behavior.**

That is a much higher bar than "documentation that describes the project." It means the docs must be **complete enough** to enumerate everything an autonomous change could break, and **accurate enough** that nothing in them is a plausible-sounding guess. Both are enforced by the **Grounding & Completeness Protocol** in `AGENTS.md` § 6.0 — read it before drafting or reviewing any doc.

## Why this folder matters

Without it, every session starts cold. The agents re-derive architecture from grep, re-discover conventions by trial and error, re-invent the wheel each time, and — worst — invent **wrong** facts that look plausible. A confident agent acting on a wrong fact ships a confident, wrong commit. This folder prevents that — but only if it is grounded in real code and kept current with it.

## The Grounding & Completeness Protocol (summary)

Full version in `AGENTS.md` § 6.0. No agent may sign off on a doc unless it is:

- **Grounded, not guessed** — every claim traceable to a real file / route / schema / config / workflow; cite paths where practical.
- **Free of invented facts** — anything unconfirmed is written `UNKNOWN — needs human confirmation`, never as if settled.
- **Exhaustive where it's a contract** — routes, schemas, events, public signatures, env vars, flags, integrations are listed in full, not sampled. No "etc." in a contract inventory.
- **Explicit about invariants & blast radius** — each contract notes what must stay true and what depends on it.
- **Verified** — the drafting agent records how it checked the doc against the code; reviewers re-check against the source, not just the prose.
- **Self-dating** — each doc names the code paths that, when changed, require it to be updated.

Notch is not greenfield: phases 1 and 2 are built (`CLAUDE.md` § Status), so every doc here is **descriptive** (what exists) unless it says otherwise. Never blur the two.

## Hard rule — unanimous consensus

**No file in this folder may be added, edited, or removed without sign-off from all 9 agents** defined in `AGENTS.md`. The Review Coordinator (`.claude/agents/review-coordinator.md`) drives this process. One wrong fact here propagates into every future session, so the bar is deliberately high.

If a single agent BLOCKs a `/docs/*` change, the change does not land. Every commit touching `/docs/*` must carry `unanimous-consensus: T-NNN` (`AGENTS.md` § 7, Hooks).

## Index — what lives here

Status values: **in review** = drafted on branch `chore/adopt-agentic-mastery` and going through the 3-round review in `reviews/chore-adopt-agentic-mastery/`; nothing is **signed off** until all 9 agents pass it. Statuses below are as of 2026-11-14.

### Tier 1 — required before any feature work begins

Tier 1 includes the **contract-critical docs** (`contracts.md`, `api.md`, `data-model.md`) on purpose: the moment feature work begins, an agent must already have the full inventory of what it could break.

| File | Owner (lead author) | Task | Status | Purpose |
|------|---------------------|------|--------|---------|
| `README.md` (this file) | Analyst | [T-001.1](../tasks/T-001.1.md) | in review | Docs index, consensus rule, grounding rule. |
| `architecture.md` | Architect | [T-001.2](../tasks/T-001.2.md) | in review (Round 1) | System overview, data flow and trust boundaries: browser PWA ↔ PocketBase on the Google Cloud e2-micro VM ↔ push sender ↔ browser push services; static frontend on Netlify. |
| `contracts.md` ⭐ | Backend + Data Engineer + Architect | [T-001.17](../tasks/T-001.17.md) | in review (Round 2) | **The exhaustive, code-grounded inventory**: every PocketBase collection and rule, every hook in `pocketbase/pb_hooks/`, the shared rules repeated in `src/lib/*` and `guards.js`, the push message kinds, the env vars, the manifest shortcut and the `#now` route. Must be complete (§ 6.0(3)), not a sample. |
| `api.md` | Backend | [T-001.5](../tasks/T-001.5.md) | in review (Round 2) | The PocketBase API surface as Notch uses it: auth model, ownership rules, hook-enforced validation, and **how to add or change a collection rule or hook safely**. |
| `data-model.md` | Data Engineer | [T-001.4](../tasks/T-001.4.md) | in review (Round 1) | Every PocketBase collection and field, indexes, PII classification, the migration approach for SQLite via PocketBase (new timestamped file with up and down, never edit an old one), and **how to change the schema safely**. |
| `stack.md` | Architect | [T-001.6](../tasks/T-001.6.md) | in review (Round 1) | React 19 + Vite, PocketBase (SQLite), Node `web-push` sender, Netlify, Google Cloud VM, DuckDNS — and why each was chosen. |
| `testing.md` | Test Engineer (sdet) | [T-001.8](../tasks/T-001.8.md) | in review (Round 3) | `test:api`, `test:stats`, `test:reminders`, the t3/t4/t5 attack scripts, `build`, coverage gaps, and the **regression-safety check**. |
| `deployment.md` | DevOps | [T-001.9](../tasks/T-001.9.md) | in review (Round 3) | Environments, CI on GitHub Actions, the deploy order (migrations + hooks to the VM, restart PocketBase, restart `notch-push`, then the Netlify deploy), rollback. |
| `ownership.md` | Architect + Analyst | [T-001.14](../tasks/T-001.14.md) | in review (Round 1) | DRI map (rcluff11 for every path today). Mirrors `.github/CODEOWNERS`. |
| `onboarding.md` | Analyst | [T-001.15](../tasks/T-001.15.md) | in review | First-day path: prerequisites, local setup, tests, hooks, branch and commit rules, read order. |
| `decisions/` (skeleton + ADR 0001) | Architect | [T-001.11](../tasks/T-001.11.md) | in review (Round 1) | One Architectural Decision Record per significant decision; never edit a past ADR, supersede it. |
| `reviews/` (skeleton) | Review Coordinator | [T-001.12](../tasks/T-001.12.md) | in review | Review artifacts per branch, e.g. `reviews/chore-adopt-agentic-mastery/`. |

### Tier 2 — required by end of the first feature sprint

| File | Owner (lead author) | Task | Status | Purpose |
|------|---------------------|------|--------|---------|
| `domain.md` | Data Engineer + Analyst | [T-001.3](../tasks/T-001.3.md) | in review (Round 1) | The habit/calendar domain: the three kinds of task, completions and points, rewards, plans and targets, courses and steps, and their relationships. |
| `ux.md` | UX Designer | [T-001.7](../tasks/T-001.7.md) | in review (Round 2) | Personas, primary journeys, phone-first PWA layout, dark mode, accessibility baseline, design-system pointers (`src/styles.css`). |
| `glossary.md` | Analyst | [T-003](../tasks/T-003.md) (no seed subtask) | in review | Every Notch term, defined once, with where it lives in code. |
| `runbooks/` | DevOps | [T-001.10](../tasks/T-001.10.md) | in review (Round 3) | One file per on-call procedure for the VM, PocketBase, the sender and Netlify. |

> **Tier 1 vs. Tier 2 is a discipline tool, not a license to skip.** Both tiers carry the unanimous 9-agent consensus rule. Tier 2 missing past the first sprint is a process failure that should be retrospected.

Not used here: `integration-map.md` and `workspace.manifest.md` (workspace model only; Notch is a single repo, see `tasks/T-002.md`).

## How to use this folder during a session

**You are an agent.** At session start:

1. List every file under `/docs/`.
2. Read every file (or, for very large repos, at least the files relevant to the user's request — but ALWAYS read `architecture.md`, `contracts.md`, `data-model.md`, `domain.md`, `glossary.md`, and `stack.md`).
3. Acknowledge to the user what you loaded — one line: *"Loaded N docs: architecture.md, contracts.md, domain.md, …"*
4. **Before changing anything, check `contracts.md`.** If your change touches a documented collection, field, rule, hook, push message kind, public helper in `src/lib/`, env var, or the `#now` route, treat it as a contract change: run the regression-safety check (`AGENTS.md` § 7) and update `contracts.md` in the same pull request.
5. Proceed with the user's request, applying what you learned.

**You are a human reviewing a pull request.** Check that any `/docs/*` change has the review artifact attached and 9-of-9 sign-offs. If not, comment "blocked: needs unanimous consensus per AGENTS.md".

## Anti-patterns

- ❌ Editing a doc to match a code change without running the review cycle.
- ❌ Adding a "draft" doc that no one's signed off on — drafts live on a branch, not in `/docs/`.
- ❌ Leaving unreplaced `[insert … here]` placeholders. Either fill them in, remove the line, or open an Architectural Decision Record explaining why it's still undecided.
- ❌ Writing prescriptive style/lint rules here — those belong in tooling configs, not in living memory.
- ❌ **Inventing a fact because it sounds right.** If it isn't confirmed by the code or the human, it's `UNKNOWN`, not a sentence that reads as settled. A plausible guess in living memory is a landmine.
- ❌ **Sampling a contract inventory.** "The main routes are …" or "tables include …" is a BLOCK. Contracts are listed in full or the doc points to an exact, reproducible machine-readable source.
- ❌ **Letting `contracts.md` drift behind the code.** A change to a documented contract and its doc update are one atomic pull request, never "I'll update the docs later."

---
*Update this file when:* a doc is added, renamed, removed or signed off; a doc's owner changes; or the stack facts in "Notch at a glance" change (`package.json`, `netlify.toml`, `.github/workflows/`, `.github/CODEOWNERS`, the Stack section of `CLAUDE.md`).
