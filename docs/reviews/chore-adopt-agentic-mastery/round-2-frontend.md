# Round 2 — Frontend Review — chore/adopt-agentic-mastery

**Reviewer:** Frontend Engineer. **Date:** 2026-11-14. **Scope:** review only of `src/` and `public/` as they stand on this branch (the app code is unchanged from `079f486`), plus `index.html`, `vite.config.js` and `netlify.toml` where they shape the client. Inputs: `CLAUDE.md`, `docs/architecture.md`, `docs/reviews/chore-adopt-agentic-mastery/round-1-{analyst,architect,data-engineer}.md`. No app code was changed.

## Frontend Review — chore/adopt-agentic-mastery
**Verdict:** BLOCK (one BLOCKER, FE-1, a frontend redline that needs an ADR, not code). It applies to the next deploy sign-off, not to landing the docs on this branch.

**Feasibility concerns for UX requests:** none new. For SEC-3 (CSP) and SEC-4 (notification URL), the feasibility input is in FE-2 and FE-3. Moving the token to an HTTP-only cookie is feasible only behind a same-origin proxy (FE-1).

**Bundle / perf impact:** `npm run build` (Vite 8.3.5) finished with **no warnings**. The only extra output was Rolldown's informational `[PLUGIN_TIMINGS]` note (vite:css transform took most of the 4.9 s build). Output:

| File | Size | gzip |
|---|---|---|
| `dist/index.html` | 1.04 kB | 0.49 kB |
| `dist/assets/index-*.css` | 20.33 kB | 5.17 kB |
| `dist/assets/index-*.js` | 377.89 kB | 112.99 kB |

It's one JS chunk with no code-splitting. No performance budget is documented anywhere in `/docs` (FE-21), so the "no regression past budget" redline can't be checked yet. This build is the baseline.

**Blockers:** FE-1.
**Warnings:** FE-2 to FE-15.
**Suggestions:** FE-16 to FE-22.

---

## What passes

| Check | Result | Evidence |
|---|---|---|
| Dates are local ISO strings through `time.js` | PASS | `src/lib/time.js:5-25`. `toISOString` and `getTimezoneOffset` don't appear anywhere in `src/` (grep). |
| DST-safe date arithmetic | PASS | `addDays` uses `setDate` on a local date (`time.js:21-25`). `dayNumber` uses `Date.UTC` maths (`affirmations.js:287-295`), so a 23-hour or 25-hour day never shifts a date. |
| Stepped items use `activeWindow()` | PASS | `TaskEditor.jsx:47`, `BlockEditor.jsx:30,54,59`, `stats.js:72,259,348,354`. No view reads `task.date` or `block.date` to schedule a stepped item. The only `b.date` read is a label in `TaskEditor.jsx:149`. Exception: Tasks "All tasks" mode, see FE-9. |
| Derived values come from `stats.js` | PASS (with FE-18) | Week/day/month figures, streaks, score card and target progress are all computed at render time (`Home.jsx:87-109`, `Progress.jsx:38-41`, `ScoreCard.jsx:20`). Nothing derived is written back. |
| Intervals and listeners cleaned up | PASS | `Home.jsx:77-85`, `Now.jsx:12-21`, `App.jsx:168-172`, `Modal.jsx:187-191`, `TaskItem.jsx:363`, `Settings.jsx:78,244`. |
| List keys | PASS (with FE-19) | Every `.map` that renders elements has a stable id key. Composite keys (`${b.id}|${date}`) are used where a block can appear on two dates (`Home.jsx:175`, `Now.jsx:47`). |
| XSS sinks | PASS | There's no `dangerouslySetInnerHTML`, `innerHTML` or `eval` in `src/`, and user text is rendered only as React children. |
| Logout clears client state | PASS | `pb.authStore.clear()` → `onChange` → `user = null` (`App.jsx:213`), so `<DataProvider key={user.id}>` unmounts and all cached records go with it (`App.jsx:235-238`). The second logout gap (push) is SEC-12. |
| Toggle in-flight guard (single item) | PASS | `TaskItem.jsx:365-380` ignores taps while a save is in flight, shows an inline `role="alert"` error, and clears its timer on unmount. That's the pattern the other write paths should copy (FE-4, FE-5). |
| Settings user-field writes | PASS | `useUserField` (`Settings.jsx:19-70`) is optimistic, keeps a last-write-wins queue and rolls back on failure. |

