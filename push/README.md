# Push reminders

Notch sends notifications before calendar blocks and at tasks' "remind me at" times, even when the app is closed.

```
Phone/browser ──(Turn on reminders)──► PocketBase  push_subscriptions
                                            ▲
push/sender.mjs (every minute) ─────────────┘ reads blocks, tasks, completions, users,
        │                                     works out each user's local time
        └──► Apple / Google / Mozilla push service ──► notification on the device
```

## What gets sent

**Blocks.** Each block reminds at a set of times before it starts: at start, 5, 10, 15, 30 or 60 minutes.

| Where | Field | Meaning |
|---|---|---|
| Settings → Default block reminders | `users.remindBefore` | e.g. `[10]` (new accounts) |
| Block editor → Reminders | `blocks.remindBefore` | `null` = use my default, `[]` = none, or e.g. `[60, 10]` |

The notification is the block's name with the real time left and that day's unfinished tasks in the
block, e.g. **Gym**: "Starts in 10 min · To do: Squats, Protein shake". Other wording: "Starting now",
"Starts in 1 hour", "Starts in 1 hr 15 min".

**Tasks.** Daily and one-off tasks can have a "Remind me at" time (`tasks.remindAt`, `HH:MM`):

- Daily tasks: every day (from their start date) unless already checked off that day.
- One-off tasks: on their due date, or on `tasks.remindDate` if they have no due date (blank = today when saved), unless already done.
- Tasks attached to a block don't get their own reminder; they're listed in the block's reminder.

The notification reads **Don't forget: Stretching**, "Worth 5 points. Tap to check it off."

**Timing rules** (all in [`src/lib/reminders.js`](../src/lib/reminders.js), tested by `npm run test:reminders`):

- Each reminder goes out once per device, item, day and offset.
- If several of a block's reminder times have already passed (e.g. the sender was down), only the closest one is sent.
- Nothing arrives late: block reminders expire at the block's start ("Starting now" gets one minute), task
  reminders 15 minutes after their time. The push `TTL` is set so the push service drops them after that too.
- Times use each device's timezone, refreshed whenever Notch opens; blocks just after midnight are reminded
  the evening before.

## One-time setup

1. **Generate a VAPID key pair** (identifies your server to push services). Do this once and keep it;
   changing it later means every device has to turn reminders on again.

   ```bash
   npx web-push generate-vapid-keys
   ```

2. **Netlify:** add environment variable `VITE_VAPID_PUBLIC_KEY` = the *public* key, then redeploy.
   (The public key is safe to expose. Never put the private key in Netlify.)

3. **PocketBase server:** deploy `pb_migrations` and `pb_hooks` and restart PocketBase so the
   `push_subscriptions` collection exists. Create a dedicated superuser for the sender in the
   PocketBase admin UI (or `./pocketbase superuser upsert sender@yourdomain.com <password>`).

## Running the sender on the Google Cloud VM

Needs Node.js 20.6 or newer (`node --version`).

```bash
git clone https://github.com/rcluff11/habit-tracker.git notch && cd notch
npm ci --omit=dev
cp push/.env.example push/.env
nano push/.env          # fill in PB_URL, PB_EMAIL, PB_PASSWORD, VAPID_* (private key goes here only)
chmod 600 push/.env
npm run push:test       # sends a test notification to every subscribed device
```

Keep it running with systemd. Create `/etc/systemd/system/notch-push.service`
(replace `YOUR_USER` and the path):

```ini
[Unit]
Description=Notch push reminder sender
After=network-online.target

[Service]
User=YOUR_USER
WorkingDirectory=/home/YOUR_USER/notch
ExecStart=/usr/bin/node --env-file=push/.env push/sender.mjs
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now notch-push
journalctl -u notch-push -f     # watch the logs
```

To update later: `git pull && npm ci --omit=dev && sudo systemctl restart notch-push`.

## Local development

`push/.env` and `.env.local` (both git-ignored) hold local keys. With PocketBase running:

```powershell
npm run push:sender   # run the sender
npm run push:test     # send a test notification
```

Push works on `http://localhost`, but on a phone it needs the real HTTPS site.

## Phone notes

- **iPhone / iPad (iOS 16.4+):** open the site in Safari → Share → **Add to Home Screen**, open Notch
  from the Home Screen, then Settings → **Turn on reminders**. Safari tabs can't receive push.
- **Android:** works in Chrome directly; installing (menu → Install app) is optional.
- Reminders are per device: turn them on on each phone/computer. Logging out turns them off on that device.
- A reminder that can't be delivered before its block starts is dropped rather than arriving late.
- Each device's timezone is refreshed whenever Notch opens, so reminders follow you when you travel.

## Known limitations

- If the sender restarts shortly before a block or task reminder, that reminder may be sent again. It
  replaces the earlier notification (same tag) rather than stacking a second one.
- A block starting in the hour skipped when clocks spring forward (e.g. 2:30am) gets no reminder that night.
