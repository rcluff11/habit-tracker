# API — Notch

**Lead author:** Backend Engineer (T-001.5). **Status:** descriptive (code on branch `chore/adopt-agentic-mastery`, 2026-11-14). Draft pending the 9-agent consensus (AGENTS.md § 0 Step 4).

This is the narrative companion to [`contracts.md`](contracts.md). `contracts.md` lists every call, field, hook, message and env var; this doc explains how the API works and the rules for changing it safely. Schema detail is in [`data-model.md`](data-model.md); trust boundaries are in [`architecture.md`](architecture.md) § 4.

---

## 1. Protocol

Notch has **no custom HTTP API**. The browser talks straight to **PocketBase's standard record API** over HTTPS, through the PocketBase JS SDK (`pocketbase ^0.28.1`, `src/lib/pb.js`). There are no routes or cron jobs in `pb_hooks` (`contracts.md` § 3). Server-side logic is a set of PocketBase **hooks** that run inside PocketBase's own request handling.

- **Style:** REST, JSON. One resource per collection: `GET/POST /api/collections/{collection}/records`, `GET/PATCH/DELETE /api/collections/{collection}/records/{id}`. Lists are filtered with PocketBase filter strings, always built with `pb.filter("… {:param}", {param})` so values are escaped (`src/lib/push.js:61`, `src/components/EnergyCheckin.jsx:43`, `push/sender.mjs:173,175`).
- **Realtime:** available in PocketBase but **not used** by the app or the sender (no `subscribe(` on a collection in `src/` or `push/`). The app reloads after writes instead (`src/lib/DataContext.jsx:72–79`).
- **Batch:** not used by the code. Whether `/api/batch` is enabled on the VM is `UNKNOWN — needs human confirmation`.
- **Versioning:** none. There is one client (the SPA, deployed by Netlify from the same repo) and one internal consumer (the push sender). Both ship from this repo, so "versioning" is the deploy order (§ 6) plus the compatibility shims in `contracts.md` § 10.
- **Second consumer — the push sender:** `push/sender.mjs` reads PocketBase as a superuser every minute and pushes Web Push messages that `public/sw.js` displays (§ 7).

## 2. Auth model

- **End users** are records in PocketBase's built-in `users` auth collection. Sign-up: `users.create({name, email, password, passwordConfirm})` then `authWithPassword(email, password)` (`src/views/Auth.jsx:18–25`). Sign-up is open; email verification is not required by the client.
- **Token storage:** the SDK's default `LocalAuthStore` keeps the token and user record in `localStorage` (`src/lib/pb.js` sets no custom store). On app open, `App.jsx:78–94` calls `authRefresh()`; a 401/403/404 clears the store (logged out), a network error keeps it (offline use). Logout removes this device's push subscription, then clears the store (`src/views/Settings.jsx:376–380`).
- **Authorization** is two layers, and both are required:
  1. **Collection API rules** (in migrations): every collection except `users` is owner-only — `user = @request.auth.id` for list/view/delete, create must set `user` to the caller, update cannot change `user` (`architecture.md` § 5). The `users` collection's own rules are **not** in any migration (`UNKNOWN`, Architect SEC-5).
  2. **Hooks** (`pb_hooks/guards.js` `check()`): every related id must belong to the caller, and server-owned fields are recomputed (`contracts.md` § 2.4).
- **Superuser:** the push sender logs in to `_superusers` with `PB_EMAIL`/`PB_PASSWORD` from `push/.env` (`push/sender.mjs:80–84`). A superuser bypasses all rules and all of `check()` (`guards.js:199`). The sender's only write is deleting expired subscriptions.

## 3. Error conventions

