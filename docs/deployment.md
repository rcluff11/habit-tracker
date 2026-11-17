# Deployment — Notch

**Lead author:** DevOps. **Task:** [T-001.9](../tasks/T-001.9.md). **Status:** descriptive as of branch `chore/adopt-agentic-mastery`, 2026-11-14. Draft pending the 9-agent consensus (AGENTS.md § 0 Step 4).

**Sources:** `CLAUDE.md` (Stack, Commands, Deploy order), `push/README.md`, `push/.env.example`, `netlify.toml`, `package.json`, `.github/workflows/checks.yml`, `.githooks/*`, `scripts/setup-hooks.sh`, `ADOPTING.md`, `pocketbase/pb_migrations/*.js` and `push/sender.mjs`. I did not read any `.env` file or `pocketbase/pb_data`. Anything only the VM or the Netlify/GitHub dashboards can show is marked **UNKNOWN — needs human confirmation**.

> **Production state is not asserted here.** Two phase 2 commits (`f7b0a31`, `079f486`) are on `origin/main`, but `CLAUDE.md` says phase 2 is "not yet deployed". Whether Netlify published them and whether the VM has the phase 2 migrations is UNKNOWN (review finding SCOPE-1 / OPS-1). § 7.1 lists the read-only checks that answer it.

---

## 1. Environments

| Environment | Frontend | Backend | Push sender | Data |
|---|---|---|---|---|
| **Local** | `npm run dev`, Vite on `http://localhost:5173` | `npm run pb` runs `pocketbase.exe serve` from `pocketbase/` on `127.0.0.1:8090` (Windows). It applies `pb_migrations` on start and loads `pb_hooks`. | `npm run push:sender` / `npm run push:test` with a local `push/.env` | `pocketbase/pb_data/` (gitignored, local only) |
| **CI** (GitHub Actions) | Not built today. The proposed `app` job builds it (§ 5.2). | Not run today. The proposed `app` job runs a pinned PocketBase 0.41.0 against a throwaway `--dir`. | Not run | Throwaway, per job |
| **Preview** (Netlify deploy previews / branch deploys) | Whether deploy previews are on: **UNKNOWN**. If they are, they are built with the same `VITE_PB_URL` as production unless the variable is scoped per deploy context (**UNKNOWN**), so **a preview talks to the production database**. | none (no staging backend exists) | none | production, if previews are on |
| **Production** | Netlify project `notchedweb`. Build `npm run build`, publish `dist/` (`netlify.toml`). Production branch: `main` (assumed from "the Netlify deploy goes out from the push", `CLAUDE.md`; **UNKNOWN**, confirm in Site settings → Build & deploy). Site URL: **UNKNOWN** (likely `https://notchedweb.netlify.app` or a custom domain). | PocketBase on a Google Cloud e2-micro VM behind a DuckDNS subdomain with automatic HTTPS. Version: **UNKNOWN** (local is 0.41.0). systemd unit name, install dir, `pb_data` path, whether it binds to loopback, and how TLS is terminated (PocketBase autocert or a reverse proxy): **UNKNOWN**. | systemd unit `notch-push` (`push/README.md`): `User=<non-root user>`, `WorkingDirectory=/home/<user>/notch` (a git clone of this repo), `ExecStart=/usr/bin/node --env-file=push/.env push/sender.mjs`, `Restart=always`, `RestartSec=10`. The real unit file on the VM: **UNKNOWN**. Node version on the VM: **UNKNOWN** (needs ≥ 20.6 for `--env-file`). | `pb_data/` on the VM's disk. Backups: **UNKNOWN**. |

**There is no staging environment.** The first time new migrations and hooks meet real data is the production deploy. That is why the pre-deploy backup and read-only checks (§ 7) are mandatory.

### 1.1 What runs where at runtime

