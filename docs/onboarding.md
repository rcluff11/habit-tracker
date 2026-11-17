# Onboarding — your first day on Notch

**Status:** in review on `chore/adopt-agentic-mastery` (T-001.15). Descriptive: it covers what exists in the repo today.
**Owner:** Analyst. **DRI:** rcluff11 (`.github/CODEOWNERS`).

Notch ("Notch every win") is a habit tracker and time-blocking calendar delivered as an installable PWA (`CLAUDE.md`, `index.html`). It's one repo with three runnable parts:

| Part | Where | Runs on (production) |
|------|-------|----------------------|
| Frontend (React 19 + Vite, plain JSX) | `src/`, `public/`, `index.html`, `vite.config.js` | Netlify, built from `netlify.toml` |
| Backend (PocketBase, SQLite) | `pocketbase/pb_migrations/`, `pocketbase/pb_hooks/` | Google Cloud e2-micro VM behind a DuckDNS subdomain |
| Push sender (Node, `web-push`) | `push/sender.mjs` | The same VM, under systemd (`notch-push`) |

There is one human on the project today, rcluff11, who is the DRI for every path and approves every plan before code is written (`.github/CODEOWNERS`; `CLAUDE.md` "Working with the agents").

## 1. Prerequisites

| Need | Version | Source |
|------|---------|--------|
| Node.js + npm | `UNKNOWN — needs human confirmation`. `package.json` has no `engines` field. The scripts `push:sender` and `push:test` use `node --env-file=…`, so pick a Node release that supports that flag. | `package.json` |
| PocketBase | The README says to download the Windows build, v0.41.x, into `pocketbase/`. The exact version running on the VM is `UNKNOWN — needs human confirmation`. | `README.md` § Local development |
| Git + a POSIX `sh` | Needed for `scripts/setup-hooks.sh` and the hooks in `.githooks/`. On Windows, Git Bash works. | `scripts/setup-hooks.sh` |
| OS | `npm run pb` runs `pocketbase.exe`, so the script works on Windows only as written. On macOS or Linux, run `./pocketbase serve` from `pocketbase/` yourself (`.gitignore` already ignores `pocketbase/pocketbase`). | `package.json` `pb` script, `.gitignore` |

The PocketBase binary, `pocketbase/pb_data/`, `node_modules/` and `dist/` are not in git (`.gitignore`).

## 2. Set up and run locally

You need two terminals.

```sh
git clone <repo URL>                 # the GitHub remote; URL: UNKNOWN — needs human confirmation
cd "Habit Tracker"
npm install                          # react, react-dom, pocketbase, web-push; vite + @vitejs/plugin-react (dev)
sh scripts/setup-hooks.sh            # once per clone: sets core.hooksPath=.githooks

# Terminal 1 — database (the first run creates pocketbase/pb_data and applies every migration)
npm run pb                           # Admin UI: http://127.0.0.1:8090/_/

# Terminal 2 — frontend
npm run dev                          # App: http://localhost:5173
```

`pb_migrations/` and `pb_hooks/` must sit next to the PocketBase binary. If you add or change them while PocketBase is running, restart it so they load (`README.md`; `CLAUDE.md` § Schema changes).

### Frontend environment variables

Copy `.env.example` to `.env.local` (`README.md` § Local development). The frontend reads only these two:

| Name | Read in | If it's missing |
|------|---------|-----------------|
| `VITE_PB_URL` | `src/lib/pb.js` line 3 | Falls back to `http://127.0.0.1:8090` |
| `VITE_VAPID_PUBLIC_KEY` | `src/lib/push.js` line 3 | Push sign-up on a device won't work; only needed to test reminders |

The push sender has its own settings in `push/.env` (template: `push/.env.example`). It holds the private VAPID key and a PocketBase superuser login, and lives only on the VM. See `push/README.md`. **Never commit or paste `.env`, `.env.local` or `push/.env`,** and agents never read them (`CLAUDE.md` § Stack).

## 3. Tests

