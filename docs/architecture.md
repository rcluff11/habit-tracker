# Architecture — Notch

**Lead author:** Architect. **Status:** descriptive (describes the code as it exists on branch `chore/adopt-agentic-mastery`, 2026-11-14). Draft pending the 9-agent consensus (AGENTS.md § 0 Step 4).

Notch ("Notch every win") is a single-tenant-per-user habit tracker and time-blocking calendar delivered as an installable PWA. Every record belongs to exactly one user; there is no sharing between users.

## 1. System overview

```
                         HTTPS (Netlify CDN)
  Phone / browser  ◄──────────────────────────────  Netlify: static SPA + sw.js + manifest
  (React SPA, PWA)                                  (netlify.toml, build: `npm run build` → dist/)
        │  ▲
        │  │ HTTPS REST (PocketBase JS SDK; realtime unused)
        ▼  │
  ┌──────────────────────── Google Cloud e2-micro VM (DuckDNS hostname) ────────────────────────┐
  │  PocketBase 0.41.0 (SQLite, pb_data/)                                                       │
  │    pb_migrations/  schema + API rules           pb_hooks/  server rules (guards.js)         │
  │        ▲                                                                                    │
  │        │ REST as a PocketBase *superuser* (PB_URL, default http://127.0.0.1:8090)           │
  │  push/sender.mjs (Node, systemd unit `notch-push`, tick every 60 s)                         │
  └────────┼────────────────────────────────────────────────────────────────────────────────────┘
           │ HTTPS POST, VAPID-signed, payload encrypted per subscription
           ▼
  Push service named by each subscription's `endpoint` (Apple / Google / Mozilla) ──► device ──► sw.js
```

Sources: `CLAUDE.md` (Stack), `netlify.toml`, `src/lib/pb.js`, `push/sender.mjs`, `push/README.md`, `push/.env.example`, `pocketbase/pocketbase.exe --version` (local binary).

## 2. Components

| Component | Where it runs | Code | Responsibility |
|---|---|---|---|
| SPA / PWA | Browser, served by Netlify (project `notchedweb`, per `CLAUDE.md`) | `src/`, `index.html`, `public/` | All UI. Talks to PocketBase directly with the JS SDK (`src/lib/pb.js`). Loads every owned collection in `src/lib/DataContext.jsx`. Derives all stats at render time (`src/lib/stats.js`). |
| Service worker | Browser | `public/sw.js` | Shows push notifications; focuses or opens the app on click. No caching / offline logic. |
| PocketBase | GCP e2-micro VM | `pocketbase/pb_migrations/*.js`, `pocketbase/pb_hooks/*.js` | Auth (users collection), storage (SQLite), REST API (realtime is available but unused — `contracts.md` § 1), collection API rules, server-side validation hooks. The authority for ownership, points, block times (`CLAUDE.md` principle 5). |
| Push sender | Same VM, systemd unit `notch-push` (`push/README.md` lines 111–134) | `push/sender.mjs`, plus shared `src/lib/{stats,time,reminders,messages,affirmations}.js` | Every 60 s: authenticates as a superuser, reads all subscriptions, users, blocks, tasks, recent completions, check-ins, courses, course steps; computes due reminders per device in its timezone; sends Web Push; records sends in `push/.sent.json`. |
| DNS | DuckDNS | none in repo | Hostname for the VM. Exact hostname: UNKNOWN — needs human confirmation. |
| TLS termination for the VM | UNKNOWN — needs human confirmation | none in repo | `CLAUDE.md` says "automatic HTTPS". Whether that is PocketBase's built-in autocert (`serve <domain>`) or a reverse proxy (e.g. Caddy) is not recorded in the repo. `push/.env.example` uses `PB_URL=http://127.0.0.1:8090`, which implies PocketBase listens on loopback 8090 behind something, but this is not confirmed. |

## 3. Data flow

