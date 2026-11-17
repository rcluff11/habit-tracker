## Architect Review — chore/adopt-agentic-mastery (Round 1, Analysis)

**Scope:** Tier 1 docs bootstrap (Architect drafts) plus a full security review of the existing Notch app as it stands on this branch (phase 1 deployed, phase 2 built and not deployed). Review and document only; no app code changed.

**Verdict:** BLOCK (one BLOCKER, SEC-1; see sign-off)
**Security posture:** same — this branch adds process files and docs only and does not change app code. The existing app has one exploitable-now issue and several defence-in-depth gaps listed below.
**Threat model delta:** none from this branch. Baseline threat model recorded in `docs/architecture.md` §§ 4–7 (first time it is written down).
**Architectural Decision Record needed?** yes — `docs/decisions/0001-foundational-stack.md` (drafted, retroactive). A further ADR is needed if SEC-2 is resolved by accepting the superuser sender rather than scoping it.

### Method

Read all 7 migrations in `pocketbase/pb_migrations/`, `pocketbase/pb_hooks/main.pb.js`, `pocketbase/pb_hooks/guards.js`, `push/sender.mjs`, `push/README.md`, `push/.env.example`, `.env.example`, `public/sw.js`, `public/manifest.webmanifest`, `netlify.toml`, `index.html`, `.gitignore`, `src/lib/pb.js`, `src/lib/push.js`, and the auth/logout lines of `src/views/Auth.jsx` and `src/views/Settings.jsx`. Grepped `src/` and `public/` for `dangerouslySetInnerHTML|innerHTML|outerHTML|insertAdjacentHTML|document.write|eval(|new Function|href={|window.open|location.*` (no matches) and for `localStorage` (only `src/views/Home.jsx` 53/61, a dismiss date). Grepped `src/lib/reminders.js` for notification `url` values. Commands run: `git check-ignore -v push/.env .env .env.local`, `git log --all --name-status -- push/.env .env .env.local push/.env.example .env.example`, `git log --all -p | grep` for VAPID private keys / passwords / PEM blocks, `npm audit --omit=dev`, `npm audit`, `pocketbase/pocketbase.exe --version` (0.41.0). Cross-checked existing cross-user tests in `scripts/api-test.mjs` and `scripts/t5-courses-attack.mjs`. Did not read `pb_data`, `node_modules`, `package-lock.json` or any real `.env`, and did not touch the VM.

### Checklist results

| Item | Result | Evidence |
|---|---|---|
| Every collection's create rule pins `user = @request.auth.id`; list/view/update/delete owner-only (latest migration) | PASS for all 11 owned collections | `1761100000_init_schema.js` 4–6, 16–21; `1761200000_push_subscriptions.js` 11–15; `1794300000_energy.js` 16–20; `1794500000_plans_courses.js` 21–28. No later migration alters rules. |
| `users` collection rules and auth options | UNVERIFIED — not in any migration (SEC-5) | `grep Rule pocketbase/pb_migrations/*.js` finds no `users` rule assignment |
| Same-owner relations on create AND update | PASS in code (all 9 listed relations, plus rewards→categories, plan_targets→categories) | `guards.js` 4–11, 214–221; `main.pb.js` 8–16 run `check()` on both create and update request hooks. Untested paths listed under "SDET test cases". |
| Server-owned fields | PASS: `completions.points` (guards.js 333–337), `push_subscriptions.endpoint` (339–352), `user` immutable via update rule. `rewards.claimedWeeks` is client-set (SEC-10). | |
| `push_subscriptions.endpoint` validated (https + known hosts) | FAIL — https only, no host allowlist (SEC-1) | `guards.js` 347–351 |
| Notification payloads from user's own data; `sw.js` no HTML | PASS — sender groups by `sub.user` (sender.mjs 191–204); `sw.js` uses `showNotification` text fields (14–20). Click URL not origin-checked (SEC-4). | |
| No `dangerouslySetInnerHTML` / `innerHTML` in `src/` | PASS | grep, no matches |
| Secrets gitignored and absent from history | PASS — `.gitignore` line 3 (`.env`, matches `push/.env`) and line 4; `git log --all` shows only `.env.example` and `push/.env.example` (placeholders, `PB_PASSWORD=change-me`); no private key or PEM in any diff | |
| Admin UI `/_/`, superuser MFA, access restriction | UNKNOWN — needs human confirmation (SEC-7) | |
| VM firewall, loopback bind, non-root systemd, `push/.env` 600, backups | UNKNOWN — needs human confirmation (SEC-7). The guide documents `chmod 600` and a non-root `User=` (push/README.md 107, 120). | |
| Netlify security headers | FAIL — none (SEC-3) | `netlify.toml` 12–21 |
| `npm audit --omit=dev` | PASS — 0 vulnerabilities (also 0 with dev deps) | |
| Threat model (STRIDE) | Recorded below | |
| Failure modes | Recorded in `docs/architecture.md` § 7; SEC-6 | |
| Cost shape | Flat per day (Netlify static + one e2-micro). Sane. | |

