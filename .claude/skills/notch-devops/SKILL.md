---
name: notch-devops
description: "[devops] Notch environments, deploy order, CI, secrets and rollback."
user-invocable: false
---
# Notch — DevOps checklist

## Environments
- **Local:** `npm run pb` (PocketBase on :8090) and `npm run dev` (Vite on :5173).
- **Production frontend:** Netlify project `notchedweb`, built from `netlify.toml` and deployed on push.
- **Production backend:** a Google Cloud e2-micro VM behind a DuckDNS subdomain with automatic HTTPS. It runs PocketBase (systemd) and `notch-push` (systemd, `push/sender.mjs`). Setup guide: `push/`.

## Deploy order (never reorder)
1. Copy `pb_migrations` and `pb_hooks` to the VM, then restart PocketBase. Migrations apply on start.
2. `sudo systemctl restart notch-push`.
3. Push to GitHub, which triggers the Netlify deploy.
The owner deploys phase work **once at the end**, as a single push and restart.

## Check
- [ ] Rollback: each migration has a working `down`, and a `pb_data` backup is taken before every deploy. Netlify rollback is "publish previous deploy".
- [ ] Secrets: `VITE_PB_URL` and `VITE_VAPID_PUBLIC_KEY` are public. The VAPID private key and the superuser login live only in `push/.env` on the VM. Nothing secret goes in git, chat or screenshots.
- [ ] CI (`.github/workflows/checks.yml`) runs the starter's procedure checks **and** the app job: `npm ci`, `npm run build`, `test:stats`, `test:reminders`, and `test:api` plus the attack scripts against a pinned, checksummed PocketBase.
- [ ] Hooks are installed (`sh scripts/setup-hooks.sh`), and branch protection plus required checks are set on `main` (`ADOPTING.md` § 5).
- [ ] Observability: the systemd journal on the VM. Note any gap, such as no alerts on sender failure or no uptime check.
