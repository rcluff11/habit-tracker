# Runbooks — Notch

**Owner:** DevOps. **Task:** [T-001.10](../../tasks/T-001.10.md). **Status:** draft, Round 3 of `chore/adopt-agentic-mastery` (2026-11-14).

Each runbook is a step-by-step procedure for one on-call situation. Copy [`_TEMPLATE.md`](_TEMPLATE.md) to start a new one. Commands assume an SSH session on the VM as the sender's service user, with the repo checked out at `~/notch` (`push/README.md`). Anything that depends on how the VM was set up is marked **UNKNOWN — needs human confirmation**. Fill in the facts below once and keep them current.

## Index

| Runbook | Use when |
|---|---|
| [`push-reminders-stopped.md`](push-reminders-stopped.md) | Reminders or daily messages didn't arrive, `notch-push` is down or crash-looping, or it's running but silent |
| [`deploy-phase.md`](deploy-phase.md) | Deploying a phase or any change with migrations, hooks or sender changes. Also covers rollback and a `pb_data` restore. |

Planned playbooks (not written yet; add them as these incidents happen or the facts become known): PocketBase down or the API returns 5xx; the VM is out of memory or disk; the DuckDNS or TLS certificate failed; a leaked secret (rotate the VAPID key or the superuser password).

## VM facts (fill in; all UNKNOWN today)

| Fact | Value |
|---|---|
| GCP project / zone / instance name | UNKNOWN |
| DuckDNS hostname (PocketBase public URL) | UNKNOWN |
| Netlify site URL | UNKNOWN (project `notchedweb`) |
| PocketBase systemd unit name (`PB_UNIT` below) | UNKNOWN |
| PocketBase binary and `pb_data` path (`PB_DIR` below) | UNKNOWN |
| PocketBase reads migrations and hooks from (copied dirs, or the `~/notch` checkout?) | UNKNOWN |
| PocketBase version on the VM | UNKNOWN (local 0.41.0) |
| TLS terminated by | UNKNOWN (PocketBase autocert or a reverse proxy) |
| `notch-push` service user / unit file | UNKNOWN (guide: `push/README.md`) |
| Node version on the VM | UNKNOWN (needs ≥ 20.6) |
| `sqlite3` CLI installed on the VM | UNKNOWN |
| Off-VM backup location | UNKNOWN (none confirmed) |
| Alert destination | **none exists** (see the Round 3 review, OPS-4) |

## Severity

Notch is a personal app with a handful of users and one maintainer. There are no paid SLAs. The response targets below are goals for the owner, not commitments.

| Sev | Meaning | Examples | Respond |
|---|---|---|---|
| **Sev1** | The app is unusable for everyone, or data is lost or exposed | PocketBase down, VM down, `pb_data` corrupt, a leaked secret, the SEC-1 endpoint abused | Same day; start within 1 hour of noticing |
| **Sev2** | A core feature is broken for everyone | Reminders stopped, a frontend deploy is broken, logins failing | Within 24 hours |
| **Sev3** | Degraded or affecting one user | One device not receiving pushes, a slow tick, a cosmetic bug | Next working session |

## On-call

- **Rotation:** one person, the owner and DRI (`rcluff11`).
- **Paging:** none. Nothing alerts today, so incidents are found by using the app or by user reports. Until the Round 3 review's OPS-4 heartbeat and uptime checks exist, check `journalctl -u notch-push` and the site after every deploy and at least weekly.
- **Escalation:** none beyond the owner. Vendors: GCP support (VM), Netlify support (frontend), DuckDNS (best effort), PocketBase GitHub discussions.
- **After any Sev1 or Sev2:** add a short note to the task that caused or fixed it: what happened, how it was found, how it was fixed, and what changes so it doesn't recur. If a runbook was wrong or missing, fix it in the same task.

## Rules for every runbook

- Never paste secrets (`push/.env` values, superuser passwords, VAPID private keys, full push endpoints) into chat, tasks, PRs or screenshots.
- Run read-only queries against a **backup copy** with `sqlite3 -readonly`, not against the live `pb_data`.
- Never create or edit user records in the PocketBase admin UI unless a runbook step says to. The superuser bypasses every rule and hook.
- Log every production change, whether a restart, a deploy, an admin-UI edit, a restore or a secret change, in the access log below or in the task's activity log.

## Access log

Append one line per production change that has no task of its own: `YYYY-MM-DD HH:MM TZ — who — what — why — runbook`.

- (empty)

## Update this doc when

- a runbook is added, renamed or retired;
- any VM fact above is confirmed or changes;
- an alert destination, paging tool or second maintainer is added;
- severity definitions or response targets change.
