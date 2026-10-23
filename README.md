# Dayline — habit tracker + calendar

A "life operating system": time-blocked calendar, to-do list, daily habits and
personal rewards in one place. React (Vite) frontend, PocketBase backend,
deployed on Netlify.

## Features (MVP)

- **Home** — greeting, daily affirmation, today's top 3 (★ tasks), next 3 hours, today's progress ring, weekly % and points to your next reward.
- **Calendar** — day/week views on a 15-minute grid. Click or drag to create a block; name it, pick a category, a palette color or any hex code, and repeat it daily / weekdays / weekly (with an optional end date). Blocks can be checked off right on the calendar.
- **To-do** — tasks that live on a calendar block (e.g. Gym), daily habits (e.g. Stretching), or one-off to-dos with optional due dates. Point values, categories, and ★ priority.
- **Progress** — weekly % complete, points earned, daily chart, points by category ("crushing fitness, neglecting relationships"), and rewards by points (optionally per category) or by % complete.
- **Settings** — name, color palettes (presets + custom hex palette), categories.

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

If `pocketbase/pocketbase.exe` is missing, download the Windows build from
https://github.com/pocketbase/pocketbase/releases (v0.40.x) into `pocketbase/`.

The database schema lives in `pocketbase/pb_migrations/` and is applied automatically on start.

## Deploying

Netlify only hosts static files, so PocketBase needs its own server:

1. **Host PocketBase** — e.g. [PocketHost](https://pockethost.io) (easiest), Fly.io, Railway, or any small VPS.
   Upload the `pb_migrations` folder with it so the schema is created.
2. **Deploy the frontend to Netlify** — connect the repo (build settings come from `netlify.toml`)
   and add an environment variable `VITE_PB_URL` = your PocketBase URL (e.g. `https://dayline.pockethost.io`).
   Or from the CLI: `npx netlify-cli deploy --prod` after `npm run build`.

## Project layout

```
src/
  lib/          pb client, DataContext (loads + saves records), stats (scheduling + weekly math), time, colors
  components/   Modal, ColorPicker, TaskItem, TaskEditor, BlockEditor, CategoryChip
  views/        Home, Calendar, Tasks, Progress, Settings, Auth
pocketbase/pb_migrations/   database schema
docs/           task briefs used for the Codex collaboration
```

## Roadmap (phase 2)

- Notifications (calendar reminders with adjustable frequency, progress nudges, affirmations) — needs a PWA service worker + push
- Monthly plans / week-long "courses" (e.g. Week 1: wake by 8, walk 20 min; Week 2: add gym)
- Energy check-in (high / normal / low) with task suggestions
- End-of-day score card
- Phone/desktop widget for "next 3 hours"
