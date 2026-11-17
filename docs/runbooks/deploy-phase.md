# Runbook: deploy a phase (and roll it back)

**Severity guide:** this is a planned change, not an incident. A failed deploy is Sev1 (backend) or Sev2 (frontend). **Last tested:** never.

Policy and background: [`../deployment.md`](../deployment.md) §§ 3, 6 and 7. Order: **PocketBase, then the sender, then Netlify.** Roll back in reverse.

Set these once per SSH session (see `README.md` "VM facts"; all UNKNOWN today):
```bash
NOTCH=~/notch                 # sender checkout
PB_UNIT=…                     # PocketBase systemd unit
PB_DIR=…                      # directory holding the pocketbase binary and pb_data
```

## Before you start (go / no-go)

- [ ] The PR is approved and CI is green. Until the `app` CI job exists, attach local output of `npm run build`, `test:stats`, `test:reminders`, `test:api` and t3/t4/t5, run against a PocketBase started with this PR's migrations.
- [ ] The review artifact has no open deploy-scope BLOCKER. For phase 2 that means **SEC-1/BE-1, BE-2, FE-1 and OPS-1 to OPS-4 are resolved or accepted by ADR**. The UX review also asks for UX-1 and UX-2 first.
- [ ] You have 30 quiet minutes, outside users' reminder-heavy times.
- [ ] `deployment.md` § 7.1 is done: you know what's live now. If production is already half-deployed, this runbook finishes the job. Start at step 0 anyway.
- [ ] Decide which migrations this deploy adds, and how many (phase 2: `1794200000_day_end`, `1794300000_energy`, `1794400000_notification_prefs` and `1794500000_plans_courses`, so 4).

## Deploy

**0. Freeze the frontend (Netlify UI).**
Deploys → **Lock to stop auto publishing**. Write down the **currently published deploy** (its ID and commit): that's the frontend rollback target.

**1. Record the rollback targets and take a backup (VM).**
```bash
git -C "$NOTCH" rev-parse HEAD                    # previous sender SHA -> write it down
systemctl show notch-push -p ActiveEnterTimestamp
"$PB_DIR/pocketbase" --version
```
Back up `pb_data` with the admin UI (Settings → Backups → Initialize new backup, then download it) or the shell:
```bash
mkdir -p ~/backups
sudo systemctl stop notch-push "$PB_UNIT"
sudo tar czf ~/backups/pb_data-$(date -u +%Y%m%dT%H%MZ).tgz -C "$PB_DIR" pb_data
sudo systemctl start "$PB_UNIT" notch-push
sha256sum ~/backups/pb_data-*.tgz | tail -1          # write it down
```
Copy the backup off the VM, for example with `gcloud compute scp <instance>:~/backups/<file> .` from your machine, or to a GCS bucket. Then on the copy:
```bash
mkdir -p /tmp/pbcheck && tar xzf <file>.tgz -C /tmp/pbcheck
sqlite3 -readonly /tmp/pbcheck/pb_data/data.db "PRAGMA integrity_check;"          # ok
sqlite3 -readonly /tmp/pbcheck/pb_data/data.db "SELECT file FROM _migrations ORDER BY applied;"
sqlite3 -readonly /tmp/pbcheck/pb_data/data.db 'SELECT count(*) FROM blocks WHERE start % 15 != 0 OR "end" % 15 != 0;'
sqlite3 -readonly /tmp/pbcheck/pb_data/data.db "SELECT listRule, viewRule, createRule, updateRule, deleteRule FROM _collections WHERE name='users';"
```
Record all four results in the deploy task. If the grid count isn't 0 and this deploy adds the 15-minute guard (BE-8), stop: the backfill migration must ship with it.

**2. Merge (GitHub).** Merge the PR. Netlify builds the merge commit but doesn't publish it. Check that the build succeeded.

**3. Update the checkout (VM).**
```bash
cd "$NOTCH" && git fetch origin
git log --oneline HEAD..origin/main               # read what you're about to deploy
git diff --stat HEAD origin/main -- pocketbase push src/lib
git pull --ff-only && npm ci --omit=dev
```
If PocketBase reads `pb_hooks` straight from this checkout with `--hooksWatch` on (the default), it restarts and applies the migrations **now**. Watch the PocketBase unit's journal (`journalctl -u "$PB_UNIT" -f`) and skip the restart in step 4.

**4. Apply migrations and hooks (VM).** Copy the new files to where PocketBase reads them, if it doesn't read the checkout:
```bash
rsync -a --delete "$NOTCH/pocketbase/pb_hooks/" "$PB_DIR/pb_hooks/"
rsync -a "$NOTCH/pocketbase/pb_migrations/" "$PB_DIR/pb_migrations/"
sudo systemctl restart "$PB_UNIT"
journalctl -u "$PB_UNIT" -n 50 --no-pager          # no migration errors
curl -fsS -m 5 http://127.0.0.1:8090/api/health
```
Never use `--delete` on `pb_migrations`: an applied migration's file must stay.