1. **Sign-up / login.** `src/views/Auth.jsx` lines 18–25 creates a `users` record (public sign-up) and authenticates with email + password. The SDK keeps the auth token in the browser's `localStorage` (PocketBase JS SDK default `LocalAuthStore`; `src/lib/pb.js` sets no custom store).
2. **Reads / writes.** `src/lib/DataContext.jsx` lists each collection (`getFullList`) and writes with `create` / `update` / `delete`, always setting `user` to the signed-in id. PocketBase evaluates the collection API rules, then `pb_hooks/main.pb.js` runs `guards.check()` on create and update for the 11 collections in `GUARDED` (main.pb.js lines 3–6).
3. **Push subscription.** `src/lib/push.js` subscribes with `VITE_VAPID_PUBLIC_KEY` and saves `{user, subscription, timezone}` to `push_subscriptions`. `guards.js` lines 339–352 copies `subscription.endpoint` into `endpoint` and requires it to start with `https://`.
4. **Reminders.** `push/sender.mjs` `tick()` (lines 163–224) reads all data as superuser, builds messages with `src/lib/reminders.js`, and calls `webpush.sendNotification` (line 89) with payload `{title, body, url, tag}`. A 404/410 from the push service deletes the subscription (lines 96–99).
5. **Notification display.** `public/sw.js` shows `title`/`body` as plain notification text (lines 14–20) and, on click, opens `data.url` resolved against its own origin (lines 27–37). The sender only ever sets `url` to `/`, `/#home`, `/#calendar` or `/#tasks` (`src/lib/reminders.js` lines 142–275, `push/sender.mjs` line 243).
6. **Course / step delete.** `onRecordDelete` model hooks (main.pb.js lines 22–46) write derived dates onto linked tasks and blocks inside one transaction before the delete.

## 4. Trust boundaries

| # | Boundary | What crosses it | Enforcement in code | Notes |
|---|---|---|---|---|
| TB-1 | Browser → PocketBase (public internet, HTTPS) | Every API call | Collection API rules in migrations (owner-only list/view/delete; create pins `@request.body.user = @request.auth.id`; update forbids changing `user`) and `guards.check()` (same-owner relations, server-owned fields) | All client input is untrusted. The UI is never the only check (`CLAUDE.md` principle 5). The `users` collection's own API rules and auth options are **not** set by any migration; they live only in `pb_data` (see § 6). |
| TB-2 | Push sender → PocketBase | Superuser credentials, full data read | Superuser bypasses all API rules and `guards.check()` (`guards.js` line 199) | Most sensitive credential in the system. Stored only in `push/.env` on the VM (gitignored; `.gitignore` line 3 `.env` matches `push/.env`). |
| TB-3 | Push sender → push services | HTTPS POST to the stored `endpoint`, signed with the VAPID private key | `endpoint` must start with `https://` (`guards.js` line 348). **No host allowlist** — see review SEC-1. | User-controlled destination URL leaves the VM. |
| TB-4 | Netlify → browser | Static bundle, `sw.js`, manifest, `VITE_*` values (public by design) | `netlify.toml` sets only cache headers; **no security headers / CSP** | `VITE_VAPID_PUBLIC_KEY` and `VITE_PB_URL` are public. |
| TB-5 | Push service → service worker | Encrypted push payload | Only the VAPID private-key holder can send to a subscription created with `applicationServerKey` (`src/lib/push.js` line 50) | `sw.js` renders text only; click URL is not origin-checked (review SEC-4). |
| TB-6 | Admin → PocketBase admin UI (`/_/`) | Superuser login | UNKNOWN — needs human confirmation (exposure, MFA, IP restriction) | |

## 5. Identity and authorization model

- **End users:** PocketBase `users` auth collection, email + password (`src/views/Auth.jsx`). Sign-up is open to anyone who can reach the API (the client calls `users.create` without any invite). Email verification is not required by the client. Server-side password minimum, auth rate limits, MFA/OTP settings and the `users` API rules: UNKNOWN — needs human confirmation (not in migrations; stored in `pb_data`).
- **Ownership:** every non-`users` collection has a required `user` relation (cascade delete) and the rules `listRule/viewRule/deleteRule = "user = @request.auth.id"`, `createRule = "@request.auth.id != '' && @request.body.user = @request.auth.id"`, `updateRule = "user = @request.auth.id && (@request.body.user:isset = false || @request.body.user = @request.auth.id)"`. Sources: `1761100000_init_schema.js` lines 4–6 (categories, blocks, tasks, completions, rewards), `1761200000_push_subscriptions.js` lines 11–15, `1794300000_energy.js` lines 16–20 (checkins), `1794500000_plans_courses.js` lines 21–28 (plans, courses, course_steps, plan_targets). No later migration changes these rules.
- **Same-owner relations:** `guards.js` `RELATIONS` (lines 4–11) checks, on create and update, that every relation id belongs to the requesting user: blocks→categories, blocks→course_steps, tasks→categories/blocks/course_steps, completions→tasks, rewards→categories, plan_targets→plans/categories/tasks, course_steps→courses. `categories` has no relations and is not in `GUARDED`.
- **Server-owned fields:** `completions.points` (from the task, guards.js 333–337), `push_subscriptions.endpoint` (from the subscription, 339–352), normalised `users.remindBefore` / `users.nudgeTimes`, `courses.onEnd` default, stepped-task field clearing (206–212), target-kind field clearing (305–321).
- **Superuser:** bypasses every rule and hook (`guards.js` line 199). Used by the push sender and the admin UI.