- The browser loads the static bundle from Netlify and calls PocketBase directly over HTTPS (`VITE_PB_URL`).
- `notch-push` loads `src/lib/{stats,time,reminders,messages,affirmations}.js` **once at start** from its git checkout. A change to any of them only takes effect after `sudo systemctl restart notch-push`.
- `notch-push` talks to PocketBase at `PB_URL` (default `http://127.0.0.1:8090`, `push/.env.example`) as a PocketBase **superuser** (see § 4 and review OPS-7 / SEC-2).
- The sender's de-duplication state is `push/.sent.json` in its working directory (or `SENT_LOG`). It is gitignored, kept for 2 days, and written atomically (`.tmp` then rename).

---

## 2. Promotion path

```
feature branch ──PR──► main ──(Netlify auto-build)──► production frontend
                           └──(manual: git pull on VM, restart PocketBase, restart notch-push)──► production backend
```

1. Work on `feat/…`, `fix/…`, `chore/…` or `refactor/…` (`AGENTS.md` § 7). The local hooks (§ 5.3) block commits to `main`, commits without a task ID, and force-pushes to `main`.
2. Open a PR to `main`. CI runs (§ 5). The review cycle runs (`AGENTS.md` § 7, § 9).
3. Merge to `main`. **With default Netlify settings this publishes the frontend immediately.** Because of that, a phase that has migrations must lock Netlify auto-publishing *before* the merge (§ 3, step 0), or the frontend will be live before its schema.
4. Deploy the backend on the VM from `main`, then publish the frontend (§ 3).

The owner deploys a phase **once at the end**: one merge, one VM restart and one Netlify publish.

---

## 3. Deploy order and steps (never reorder)

The required order, from `CLAUDE.md` § Commands and `push/README.md` "Always restart the sender after deploying", is:

1. **PocketBase:** put the new `pb_migrations` and `pb_hooks` on the VM and restart PocketBase. Migrations apply on start.
2. **Sender:** `sudo systemctl restart notch-push`.
3. **Frontend:** the Netlify deploy.

**The order conflicts with how the code reaches each place.** Netlify publishes when `main` changes, but the VM gets its code with `git pull` from GitHub (`push/README.md`: "To update later: `git pull && npm ci --omit=dev && sudo systemctl restart notch-push`"). So the VM can only get the new migrations *after* `main` changes, by which point Netlify has already published. The fix is to stop Netlify auto-publishing for the duration of the deploy (step 0 below). See review OPS-3.

The full checklist with commands is in [`runbooks/deploy-phase.md`](runbooks/deploy-phase.md). In summary:

