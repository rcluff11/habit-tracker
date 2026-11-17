# Stack — Notch

**Lead author:** Architect. **Status:** descriptive, 2026-11-14. Draft pending the 9-agent consensus.

Versions come from `package.json` (declared semver ranges; resolved versions live in `package-lock.json`, which was not read) and from running `pocketbase/pocketbase.exe --version` locally. Reasons are recorded only where the repo states them; otherwise `UNKNOWN — needs human confirmation`.

## Runtime and languages

| Technology | Version | Where | Why chosen |
|---|---|---|---|
| JavaScript (ES modules, JSX), no TypeScript | n/a (`"type": "module"` in `package.json`) | `src/`, `push/`, `scripts/`, `pocketbase/pb_hooks/` | No TypeScript is a stated convention (`CLAUDE.md` Stack). Reason: UNKNOWN — needs human confirmation. |
| Node.js | ≥ 20.6 required on the VM (`push/README.md` line 100, needed for `--env-file`). Local dev machine: v24.21.0. VM version: UNKNOWN — needs human confirmation. | push sender, build, test scripts | `--env-file` support (`push/README.md`). |

## Frontend

| Technology | Version | Why chosen |
|---|---|---|
| React | `^19.3.1` (`react`, `react-dom`) | UNKNOWN — needs human confirmation |
| Vite | `^8.3.5` (dev) | UNKNOWN — needs human confirmation |
| @vitejs/plugin-react | `^6.1.2` (dev) | Required for JSX in Vite (`vite.config.js`). |
| PocketBase JS SDK | `pocketbase ^0.28.1` | Client for the PocketBase backend; also used by the push sender and test scripts. |
| PWA (manifest + hand-written service worker) | `public/manifest.webmanifest`, `public/sw.js` | Installable app and Web Push delivery, including iOS Home Screen apps (`push/README.md` "Phone notes"). |

## Backend

| Technology | Version | Why chosen |
|---|---|---|
| PocketBase (Go binary, SQLite) | 0.41.0 (local `pocketbase/pocketbase.exe`). Production VM version: UNKNOWN — needs human confirmation. The binary is gitignored (`.gitignore`), so the version is not pinned in the repo. | UNKNOWN — needs human confirmation. Observable fit: auth, API rules and JS hooks in one self-hosted binary (realtime is also included but unused). |
| PocketBase JS hooks (JSVM) | bundled with PocketBase | Server-side rules (`pocketbase/pb_hooks/`). |
| SQLite | bundled with PocketBase | Storage in `pocketbase/pb_data/` (gitignored). |
| web-push | `^3.6.7` | VAPID signing and payload encryption for Web Push in `push/sender.mjs`. |

## Hosting and services

| Service | Use | Config in repo | Why chosen |
|---|---|---|---|
| Netlify | Static hosting of `dist/`, SPA redirect, env vars `VITE_PB_URL`, `VITE_VAPID_PUBLIC_KEY` | `netlify.toml` | UNKNOWN — needs human confirmation |
| Google Cloud Compute Engine e2-micro VM | Runs PocketBase and the push sender (systemd) | none (setup guide in `push/README.md`) | UNKNOWN — needs human confirmation |
| DuckDNS | Hostname for the VM | none | UNKNOWN — needs human confirmation |
| TLS for the VM ("automatic HTTPS", `CLAUDE.md`) | HTTPS to PocketBase | none | Mechanism UNKNOWN — needs human confirmation |
| Web Push services (Apple, Google, Mozilla) | Notification delivery | none | Platform standard for PWA notifications. |
| GitHub (`rcluff11/habit-tracker`) + GitHub Actions | Source control; `procedure-checks` workflow | `.github/workflows/checks.yml` | Starter default (`AGENTS.md` § 7). The workflow runs the starter's procedure checks; it does not run `npm run test:*`. |

## Test tooling

Plain Node scripts, no framework: `scripts/api-test.mjs`, `scripts/reminders-test.mjs`, `scripts/stats-test.mjs`, `scripts/t3-energy-attack.mjs`, `scripts/t4-nudges-attack.mjs`, `scripts/t5-courses-attack.mjs` (`package.json` scripts; `CLAUDE.md` Commands).

## Dependency health (2026-11-14)

`npm audit --omit=dev` and `npm audit`: 0 vulnerabilities. No SBOM is generated. No automated dependency update tool is configured in `.github/`.

## Verification

Read `package.json`, `vite.config.js`, `netlify.toml`, `.gitignore`, `push/README.md`, `.github/workflows/checks.yml`; ran `pocketbase/pocketbase.exe --version`, `node --version`, `npm audit --omit=dev`, `npm audit`.

## Update this doc when

`package.json` dependencies change; the PocketBase binary is upgraded (locally or on the VM); `netlify.toml`, `vite.config.js` or `.github/workflows/` change; a hosting, DNS or TLS provider changes; or a reason marked UNKNOWN is confirmed.
