# Push reminders

Notch sends notifications before calendar blocks, at tasks' "remind me at" times, and (if turned on) a daily
affirmation, progress nudges and a day-end score, even when the app is closed.

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

**Daily messages** (Settings → Notifications). All are **off by default**; turning them on is per account,
and every device with reminders on gets them.

| Message | Field | Default | When | Example |
|---|---|---|---|---|
| Affirmation | `users.affirmationAt` (`HH:MM`) | `""` = off | at that time | **Today's affirmation**: one line, the same all day |
| Progress nudges | `users.nudgeTimes` (minutes since midnight) | `[]` = off | at each time before "day ends at", only on days with tasks | **2 of 5 done**: what's left and the next task |
| Day-end score | `users.dayEndPush` (bool), at `users.dayEndAt` | `false` (day ends `21:00` if blank) | at day end, only on days with tasks | **Your day**: score headline, then a celebration line on a complete day or a line for tomorrow otherwise |

- Nudges: at most **6** times a day, each on a **15-minute** step (presets Light 6 PM, Regular 12 PM + 6 PM,
  Frequent 10 AM + 2 PM + 6 PM). The server rejects anything else.
- Once everything is done, the next nudge time sends one "All done!" celebration instead, and later nudge
  times that day send nothing.
- No tasks scheduled that day: no nudge and no day-end push.
- Progress counts the same tasks Home shows: block tasks, daily habits, and open or due one-offs. A one-off
  finished on an earlier day doesn't count as open.
- All three open Home (`/#home`) and replace the previous notification of the same kind (tags
  `affirmation`, `nudge`, `dayend`).

**Course windows.** Habits and repeating blocks linked to a course step (`tasks.step`, `blocks.step`) only
run inside their window, from `activeWindow` in [`src/lib/stats.js`](../src/lib/stats.js), the same rule
the app uses:

- **Start:** the step's week, `course.startDate + (week − 1) × 7`. Nothing is reminded or counted before it.
- **End:** for a course with `onEnd = stop`, the last day of its highest week,
  `course.startDate + maxWeek × 7 − 1`. A block's own `recurUntil` ends it sooner if earlier. With
  `onEnd = keep` there's no end, and the habit or block carries on after the course.
- Outside the window a stepped item gets no reminder, and isn't counted in nudges or the day-end score, so a
  day whose only habit is next week's gets no nudge and no day-end push. Tasks on a stepped block follow the
  block.
- When a course or step is deleted, PocketBase writes the dates onto its habits and blocks
  (`date`, and `recurUntil` for `stop` courses), so they keep the same window without the course.

**Timing rules** (all in [`src/lib/reminders.js`](../src/lib/reminders.js), tested by `npm run test:reminders`):

- Each reminder goes out once per device, item, day and offset; each daily message once per device, kind,
  day (and nudge time), even across sender restarts (see `push/.sent.json` below).
- A nudge's "Next:" suggestion is always something still doable: a task on a block that has already
  ended today is never suggested.
- Daily messages are due for 15 minutes from their time, never past local midnight (nudges also stop at
  "day ends at"), and use the device's local date, so the affirmation changes at the user's midnight.
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

**Always restart the sender after deploying.** It loads `src/lib` once at start, so new message kinds
or timing rules only take effect after `sudo systemctl restart notch-push`. For the daily messages and
course windows, deploy the new `pb_migrations` and `pb_hooks` and restart PocketBase first (the `users`
fields and the `checkins`, `courses` and `course_steps` collections must exist), then restart the sender.
If those collections are missing, the sender logs a warning once and carries on without check-ins or course windows (block and task reminders still go out); restart it after PocketBase has applied the migrations.

Each tick makes eight queries, however many users and devices there are: subscriptions, then users, blocks,
tasks, completions, check-ins, courses and course steps in parallel. Completions are the last two days plus
every completion of a one-off task (`task.daily = false && task.block = ''`); check-ins are the last two
days; courses and steps are all of them (only `id, user, startDate, onEnd` and `id, user, course, week`),
because a course's end comes from its highest week. Each user's completion index and course schedule
(`scheduleIndex`) are built once per tick and shared by all their devices.

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

- What was sent is saved to `push/.sent.json` (or the path in `SENT_LOG`) after each tick that sends
  something, and loaded at start, so a restart doesn't resend a reminder or daily message. The service
  user must be able to write to `push/`. If the file can't be written, the sender logs a warning and
  keeps running; then a restart within a message's 15-minute window can resend it (same tag, so it
  replaces the earlier notification rather than stacking). If the sender crashes between sending and
  saving, that tick's messages may also go out again.
- A block starting in the hour skipped when clocks spring forward (e.g. 2:30am) gets no reminder that night.
- On the spring-forward day, affirmations and nudges set between 02:00 and 02:59 local time don't fire.
