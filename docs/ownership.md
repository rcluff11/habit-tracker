# Ownership — Notch

**Lead authors:** Architect + Analyst. **Status:** descriptive, 2026-11-14. Mirrors `.github/CODEOWNERS`; change both together.

Notch has one human Directly Responsible Individual (DRI): GitHub **`rcluff11`**. That person holds every role below, including security DRI, leadership sign-off for ADRs, tiebreaker, and on-call. The 9 agents in `AGENTS.md` act as reviewers; none of them is a DRI and no agent message counts as the DRI's approval.

## Area map

| Area | Paths | DRI | CODEOWNERS entry |
|---|---|---|---|
| Repo default | `*` | `rcluff11` | `*` |
| Project conventions and agent config | `/AGENTS.md`, `/CLAUDE.md`, `/.claude/`, `/.github/` | `rcluff11` | yes |
| CI and gate files | `/azure-pipelines.yml`, `/scripts/ci-*.sh`, `/scripts/requirements-deck.*`, `/.githooks/`, `/.placeholder-allow`, `/.gitattributes`, `/.github/CODEOWNERS` | `rcluff11` | yes |
| Upstream starter history | `/.starter/` | `rcluff11` | yes |
| Tasks ledger | `/tasks/` | `rcluff11` | yes |
| Living docs | `/docs/` and each file: `architecture.md`, `stack.md`, `data-model.md`, `api.md`, `ux.md`, `testing.md`, `deployment.md`, `runbooks/`, `decisions/`, `ownership.md`, `onboarding.md` | `rcluff11` | yes |
| Frontend | `src/`, `public/`, `index.html`, `vite.config.js`, `netlify.toml` | `rcluff11` | covered by `*` only |
| Backend (schema, rules, hooks) | `pocketbase/pb_migrations/`, `pocketbase/pb_hooks/` | `rcluff11` | covered by `*` only |
| Push sender | `push/` | `rcluff11` | covered by `*` only |
| Tests | `scripts/*.mjs`, `scripts/test/` | `rcluff11` | covered by `*` only |
| Production: Netlify project `notchedweb`, GCP VM, DuckDNS, PocketBase superusers, VAPID keys | outside the repo | `rcluff11` | n/a |

## Roles

| Role | Holder |
|---|---|
| Security DRI | `rcluff11` |
| Leadership sign-off (ADRs that weaken security) | `rcluff11` |
| Tiebreaker | `rcluff11` |
| On-call | `rcluff11`. Rotation tool: none. |
| Secret custodian (`push/.env` on the VM, Netlify env vars) | `rcluff11` |

## Note

The "Code areas" block at the bottom of `.github/CODEOWNERS` is still commented-out starter placeholders. The app paths are covered by the `*` default, so routing is correct today; add explicit lines if a second engineer joins.

## Verification

Drafted by the Architect and Analyst from `.github/CODEOWNERS`. Re-checked by the Review Coordinator on 2026-11-14: every non-comment line of `.github/CODEOWNERS` names `@rcluff11`, and each path in the area map above appears there or is covered by the `*` default.

## Update this doc when

`.github/CODEOWNERS` changes, a person joins or leaves, or a role moves.