**5. Restart the sender (VM).**
```bash
sudo systemctl restart notch-push
journalctl -u notch-push -n 20 --no-pager           # "Notch reminder sender running…", no "Collection … not found"
```

**6. Publish the frontend (Netlify UI).** Publish the deploy built from the merge commit, then **unlock auto publishing**. Check it:
```bash
curl -s https://<site>/manifest.webmanifest | grep -c '"shortcuts"'      # 1 for phase 2
curl -s -o /dev/null -w '%{http_code}\n' https://<pb-host>/api/collections/checkins/records   # not 404
```
Then on your phone, installed from the Home Screen: log in, open Home, Calendar, To-do, Progress and Settings. Save one new-feature record (for phase 2: an energy check-in) and reload to confirm it persisted.

**7. Canary (owner only).** Set a task reminder two minutes ahead on your own account and confirm it arrives. Turn on one daily message for yourself and confirm it the next time it's due. Use `npm run push:test` only if you are the only user with reminders on: it sends to every device of every user.

**8. Record.** In the deploy task: the merge SHA, the Netlify deploy ID, the backup file and its checksum, the four query results, and the times of steps 0–7.

**9. Watch.** Check `journalctl -u notch-push --since "-1 hour"` and the PocketBase logs after one hour and again the next morning.

## Rollback

Decide fast. Before users have written data to the new collections, a full rollback is cheap. After that, prefer **forward-fix** (`deployment.md` § 6).

**R1. Frontend (Netlify).** Deploys → the target recorded in step 0 → **Publish deploy**. Make sure auto-publishing is **locked**, so the next push to `main` doesn't re-publish the broken build.

**R2. Sender (VM).**
```bash
cd "$NOTCH" && git checkout <previous-sha> && npm ci --omit=dev && sudo systemctl restart notch-push
```
Afterwards, put the checkout back on `main` (`git checkout main`) once `main` is fixed or reverted.

**R3. Hooks and migrations (VM). This deletes data in the new fields and collections.**
```bash
sudo systemctl stop notch-push "$PB_UNIT"
"$PB_DIR/pocketbase" migrate --help                 # confirm the flags on this version
"$PB_DIR/pocketbase" migrate down <n> --dir="$PB_DIR/pb_data" --migrationsDir="$PB_DIR/pb_migrations"
git -C "$NOTCH" show <previous-sha>:pocketbase/pb_hooks/guards.js >/dev/null   # confirm the SHA has the old hooks
git -C "$NOTCH" archive <previous-sha> pocketbase/pb_hooks | tar x -C /tmp && rsync -a --delete /tmp/pocketbase/pb_hooks/ "$PB_DIR/pb_hooks/"
sudo systemctl start "$PB_UNIT" notch-push
```
`<n>` is the number of migrations this deploy added (4 for phase 2). Check the result: `SELECT file FROM _migrations` (on a fresh backup) no longer lists them.

**R4. Restore `pb_data` from the backup** (for corruption or failed migrations only). This loses every write since the backup.

1. Get approval and write it down: the owner records in the task who approved, when, why, and the backup file and checksum.
2. Stop the services: `sudo systemctl stop notch-push "$PB_UNIT"`.
3. Keep the current data: `sudo mv "$PB_DIR/pb_data" "$PB_DIR/pb_data.before-restore-$(date -u +%Y%m%dT%H%MZ)"`.
4. Check the backup: `sha256sum <file>.tgz` matches the recorded value.
5. Unpack it: `sudo tar xzf <file>.tgz -C "$PB_DIR"`, then fix ownership to PocketBase's service user.
6. Check integrity: `sqlite3 -readonly "$PB_DIR/pb_data/data.db" "PRAGMA integrity_check;"` prints `ok`. Compare `SELECT count(*)` for `users`, `tasks`, `blocks` and `completions` with the values you recorded before.
7. Put back the hooks and migrations that match the backup's `_migrations` list (R3 hook step), then `sudo systemctl start "$PB_UNIT" notch-push`.
8. Verify as in step 6, and add the restore to the access log.

## Update this runbook when

- the deploy order, the Netlify settings or the VM layout change, or any `PB_UNIT` / `PB_DIR` fact is confirmed;
- the CI `app` job lands (simplify the go/no-go);
- backups move to a scheduled or off-VM system (simplify step 1);
- a phase adds migrations whose `down()` does something other than drop what `up()` added.