- **Hooks** throw `new BadRequestError("<one plain sentence>")`. PocketBase answers `400 {status, message, data: {}}`. The sentence is shown to the user as is, so write it for the user ("A block must end after it starts."), not for a developer. Every current message is listed in `contracts.md` § 2.3.
- **Ownership failures** use the same 400 `Invalid <field>.` whether the related id doesn't exist or belongs to someone else, so the API never reveals other users' ids.
- **Schema validation** (patterns, `max`, `required`, selects, unique indexes) returns 400 with `data.<field>.message`. The client shows those in `Auth.jsx:27–28` and `Settings.jsx:47`; elsewhere it shows `err.message`.
- **Rule failures:** list/view silently exclude other users' rows; update/delete of a row you can't see returns 404.
- **Never** let a hook throw a raw JS error or include record contents, ids of other users, or stack traces in a message. Use `BadRequestError` (input problem) or `ForbiddenError` (caller isn't allowed). Don't swallow errors: the only intentional `catch` blocks in `guards.js` turn "not found" into `false`/`null` (`exists`, `ownedBy`, `ownerExists`, the course lookup) — see review BE-11 for why these should only catch "not found".
- **Sender** errors are logged to the journal (`journalctl -u notch-push`) with the subscription id only — never the endpoint, keys, email or message text.

## 4. Idempotency of writes

| Write | Idempotent? | How |
|---|---|---|
| `completions` create | Yes for daily and block tasks | unique `(task, date)`; a repeat create returns 400 |
| `completions` create, one-off task | **No** — two dates can both be stored (DATA-13) | — |
| `checkins` create | Yes | unique `(user, date)`; `EnergyCheckin.jsx:37–45` turns the 400 into a lookup + update |
| `plans` create | Yes | unique `(user, month)` |
| `push_subscriptions` create | Yes | unique `endpoint`; `push.js:59–64` looks up by endpoint and updates |
| `course_steps` create | Yes per course+week | unique `(course, week)` |
| `blocks`, `tasks`, `categories`, `rewards`, `courses`, `plan_targets` create | No | Decided out of scope: a retried create after a lost response makes a visible duplicate the user can delete; no money or external effect is involved |
| All `update` (PATCH) | Yes | same body → same record |
| Push sends | At most once per device and key | `.sent.json` dedupe (`contracts.md` § 4.5) |

A new write path must state which row it falls in.

## 5. How to change the API safely

Before you start, find every entry your change touches in `contracts.md`, and update that file in the same pull request (AGENTS.md § 7).

### 5.1 Add or change a field

1. **Never edit an existing migration.** Add `pocketbase/pb_migrations/<timestamp>_<name>.js` with `up` and `down` (CLAUDE.md "Schema changes"; procedure in `data-model.md` § 8). Any new migration must also carry the relation indexes from DATA-1 or it will be blocked.
2. If the field is **validated or server-owned**, add the rule to `check()` in `guards.js`, and make sure it runs on create and update (it does automatically if the collection is in `GUARDED`).
3. If it is a **relation**, add it to `RELATIONS` (`guards.js:4–11`) so ownership is checked, add an index, and decide `cascadeDelete`. If a delete now cascades, add the collection to `RELOAD_ON_DELETE` (`DataContext.jsx:10`).
4. If the **sender** reads it, check the `fields:` list in `sender.mjs:170,175,177,178`; `blocks` and `tasks` are fetched with all fields.
5. If the value has an app-side twin (a constant or a cleaning function), change both together (`contracts.md` § 11).
6. Run `npm run test:api` (needs `npm run pb`), and the attack scripts for the area.

### 5.2 Add or change a rule

Rules live in migrations only. Copy the owner rule set exactly for a new owned collection. Never widen `listRule`/`viewRule` beyond `user = @request.auth.id`. Write a new migration whose `down` restores the previous string exactly. Add a cross-user test (another account must get 0 rows / 404 / 400).

### 5.3 Add or change a hook

- Put the logic in `guards.js` (shared, loaded with `require`; the JSVM can't see outer-scope functions from inside a handler) and register it in `main.pb.js`.
- Request hooks (`onRecordCreateRequest`, `onRecordUpdateRequest`) run only for API calls and are skipped for superusers. Model hooks (`onRecordDelete`, …) run for every save/delete including cascades — use them when the rule must hold no matter who writes. Wrap multi-record writes in `e.app.runInTransaction` as `main.pb.js:22–46` does.
- The JSVM is goja: no npm packages, no `import`/`export`, and do not assume browser globals (such as `URL`) exist; test in the real runtime.
- Throw `BadRequestError` with a user-facing sentence. Add the sentence to `contracts.md` § 2.3.
- Deploy hooks together with migrations and restart PocketBase.

### 5.4 Add a collection

Copy the owner rules and the `user` relation (`required`, `cascadeDelete: true`), add an index on `user`, add it to `GUARDED` if it has relations or server-owned fields, add it to `COLLECTIONS` in `DataContext.jsx:7` if the app loads it, and add every consumer to `contracts.md` § 1.2.

### 5.5 Breaking changes

There are no external consumers, but **installed PWAs run old JavaScript** until the service worker updates, and **the sender runs old code** until it is restarted. So:

- Deploy the producer first: migrations and hooks, restart PocketBase, restart the sender, then Netlify (CLAUDE.md "Deploy order").
- Keep a removed field or collection readable for one release, or add a 404 shim like `contracts.md` § 10, so an old client doesn't break.
- Never change the push payload keys (`title, body, url, tag`), the hash route ids, or the message key format without reading `contracts.md` §§ 4.3–4.5 and 6.1 first.

## 6. Deploy order (why it matters for the API)

1. `pb_migrations` + `pb_hooks` to the VM, restart PocketBase (new fields and rules exist).
2. `sudo systemctl restart notch-push` (the sender loads `src/lib` once at start, `push/README.md:138–142`).
3. Netlify deploy from the push.

## 7. The sender's contract with the app

The sender and the app share code, not an API: `push/sender.mjs` imports `src/lib/stats.js`, `time.js` and `reminders.js` (which pulls in `messages.js` and `affirmations.js`). That makes these modules a contract:

- **Node-safe:** no browser, Vite or `pb.js` imports; explicit `.js` extensions (`reminders.js:2`).
- **Pure:** same inputs give the same messages in the app and on the phone (`messages.js:1–3`).
- **Message shape:** `dueReminders` and `dueDailyMessages` return `{key, title, body, url, tag, topic, ttl}`. The sender sends `{title, body, url, tag}` as the payload and `TTL`, `urgency: "high"`, `topic` as Web Push options (`sender.mjs:86–93`).
- **Keys** dedupe sends per device (`contracts.md` § 4.4). Changing a key format resends messages once.
- **Time:** every function takes `now = {date, minutes}` in the device's time zone from `localNow(sub.timezone)`. Never call `todayISO()` or `nowMinutes()` from code the sender uses; they read the VM clock.
- **Service worker:** reads only `title`, `body`, `tag`, `url`; `url` must be a same-origin path (SEC-4).
- **Restart:** a change to any of these modules needs a sender restart to take effect.

## Verification

Written from the same reads and greps as `contracts.md` (see its Verification section), plus `src/App.jsx:70–94` (auth refresh), `src/views/Auth.jsx:10–32`, `src/views/Settings.jsx:14–50, 345–381`, `src/components/EnergyCheckin.jsx:30–60`, `src/lib/push.js` (full). PocketBase behaviour stated generically (error JSON shape, request vs model hooks, 404 on hidden rows) is PocketBase's documented behaviour for the 0.2x–0.4x line; the VM version is `UNKNOWN — needs human confirmation`.

## Update this doc when

- the protocol changes (realtime, batch, a custom route or cron in `pb_hooks`);
- the auth flow changes (`src/views/Auth.jsx`, `src/App.jsx` auth refresh, logout in `Settings.jsx`, the auth store in `src/lib/pb.js`, the sender's login);
- the error convention changes (a new error type in `guards.js`, how the client reads errors);
- a write path's idempotency changes (a unique index added or removed, a new create path);
- the deploy order or the sender/app shared-code rules change (`push/sender.mjs` imports, `push/README.md`);
- any change listed in `contracts.md`'s "Update this doc when" that alters a rule in § 5.
