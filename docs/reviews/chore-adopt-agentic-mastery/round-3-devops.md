## DevOps Review — chore/adopt-agentic-mastery (Round 3, Verification)

**Date:** 2026-11-14 · **Reviewer:** devops · **Task:** [T-003](../../../tasks/T-003.md), with [T-001.9](../../../tasks/T-001.9.md) (`deployment.md`) and [T-001.10](../../../tasks/T-001.10.md) (`runbooks/`)

**Verdict:** **BLOCK (deploy scope)** on OPS-1 to OPS-4. **PASS WITH ITEMS for landing this branch**, which changes process files and docs only, with no app code and no deploy.
**Rollback plan:** Netlify "publish previous deploy" (with auto-publishing locked), the previous sender SHA plus a restart, and `migrate down` for the deploy's migrations or a restore of an off-VM `pb_data` backup taken just before. Documented in `docs/deployment.md` § 6 and `docs/runbooks/deploy-phase.md`. **None of it has been tested.**
**Observability delta:** unchanged on this branch. Proposed: + 1 heartbeat (sender), + 2 uptime checks (PocketBase `/api/health`, site), + 1 disk check (OPS-4).
**Cost delta:** none on this branch. The proposals cost $0 on free tiers. Off-VM backups in GCS cost about $0.01/month expected and about $0.60/month worst case (30 × 1 GB).
**Blockers:** OPS-1, OPS-2, OPS-3, OPS-4. All are deploy scope.
**Warnings:** OPS-5 to OPS-12.
**Suggestions:** OPS-13 to OPS-17.

### Method

- **Read:** `CLAUDE.md`, `ADOPTING.md`, the `notch-devops` skill, `docs/architecture.md`, `docs/contracts.md` (headings), all six Round 1/2 reviews, `push/README.md`, `push/.env.example` (keys only, values not printed), `netlify.toml`, `.github/workflows/checks.yml`, `.githooks/*`, `scripts/setup-hooks.sh`, `package.json`, `vite.config.js`, `.gitignore`, the tails of all 7 migrations (each has a `down()`), and the runtime section of `push/sender.mjs` (lines 76–270). I also grepped the test scripts for their server needs.
- **Not read:** any `.env` file or `pocketbase/pb_data`.
- **Ran:**
  - `sh scripts/setup-hooks.sh` (output below).
  - `git config core.hooksPath` printed `.githooks`.
  - A smoke test of `commit-msg`: a message without a task ID was blocked (exit 1); `T-003` passed (exit 0).
  - `pre-commit` with nothing staged: exit 0.
  - `npm run test:stats`: 211/211 passed.
  - `npm run test:reminders`: all passed.
  - `npm run build`: OK, 377.89 kB JS (112.99 kB gzip), 20.33 kB CSS. Node v24.21.0 locally.
  - `sh scripts/test/test-deck.sh`: SKIP, exit 0.
  - `git ls-remote` for the `actions/setup-node` and `actions/checkout` tags.
- **Didn't run:** `test:api` and the t3/t4/t5 attack scripts, which need PocketBase running. That's the SDET's Round 3 run.
- **Couldn't check:** branch protection. `gh` isn't installed here, and I didn't query the GitHub API without it.

#### Hook install result

```
$ sh scripts/setup-hooks.sh
Hooks installed.
  git will now use .githooks/ for pre-commit, commit-msg, and pre-push.
  CI mirror: scripts/ci-checks.sh, run by GitHub Actions (.github/workflows/checks.yml)
  or Azure DevOps (azure-pipelines.yml). NOT enforced until main requires its
  checks (ADOPTING.md § 4-5).
...
$ git config core.hooksPath      (before: unset)
.githooks
```

### Checklist