### STRIDE summary (existing system)

- **Spoofing:** email/password auth; open sign-up; rate limits and MFA unknown (SEC-5, SEC-7). Push payloads cannot be spoofed without the VAPID private key.
- **Tampering:** owner rules + `guards.check()` on create/update; superuser bypass is intentional (guards.js 199).
- **Repudiation:** no audit log beyond PocketBase's request logs (settings UNKNOWN). Acceptable for a personal app; noted.
- **Information disclosure:** owner-only list/view on all owned collections; `users` rules unverified (SEC-5); auth token in `localStorage` with no CSP (SEC-3).
- **Denial of service:** open sign-up + no quotas + sender loads all data each minute + no send timeout (SEC-1, SEC-6).
- **Elevation of privilege:** sender superuser credential is a full-database key (SEC-2); admin UI exposure unknown (SEC-7).

---

### Blockers

**SEC-1 — BLOCKER — Push endpoint host is not validated: any account can make the VM send requests to any HTTPS URL (SSRF / abuse)**
- **Where:** `pocketbase/pb_hooks/guards.js:347-351` (only checks `endpoint.startsWith("https://")` and that `keys.p256dh`/`keys.auth` are non-empty); `push/sender.mjs:89-93` (POSTs to `sub.subscription.endpoint`), `push/sender.mjs:240-245` (`--test` sends to every subscription).
- **Attack:** anyone can sign up (`src/views/Auth.jsx:18-25`; no invite or verification). The attacker creates a `push_subscriptions` record whose `subscription.endpoint` is any HTTPS URL, e.g. `https://attacker.example/x`, `https://10.128.0.1/…`, `https://127.0.0.1/…` or `https://localhost:<port>/…`, with dummy keys, and turns on a daily message or a block reminder. Every minute that a message is due, the sender, running inside the VM's network, makes an outbound HTTPS POST with a VAPID `Authorization` header to that URL. Effects available today: (a) the VM becomes a request source the attacker controls (destination, path, timing), pointed at internal or loopback HTTPS services or third parties; (b) combined with SEC-6, an endpoint that accepts the connection and never answers can stall the sequential send loop and delay or stop reminders for every user; (c) response bodies from the target are written to the sender log (`sender.mjs:101`, `err.body`). Plain-HTTP targets such as the GCP metadata server (`http://169.254.169.254`) are blocked by the `https://` check, so this is a blind, fixed-shape POST, not credential theft. Impact is moderate, but it is reachable now by any internet user and violates the checklist rule for this boundary (TB-3).
- **Fix:** in `guards.js`, parse the endpoint with `new URL()` and require `protocol === "https:"`, no userinfo, default port, and a hostname on an allowlist of push services, for example `fcm.googleapis.com`, `*.push.apple.com`, `updates.push.services.mozilla.com`, `*.notify.windows.com` (confirm the current list against each browser's documentation before shipping). Repeat the same check in `sender.mjs` before `sendNotification` (defence in depth, so rows created before the fix are skipped), and pass a `timeout` option (e.g. 10 s) to `webpush.sendNotification`. Add a migration-free cleanup: the sender skips and logs non-allowlisted rows. Add api-test cases (see SDET list, T-5).

### Warnings

**SEC-2 — WARNING — Sender runs as a full PocketBase superuser**
- **Where:** `push/sender.mjs:80-84` (`_superusers.authWithPassword`), 165–178 (reads all subscriptions, users, blocks, tasks, completions, check-ins, courses, steps; `blocks` and `tasks` without a `fields` filter); `guards.js:199` (superuser bypasses every hook).
- **Scenario:** any compromise of the sender process, its dependencies (`web-push`, `pocketbase` SDK and their transitive deps), the VM user that runs it, or `push/.env` yields read/write/delete on every collection, every user's email, the ability to create superusers, and change settings. The sender only needs read access to a few fields plus delete on `push_subscriptions`.
- **Fix:** least privilege. Options: (1) a dedicated auth collection (e.g. `services`) with one account and rules on the needed collections such as `@request.auth.collectionName = 'services'` for list/view, and delete on `push_subscriptions` only; or (2) keep a superuser but restrict it (dedicated account only for the sender, as `push/README.md:95-96` already advises; long random password; never reuse the admin login) and request only the fields used (`fields:` on blocks/tasks/subscriptions). If (2) is chosen, record it in an ADR. Also confirm `PB_URL` on the VM is loopback so the superuser password never crosses the internet (`.env.example` default is `http://127.0.0.1:8090`; production value UNKNOWN).

**SEC-3 — WARNING — No security headers or CSP; auth token sits in `localStorage`**
- **Where:** `netlify.toml:12-21` (only cache/content-type headers); `src/lib/pb.js:3` (SDK default `LocalAuthStore`, token in `localStorage`).
- **Scenario:** any future XSS (a new dependency, a markdown renderer for notes, a bad `href`) reads the PocketBase token from `localStorage` and takes over the account; no CSP limits script sources or exfiltration. Without `frame-ancestors`/`X-Frame-Options` the app can be framed for clickjacking (e.g. tricking a tap on "Delete these habits"). No XSS sink exists today (grep clean), so this is defence in depth.
- **Fix:** add a `[[headers]] for = "/*"` block in `netlify.toml` with: `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://<pocketbase-host> wss://<pocketbase-host>; worker-src 'self'; manifest-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'` (verify `style-src` needs against the build; `index.html` has no inline scripts), `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options: nosniff`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, and `Strict-Transport-Security`. Test on iOS Home Screen and Android before deploy.

**SEC-4 — WARNING — Service worker opens any URL from the payload**
- **Where:** `public/sw.js:27` (`new URL(data.url, self.location.origin)` accepts absolute URLs), `:35`, `:37` (`openWindow(url)`).
- **Scenario:** if the VAPID private key leaks, or a future message builder ever puts user-controlled text into `url`, a notification tap navigates to an attacker's site (phishing for the Notch password). Today the sender only sends `/`, `/#home`, `/#calendar`, `/#tasks` (`src/lib/reminders.js:142,170,186,199,247,275`; `push/sender.mjs:243`).
- **Fix:** in `sw.js`, after resolving, require `url.origin === self.location.origin`, else use `/`. Add the payload `url` rule ("same-origin path only") to `contracts.md`.

**SEC-5 — WARNING — `users` collection rules and auth settings are not in migrations**
- **Where:** no migration sets `users.listRule/viewRule/createRule/updateRule/deleteRule`, password options, rate limits, MFA, or email-verification requirements (checked with `grep -n Rule pocketbase/pb_migrations/*.js`). The client enforces `minLength={8}` only in the browser (`src/views/Auth.jsx:58`). Sign-up is open (`Auth.jsx:18-25`).
- **Scenario:** the effective `users` rules are whatever PocketBase created at first boot or someone set in the admin UI. A change in the admin UI (e.g. widening `listRule` to `@request.auth.id != ''`) would expose every user's name and, where `emailVisibility` is on, email, and nothing in the repo or tests would catch it. Rate limits off would allow online password guessing. The current values cannot be verified without the running server.
- **Fix:** add a new migration that pins the `users` rules (`id = @request.auth.id` for list/view/update/delete; decide whether `createRule` stays open), the password minimum, and enables the built-in rate limiter for `*:auth` and `*:create` (settings, or document them in `deployment.md` if they cannot be set in a migration). Decide explicitly, in an ADR if open sign-up stays, whether public sign-up is intended. Add SDET tests T-1 to T-3.

**SEC-6 — WARNING — No resource limits: one account can degrade reminders and the shared VM**
- **Where:** `push/sender.mjs:169-179` (loads every user's `blocks` and `tasks`, not just users with subscriptions, every 60 s into memory), `:205-212` (each send awaited one after another, no `timeout` option on `sendNotification`, line 89–93); no per-user record limits in any migration or hook.
- **Scenario:** a self-registered account scripts tens of thousands of blocks/tasks (each text field allows up to 2000–4000 chars). Every tick the sender pulls them all; on an e2-micro (shared with PocketBase) this raises memory and CPU and can OOM the VM, taking the API down for everyone. Separately, one hanging endpoint (SEC-1) or a slow push service delays every device after it in the loop; ticks never overlap (sender.mjs 252–257), so reminders arrive late or are dropped by their TTL.
- **Fix:** scope sender queries to users that have subscriptions (filter by `user` in the subscription set, or fetch per user), add a request timeout and bounded concurrency to sends, and add simple per-user caps in `guards.js` (e.g. max blocks/tasks per user) or a PocketBase rate limit on create. Confirm VM memory alerts exist (UNKNOWN).

**SEC-7 — WARNING — Production controls that cannot be confirmed from the repo**
Each item: UNKNOWN — needs human confirmation.
- PocketBase admin UI `/_/` reachable at the public DuckDNS URL? Superuser MFA/OTP enabled? Superuser passwords strong and unique? Access restricted by IP or proxy?
- VM firewall allows only 80/443 (and SSH restricted to known IPs or IAP)? PocketBase bound to `127.0.0.1` behind the TLS terminator, not `0.0.0.0:8090`?
- systemd units for PocketBase and `notch-push` run as non-root users (the guide uses `User=YOUR_USER`, `push/README.md:120`)?
- `push/.env` mode 600 and owned by the service user (`push/README.md:107` documents it)?
- `pb_data` backups exist, are off-VM, encrypted, and a restore has been tested?
- PocketBase version on the VM (local is 0.41.0) and the update process.
- Is the GitHub repo `rcluff11/habit-tracker` public? (No secrets were found in history, so this is informational.)
- **Fix:** answer each in `docs/deployment.md` (DevOps, Round 3). Any "no" on the first three becomes a BLOCKER.

**SEC-8 — WARNING — Production backend URL falls back to plain HTTP**
- **Where:** `src/lib/pb.js:3` (`VITE_PB_URL || "http://127.0.0.1:8090"`).
- **Scenario:** a Netlify build without `VITE_PB_URL` ships an app that points to loopback over HTTP. Browsers block it as mixed content, so this is a broken deploy rather than a leak, but it is an unencrypted default in production code (redline: TLS everywhere).
- **Fix:** fail the production build when `VITE_PB_URL` is missing or not `https://` (e.g. a check in `vite.config.js` when `mode === "production"`).

### Suggestions

**SEC-9 — SUGGESTION — `categories` is outside `GUARDED`.** `pocketbase/pb_hooks/main.pb.js:3-6`. No gap today (categories has no relations), but a future relation on `categories` would be silently unchecked. Add it to `GUARDED` and validate `color` against a hex pattern (`^#[0-9A-Fa-f]{6}$`) in all collections with a `color` field (`1761100000_init_schema.js`, `categories.color`, `blocks.color`, `max: 9`, no pattern).

**SEC-10 — SUGGESTION — `rewards.claimedWeeks` is unvalidated client JSON (up to 20 000 bytes).** `1761100000_init_schema.js` (rewards fields). Own-data only, so not a security issue; validate as an array of ISO week-start dates in `guards.js` for data integrity (Data Engineer).

**SEC-11 — SUGGESTION — Global unique index on `push_subscriptions.endpoint`.** `1761200000_push_subscriptions.js:27`. A user who learns another device's endpoint (it is a secret capability URL, so unlikely) could register it first and stop that device from subscribing. `src/lib/push.js:91-98` recovers by re-subscribing. Acceptable; note in contracts.

**SEC-12 — SUGGESTION — Shared-device logout.** `src/views/Settings.jsx:378` swallows `disablePush()` errors. If the delete fails (offline) but `unsubscribe()` also fails, the previous account's reminders (block and task titles) can keep arriving on that device. Show a warning when `disablePush` fails.

**SEC-13 — SUGGESTION — Supply chain hygiene.** No SBOM; no Dependabot/Renovate config in `.github/`; the PocketBase binary is gitignored with no recorded version or checksum (`.gitignore`), and PocketBase is pre-1.0. Record the production PocketBase version and SHA-256 in `docs/deployment.md`, add `npm audit --omit=dev` to CI, and generate an SBOM (`npm sbom`) at release. CI (`.github/workflows/checks.yml`) runs no app tests; DevOps to decide.

**Note for Data Engineer (not security):** `guards.js:333-337` also runs on completion *update*, so editing an existing completion re-snapshots `points` from the task's current value, which would change a past week's total (principle 3, "History stays put"). Confirm the client never updates completions, or snapshot only on create.

---

### SDET test cases (Round 3) — need a running PocketBase

Code review shows these paths are guarded, but no test proves them. Add to `scripts/api-test.mjs` or a new attack script:

- **T-1** User B `users.getList()` returns only B; `users.getOne(ua)` returns 404; A's `email` never appears in any response to B, including with `emailVisibility` set by A.
- **T-2** Anonymous client: `getFullList` on all 11 owned collections and `users` returns 0 / 401–403 (t5 covers only `courses`).
- **T-3** Sign-up cannot set `verified: true`; a user cannot set `verified` on update; a 7-character password is rejected by the server (not just the client).
- **T-4** Cross-user relations on **update** (today only create is tested for most): B updates own task with `block`, `category` or `step` = A's id; B updates own block with `category` or `step` = A's id; B updates own completion with `task` = A's task; B updates own reward with `category` = A's; B updates own plan_target with `task` = A's habit. Each must 400. Also on create: B's block with A's `category`; B's reward with A's `category`.
- **T-5** (after SEC-1 fix) `push_subscriptions` create/update rejects `https://127.0.0.1/x`, `https://localhost:8090/x`, `https://10.0.0.1/x`, `https://user:pass@fcm.googleapis.com/x`, `https://fcm.googleapis.com.attacker.example/x`, and accepts a real FCM / Apple / Mozilla host.
- **T-6** B cannot `update` A's `push_subscriptions` row by id, and B's update of its own row cannot set `endpoint` independently of `subscription` (the hook overwrites it).
- **T-7** If the PocketBase batch API (`/api/batch`) is enabled on the server: cross-user create/update through a batch request is rejected by the same guards.
- **T-8** Auth rate limiting (after SEC-5): repeated failed `authWithPassword` gets 429.
- **T-9** Sender (unit/integration, after SEC-6 fix): one subscription whose endpoint never responds does not delay delivery to the others beyond the timeout.

### Contract entries for the Backend Engineer (`docs/contracts.md`, Round 2)

**Environment variables (complete list found in code):**
- `VITE_PB_URL` — Netlify build, public; PocketBase base URL used by `src/lib/pb.js:3`. Invariant: must be `https://` in production (SEC-8).
- `VITE_VAPID_PUBLIC_KEY` — Netlify build, public; `src/lib/push.js:3`. Invariant: must equal the sender's `VAPID_PUBLIC_KEY`; changing it forces every device to resubscribe (`push/README.md:84-89`).
- `PB_URL`, `PB_EMAIL`, `PB_PASSWORD`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` — `push/.env` on the VM only, all required (`push/sender.mjs:227`). `PB_PASSWORD` and `VAPID_PRIVATE_KEY` are secrets; never in git, Netlify, chat or logs.
- `SENT_LOG` — optional path of the sent log (`push/sender.mjs:110`), default `push/.sent.json`.

**Integrations:**
- PocketBase REST + realtime via the JS SDK (`pocketbase ^0.28.1`), from the browser (user token) and the sender (superuser).
- Web Push services via `web-push ^3.6.7`, VAPID-signed, to `push_subscriptions.endpoint`.
- Netlify build (`npm run build` → `dist/`), SPA redirect `/* → /index.html 200`, `no-cache` on `/sw.js` and `/manifest.webmanifest` (`netlify.toml`).
- DuckDNS hostname and the VM's TLS terminator (details UNKNOWN).

**Message / event schemas:**
- Push payload JSON `{title, body, url, tag}` (`push/sender.mjs:89`) consumed by `public/sw.js`. Invariant: `url` is a same-origin path (`/`, `/#home`, `/#calendar`, `/#tasks` today); `title`/`body` are plain text. Push options `TTL`, `urgency: "high"`, `topic`.
- `push_subscriptions.subscription` = browser `PushSubscription.toJSON()` (`{endpoint, keys: {p256dh, auth}}`); `endpoint` is server-copied; `timezone` is an IANA zone (invalid zones fall back to `America/Denver`, `sender.mjs:20,26-37`).
- `push/.sent.json`: object `"<subId>|<msg.key>" → sent-at ms`, entries kept 2 days (`sender.mjs:107-142`).
- Hash routes used by notifications and the manifest shortcut: `#home`, `#now`, `#calendar`, `#tasks` (`public/manifest.webmanifest` shortcut `/#now`).

**Scheduled job:**
- `notch-push` systemd service, one tick per 60 s, ticks never overlap; 8 queries per tick (`sender.mjs:161-179`).

**Trust-boundary and cross-cutting invariants:**
1. Every owned collection keeps the owner rule set quoted in `docs/architecture.md` § 5; any new collection copies it exactly.
2. Every new collection with a relation is added to `GUARDED` (`main.pb.js:3-6`) and every relation to `RELATIONS` (`guards.js:4-11`), checked on create and update.
3. Server-owned fields are set by hooks, never trusted from the client: `completions.points`, `push_subscriptions.endpoint`, normalised `users.remindBefore`/`nudgeTimes`, stepped-task fields, target-kind fields.
4. `guards.check()` returns early for superusers (`guards.js:199`); the sender's writes are therefore unvalidated and must stay limited to deleting expired subscriptions.
5. `push_subscriptions.endpoint` must be an allowlisted push-service HTTPS URL (after SEC-1).
6. The sender only ever sends a user's own data to that user's own subscriptions (grouping by `sub.user`, `sender.mjs:191-204`).
7. Course/step delete hooks run in one transaction and stamp dates before the delete (`main.pb.js:18-46`).

### Sign-off

**Architect: BLOCK** — on SEC-1 (unvalidated push endpoint host, exploitable now by any self-registered account). This BLOCK applies to deploying the app (including the pending phase 2 deploy), not to landing the docs on this branch, which change no code. It lifts when SEC-1's allowlist and send timeout are in `guards.js` and `sender.mjs` with tests T-5 and T-9, or when the DRI accepts the risk in a recorded ADR. Warnings SEC-2 to SEC-8 should be fixed or answered before the next review; SEC-7 answers go in `docs/deployment.md`.

**Architect drafts submitted for consensus:** `docs/architecture.md`, `docs/stack.md`, `docs/decisions/README.md`, `docs/decisions/0001-foundational-stack.md`, `docs/ownership.md` (with Analyst).
