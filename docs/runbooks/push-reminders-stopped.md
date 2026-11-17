# Runbook: push reminders stopped

**Severity guide:** Sev2 if nobody gets reminders. Sev3 if one device or one user doesn't. **Last tested:** never.

**Components:** `notch-push` (systemd, `push/sender.mjs`), PocketBase, the push services (Apple, Google, Mozilla, Microsoft), the device's service worker (`public/sw.js`). Background: `push/README.md`, `docs/architecture.md` § 7.

## Symptoms

- A block reminder, task reminder, affirmation, nudge or day-end push didn't arrive.
- `systemctl status notch-push` isn't `active (running)`, or it keeps restarting.
- The sender is `active (running)` but sends nothing. This is the dangerous case. The sender **logs nothing on a normal idle minute**, so a hung sender looks exactly like a quiet one (BE-2, BE-6).

## Impact

Nobody gets reminders until it's fixed. A reminder is never sent late: block reminders expire at the block's start, and task reminders and daily messages 15 minutes after their time. Anything missed during the outage is gone. Nothing else in the app is affected.

## Diagnose

Work through these in order. All of them are read-only.

**1. Is it one device or everyone?**
If only one device is missing reminders, check the device first:

- On iPhone, Notch must be opened from the Home Screen. Safari tabs can't receive push.
- Settings → **Turn on reminders**.
- OS notification permission for Notch.
- Focus or Do Not Disturb modes.
- The message must be enabled for that user. Daily messages are off by default.
- Logging out turns reminders off on that device.

If it's everyone, carry on.

**2. Service state**
```bash
systemctl status notch-push --no-pager
systemctl show notch-push -p ActiveState -p SubState -p NRestarts -p ActiveEnterTimestamp -p MainPID
```
- `active (running)`, low `NRestarts`, started a while ago: the process is alive. Go to step 4.
- `activating (auto-restart)` or a high `NRestarts`: it's crash-looping. Go to step 3.
- `inactive` or `failed`: it was stopped or never enabled. Check `systemctl is-enabled notch-push`, then step 3.

**3. Recent logs**
```bash
journalctl -u notch-push --since "-3 hours" --no-pager | tail -n 100
```
Match what you see against this table (the strings come from `push/sender.mjs`):

| Log line | Meaning | Go to |
|---|---|---|
| `Missing settings: …` | `push/.env` is missing a key, unreadable by the service user, or the `--env-file` path is wrong | Fix A |
| `Tick failed: …` repeating every minute | Each tick throws. Common causes: PocketBase unreachable (`fetch failed`, `ECONNREFUSED`), an expired or rejected superuser token (401/403; the sender never re-authenticates, BE-5), or one subscription's bad data aborting the tick (BE-3) | step 5, then Fix B |
| `Collection "…" not found; treating it as empty…` | The sender is newer than the PocketBase schema (phase 2 migrations not applied). Block and task reminders still go out. | `deploy-phase.md` |
| `Push to <id> failed: 403 …` for **every** subscription | VAPID key mismatch: `VAPID_PUBLIC_KEY` in `push/.env` differs from Netlify's `VITE_VAPID_PUBLIC_KEY` | Fix D |
| `Push to <id> failed: …` for **one** id | That device's push service rejects it. Sev3. | Fix E |
| `Removed expired subscription <id>` | Normal: the device revoked permission | none |
| `Couldn't save …/.sent.json` / `Couldn't read …` | The service user can't write `push/`, or the disk is full | step 7 |
| `Notch reminder sender running, checking every 60s (N recent sends loaded).` and nothing after | It started and is either idle or hung | step 4 |
| a JS stack trace, then systemd `Main process exited` | It crashed at start (bad deploy, wrong Node version, `npm ci` not run) | Fix C |

**4. Running but silent: idle or hung?**
Prove it with a reminder you know is due. Set a task "Remind me at" two minutes from now on your own account, with reminders turned on, and wait three minutes.

- It arrives: the sender is fine. Go back to step 1 for the affected user.
- It doesn't arrive and the log shows nothing: the sender is probably **hung**. Collect evidence before restarting:
```bash
PID=$(systemctl show -p MainPID --value notch-push)
ps -o pid,etime,time,rss,cmd -p "$PID"          # TIME barely moving over a few minutes = stuck awaiting I/O
sudo ss -tnp | grep "pid=$PID,"                  # open TCP connections of the sender
```
A connection to `127.0.0.1:8090` that stays open while PocketBase is unhealthy means the sender is waiting on PocketBase (BE-6, step 5). A long-lived connection to a remote host on `:443` that isn't a push service means it's waiting on a push endpoint (BE-2, Fix F). Note the remote IP. **Don't** paste the full `ss` output anywhere public.

**5. PocketBase health (from the VM)**
```bash
curl -fsS -m 5 http://127.0.0.1:8090/api/health; echo " rc=$?"
systemctl status "$PB_UNIT" --no-pager           # PB_UNIT: see README "VM facts"
```
If it isn't healthy, the problem is PocketBase, not the sender. Restart PocketBase (`sudo systemctl restart "$PB_UNIT"`), then the sender.