| Item | Result |
|---|---|
| CI green on the branch before merge; no `[skip ci]` | Not yet run: the branch has not been pushed. No skip markers in this branch's history (it has no commits of its own yet). |
| Migration decoupled from deploy | Migrations are additive, and the client and sender tolerate missing phase 2 collections. But the deploy **mechanics** couple them the wrong way round (OPS-3). |
| Feature flag on risky changes | No flag system. Phase 2 push messages are per-user opt-in (default off), which works as a flag for the new outbound traffic. The UI ships to all users at once, which is acceptable for a handful of users with an owner-first canary (`deployment.md` § 10). |
| Rollback path documented | **Yes, now** (`deployment.md` § 6, `runbooks/deploy-phase.md`). **Tested: no** (OPS-2). |
| Env vars per environment | Documented (`deployment.md` § 4). Netlify per-context scoping is UNKNOWN (OPS-10). |
| Logs structured, right level | No. Free-text `console.*`, and silent when idle (BE-16, OPS-4). |
| New endpoints/jobs have a metric and an alert | No. Nothing alerts anywhere (OPS-4). |
| Runbook for on-call-visible behaviour | **Yes, now:** `runbooks/push-reminders-stopped.md`, `runbooks/deploy-phase.md`. |
| Secrets only in `push/.env` and Netlify | Yes per the repo: `.gitignore` covers them, and the architect found no secrets in history. The VM file mode is UNKNOWN. |
| Cost assessed | Yes (`deployment.md` § 11). GCP region and free-tier eligibility UNKNOWN. |

---

### Findings

#### OPS-1 — BLOCKER (deploy) — Production may be running the phase 2 frontend without its backend (SCOPE-1)

- **Evidence:**
  - `origin/main` is at `079f486` (2026-11-12), which contains both phase 2 commits.
  - `CLAUDE.md` says "The Netlify deploy goes out from the push", so if Netlify auto-publishes `main`, the phase 2 frontend has been live since about 2026-11-12.
  - `CLAUDE.md` Status says phase 2 is "not yet deployed".
  - The VM gets code only by a manual `git pull` (`push/README.md`), so the migrations `1794200000`–`1794500000` are probably **not** applied.
  - In that state, reads of the five phase 2 collections return empty (`DataContext.jsx:32-34`). Writes to `checkins`, `plans`, `plan_targets`, `courses` and `course_steps` fail with 404. Saving `dayEndAt`, `nudgeTimes`, `affirmationAt` or `dayEndPush` on `users` is dropped, or rejected (the exact behaviour is UNKNOWN). The user sees settings that don't stick.