## 6. Data classification

| Data | Where | Class |
|---|---|---|
| Email, name, password hash | `users` (PocketBase auth collection) | PII |
| Habits, calendar blocks, notes, plans, courses, energy check-ins | owned collections | Personal data; may reveal health/lifestyle information. Treated as confidential per-user. |
| Push subscription endpoint + keys, timezone | `push_subscriptions` | Device identifier (capability URL) + coarse location (IANA zone). Confidential. |
| VAPID private key, sender superuser password | `push/.env` on the VM only | Secret |
| VAPID public key, PocketBase URL | Netlify env `VITE_*` | Public |

Data residency commitments: none documented. VM region: UNKNOWN — needs human confirmation. Netlify CDN is global.

## 7. Failure modes

| Failure | Effect | Mitigation in code |
|---|---|---|
| VM down / PocketBase down | Whole app unusable (no offline mode; `sw.js` does not cache). Reminders stop. | None. Single VM is a single point of failure; no HA or SLO is claimed in the repo. |
| DuckDNS outage | Backend hostname unresolvable; app unusable. | None. |
| Sender crashes / restarts | Reminders pause; `push/.sent.json` prevents resends (sender.mjs 107–142); `Restart=always` in the documented unit. | Yes. |
| Phase-2 collections missing on server | Sender treats them as empty and keeps block/task reminders (sender.mjs 146–159). | Yes. |
| A push endpoint hangs | `send()` is awaited sequentially with no explicit timeout (sender.mjs 89–93, 205–212); one slow endpoint delays every later device in the tick. | No — see review SEC-6. |
| Very large account | Sender lists all users' blocks and tasks every minute (sender.mjs 169–179) on an e2-micro shared with PocketBase. | No per-user quotas. See review SEC-6. |
| `pb_data` loss | All user data lost. | Backups: UNKNOWN — needs human confirmation. |
| Netlify down | App shell unavailable to new loads. | None needed beyond Netlify's own. |

## 8. Scalability and cost shape

Sized for a handful of users. Netlify static hosting plus one always-on e2-micro VM; cost is flat per day, not per request. The sender does 8 queries per tick independent of user count but loads every user's blocks and tasks into memory each minute, so memory grows linearly with total data. PocketBase on SQLite is single-node by design.

## 9. Vendor lock-in and exit

| Vendor | Lock-in | Exit |
|---|---|---|
| PocketBase (self-hosted, open source, pre-1.0) | Low/medium: JS hooks and rule syntax are PocketBase-specific | SQLite file is portable; rules and hooks would need re-implementation. |
| Netlify | Low: static `dist/` + one SPA redirect + two header blocks | Any static host. |
| GCP e2-micro | Low: generic Linux VM | Any VM. |
| DuckDNS | Low, but on the critical path | Buy a domain and repoint. |
| Web Push services | Inherent to the platform | None needed. |

## 10. Unknowns needing human confirmation

VM firewall rules; whether PocketBase binds to loopback; how TLS is terminated; systemd service users (root or not) for PocketBase and `notch-push`; `push/.env` file mode on the VM; PocketBase version on the VM; admin UI exposure and superuser MFA; `users` collection API rules, password minimum, rate limits and email-verification settings in production; `pb_data` backups and restore test; VM region; whether the GitHub repo is public.

## Verification

Drafted by reading every migration in `pocketbase/pb_migrations/`, both files in `pocketbase/pb_hooks/`, `push/sender.mjs`, `push/README.md`, `push/.env.example`, `.env.example`, `public/sw.js`, `netlify.toml`, `index.html`, `src/lib/pb.js`, `src/lib/push.js`, grep of `src/` for auth and URL handling, and running `pocketbase/pocketbase.exe --version`. Nothing in `pb_data`, `node_modules` or any real `.env` was read.

## Update this doc when

- any file in `pocketbase/pb_migrations/` or `pocketbase/pb_hooks/` changes (rules, collections, guards);
- `push/sender.mjs`, `push/README.md` or `push/.env.example` changes;
- `public/sw.js`, `public/manifest.webmanifest`, `netlify.toml` or `index.html` changes;
- `src/lib/pb.js`, `src/lib/push.js` or `src/views/Auth.jsx` changes;
- the hosting, DNS, TLS, VM, or deploy topology changes, or any UNKNOWN above is confirmed.