**6. VM resources**
```bash
free -m; df -h /; uptime
journalctl -k --since "-1 day" --no-pager | grep -iE "out of memory|oom-kill" | tail
```
An OOM kill or a full disk takes down the sender, PocketBase, or both (SEC-6).

**7. Sent-log state**
```bash
ls -l ~/notch/push/.sent.json ~/notch/push/.sent.json.tmp 2>/dev/null
stat -c '%U %a %y' ~/notch/push ~/notch/push/.sent.json
```
- The file is a JSON object of `"<subId>|<message key>": <sent-at ms>`. Entries older than 2 days are dropped on load.
- It's written only after a tick that **sent** something. An old `mtime` alone doesn't prove the sender is stuck.
- If the file is corrupt, the sender silently starts with an empty log. Within a message's 15-minute window that can resend once, with the same tag, so the notification replaces the earlier one rather than stacking.
- Don't delete it to "fix" anything. If it's unreadable or corrupt, move it aside (`mv .sent.json .sent.json.bad-$(date +%s)`) and restart.

## Fix

Each of these changes production, so log it in `README.md` § Access log or in the incident's task.

**Fix A: settings.** Edit `~/notch/push/.env` on the VM only. Compare it against `push/.env.example` and check that all six keys are set. Then `chmod 600 ~/notch/push/.env`, make the service user its owner, and `sudo systemctl restart notch-push`. Never print the file. Use `grep -c '^VAPID_PRIVATE_KEY=.' push/.env` to check that a key is present.

**Fix B: restart (clears hangs, stale tokens and transient PocketBase errors).**
```bash
sudo systemctl restart notch-push
journalctl -u notch-push -n 5 --no-pager
```
This is safe at any time. `.sent.json` stops anything already sent from going out again. If the superuser password was changed, update `PB_PASSWORD` in `push/.env` first (Fix A).

**Fix C: crashed at start after a deploy.** Run `node --version` (needs ≥ 20.6), then `cd ~/notch && git status && git log -1 --oneline && npm ci --omit=dev`, then restart. If the new code is at fault, roll back to the previous SHA (`deploy-phase.md` § Rollback).

**Fix D: VAPID mismatch.** Compare only the first and last 6 characters of `VITE_VAPID_PUBLIC_KEY` in Netlify and `VAPID_PUBLIC_KEY` in `push/.env`. Put back whichever one was changed by mistake. If the key pair really did change, every device has to turn reminders on again.

**Fix E: one failing device.** Ask the user to turn reminders off and on again on that device (Settings). The sender deletes subscriptions that return 404 or 410 by itself.

**Fix F: a hung or hostile push endpoint (BE-2, SEC-1).** Until the send timeout and host allowlist ship, one subscription whose endpoint accepts a connection and never answers stalls **every** reminder after it in every tick.

1. Restart the sender (Fix B) to restore service at once. Expect it to hang again on the next send to that endpoint.
2. Find subscriptions whose endpoint is not a known push service. On a **backup copy**:
   ```bash
   sqlite3 -readonly <backup>/data.db "SELECT id, user, substr(endpoint, 1, 40) FROM push_subscriptions
     WHERE endpoint NOT LIKE 'https://fcm.googleapis.com/%'
       AND endpoint NOT LIKE 'https://web.push.apple.com/%'
       AND endpoint NOT LIKE 'https://updates.push.services.mozilla.com/%'
       AND endpoint NOT LIKE 'https://%.notify.windows.com/%';"
   ```
   Print only the first 40 characters: endpoints are capability URLs.
3. Delete each offending record in the admin UI (Collections → `push_subscriptions`). This is a deliberate admin-UI edit, so log who, what and why. If its `user` was created to abuse the endpoint, consider suspending that account and treat it as a Sev1 security incident (SEC-1).
4. Restart the sender again and repeat Diagnose step 4.

## Verify

- `systemctl status notch-push` is `active (running)`, and `NRestarts` doesn't climb over 10 minutes.
- A self-set task reminder two minutes ahead arrives on your phone.
- Optional, and with care: `cd ~/notch && npm run push:test` sends a test notification to **every subscribed device of every user**. Only use it when you are the only user with reminders on, or warn users first.

## Prevent / follow-up

- **BE-2:** a send timeout (about 10 s) and a per-host breaker in `push/sender.mjs`.
- **BE-1 / SEC-1:** a host allowlist in `guards.js` and in the sender.
- **BE-6:** a tick watchdog that exits on a stuck tick, so `Restart=always` recovers it.
- **BE-5:** re-authenticate when a call returns 401 or 403.
- **OPS-4:** a heartbeat ping after each tick to an external dead-man's switch (Healthchecks.io), which alerts the owner within 5 minutes of a stall. This runbook stops relying on "notice it by hand" once that exists.
- **BE-16:** structured logs, with one line per tick when anything was due.

## Update this runbook when

- `push/sender.mjs` log messages, auth, the sent-log format or the tick timing change;
- the `notch-push` unit, its user, its working directory or `push/.env` keys change;
- the push-host allowlist, the send timeout, the watchdog or the heartbeat ships (then simplify steps 4 and Fix F);
- a new push service host appears (update the query in Fix F).
