# 0001 — Foundational stack: React PWA on Netlify, PocketBase on a GCP VM, Node push sender

**Status:** accepted — recorded retroactively
**Date:** recorded 2026-11-14 (decision made during phase 1; original date UNKNOWN — needs human confirmation)
**Deciders:** `rcluff11` (sole DRI)

## Context

Notch is a personal habit tracker and time-blocking calendar for a small number of users, used mostly on phones. It needs accounts, per-user data that no other user can read, reminders that arrive when the app is closed, and low running cost. The original reasoning for each choice was not written down; what follows records what was built (`CLAUDE.md` Stack, `package.json`, `netlify.toml`, `push/README.md`) and marks the reasons that are not recorded.

## Decision

1. **Frontend:** React 19 + Vite, plain JS/JSX (no TypeScript), shipped as an installable PWA with a hand-written service worker (`public/sw.js`). Hosted on Netlify as static files (`netlify.toml`). Reason for React/Vite/Netlify/no-TypeScript: UNKNOWN — needs human confirmation.
2. **Backend:** a single self-hosted PocketBase binary (SQLite) providing auth, the REST API (realtime available, unused), collection API rules and JS hooks. Security is enforced with collection rules plus `pb_hooks/guards.js` (`CLAUDE.md` principle 5). Reason for PocketBase over alternatives: UNKNOWN — needs human confirmation.
3. **Hosting of the backend:** one Google Cloud e2-micro VM with a DuckDNS hostname and automatic HTTPS. Reason: UNKNOWN — needs human confirmation (e2-micro is commonly chosen for low or zero cost; not confirmed for this project).
4. **Reminders:** Web Push with VAPID, sent by a Node service (`push/sender.mjs`, `web-push`) on the same VM under systemd, polling every minute and logging in to PocketBase as a superuser. It reuses the app's own scheduling code (`src/lib/stats.js`, `reminders.js`) so the app and the reminders agree (`push/README.md`).

## Consequences

- **Positive:** one small VM plus static hosting gives a flat, low cost shape. Shared JS between app and sender keeps reminder timing and app display in sync. PocketBase gives auth and per-record rules without writing an API server.
- **Security:** the API is reachable directly from the internet, so collection rules and hooks are the only authorization layer (no API gateway). The push sender holds a superuser credential that bypasses all rules (`pb_hooks/guards.js` line 199), which makes `push/.env` on the VM the most sensitive secret. The `users` collection's rules and auth options are not in migrations and live only in `pb_data`. See `docs/reviews/chore-adopt-agentic-mastery/round-1-architect.md`.
- **Availability:** the VM is a single point of failure for the API, the database and reminders. No HA or SLO is claimed. Backups: UNKNOWN — needs human confirmation.
- **Lock-in:** low. SQLite data is portable; Netlify serves plain static files; the VM is generic Linux. PocketBase rule syntax and JS hooks would need re-implementation on another backend. PocketBase is pre-1.0, so upgrades can carry breaking changes.
- **Scale:** single-node SQLite and a sender that loads all users' data each minute suit a handful of users, not a public service at scale.

## Alternatives considered

UNKNOWN — needs human confirmation.