| Command | What it checks | Needs PocketBase running? | Run it after changing |
|---------|----------------|---------------------------|-----------------------|
| `npm run test:api` | Collection rules and `pb_hooks` (ownership, valid values) | Yes (`VITE_PB_URL` or `http://127.0.0.1:8090`) | migrations or hooks |
| `npm run test:stats` | Scheduling and stats helpers in `src/lib/stats.js` and `time.js` | No | `stats.js`, `time.js` |
| `npm run test:reminders` | Reminder and daily-message timing (`reminders.js`, `messages.js`) | No | `reminders.js`, `messages.js`, `push/sender.mjs` |
| `npm run build` | The Vite production build | No | anything in `src/` or `public/` |
| `node scripts/t3-energy-attack.mjs`, `node scripts/t4-nudges-attack.mjs`, `node scripts/t5-courses-attack.mjs` | Reviewer attack checks | t4 and t5: yes (t4 skips its server part if PocketBase isn't up) | the matching feature |
| `npm run push:test` | Sends a test push to subscribed devices | Yes, and `push/.env` | the sender (VM only) |

Source: `package.json` scripts and `CLAUDE.md` § Commands. Test strategy and coverage live in `testing.md`.

On 2026-11-14, `npm run test:stats` printed `211/211 passed` and `npm run test:reminders` printed `All reminder checks passed`. The CI workflow (`.github/workflows/checks.yml`) runs the process checks only; it doesn't run these app suites, so run them yourself before every pull request.

## 4. How work flows (`AGENTS.md` § 7)

1. **Open or update a task** in `tasks/T-NNN.md`. Copy `tasks/_TEMPLATE.md` for a new one and take the next free ID (see `tasks/INDEX.md`).
2. **Branch from `main`.** Never commit to `main` directly; the pre-commit hook blocks it. Branch names:
   - `feat/<short-name>` — new features
   - `fix/<short-name>` — bug fixes
   - `chore/<short-name>` — infra, docs, process
   - `refactor/<short-name>` — restructuring without behaviour change
3. **Plan, then review the plan** with the agents (`/build` runs this flow; `/review` runs the 3-round review). The DRI approves the reviewed plan before any code is written, and the approval is recorded in the task's activity log (`tasks/README.md#plan-approval`).
4. **Build, review the build, test, and run the regression-safety check** against `contracts.md`.
5. **Commit.** Every commit message must contain a task ID such as `T-042` or `T-042.3`; the `commit-msg` hook rejects it otherwise. A commit that touches `/docs/*` also needs the line `unanimous-consensus: T-NNN`. The hooks also scan for secrets and unreplaced starter placeholders.
6. **Push and open a pull request** with `.github/pull_request_template.md`, linking the review artifact in `docs/reviews/<branch>/`. CI must pass and the CODEOWNER (rcluff11) approves.

Notch-specific rules on top of `AGENTS.md`:
- **Schema changes:** never edit an existing migration. Add a new timestamped file in `pocketbase/pb_migrations/` with both up and down (`CLAUDE.md` § Schema changes).
- **Shared rules change together:** `REMINDER_OPTIONS`, `NUDGE_STEP`, `MAX_NUDGES`, `EARLIEST_DAY_END`, the course-window maths, `ENERGY_LEVELS`, `EFFORT_LEVELS` and the target kinds exist in both `src/lib/` and `pocketbase/pb_hooks/guards.js` (`CLAUDE.md` principle 6).
- **Deploy order:** migrations and hooks to the VM and restart PocketBase first, then restart the sender (`sudo systemctl restart notch-push`), then the Netlify deploy goes out from the push (`CLAUDE.md` § Commands). The owner deploys a phase once, at the end, not feature by feature. Details: `deployment.md`.
- **Learning requests:** when the owner asks to *learn* something, explain and give hints rather than writing the full implementation (`CLAUDE.md`).

## 5. Read next, in this order

1. `AGENTS.md` — the process, the 9 agents, the hard gates.
2. `CLAUDE.md` — stack, layout, data model, the six principles.
3. `docs/README.md` — the index of this folder.
4. `docs/glossary.md` — the words (block, habit, stepped item, active window…).
5. `docs/architecture.md`, `docs/stack.md`, `docs/data-model.md`, `docs/domain.md`.
6. `docs/contracts.md` — read before you change anything.
7. `docs/testing.md`, `docs/deployment.md`, `docs/ux.md`, `docs/ownership.md`.
8. `tasks/INDEX.md` — what's in flight.
9. `plan.md` — the phase 2 design record (requirements FR-1 to FR-22, decisions D-1 to D-16).

## 6. A safe first pull request

`UNKNOWN — needs human confirmation`: no starter task has been chosen yet. Good candidates are the docs-only follow-ups raised in `docs/reviews/chore-adopt-agentic-mastery/round-1-analyst.md`.

## 7. Who to ask

rcluff11 for everything (the only human; `.github/CODEOWNERS`). Communication channels beyond GitHub: `UNKNOWN — needs human confirmation`.

---
**How this was verified:** each command was checked against `package.json` scripts; env var names against `src/lib/pb.js` and `src/lib/push.js`; the hook rules against `.githooks/commit-msg` and `.githooks/pre-commit`; CI steps against `.github/workflows/checks.yml`; `test:stats` and `test:reminders` were run on 2026-11-14.

*Update this doc when:* `package.json` scripts or dependencies change; `.env.example`, `src/lib/pb.js` or `src/lib/push.js` change which env vars are read; `.githooks/*`, `scripts/setup-hooks.sh` or `.github/workflows/*` change; `AGENTS.md` § 7 changes; or a new test script is added to `scripts/`.