- **What to check.** All read-only; the commands are in `deployment.md` § 7.1:
  1. Netlify → Deploys: the Published deploy's commit, the production branch, whether auto-publishing is on, whether deploy previews are on.
  2. `curl -s https://<site>/manifest.webmanifest | grep -c '"shortcuts"'`. `1` means the phase 2 frontend is live (the app shortcut was added in `f7b0a31`; `cd0f338`'s manifest has no `shortcuts`).
  3. `curl -s -o /dev/null -w '%{http_code}' https://<pb-host>/api/collections/checkins/records`. `404` means the phase 2 schema is missing.
  4. On the VM: `git -C ~/notch log -1 --oneline`, `systemctl show notch-push -p ActiveEnterTimestamp`, `pocketbase --version`.
- **Fix:** record the answers in `tasks/T-003.md`. If the frontend is live without the backend, either finish the backend deploy (`runbooks/deploy-phase.md` steps 1 and 3–5, **after** the security blockers SEC-1/BE-1/BE-2 are fixed), or roll the frontend back to the last phase 1 deploy (`cd0f338`) and lock publishing. The rollback is the safer choice while BE-1 and BE-2 are open, because the phase 2 sender adds daily messages and more sends per tick. Either way, open a `fix/` task.

#### OPS-2 — BLOCKER (deploy) — No confirmed backup and no tested restore; the migration downs are destructive

- **Evidence:**
  - Backups are UNKNOWN (SEC-7, DATA-8, DATA-15).
  - Every phase 2 `down()` drops the fields or collections its `up()` added (checked: all 7 migrations have a `down()`).
  - There is no staging environment, so the first time a migration meets real data is in production.
  - Redlines: "no production deploy without a documented, **tested** rollback path"; "no production data restored from backup without an integrity check and an audit entry".
- **Fix:**
  1. Before the next deploy, take a backup by one of the two methods in `deployment.md` § 7.2, copy it off the VM, and record its checksum.
  2. **Restore it once** into a scratch directory, either locally (`pocketbase.exe serve --dir <restored pb_data>` with the repo's migrations) or on the VM under a different port, and run `PRAGMA integrity_check` and row counts. That one rehearsal makes the rollback "tested".
  3. Then schedule backups. The cheapest options are PocketBase's built-in scheduled backups (Settings → Backups, with cron and an S3-compatible target, e.g. a GCS bucket with HMAC keys stored in PocketBase settings) or a nightly systemd timer that copies `sqlite3 .backup` output to GCS.
  4. Keep 7 daily and 4 weekly copies.
  5. Record the location in `runbooks/README.md` "VM facts".

#### OPS-3 — BLOCKER (deploy) — The documented deploy order can't be followed with Netlify auto-publish on

- **Evidence:**
  - `CLAUDE.md` and the skill say: migrations and hooks first, then the sender, then "the Netlify deploy goes out from the push".
  - But the VM gets those migrations by `git pull` from GitHub (`push/README.md` "To update later"), which only works **after** `main` has changed, and that change publishes the frontend.
  - Following the written steps therefore always puts the frontend first, which is how OPS-1 can happen.
  - A second trap: PocketBase's `--hooksWatch` defaults to on. If the VM serves `pb_hooks` from the git checkout, `git pull` restarts PocketBase and applies migrations at once, without a backup or an operator watching. The VM layout is UNKNOWN.
- **Fix (procedural, no code):** lock Netlify auto-publishing before merging, deploy the VM from `main`, then publish the built deploy by hand and unlock (`deployment.md` § 3, `runbooks/deploy-phase.md` steps 0–6). Take the backup **before** `git pull`. Update `CLAUDE.md` § Commands and the `notch-devops` skill to say "lock Netlify publishing first" in the follow-up task. I'm not editing `CLAUDE.md` here.

#### OPS-4 — BLOCKER (deploy) — No alerting on any critical path; a hung sender is invisible

- **Evidence:**
  - Observability is the systemd journal only. Nothing pages anyone.
  - The sender logs nothing on an idle tick (`sender.mjs:251-257`), so a hang (BE-2 send with no timeout, BE-6 PocketBase call with no timeout) looks the same as a quiet hour. systemd sees a live process and doesn't restart it.
  - PocketBase, VM and DuckDNS outages are also silent.
  - Redline: "no critical path without alerting to a real on-call destination". Reminders are the product's main critical path.
- **Fix (cheap, staged):**
  1. **Now, no code:**
     - an external uptime check (UptimeRobot or Better Stack free tier, 5-minute interval) on `https://<pb-host>/api/health` and on the site, alerting by email or push to the owner;
     - a Healthchecks.io check, `notch-vm`, with a 10-minute period and 5-minute grace, pinged by a systemd timer on the VM every 5 minutes. The timer only pings if `systemctl is-active --quiet notch-push` succeeds, `curl -fsS -m 5 http://127.0.0.1:8090/api/health` succeeds and `df --output=pcent /` is under 85%.
     - These catch crashes, crash-loops, PocketBase down, VM down and a filling disk. They **don't** catch a hung sender.
  2. **With the BE-2 and BE-6 fixes (backend task):** add `HEARTBEAT_URL` to `push/.env` and ping it at the end of every tick that completes:
     ```js
     // push/sender.mjs main loop, after `await tick()`: one ping per completed tick, never blocks the loop
     const hb = process.env.HEARTBEAT_URL;
     if (hb) fetch(ok ? hb : `${hb}/fail`, { signal: AbortSignal.timeout(5000) }).catch(() => {});
     ```
     Set the check to a 1-minute period with 5-minute grace. A hung or dead sender then alerts within about 6 minutes.
  3. Treat the ping URL as a secret. Anyone holding it can keep the check green, so it lives in `push/.env` only.
  4. Record the alert destination in `runbooks/README.md`.
  5. Claim no SLO until these exist.

  The blocker clears when step 1 is in place and step 2 is a task that ships with the BE-2 fix.

#### OPS-5 — WARNING — CI doesn't build or test the app (SCOPE-7)

- **Evidence:** `.github/workflows/checks.yml` runs only the starter's procedure, shellcheck and deck jobs. The build, `test:stats`, `test:reminders`, `test:api` and the attack scripts run only by hand. Netlify's build is the only automatic build check, and it runs after merge.
- **Fix:** add this job in a follow-up task. A new CI job changes the gate, so it isn't on this branch, and I didn't edit `checks.yml`.
  - Its style matches the existing jobs: per-job `contents: read`, `persist-credentials: false`, actions pinned by SHA, values passed through `env:` (no `${{ }}` inside `run:`), a timeout, and no secrets.
  - Action SHAs, checked with `git ls-remote` on 2026-11-14:
    - `actions/checkout` `v4.4.0` = `11d5960a326750d5838078e36cf38b85af677262`, the same SHA the workflow already uses;
    - `actions/setup-node` `v4.4.0` = `49933ea5288caeca8642d1e84afbd3f7d6820020`.
  - Both are lightweight tags, so the SHA shown is the commit.
  - Node 22 is chosen because Vite 8 needs ≥ 20.19 or ≥ 22.12, and Node 22 is LTS. Local is v24.
  - **The PocketBase SHA-256 is UNKNOWN.** Fill it in from the release before merging:
    `curl -sSfL https://github.com/pocketbase/pocketbase/releases/download/v0.41.0/checksums.txt | grep linux_amd64.zip`.
    Ideally, cross-check it with `sha256sum` of a separately downloaded copy.

```yaml
  # App build and tests. No secrets; PocketBase runs from a pinned, checksummed
  # release against a throwaway data dir with this branch's migrations and hooks.
  app:
    name: app (build + tests)
    runs-on: ubuntu-24.04
    timeout-minutes: 15
    permissions:
      contents: read
    env:
      POCKETBASE_VERSION: 0.41.0
      # UNKNOWN: fill in from the v0.41.0 release's checksums.txt (pocketbase_0.41.0_linux_amd64.zip).
      POCKETBASE_SHA256: UNKNOWN-fill-in-before-merge
      VITE_PB_URL: http://127.0.0.1:8090
    defaults:
      run:
        shell: bash   # bash -eo pipefail
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0
        with:
          persist-credentials: false

      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
        with:
          node-version: '22'

      - name: install dependencies
        run: npm ci --no-audit --no-fund

      - name: build
        run: npm run build

      - name: stats tests (no server)
        run: npm run test:stats

      - name: reminder tests (no server)
        run: npm run test:reminders

      - name: download PocketBase (pinned + checksummed)
        run: |
          url="https://github.com/pocketbase/pocketbase/releases/download/v${POCKETBASE_VERSION}/pocketbase_${POCKETBASE_VERSION}_linux_amd64.zip"
          zip="$RUNNER_TEMP/pocketbase.zip"
          curl -sSfL -o "$zip" "$url"
          echo "${POCKETBASE_SHA256}  $zip" | sha256sum -c - \
            || { echo "::error::PocketBase ${POCKETBASE_VERSION} doesn't match its pinned checksum; not running it."; exit 1; }
          mkdir -p "$RUNNER_TEMP/pb"
          unzip -q "$zip" pocketbase -d "$RUNNER_TEMP/pb"
          "$RUNNER_TEMP/pb/pocketbase" --version

      - name: start PocketBase with this branch's migrations and hooks
        run: |
          "$RUNNER_TEMP/pb/pocketbase" serve --http=127.0.0.1:8090 \
            --dir="$RUNNER_TEMP/pb_data" \
            --migrationsDir="$GITHUB_WORKSPACE/pocketbase/pb_migrations" \
            --hooksDir="$GITHUB_WORKSPACE/pocketbase/pb_hooks" \
            --hooksWatch=false \
            > "$RUNNER_TEMP/pocketbase.log" 2>&1 &
          for i in $(seq 1 30); do
            if curl -fsS -m 2 http://127.0.0.1:8090/api/health > /dev/null; then
              echo "PocketBase healthy after ${i}s"; exit 0
            fi
            sleep 1
          done
          echo "::error::PocketBase didn't become healthy within 30s"
          cat "$RUNNER_TEMP/pocketbase.log"
          exit 1

      - name: API rules and hooks (test:api)
        run: npm run test:api

      - name: attack script t3 (energy)
        run: node scripts/t3-energy-attack.mjs

      - name: attack script t4 (nudges)
        run: |
          # t4 silently skips its server half if PocketBase is down; fail instead.
          node scripts/t4-nudges-attack.mjs | tee "$RUNNER_TEMP/t4.log"
          if grep -q 'skip  PocketBase not running' "$RUNNER_TEMP/t4.log"; then
            echo "::error::t4 skipped its PocketBase checks"; exit 1
          fi

      - name: attack script t5 (courses)
        run: node scripts/t5-courses-attack.mjs

      - name: PocketBase log (on failure)
        if: failure()
        run: cat "$RUNNER_TEMP/pocketbase.log" || true
```

  Notes on the job:
  - **Prerequisites:**
    - Add `actions/setup-node` to the allowed actions if Settings → Actions restricts them (`ADOPTING.md` § 4a step 2).
    - Once the job has reported on one PR, add `app (build + tests)` to the required checks (OPS-6).
    - `scripts/test/test-ci-wiring.sh` is unaffected: it checks only `scripts/test/test-*.sh` suites, and `azure-pipelines.yml` doesn't exist here.
  - **What it doesn't cover:**
    - The job tests migrations from an **empty** database with PocketBase's default `users` settings. It doesn't catch data-dependent migration failures (OPS-2 covers that) or production `users` rules (SEC-5).
    - It doesn't test `push/sender.mjs` beyond what t4 imports.
  - **Cost:** about 2 more billed minutes per PR push on a private repo. Repo visibility is UNKNOWN; it's free if public.
  - **Optional, non-blocking:** `npm audit --omit=dev || echo "::warning::npm audit found issues"` (SEC-13).

#### OPS-6 — WARNING — Branch protection and required checks are not confirmed (`ADOPTING.md` § 5)

- **Evidence:**
  - I couldn't query GitHub (no `gh`). T-003 criterion 3 says the owner confirms by hand.
  - Until then, `--no-verify` or a direct push to `main` bypasses every gate.
  - This is also how phase 2 reached `main` (SCOPE-4).
- **Order matters:**
  1. Merge this branch first, so `scripts/ci-*.sh` exists on `main`. The PR gate runs the **target** branch's script.
  2. Open one throwaway PR so every check reports once.
  3. Only then require the checks. A required check that has never reported blocks every PR.
- **Exact settings:**
  1. **Settings → Actions → General:**
     - Actions permissions: allow only selected actions, `actions/checkout` and `actions/setup-node` (the latter once OPS-5 lands), and tick "Require actions to be pinned to a full-length commit SHA".
     - Workflow permissions: **Read repository contents**.
     - Uncheck "Allow GitHub Actions to create and approve pull requests".
     - Fork pull request workflows: **Require approval for all outside collaborators**.
  2. **Settings → Code security:** turn on **Dependabot alerts**. Leave Dependabot *version updates* off: their PRs carry no task ID and fail the gate.
  3. **Settings → Rules → Rulesets → New branch ruleset**, named `main`, Enforcement **Active**, Target: the default branch. (Classic Settings → Branches works too.) Rules:
     - **Restrict deletions:** on.
     - **Block force pushes:** on.
     - **Require a pull request before merging:** on. Required approvals **0** (solo; GitHub won't let you approve your own PR). "Require review from Code Owners" **off** until a second maintainer joins, then approvals ≥ 1 and code-owner review on.
     - **Require status checks to pass:** on, with "Require branches to be up to date before merging" on. Add `procedure checks`, `shell scripts (lint + test)` and `overview deck (build + compare)`, each with source **GitHub Actions**. After OPS-5 lands, add `app (build + tests)`.
       - The deck job now always SKIPs green, because the pptx, `build_deck.py` and `requirements-deck.txt` are gone. Requiring it is harmless.
       - If you'd rather delete the deck job, remove it from the required checks first (`ADOPTING.md` § 1).
     - **Bypass list:** empty. Admins included, no bypass.
  4. Record "branch protection on, checks required" with the date in `tasks/T-003.md`'s activity log. Then `ADOPTING.md`'s "Definition of shipped/enforced" can be ticked.

#### OPS-7 — WARNING — The sender runs as a full superuser (SEC-2), operational side

- **Evidence:** `sender.mjs:80-84` authenticates to `_superusers`. The credential sits in `push/.env` on a VM that also holds `pb_data`. The `PB_URL` value, file mode and service user in production are UNKNOWN.
- **Fix:**
  - Preferred: the Architect's option (1), a `services` auth collection with read-only rules on the fields the sender needs plus delete on `push_subscriptions`. This is a migration plus a sender change, in a backend task.
  - Until then, record an ADR accepting option (2), with these operational controls, each confirmed on the VM and recorded in `runbooks/README.md`:
    - the account is dedicated to the sender, with a long random password, never the admin login;
    - `PB_URL=http://127.0.0.1:8090` (loopback);
    - `push/.env` is mode 600 and owned by a non-root, non-login service user that doesn't own `pb_data`;
    - the admin UI superusers (not the sender) use MFA/OTP;
    - the rotation procedure in `deployment.md` § 4 is followed after any suspected exposure.
  - Add the systemd hardening in OPS-17, so a compromised sender can't write outside `push/`.

#### OPS-8 — WARNING — No security headers on Netlify (FE-2 / SEC-3)

- **Evidence:** `netlify.toml` sets only `Cache-Control` and `Content-Type` for `/sw.js` and the manifest.
- **Fix:** add the block below in a frontend/devops task.
  - The CSP is from FE-2, which was checked against the build: Google Fonts CSS and font files, no inline script, no realtime.
  - It starts as **`Content-Security-Policy-Report-Only`**. There is no report endpoint, so read violations in the browser console, using Safari Web Inspector on the iOS Home Screen app and `chrome://inspect` on Android. Promote it to `Content-Security-Policy` after a clean week.
  - The other headers are low-risk and can be enforced at once. The app is never framed and uses no camera, microphone or location.
  - Before adding HSTS, check with `curl -sI https://<site> | grep -i strict-transport`. Netlify usually sends it already. If it doesn't, add `Strict-Transport-Security = "max-age=31536000"` without `preload`.
  - Replace `PB_HOST` with the real DuckDNS host. Netlify doesn't reliably interpolate env vars in `[[headers]]`. A later CI check should compare the host with `VITE_PB_URL`.

```toml
# Security headers for every path. CSP starts in Report-Only (FE-2 / SEC-3 / OPS-8).
[[headers]]
  for = "/*"
  [headers.values]
    Content-Security-Policy-Report-Only = "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://PB_HOST; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
    X-Frame-Options = "DENY"
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"
    Permissions-Policy = "camera=(), microphone=(), geolocation=()"
```

  Netlify applies every matching `[[headers]]` rule, so `/sw.js` and the manifest keep their existing `Cache-Control` and pick these up too. That's compatible: the service worker makes no fetches. Rollback is to remove the block and redeploy, or to publish the previous deploy.

#### OPS-9 — WARNING — Runtime versions are not pinned for Netlify or the VM

- **Evidence:**
  - There's no `.nvmrc`, no `engines` in `package.json`, and no `NODE_VERSION` in `netlify.toml`, so Netlify builds with its image default.
  - Vite 8 needs Node ≥ 20.19 or ≥ 22.12, and a default change can break or alter the build.
  - The VM's Node (needs ≥ 20.6) and PocketBase versions are UNKNOWN.
  - The PocketBase binary is gitignored with no recorded version or checksum (SEC-13). The test suite runs against 0.41.0, and production may differ.
- **Fix:**
  - Add `[build.environment] NODE_VERSION = "22"` to `netlify.toml` and `"engines": {"node": ">=22.12"}` to `package.json`, matching the CI job.
  - Record the VM's `node --version` and `pocketbase --version` in `runbooks/README.md`.
  - Upgrade PocketBase only in its own task: back up, keep the old binary, and read the changelog for migration and JSVM changes.

#### OPS-10 — WARNING — No staging, and previews may write to production

- **Evidence:** there is one backend. If Netlify deploy previews or branch deploys are on, and `VITE_PB_URL` isn't scoped per context (both UNKNOWN), a PR's unreviewed client code runs against production data with real user sessions on the preview origin.
- **Fix:**
  - Check Netlify → Site configuration → Environment variables → `VITE_PB_URL` scopes, and Build & deploy → Deploy contexts.
  - Either turn deploy previews off, or accept them for the owner's own PRs and note it.
  - A real staging backend would be a second PocketBase on the same VM, on another port, with its own `pb_data` and a staging DuckDNS name. The cost is ~$0 but it shares e2-micro memory (SEC-6), so it's a later, deliberate decision with its own cost note.

#### OPS-11 — WARNING — VM infrastructure is click-ops (IaC redline)

- **Evidence:** none of the VM, the firewall rules, the DuckDNS updater, TLS, or the PocketBase and `notch-push` unit files are in the repo. Only a guide is (`push/README.md`). The VM can't be rebuilt, reviewed or diffed.
- **Fix:** an IaC pipeline (Terraform for one VM) is likely more than this project needs. Record that in an ADR, accepted by DevOps and the Architect, and meanwhile check in what can be:
  - `deploy/notch-push.service` and `deploy/pocketbase.service`, copied from the VM;
  - the reverse-proxy config, if there is one;
  - a `deploy/README.md` that lists the GCP firewall rules and the machine type.

  Any VM change then goes through a PR that updates those files.

#### OPS-12 — WARNING — Production access isn't logged (break-glass redline)

- **Evidence:** SSH, admin-UI and console sessions leave no record in the repo. The admin UI bypasses every rule and hook (DATA-16).
- **Fix:**
  - Use the access-log convention in `runbooks/README.md` and `deployment.md` § 9: one line per production change.
  - Check whether PocketBase's request logs (admin UI → Logs) record superuser actions, and their retention (UNKNOWN).
  - Make sure GCP OS Login or Cloud Audit Logs cover SSH (UNKNOWN).

#### OPS-13 — SUGGESTION — Line endings and file modes for the hooks

- **Evidence:** `core.autocrlf=true` and `core.fileMode=false`, with no `.gitattributes`. The hooks and scripts in the working copy have CRLF endings (126 CRs in `pre-commit`). They run fine in Git Bash (smoke test above), and `autocrlf` normalises them to LF on commit. But a contributor with `autocrlf=false` would commit CRLF, and `sh` and shellcheck would then fail in CI. Also, new files are committed as `100644`, not executable (`ADOPTING.md` starter T-018).
- **Fix:** add a `.gitattributes` with `*.sh text eol=lf` and `.githooks/* text eol=lf`. When committing the hooks, run `git add --chmod=+x .githooks/pre-commit .githooks/commit-msg .githooks/pre-push scripts/*.sh`.

#### OPS-14 — SUGGESTION — Disk and log growth on the e2-micro

journald has no `SystemMaxUse` in the repo. `pb_data` holds the request logs and, with built-in backups, the backups themselves. Set `SystemMaxUse=200M` in `/etc/systemd/journald.conf`, set PocketBase log retention (Settings → Logs) to 7 days, and keep backups off the VM disk. OPS-4's timer covers the disk alert.

#### OPS-15 — SUGGESTION — `npm run push:test` sends to everyone

`sender.mjs:238-247` sends a test to every subscription of every user. The runbooks warn about it. A `--user <id>` filter in a backend task would make it a safe canary.

#### OPS-16 — SUGGESTION — Record GCP free-tier eligibility

The e2-micro is free only in `us-west1`, `us-central1` or `us-east1` with ≤ 30 GB standard disk. Record the region and disk in `runbooks/README.md` so a move doesn't start billing silently.

#### OPS-17 — SUGGESTION — Harden the `notch-push` unit

Add these to `[Service]` in the documented unit (`push/README.md`):
- `NoNewPrivileges=true`, `ProtectSystem=strict`, `ProtectHome=read-only`, `ReadWritePaths=/home/<user>/notch/push`, `PrivateTmp=true`, `MemoryMax=200M`;
- with `StartLimitIntervalSec=300` and `StartLimitBurst=10` in `[Unit]`, so a crash-loop ends in `failed`, which the OPS-4 timer then reports, instead of looping forever unnoticed.

`MemoryMax` stops the sender taking PocketBase down with it on the shared e2-micro (SEC-6). Test it after the change with `npm run push:test` (with care, OPS-15) and a self-reminder.

---

### Summary

- **BLOCKER:** 4 (OPS-1 to OPS-4). All are deploy scope; none blocks landing this branch.
- **WARNING:** 8 (OPS-5 to OPS-12)
- **SUGGESTION:** 5 (OPS-13 to OPS-17)

**Files written this round:**
- `docs/deployment.md` (T-001.9)
- `docs/runbooks/README.md` (index, VM facts, severity, on-call, access log)
- `docs/runbooks/_TEMPLATE.md`
- `docs/runbooks/push-reminders-stopped.md`
- `docs/runbooks/deploy-phase.md`

T-001.10's separate `incident-severity.md` and `on-call.md` are folded into `runbooks/README.md`, which suits a one-maintainer project. The Review Coordinator should note that supersession in T-001.10.

**Hand-offs:**
- Backend: the heartbeat ping (OPS-4 step 2) alongside BE-2, BE-5 and BE-6; the sender's service account (OPS-7); a `push:test --user` filter (OPS-15).
- Frontend: the headers (OPS-8) with FE-2; the Node pin (OPS-9).
- Architect: ADRs for OPS-7 (if option 2) and OPS-11.
- SDET: run `test:api` and t3/t4/t5 locally now, and own the `app` job's test list (OPS-5).
- Owner: answer OPS-1, set OPS-6, and fill in the "VM facts" table.

### Sign-off

**DevOps: BLOCK (deploy scope) / PASS WITH ITEMS (this branch).**

- Deploying the app, including finishing or reverting the phase 2 deploy, is blocked until four things are true:
  - **OPS-1:** production state confirmed and recorded in T-003;
  - **OPS-2:** an off-VM backup taken and restored once;
  - **OPS-3:** the lock-publish deploy procedure adopted;
  - **OPS-4:** uptime checks and the VM timer heartbeat in place, with the sender heartbeat tasked alongside BE-2.

  This is on top of the Architect's and Backend's SEC-1/BE-1/BE-2 blocks and Frontend's FE-1.
- Landing `deployment.md`, the runbooks and this review on `chore/adopt-agentic-mastery` isn't blocked. Each WARNING should become a task in `/tasks/` or be accepted by the DRI.