| Step | Where | Action | Verify |
|---|---|---|---|
| 0 | Netlify UI | Deploys → **Lock to stop auto publishing** (Netlify still builds each push but doesn't publish). Record the currently published deploy ID; that is the frontend rollback target. | The Deploys page shows "Auto publishing is locked". |
| 1 | VM | Pre-deploy checks and a **`pb_data` backup copied off the VM** (§ 7). | The backup's checksum is recorded and `PRAGMA integrity_check` returns `ok`. |
| 2 | GitHub | Merge the PR to `main`. Netlify builds but does not publish. | CI is green on the merge commit, and the Netlify build succeeded but isn't published. |
| 3 | VM | `cd ~/notch && git fetch && git log --oneline HEAD..origin/main` (review what's coming), then `git pull --ff-only && npm ci --omit=dev`. | `git rev-parse HEAD` matches the merge commit. |
| 4 | VM | Make PocketBase use the new `pb_migrations` and `pb_hooks` (copy them into PocketBase's directories, or point `--migrationsDir` / `--hooksDir` at the checkout; which one the VM uses is **UNKNOWN**). Then `sudo systemctl restart <pocketbase unit>`. | `curl -fsS http://127.0.0.1:8090/api/health` returns 200; the journal shows no migration error; `_migrations` lists the new files (§ 7.2). |
| 5 | VM | `sudo systemctl restart notch-push`. | `journalctl -u notch-push -n 20` shows "Notch reminder sender running…" and no "Collection … not found" warning. |
| 6 | Netlify UI | Publish the deploy built from the merge commit, then **unlock** auto-publishing. | `curl -s <site>/manifest.webmanifest` and a manual smoke test on a phone (log in, Home, Calendar, To-do, Settings → notifications). |
| 7 | VM / phone | Owner-only test push (see `runbooks/deploy-phase.md`; `npm run push:test` sends to **every** subscribed device of **every** user). | The notification arrives. |

**`--hooksWatch` warning.** PocketBase watches `pb_hooks` by default and restarts itself when a hook file changes. If the VM's PocketBase serves `pb_hooks` straight from the git checkout, then `git pull` (step 3) deploys hooks, and with them the migrations, at once, **before** step 4 and possibly before the backup. That's why the backup (step 1) comes before the pull. Whether the VM runs this way is **UNKNOWN**.

**Migrations are decoupled from code where possible.** Every migration so far is additive (new fields, new collections). The client already tolerates a missing phase 2 collection on reads (`src/lib/DataContext.jsx:32-34`), and the sender skips missing collections with a warning (`push/sender.mjs:146-159`). So "backend first, then frontend" is safe, but "frontend first" is not: phase 2 writes (check-ins, plans, courses and the new `users` fields) fail, or are silently dropped, against an old schema.

---

## 4. Secrets and configuration

| Name | Where it lives | Class | Notes |
|---|---|---|---|
| `VITE_PB_URL` | Netlify environment variables (build time) | Public | Compiled into the bundle. Must be `https://` in production (review SEC-8; `src/lib/pb.js` falls back to `http://127.0.0.1:8090` if it's unset). Scoping per deploy context: **UNKNOWN**. |
| `VITE_VAPID_PUBLIC_KEY` | Netlify environment variables | Public | Must equal `VAPID_PUBLIC_KEY` in `push/.env`. If they differ, every push fails. |
| `PB_URL` | `push/.env` on the VM | Config | Should be loopback (`http://127.0.0.1:8090`) so the superuser password never crosses the network. Production value: **UNKNOWN**. |
| `PB_EMAIL`, `PB_PASSWORD` | `push/.env` on the VM only | **Secret** | A dedicated PocketBase superuser for the sender (`push/README.md` § One-time setup). It's a full-database credential (SEC-2). |
| `VAPID_PRIVATE_KEY` | `push/.env` on the VM only | **Secret** | Never in Netlify, git, chat or screenshots. Rotating it forces every device to turn reminders on again. |
| `VAPID_SUBJECT` | `push/.env` | Config | `mailto:` or `https:` contact. |
| `SENT_LOG` (optional) | `push/.env` | Config | Path of the sent log. Default `push/.sent.json`. |
| PocketBase admin (superuser) logins | PocketBase `_superusers` in `pb_data` | **Secret** | MFA/OTP enabled, and admin UI `/_/` reachable from the internet: **UNKNOWN** (SEC-7). |
| PocketBase app settings (SMTP, rate limits, backups/S3) | `pb_data` | Secret/config | Not in migrations (SEC-5). Values: **UNKNOWN**. |

**Rules**

- Never commit `.env`, `.env.local` or `push/.env` (`.gitignore` covers `.env` at any depth and `.env.local`). Only `.env.example` and `push/.env.example` are tracked.
- `push/.env` is mode `600`, owned by the `notch-push` service user (`push/README.md`). Actual mode on the VM: **UNKNOWN**.
- Edit secrets only on the VM (`sudo -u <user> nano ~/notch/push/.env`) or in the Netlify UI. Never paste a value into chat, a task file, a PR, a commit or a screenshot. When comparing keys, compare the first and last 6 characters only.
- The local `pre-commit` hook scans staged content for common key formats. It doesn't recognise VAPID keys or PocketBase passwords, so the rules above still apply.
- **Rotation.** Superuser password: set a new one in the admin UI (or `./pocketbase superuser upsert`), update `push/.env`, then `sudo systemctl restart notch-push`. VAPID keys: rotate only after a leak, and then tell users to turn reminders on again.

---

## 5. CI pipeline

### 5.1 Today (`.github/workflows/checks.yml`)

The workflow runs on every PR and on pushes to `main`/`master`. Top-level `permissions: {}`, `contents: read` per job, `actions/checkout` pinned by SHA (`v4.4.0`, `11d5960a…`, verified with `git ls-remote`) and `persist-credentials: false`.

| Job (check name) | What it does |
|---|---|
| `procedure checks` | Runs the target branch's `scripts/ci-pr-checks.sh` on PRs, or `scripts/ci-checks.sh` on pushes: task IDs, `/docs` consensus assertion, placeholders, secret scan. Also checks that the PR body uses `.github/pull_request_template.md`. |
| `shell scripts (lint + test)` | Pinned and checksummed shellcheck v0.10.0 over `.githooks/*` and `scripts/**/*.sh`, plus the starter's fixture suites in `scripts/test/`. |
| `overview deck (build + compare)` | Builds the starter deck only when a PR touches it. Otherwise prints SKIP. |

**What CI doesn't do:** it doesn't run `npm ci`, the build, `test:stats`, `test:reminders`, `test:api` or the t3/t4/t5 attack scripts. App changes are tested only by hand (review SCOPE-7 / OPS-5). Netlify's own build is the only automatic build check, and it runs **after** merge.

### 5.2 Proposed `app` job

The exact YAML is in the Round 3 DevOps review (`docs/reviews/chore-adopt-agentic-mastery/round-3-devops.md`, OPS-5). It lands in a follow-up task, not on this branch. Summary:

- check name `app (build + tests)`, `ubuntu-24.04`, `timeout-minutes: 15`, `contents: read`, no secrets;
- `actions/setup-node` pinned by SHA (`v4.4.0`, `49933ea5…`), Node 22;
- `npm ci`, `npm run build`, `npm run test:stats`, `npm run test:reminders`;
- downloads PocketBase 0.41.0 `linux_amd64` and checks its pinned SHA-256 (the checksum is **UNKNOWN**; fill it in from the release's `checksums.txt`);
- `serve` on `127.0.0.1:8090` with `--dir` set to a temp dir, `--migrationsDir` set to the repo's `pocketbase/pb_migrations`, `--hooksDir` set to the repo's `pocketbase/pb_hooks` and `--hooksWatch=false`, then waits on `/api/health`;
- `npm run test:api` and `node scripts/t3-energy-attack.mjs`, `t4-nudges-attack.mjs` and `t5-courses-attack.mjs`, failing if t4 printed its "PocketBase not running" skip line.

The job tests the migrations from an empty database, with PocketBase's **default** `users` collection settings. It doesn't test production's `users` rules or rate limits, which aren't in migrations (SEC-5).

### 5.3 Local hooks

`sh scripts/setup-hooks.sh` sets `core.hooksPath=.githooks`. Run it once per clone. The hooks are:

- `pre-commit`: blocks commits to `main` and other protected branches, unreplaced placeholders and common secret formats;
- `commit-msg`: requires `T-NNN`, and `unanimous-consensus: T-NNN` for `/docs` changes;
- `pre-push`: blocks force-pushes to protected branches.

`--no-verify` skips the hooks. Only required CI checks on a protected `main` close that gap (§ 5.4).

### 5.4 Enforcement status

The checks run, but nothing **requires** them until branch protection is set (`ADOPTING.md` § 5). Status: **UNKNOWN — needs human confirmation**. The exact settings are listed in the Round 3 review (OPS-6). Until they are on, every gate is advisory.

---

## 6. Rollback

**Rule: roll back in the reverse of the deploy order.** Frontend first, then the sender, then PocketBase. That way no client is writing to collections you are about to remove.

| Component | How | Time | Data impact | Tested? |
|---|---|---|---|---|
| **Frontend** (Netlify) | Deploys → choose the previous published deploy → **Publish deploy**. Then **lock auto-publishing**, so the next push doesn't undo the rollback. Unlock only once `main` is fixed. | < 1 min | None | **No** (UNKNOWN whether it has ever been done). |
| **Sender** (`notch-push`) | `cd ~/notch && git checkout <previous-sha> && npm ci --omit=dev && sudo systemctl restart notch-push`. Afterwards, return the checkout to `main` (`git checkout main`) once main is fixed. `push/.sent.json` survives, so nothing is re-sent. | ~1 min | None | No |
| **PocketBase hooks** | Restore the previous `pb_hooks` (`git checkout <previous-sha> -- pocketbase/pb_hooks`, then copy them into place if the VM uses separate directories), then restart PocketBase. | ~1 min | None | No |
| **PocketBase migrations** | Stop the sender and PocketBase. Check the applied list (§ 7.2). Then `./pocketbase migrate down <n> --dir=<pb_data> --migrationsDir=<dir>`, where `<n>` is the number of migrations this deploy added (phase 2 adds four: `1794200000`–`1794500000`). Confirm the exact flags with `./pocketbase migrate --help` on the VM's version, and answer its confirmation prompt. Then restore the previous hooks and start PocketBase. | ~5 min | **Destructive.** Every phase 2 `down()` drops what its `up()` added: the `users` fields `dayEndAt`, `dayEndPush`, `affirmationAt` and `nudgeTimes`; `tasks.effort`; and the `checkins`, `plans`, `plan_targets`, `courses` and `course_steps` collections. Everything users wrote there is lost (DATA-15). | No |
| **Whole backend from backup** | `runbooks/deploy-phase.md` § "Restore `pb_data`": stop both services, move the current `pb_data` aside (never delete it), unpack the backup, run `PRAGMA integrity_check`, compare row counts, record who approved the restore and why in the task file, start PocketBase, then the sender. | ~10 min | **Loses every write since the backup**, phase 1 data included. | **No.** No restore has ever been tested (OPS-2). |

**Which one to use:**

- In the first minutes after a deploy, before users have written phase data: frontend rollback, then `migrate down`.
- Once users have written data to the new collections: **forward-fix**. Roll back only the frontend if it's broken, keep the schema, and ship a fix. Restore from a backup only for corruption or data loss, and only with a recorded approval.
- `migrate down` without a backup taken just before the deploy is not an acceptable plan.

---

## 7. Pre-deploy checklist

Do every item, in order, and record the results in the deploy task's activity log. Read-only items must stay read-only: run SQL against the **backup copy** with `sqlite3 -readonly`, never against the live `pb_data/data.db`.

### 7.1 Confirm what is live now (SCOPE-1)

- [ ] **Netlify:** which commit is the **Published** deploy (Deploys page)? Is the production branch `main`? Is auto-publishing on? Are deploy previews on, and which `VITE_PB_URL` do they use?
- [ ] **Frontend marker (read-only):** `curl -s https://<site>/manifest.webmanifest | grep -c '"shortcuts"'`. `1` means the phase 2 frontend is live (the app shortcut was added in phase 2), `0` means phase 1.
- [ ] **Backend marker (read-only):** `curl -s -o /dev/null -w '%{http_code}\n' https://<pb-host>/api/collections/checkins/records`. `404` means the phase 2 migrations are **not** applied. `200`, `401` or `403` means the collection exists.
- [ ] **VM:** `git -C ~/notch log -1 --oneline`, `systemctl show notch-push -p ActiveEnterTimestamp`, `systemctl status <pocketbase unit>`, and `./pocketbase --version`.

If the frontend is phase 2 but the backend isn't, production is running out of order. Either deploy the backend now (§ 3, steps 1 and 3–5) or roll the frontend back (§ 6), and open a `fix/` task.

### 7.2 Backup (mandatory, every deploy)

- [ ] Take a consistent backup of `pb_data`. Use **one** of:
  - **Admin UI:** Settings → Backups → **Initialize new backup**. This writes a zip into `pb_data/backups/`. Download it to your machine.
  - **Shell:** `sudo systemctl stop notch-push <pocketbase unit>`, then `tar czf ~/backups/pb_data-$(date -u +%Y%m%dT%H%MZ).tgz -C <parent of pb_data> pb_data`, then start both services again. About a minute of downtime.
- [ ] Copy the backup **off the VM**. A backup on the same disk doesn't count. Record its `sha256sum` and size.
- [ ] Integrity: `sqlite3 -readonly <backup>/data.db "PRAGMA integrity_check;"` prints `ok`. Whether `sqlite3` is installed on the VM is **UNKNOWN**. If it isn't, run the check on your own machine against the downloaded copy.
- [ ] Record the applied migrations: `sqlite3 -readonly <backup>/data.db "SELECT file, applied FROM _migrations ORDER BY applied;"`.

### 7.3 Read-only data checks requested in Round 2

- [ ] **Block times off the 15-minute grid** (DATA-5 / BE-8). Run this on the backup copy:
  `sqlite3 -readonly <backup>/data.db 'SELECT count(*) FROM blocks WHERE start % 15 != 0 OR "end" % 15 != 0;'`
  If the count isn't 0, the planned server-side grid check would reject those blocks' next edit. A snap backfill migration must ship with the check.
- [ ] **`users` collection rules and auth settings** (SEC-5 / BE-9). Admin UI → Collections → `users`: record the list, view, create, update and delete rules; the password minimum length; whether email verification is required; the auth methods; and MFA/OTP. Then Settings → Application: record the rate limits. Or read the rules on the backup copy:
  `sqlite3 -readonly <backup>/data.db "SELECT listRule, viewRule, createRule, updateRule, deleteRule FROM _collections WHERE name='users';"`
  These values become the `down()` of the migration that pins them (BE-9). Opening the admin UI is production access, so log it (§ 9).
- [ ] **Phase 2 `users` fields** (when deploying phase 2): after the deploy, `_collections` → `users` → `fields` includes `dayEndAt`, `dayEndPush`, `affirmationAt` and `nudgeTimes`.

### 7.4 Go / no-go

- [ ] CI is green on the PR, including the `app` job once it exists. Until then, attach local output of `npm run build`, `test:stats`, `test:reminders`, `test:api` and t3/t4/t5, run against a PocketBase started with the PR's migrations.
- [ ] No open deploy-scope BLOCKER in the branch's review artifact. For the phase 2 deploy these are SEC-1/BE-1, BE-2, FE-1 and OPS-1 to OPS-4.
- [ ] The rollback targets are written down: the previous Netlify deploy ID, the previous VM `git` SHA, the backup file name and its checksum.
- [ ] The runbook covers any new on-call-visible behaviour.

---

## 8. Observability

| Signal | Where | Alert? |
|---|---|---|
| Sender logs | `journalctl -u notch-push`. Free text (BE-16). Logs at start, on send failures, on a failed tick, on missing collections and on sent-log errors. **Logs nothing on a normal idle tick**, so a hung sender looks the same as an idle one. | **None** |
| PocketBase logs | Admin UI → Logs (request log, stored in `pb_data`), plus the PocketBase unit's journal | **None** |
| Process liveness | `systemctl status` (`Restart=always` restarts crashes, but not hangs) | **None** |
| Frontend | Netlify deploy notifications (configured: **UNKNOWN**) | UNKNOWN |
| VM resources (memory, disk, CPU) | GCP console | **None** known (SEC-6) |

There is **no alerting on any critical path** (review OPS-4). The proposed minimum is in the review: a heartbeat from the sender, an external uptime check of PocketBase and the site, and a disk check. No SLO is claimed, and none may be claimed until that telemetry exists.

---

## 9. Production access

- Production access means SSH to the VM, the PocketBase admin UI at `/_/`, and the Netlify and GCP consoles.
- Every session that **changes** anything (a deploy, a restart, an admin-UI edit, a restore, a secret change) gets a dated line in the relevant task's activity log: who, when, what and why. When no task fits, log it in `docs/runbooks/README.md` § Access log.
- Never create or edit user data in the admin UI (DATA-16). The superuser bypasses every rule and hook.
- How SSH is restricted (IAP or IP allowlist) and whether the admin UI is reachable from the internet: **UNKNOWN** (SEC-7).

---

## 10. Feature flags and progressive rollout

- There is no feature-flag system. Phase 2's push messages (affirmation, nudges, day-end score) are **off by default for every user** (`users.affirmationAt = ""`, `nudgeTimes = []`, `dayEndPush = false`). That works as a per-user opt-in flag for the new outbound traffic. The phase 2 UI ships to everyone at once.
- Single region, single VM, a handful of users. Progressive rollout is "owner first": deploy, then the owner uses the app for a day before telling other users. The owner-only test push is the canary.

---

## 11. Cost

- Netlify: static hosting. Plan: **UNKNOWN** (likely free).
- GCP e2-micro: within the always-free tier **only** in `us-west1`, `us-central1` or `us-east1` with a standard persistent disk ≤ 30 GB. The region and disk are **UNKNOWN**.
- The proposed additions (Healthchecks.io heartbeat, an UptimeRobot/Better Stack uptime check, off-VM backups to a GCS bucket) cost $0 on free tiers. Expected scale: a few MB of backups, about a cent a month. Worst case, 30 daily backups of a 1 GB `pb_data` in GCS Standard is about $0.60 a month.

---

## 12. Known gaps

| Gap | Impact | Tracking |
|---|---|---|
| Production deploy state unknown (phase 2 may be half-deployed) | The frontend may be ahead of its schema | OPS-1 / SCOPE-1 |
| No confirmed backup and no tested restore | A bad migration or a lost disk loses all data | OPS-2 |
| The deploy order can't be followed with auto-publish on | Frontend goes live before its schema | OPS-3 (fixed procedurally by § 3 step 0) |
| No alerting at all; sender hangs are invisible | Reminders stop silently (BE-2, BE-6) | OPS-4 |
| No app CI | Regressions are caught only by hand, or by Netlify after merge | OPS-5 / SCOPE-7 |
| Branch protection not confirmed | Every gate is advisory | OPS-6 |
| Sender is a superuser | One compromise exposes the whole database | OPS-7 / SEC-2 |
| No security headers or CSP | XSS and clickjacking defence in depth missing | OPS-8 / SEC-3 / FE-2 |
| Node and PocketBase versions not pinned for Netlify or the VM | Builds and the server can change under you | OPS-9 / SEC-13 |
| No staging; previews may use production data | Untested changes meet real data | OPS-10 |
| VM set up by hand (no IaC; systemd units and proxy config not in the repo) | The VM can't be rebuilt or reviewed | OPS-11 |
| Admin-UI and SSH access not logged | No audit trail | OPS-12 |
| VM facts unknown: firewall, TLS, loopback bind, service users, `.env` mode, MFA, region | Can't assess exposure | SEC-7 |

---

## Update this doc when

- `netlify.toml`, `package.json` scripts or engines, `vite.config.js`, or the Node version change;
- `.github/workflows/checks.yml`, `scripts/ci-*.sh`, `.githooks/*` or `scripts/setup-hooks.sh` change, or branch-protection settings change;
- a file is added to `pocketbase/pb_migrations/` or `pocketbase/pb_hooks/` (check the rollback table and the data impact in § 6);
- `push/sender.mjs`, `push/README.md`, `push/.env.example` or the `notch-push` unit change;
- a secret is added, renamed, moved or rotated;
- the VM, DuckDNS, TLS, PocketBase version, Netlify project or GCP region changes;
- backups, alerting or a staging environment are added, or any UNKNOWN above is confirmed (replace it with the fact and its source).