---

## Findings

### FE-1 — BLOCKER — Long-lived auth token in `localStorage` with no ADR (frontend redline)
- **Where:** `src/lib/pb.js:3` (`new PocketBase(url)` uses the SDK's default `LocalAuthStore`, key `pocketbase_auth`). `App.jsx:208-232` reads it at start. `docs/decisions/` has only `0001-foundational-stack.md`, which doesn't cover token storage.
- **Failure scenario:** any future XSS (a new dependency, a markdown renderer for notes, a bad `href`) can read `localStorage.pocketbase_auth` and replay the bearer token from anywhere until it expires. It's the same issue as SEC-3. My redline ("no long-lived authentication tokens in localStorage") requires either a fix or an accepted ADR.
- **Feasibility of the alternatives:**
  - *In-memory only:* this is technically trivial (`new PocketBase(url, new BaseAuthStore())`), but every cold start of the installed PWA would ask for the password again. On a phone that's an unacceptable UX regression, and UX would reject it.
  - *HTTP-only cookie:* PocketBase authenticates with an `Authorization` bearer header and sets no cookies. A cookie needs (a) the API on the same site as the app, for example a Netlify rewrite of `/api/*` to the DuckDNS host, because a cross-site cookie from `*.duckdns.org` is blocked by Safari ITP and soon by Chrome; (b) a `pb_hooks` bridge that sets the cookie on login and turns it into the auth header on each request; and (c) CSRF protection. It's a real Backend + DevOps project with latency and Netlify-bandwidth cost. It's feasible, but too large for now.
- **Fix (recommended):** have the Architect write ADR 0002 accepting `LocalAuthStore` under compensating controls, and have the frontend DRI accept it. The controls: (1) the CSP in FE-2; (2) no third-party script in the page (true today); (3) the user token lifetime set explicitly in a migration, not left at the default (Backend; ties to SEC-5); (4) the existing `authRefresh()` on start (`App.jsx:220`) plus the 401 handling in FE-11. That lifts the BLOCK with no code change. Revisit the cookie proxy if the app ever renders rich user content.

### FE-2 — WARNING — CSP feasibility (SEC-3): the proposed policy breaks fonts and includes an unused source
- **Where:** `netlify.toml:12-21` (no CSP). `src/styles.css:1` (`@import url("https://fonts.googleapis.com/…")`). `index.html:12` (only `/src/main.jsx` as a module script, with no inline script).
- **Failure scenario:** if the Architect's SEC-3 policy is deployed as written (`style-src 'self' 'unsafe-inline'`, no `font-src`), the Google Fonts stylesheet and its `fonts.gstatic.com` files are refused, and every page falls back to system fonts. It also lists `wss://<pb-host>`, which the app never uses: there's no realtime subscription in `src/` (grep for `.subscribe(`, `EventSource` and `realtime` finds only the PushManager call), and PocketBase realtime uses SSE over `https`, not WebSockets.
- **What the Vite build actually needs:**
  - `script-src 'self'`: the production `dist/index.html` loads a single hashed module from `/assets/`. There's no inline script and no `eval`.
  - `style-src 'self' https://fonts.googleapis.com`: React applies `style={{…}}` and the `--cat` custom property through the CSSOM (`element.style`), which CSP doesn't block, so `'unsafe-inline'` should **not** be needed. Test it on a deploy preview first, and add `'unsafe-inline'` to `style-src` only if a violation appears. If FE-13 is adopted (self-hosted fonts), drop the Google host.
  - `font-src https://fonts.gstatic.com` (or `'self'` after FE-13).
  - `connect-src 'self' https://<pocketbase-host>`: REST, plus SSE if realtime is ever added. The push subscription (`pushManager.subscribe`) and delivery go through the browser's push service and aren't governed by page CSP. Nothing else in the client fetches.
  - `img-src 'self' data:`, `manifest-src 'self'`, `worker-src 'self'` (`/sw.js`), `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`.
  - The service worker gets the same policy from its own response headers. It makes no fetches and its notification icons are same-origin, so the policy is compatible.
- **Fix:** add to `netlify.toml`, with the PocketBase host hard-coded. It's public anyway, and whether Netlify interpolates environment variables in `[[headers]]` values is `UNKNOWN — needs human confirmation`, so don't rely on it:
  ```toml
  [[headers]]
    for = "/*"
    [headers.values]
      Content-Security-Policy = "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://<pocketbase-host>; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
  ```
  Ship it first as `Content-Security-Policy-Report-Only` on a deploy preview, test on iOS Home Screen and Android, then enforce it. Add a DevOps check that the host in the CSP matches `VITE_PB_URL`. Owner: Architect (policy), DevOps (headers), Frontend (verification).

### FE-3 — WARNING — Notification tap can navigate to any origin (SEC-4)
- **Where:** `public/sw.js:27` (`new URL(data.url, origin)` accepts absolute URLs), `:35` (`open.navigate(url)`), `:37` (`openWindow(url)`).
- **Failure scenario:** a payload with `url: "https://evil.example/login"` (leaked VAPID key, or a future message builder that puts user text in `url`) either opens that site or, worse, **navigates the user's already-open Notch window** to it. That's an ideal phishing setup. A `javascript:` URL resolves with origin `"null"` and is caught by the same check.
- **Fix (same-origin check, in-app routes only):**
  ```js
  self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    let target;
    try {
      target = new URL(event.notification.data?.url || "/", self.location.origin);
    } catch {
      target = new URL("/", self.location.origin);
    }
    if (target.origin !== self.location.origin) target = new URL("/", self.location.origin);
    const url = target.href;
    // …rest unchanged
  });
  ```
  Optionally go further and allow only `/` plus a hash from the `VIEWS` ids in `App.jsx:6-14`. Record the rule ("`url` is a same-origin path") in `docs/contracts.md`. That's for Backend or the contract author; I'm not editing it.

### FE-4 — WARNING — Failed writes that fail silently and leave unhandled promise rejections
- **Where:**
  - `src/views/Calendar.jsx:104-109`: the block's ✓ button calls `toggleTask` in a `forEach` without `await` or `catch`.
  - `src/views/Progress.jsx:76-95` (`submitReward`) and `:97-107` (`deleteReward`) use `try/finally` with no `catch`. `:109-113` (`claimReward`) has no `try` at all.
  - `src/views/Settings.jsx:328` (category rename on blur), `:331` (category delete), `:336` (category colour), `:351`/`:371`/`:399`/`:418`/`:432` (`updateUser` for name and palette), and `:353-358` (`addCategory`).
  - `src/components/BlockEditor.jsx:103-106` (`del`).
- **Failure scenario:** offline, or a 400 from a hook. The user taps Claim, Delete, Save reward, or the calendar ✓. Nothing changes, no message appears, and the console logs `Uncaught (in promise)`. The reward modal stays open with no explanation. A renamed category silently reverts on the next load. `CLAUDE.md` and the frontend checklist say a failed save must never fail silently.
- **Fix:** follow the `TaskItem.jsx:370-379` pattern: catch the error, set inline `role="alert"` text, and keep focus where it was. For `Calendar.jsx`, move the multi-toggle into one `async` handler with a busy ref, `await Promise.allSettled(...)` and an inline error on the block. Optionally add a dev-only `unhandledrejection` listener in `main.jsx` so new gaps show up.

### FE-5 — WARNING — Double-submit creates duplicate records
- **Where:** `TaskEditor.jsx:52-79` (button at `:268`) and `BlockEditor.jsx:74-101` (button at `:253`) have no in-flight guard and don't disable Save. The same applies to `Settings.jsx:353-358` (`addCategory`) and the calendar ✓ (`Calendar.jsx:101-110`).
- **Failure scenario:** on a slow phone connection the user taps "Add block" twice, or presses Enter twice. Two blocks are created, each with its own check-off task (`BlockEditor.jsx:83-90`). The calendar ✓ tapped twice fires two creates. The second hits the `(task, date)` unique index and throws an unhandled rejection (FE-4).
- **Fix:** use a `busy` ref plus `saving` state, with `disabled` or `aria-busy` on the submit, as `TargetEditor.jsx:41,49-72` and `MonthPlan.jsx:41,80` already do.

### FE-6 — WARNING — `reload()` can overwrite newer local writes (stale-state race)
- **Where:** `src/lib/DataContext.jsx:27-52` (`setState(next)` replaces everything) and `:72-77` (every delete in `RELOAD_ON_DELETE` calls `reload()`).
- **Failure scenario:** the user deletes a task, which starts a reload of all 10 collections. While it's in flight, they tick a habit, and `save` appends the completion. The reload then resolves with lists fetched *before* that tick and replaces state. The tick disappears from the UI although the server has it. The next tap then tries to *create* again, hits the unique index, and shows "Couldn't save". The same happens with two overlapping reloads (`CourseEditor.jsx:108-109` deletes in a loop) that resolve out of order.
- **Fix:** give `reload` a sequence number (`const seq = ++reloadSeq.current; … if (seq !== reloadSeq.current) return;`) and make `save` and `remove` bump a write counter. Re-run the reload if a write landed while it was in flight. Better still, see FE-12: patch the known cascades locally (block → its tasks → their completions; task → its completions and completions targets) and drop the full reload for `blocks` and `tasks`.

### FE-7 — WARNING — Starter categories come back whenever a user has none
- **Where:** `src/lib/DataContext.jsx:38-44`. `seeded` is a per-mount ref, so the condition is "no categories right now", not "new account".
- **Failure scenario:** a user deletes all six starter categories on purpose. On the next app open, all six are created again on the server. In dev under `StrictMode`, two concurrent reloads both see zero categories. The ref stops the second seed, but the second reload can then resolve last and replace state with the empty list (the FE-6 race), so the seeded categories vanish from the UI until a refresh.
- **Fix:** seed once, at sign-up. Either call it after `users.create` in `Auth.jsx:18-24`, or better, do it in a `users` create hook (Backend), which is atomic and enforced by the server. Then remove the seeding from `reload`.

### FE-8 — WARNING — "Today" goes stale when the PWA resumes after midnight
- **Where:** `Tasks.jsx:18,20`, `Calendar.jsx:43,128,134,136`, `Progress.jsx:27-29` and `TaskItem.jsx:16` compute `todayISO()` only when they render, and nothing re-renders them on resume. Only Home and Now tick (`Home.jsx:77-85`, `Now.jsx:12-21`).
- **Failure scenario:** the installed app is left on To-do overnight. The OS keeps it alive in memory, and the next morning it resumes without a re-render. The list still shows yesterday's instances labelled "Today" (`dayLabel(date, today)` with both values stale), and ticking a habit records it on **yesterday's** date, changing yesterday's score and streaks. Calendar's red "now" line and today highlight stay on yesterday too.
- **Fix:** add one shared `useToday()` hook (in `src/lib/`, using `todayISO`) that updates on `visibilitychange` and on a timeout set to the next local midnight. Either provide it from `DataContext` or use it in each view. Views whose selected `date` equals the previous today should move forward with it (`Tasks.jsx:20`, `Calendar.jsx:136`, `Progress.jsx:28,30`).

### FE-9 — WARNING — "All tasks" mode checks off any task for today, even when it isn't scheduled today
- **Where:** `src/views/Tasks.jsx:275-282` builds `{ task, date: today, done }` for every task, ignoring `blockOccursOn` and `activeWindow`.
- **Failure scenario:** a task on a Monday-only weekly block, or a habit in a course week that hasn't started (or a habit past its `recurUntil`), shows a live checkbox on Saturday. Ticking it writes a completion for a date it isn't scheduled on. Week stats ignore it (`instancesForDate` won't list it), but `targetProgress` counts every completion in the month (`stats.js:532`), so monthly "completions" targets are inflated. A block task already done on its real day also shows as not done here.
- **Fix:** in this mode, take the done state and checkbox from `instancesForDate(data, today, today)`. Show tasks not scheduled today without a check button (or with a disabled one labelled "Not scheduled today"). Backend should also reject completions outside the task's window in `guards.js` (Principle 5), so this is enforced server-side and not just in the UI.

### FE-10 — WARNING — `save()` drops an updated record that isn't in local state; EnergyCheckin's recovery path never shows its result
- **Where:** `src/lib/DataContext.jsx:63-66` (the update branch only `map`s existing rows). `src/components/EnergyCheckin.jsx:43-45` finds the server's check-in directly with `pb` and updates it with `save(..., found.id)`.
- **Failure scenario:** today's check-in exists on the server but not locally (made on another device, or a lost response). The create returns 400, the recovery update succeeds, but the record isn't added to `state.checkins`, so no level shows as selected and no suggestions appear. Every later tap repeats create → 400 → lookup → update. That's also a direct `pb` call from a component, against the convention.
- **Fix:** make `save` upsert (if no row matched `id`, append the record). Move the "find today's check-in" lookup into `DataContext`, for example as `save` with an `upsertBy` option or a small `saveCheckin(date, energy)`, so components stop calling `pb`.

### FE-11 — WARNING — An expired or revoked token mid-session shows as a network error
- **Where:** `App.jsx:215-232` checks the token only on mount. No other code handles a 401.
- **Failure scenario:** the PWA stays resident for longer than the token lifetime, or the account is deleted or the password changed on another device. Every write then fails with "Couldn't save. Check your connection and try again" (`TaskItem.jsx:417`), which is wrong advice, and the user is never sent to log in.
- **Fix:** add a single `pb.afterSend` hook in `src/lib/pb.js` that calls `pb.authStore.clear()` on a 401 from any request other than auth-refresh. `App.jsx:213` then shows `<Auth />`. Also call `authRefresh()` on `visibilitychange` when the last refresh is more than about 12 hours old, which keeps active users signed in.

### FE-12 — WARNING — Unbounded load and full reloads (frontend side of DATA-3)
- **Where:** `DataContext.jsx:29-31` (`getFullList` on all 10 collections at start; the SDK pages in batches, so about 3,650 completions a year means 4 or more sequential requests just for completions). `:10,76` (a full reload of every collection after each delete of a block, task, category, plan, target, course or step). `CourseEditor.jsx:108-109` (deletes habits one by one, so **N sequential full reloads**).
- **Analysis:** the compute side is fine. `indexCompletions` builds maps once per completions change (`stats.js:229-238`, `DataContext.jsx:93`), `instancesForDate` is O(tasks) with map lookups, and `habitStreak` is memoised per item (`TaskItem.jsx:353-357`). The cost is network, JSON parsing on every cold start on a phone, and it grows every year. "Delete these habits" on a 10-habit course does 10 full refetches.
- **Fix (proposed, needs Data Engineer sign-off on the window):**
  1. On start, load completions with `date >= addDays(today, -400)` (this covers `STREAK_LOOKBACK_DAYS`, `stats.js:322`) plus all completions of one-off tasks. Fetch older months on demand when Progress or Month navigates past the window, so history isn't hidden.
  2. Replace the full reload after a delete with local cascade patches (FE-6).
  3. Do the course bulk delete as one PocketBase batch request (or a server route), then refresh once.

### FE-13 — WARNING — Google Fonts loaded by a render-blocking `@import`
- **Where:** `src/styles.css:1`.
- **Failure scenario:** the font CSS is discovered only after the app CSS downloads, so there are three sequential round trips (app CSS → `fonts.googleapis.com` CSS → `fonts.gstatic.com` woff2) before text settles. `display=swap` then reflows headings when Fraunces and DM Sans arrive, which is layout shift on Home's first paint. It also sends every user's IP to Google with no privacy sign-off (redline: third-party resources need UX + Architect sign-off), widens the CSP (FE-2), and can't carry SRI because Google serves different CSS per browser.
- **Fix:** self-host the two woff2 subsets under `public/fonts/` with `@font-face` (`font-display: swap`, plus `size-adjust` or `ascent-override` on a local fallback to cancel the reflow) and `<link rel="preload" as="font" crossorigin>` in `index.html`. This needs no new npm dependency. Copying the font files in is a license check only (both fonts are SIL OFL 1.1).

### FE-14 — WARNING — A failed initial load renders empty views that look like data loss
- **Where:** `DataContext.jsx:47-50` (keeps empty arrays and sets `error`). `App.jsx:200-201` (shows a one-line banner, then renders the view anyway). Only Progress handles `data.error` (`Progress.jsx:116`).
- **Failure scenario:** the user opens the app on a flaky connection. Home says "Mark tasks with ★…", To-do says "Nothing here yet. Add a task…", and nothing offers a retry. Users think their data is gone and start re-creating it. When data comes back, they have duplicates.
- **Fix:** when `error` is set and nothing has loaded, render an error state in `Shell` instead of `<Current>`, with a "Try again" button that calls `reload()` (already exposed, `DataContext.jsx:103`). Also retry automatically on `online` and `visibilitychange`.

### FE-15 — WARNING — Hard-coded white text on the accent fails contrast, worst in dark mode
- **Where:** `src/styles.css:196-199` (`.btn-primary`: `#fff` on `--accent-grad`, which isn't redefined for dark mode). `src/views/Calendar.css:23-25` (`#fff` on `var(--accent)`, which is `#ff8f66` in dark mode).
- **Measured:** `#fff` on `#ff8f66` is about 2.2:1. `#fff` on the gradient runs from about 2.1:1 (`#ff9a5a`) to 3.1:1 (`#ee6a45`). WCAG AA for 15px text is 4.5:1. Every primary button ("+ Task", "Save", "Log in") is affected in both themes.
- **Fix:** add a `--on-accent` token, with a dark value such as `#2b1a14` in dark mode, or darken the gradient stops so white passes. UX owns the colour choice. I'm flagging it because these are hard-coded colours with no dark-mode value.

### FE-16 — SUGGESTION — Calendar's "now" line doesn't move
`Calendar.jsx:43,128`: `nowMinutes()` is read once per render and nothing re-renders the grid, so the red line sits where it was when the view opened. Use the FE-8 hook, or a one-minute tick scoped to `isToday` columns.

### FE-17 — SUGGESTION — `pb` called directly outside `DataContext`
`Settings.jsx:39,159,350` (users record), `EnergyCheckin.jsx:43` (see FE-10). The `users` record isn't one of the context's collections, which is why. Add `updateUser(data)` to `useData()` so these writes share one error path and the 401 handling from FE-11. `Auth.jsx` and `push.js` are fine as they are: they run before the provider exists, or are device-level.

### FE-18 — SUGGESTION — The reward-progress rule is written twice
`Home.jsx:14-22` (`rewardProgress`) and `Progress.jsx:208-211` compute "current vs target" separately. One uses `reward.target` and the other `Number(reward.target)`. Move it to `stats.js` as `rewardProgress(reward, week)` (one fact, one place) and add a `test:stats` case.

### FE-19 — SUGGESTION — Duplicate keys in a custom palette
`Settings.jsx:412-419,431-432`: "Add color" doesn't de-duplicate, so adding `#AABBCC` twice gives duplicate React keys (`key={c}`), and removing one removes both. De-duplicate on add, or key by index.

### FE-20 — SUGGESTION — Service worker: no offline shell, and no update prompt
`public/sw.js:3-4` (`skipWaiting` and `clients.claim`, with no `fetch` handler and no caches, so there's no cache version to bump today). An installed app opened offline shows the browser's error page. An app left open across a deploy keeps running the old bundle against a migrated backend until it reloads. Options:
- A tiny versioned runtime cache: cache-first for hashed `/assets/*`, network-first for `/`, and the `CACHE` name bumped on each change. A build-time precache plugin would be a new dependency, so ask the owner first.
- An "Update available, reload" toast driven by `registration.onupdatefound`, or by a `version.json` check on `visibilitychange`.

### FE-21 — SUGGESTION — Set a performance budget and split the bundle
There's no budget in `/docs`. Record the baseline above in `docs/stack.md` with a budget of initial JS ≤ 130 kB gzip and CSS ≤ 8 kB gzip, plus LCP < 2.5 s, INP < 200 ms and CLS < 0.1 on a mid-range phone, and have CI fail the build past it (DevOps). Lazy-load Progress, Settings and the editor modals (`CourseEditor`, `TargetEditor`, `BlockEditor`, `TaskEditor`) with `React.lazy`. That cuts the Home first-load JS with no new dependency.

### FE-22 — SUGGESTION — Calendar block keyboard semantics (for UX)
`Calendar.jsx:84-121`: the `role="button"` block handles Enter but not Space (`:98`), contains a nested real `<button>` (the ✓ at `:101`), and the ✓'s label "Mark done" doesn't name the block (`:103`). Everything is still keyboard-reachable, so this isn't a redline breach. Suggested fix: make the block title a real `<button>`, keep ✓ as a sibling, and label it `Mark "<title>" done`. Related: `index.html:5` and `manifest.webmanifest:10` have one light `theme-color`. Add `<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#1a1726">` so the status bar matches dark mode.

---

## Cross-references to Round 1
- **SEC-3:** FE-1 (token, ADR route), FE-2 (CSP directives), FE-13 (font host).
- **SEC-4:** FE-3 (patch provided).
- **SEC-12:** the logout path is unchanged here. FE-4's pattern applies; show the `disablePush` failure.
- **DATA-3:** FE-12 (frontend plan), FE-6 (race made worse by full reloads).
- **DATA-6 / DATA-7:** confirmations for block delete (`BlockEditor.jsx:103-106`) and category delete (`Settings.jsx:331`) are missing. Both also fail silently (FE-4). I agree with the Data Engineer's fix and will implement the UI side.
- **DATA-10:** the reward `target > 0` check is client-only (`Progress.jsx:80`). Server bounds belong to Backend (Principle 5).
- **DATA-13:** FE-5 and FE-9 lower the client's share of duplicate or stray completions.

## Owners and next steps
- Architect + frontend DRI: ADR 0002 for FE-1. Architect + DevOps: FE-2 headers.
- Frontend (future fix branch, not this one): FE-3 to FE-11 and FE-14 first, then FE-12 with Data Engineer sign-off and FE-13. UX: FE-15 and FE-22.
- Backend: the server side of FE-7 (seed on sign-up hook) and FE-9 (reject out-of-window completions).
- SDET: add `test:stats` cases for FE-18 and an attack script for FE-9 (a completion for an unscheduled date).

**Frontend Engineer: BLOCK** — on FE-1 only (token in `localStorage` with no accepted ADR, a frontend redline). It lifts when ADR 0002 accepting `LocalAuthStore` with the FE-2 CSP as a compensating control is accepted. That needs no code change. FE-2 to FE-15 are pre-existing warnings that should become `/tasks/` items before the phase 2 deploy. This BLOCK doesn't apply to landing the docs on this branch, which changes no code.
