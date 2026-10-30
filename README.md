# Notch

**Notch every win.**

Habit tracker + calendar

A "life operating system": time-blocked calendar, to-do list, daily habits and
personal rewards in one place. React (Vite) frontend, PocketBase backend,
installable as a PWA with push reminders.

## Status

**Done**

- [x] PocketBase schema, data layer, and server-side security rules (ownership checks, server-side points, valid block times)
- [x] Accounts — sign up / log in, with saved logins validated on startup
- [x] Home, Calendar, To-do, Progress and Settings views
- [x] Sunrise color theme with automatic dark mode
- [x] Installable PWA (home-screen icon, works on iPhone and Android)
- [x] Push reminders before calendar blocks and at task "remind me at" times, even when the app is closed
- [x] Per-item reminder settings (default per account, override per block)
- [x] Mobile layout fixes for the date/repeat fields
- [x] 15-minute blocks fully supported
- [x] Automated tests for database rules and reminder timing
- [x] Deployed: frontend on Netlify, PocketBase + push sender on a Google Cloud VM

**Up next** — see [Roadmap](#roadmap-phase-2)

## Features

- **Home** — greeting, daily affirmation, today's top 3 (★ tasks), next 3 hours, today's progress ring, weekly % and points to your next reward.
- **Calendar** — day/week views on a 15-minute grid. Click or drag to create a block; name it, pick a category, a palette color or any hex code, and repeat it daily / weekdays / weekly (with an optional end date). Blocks can be checked off right on the calendar, and each block can have its own reminders.
- **To-do** — tasks that live on a calendar block (e.g. Gym), daily habits (e.g. Stretching), or one-off to-dos with optional due dates. Point values, categories, ★ priority, and an optional "remind me at" time.
- **Progress** — weekly % complete, points earned, daily chart, points by category ("crushing fitness, neglecting relationships"), and rewards by points (optionally per category) or by % complete.
- **Reminders** — push notifications at start, 5, 10, 15, 30 or 60 minutes before a block (listing that block's unfinished tasks), plus task reminders. Late reminders are dropped instead of arriving after the fact. Details in [`push/README.md`](push/README.md).
- **Settings** — name, color palettes (presets + custom hex palette), categories, default block reminders, and turning reminders on/off per device.

## Local development

You need two terminals.

```powershell
# 1. Database (first run creates pocketbase/pb_data and applies migrations)
npm run pb
#    Admin UI: http://127.0.0.1:8090/_/

# 2. Frontend
npm run dev
#    App: http://localhost:5173
```

Copy `.env.example` to `.env.local` and fill in `VITE_PB_URL` (and `VITE_VAPID_PUBLIC_KEY` if you're testing reminders).

If `pocketbase/pocketbase.exe` is missing, download the Windows build (v0.41.x) into `pocketbase/`.
PocketBase releases are moving from GitHub to https://ganigeorgiev.com/pocketbase; older
versions remain at https://github.com/pocketbase/pocketbase/releases.

The database schema lives in `pocketbase/pb_migrations/` and is applied automatically on start.
Security rules live in `pocketbase/pb_hooks/`.
**Both folders must sit next to `pocketbase.exe`.** If you add or restore them while PocketBase is
running, restart it so the hooks load.

To test push reminders locally (PocketBase must be running):

```powershell
npm run push:sender   # run the reminder sender
npm run push:test     # send a test notification to every subscribed device
```

### Tests

```powershell
npm run test:api         # database rules + hooks (PocketBase must be running)
npm run test:reminders   # reminder timing rules (no server needed)
```

## Deployment

Netlify only hosts static files, so the backend runs on its own server.

- **Backend** — PocketBase on a Google Cloud Compute Engine VM (free-tier e2-micro) behind a DuckDNS subdomain.
  Upload `pb_migrations` and `pb_hooks` with it (schema + security rules).
- **Reminder sender** — `push/sender.mjs` runs on the same VM as a systemd service and checks every minute
  for reminders to send. Setup steps are in [`push/README.md`](push/README.md).
- **Frontend** — Netlify (build settings come from `netlify.toml`). Environment variables:
  - `VITE_PB_URL` — the PocketBase URL
  - `VITE_VAPID_PUBLIC_KEY` — the public push key (the private key only ever lives on the VM)

## Project layout

```
src/
  lib/          pb client, DataContext (loads + saves records), stats (scheduling + weekly math),
                reminders (shared timing rules), push (device subscriptions), time, colors
  components/   Modal, ColorPicker, OffsetPicker, TaskItem, TaskEditor, BlockEditor, CategoryChip
  views/        Home, Calendar, Tasks, Progress, Settings, Auth
public/         PWA manifest, service worker, app icons
pocketbase/
  pb_migrations/   database schema
  pb_hooks/        server-side security rules
push/           reminder sender (runs on the server) + setup guide
scripts/        API and reminder tests
docs/           task briefs used for the Codex collaboration
```

## Roadmap (phase 2)

- Progress nudges and daily affirmation notifications (with adjustable frequency)
- Monthly plans / week-long "courses" (e.g. Week 1: wake by 8, walk 20 min; Week 2: add gym)
- Energy check-in (high / normal / low) with task suggestions
- End-of-day score card
- Phone/desktop widget for "next 3 hours"
