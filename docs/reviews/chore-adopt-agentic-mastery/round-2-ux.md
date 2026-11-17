## UX Review — chore/adopt-agentic-mastery (Round 2, Implementation)

**Verdict:** PASS WITH ITEMS for this branch. The branch adds process files and docs and changes no UI, so it causes no accessibility regression. The app as it stands has **11 pre-existing BLOCKER-level items** that cross a UX redline (see "How to read the severities").
**Persona served:** the one-handed planner, one person running their day from a phone (`docs/ux.md` § 1).
**Accessibility audit:** WCAG 2.2 level AA **fail** on the existing app. The failures are contrast (UX-3, UX-4, UX-5, UX-6), unlabelled inputs (UX-8), input purpose (UX-9), and state not exposed or shown by colour only (UX-11). The project's 44px touch-target rule also fails (UX-7). The Modal, segmented toggles, focus handling in Settings and Home, and the chart labels pass.
**Docs delivered:** `docs/ux.md` (Tier 2, T-001.7).

### How to read the severities

- **BLOCKER:** crosses a UX redline in `.claude/agents/ux-designer.md`. Every one here is **pre-existing**: none is introduced by this branch, so none blocks merging it. Each one **blocks the next PR that touches its flow** until it is fixed there, and each should become a `fix/` task in `/tasks/`. I ask that **UX-1 and UX-2 be fixed before the phase 2 deploy**: phase 2 added block-task and category-scoped targets, which widened what those silent deletes destroy.
- **WARNING:** a real usability or accessibility problem that doesn't cross a redline on its own. Fix it soon.
- **SUGGESTION:** polish.

### Method

I read `CLAUDE.md`, the `notch-ux` skill, the round-1 reviews (analyst, architect, data-engineer), `src/App.jsx`, all of `src/views/*.jsx`, all of `src/components/*.jsx`, `src/styles.css` and every view and component CSS file, `src/lib/colors.js`, `messages.js`, `push.js`, and the relevant parts of `time.js`, `reminders.js`, `DataContext.jsx` and `stats.js`. I grepped `src/` for `prefers-reduced-motion`, `transition`, `focus-visible`, `outline`, `aria-label`, `window.confirm`, `remove(`, hard-coded hex and `rgba(`, and grepped `index.html` and `public/` for theme colour and shortcuts. I computed contrast with the WCAG 2.x relative-luminance formula in a scratch Node script; the figures are below. I estimated touch-target sizes from CSS padding, font size and the 1.45 line height (`styles.css:65-66`).

**Not done:** I did not run the app, a screen reader or a real device. Anything that depends on runtime behaviour is marked *inferred* or `UNKNOWN`.

### Contrast measurements (WCAG 2.x ratio; AA needs 4.5:1 for text, 3:1 for large text and UI parts)

| Pair | Light | Dark | Where |
|------|-------|------|-------|
| `#fff` on `--accent-grad` stops `#ff9a5a` / `#ee6a45` / `#e8566a` | **2.10 / 3.10 / 3.52** | same (the gradient is not redefined) | `.btn-primary` (`styles.css:196-201`) |
| `--danger` on `--surface` | **4.21** | 6.32 | `.error`, `.btn-danger` |
| `--accent-strong` on `--accent-soft` | **3.82** | 7.37 | active nav, `.seg .active`, `.chip-active`, "Now" chip |
| `--good` on `--surface` | **3.09** | 8.24 | "Claimed ✓", "Reached ✓" |
| `--muted` on `--bg` / `--surface-2` / `--accent-soft` | **4.30 / 4.09 / 3.84** | 7.04 / 5.48 / — | `.page-sub`, task meta on tinted rows, affirmation label |
| `--muted` on `--surface` | 4.53 (just passes) | 6.30 | card secondary text |
| `#fff` on `--accent` (today's date in Calendar) | **3.10** | **2.24** | `Calendar.css:23-31` |
| `--border` on `--surface` (input edge) | **1.25** | **1.31** | `.input` (`styles.css:243`) |
| `--text` on `--surface` | 14.57 | 14.04 | body |

Candidate fixes I checked: white on `#c9502d` / `#b3432a` / `#a83a52` gives 4.50 / 5.60 / 6.19. `#b8324a` on white gives 5.84. `#1f7d5c` on white gives 5.06. `#6b6380` on `#fff1e6` / `#ffe8dc` / `#ffeedd` gives 5.10 / 4.79 / 4.98. `#a8401f` on `#ffe8dc` gives 5.22. `#1a1726` on `#ff8f66` gives 7.85.

---

## Blockers

### UX-1 — Deleting a block has no confirmation and silently destroys history · BLOCKER
**Where:** Calendar → block → Edit block → Delete. `src/components/BlockEditor.jsx:103-106` (handler) and `:249` (button). There is also no `try/catch`: a failed delete gives no message.
**Repro:** Calendar → tap a repeating block that has a check-off task with past completions → Delete. The block, every occurrence (past and future), its tasks, their completions, and any "Habit count" target that counts them are gone in one tap. Past weeks' % and points drop. The cascade is described in round-1 DATA-6 and SCOPE-5.
**Fix (v0, cheap):** `window.confirm` with counts, following `CourseEditor.jsx:99`: "Delete "Gym"? This removes all its repeats, 1 check-off task, 34 check-offs and 1 monthly target. Past weeks' points will go down." Add `try/catch` and set `error`. **Later:** "Stop repeating from today" (set `recurUntil`) as the safer option offered in the same dialog. That is cheaper than an archive flag and keeps history.

### UX-2 — Deleting a category takes one tap with no confirmation · BLOCKER
**Where:** Settings → Categories → ✕. `src/views/Settings.jsx:331`.
**Repro:** Settings → tap ✕ next to "Fitness". It is deleted at once. Rewards and targets scoped to it silently become "any category", and its tasks move to "No category" (round-1 DATA-7). Undo is impossible: the colour, name and links are gone. The ✕ sits close to the name input on a small target (UX-7), so a mis-tap is likely.
**Fix (v0):** `window.confirm` naming the impact: "Delete "Fitness"? 12 tasks and 3 blocks will have no category, and the reward "Fitness 50" will count all points." Keep the server-side rule from DATA-7.

### UX-3 — Primary buttons fail text contrast in both themes · BLOCKER
**Where:** `.btn-primary` (`src/styles.css:196-201`, gradient `:15`, not redefined for dark). This affects every main call to action: "+ Task", "+ Block", "Log in", "Save", "Add task", "Claim" and others.
**Repro:** Auth screen → "Log in". White text at 0.9rem and weight 600 over `#ff9a5a` is 2.10:1. The best stop is 3.52:1. This text is not "large" under WCAG, so it needs 4.5:1.
**Fix (simple):** darken the stops so white passes everywhere, for example `linear-gradient(135deg, #c9502d, #b3432a 55%, #a83a52)` (4.50 / 5.60 / 6.19). Or keep the bright gradient and use `color: var(--text)` (`#2b2540`), but the `#e8566a` stop is only 4.14 then, so the stops still need adjusting.

### UX-4 — Text on user-chosen block colours can be unreadable · BLOCKER
**Where:** `textOn()` in `src/lib/colors.js:15-22`, used by Calendar blocks (`src/views/Calendar.jsx:93`) and `Home.jsx:176`. Also the faded done state, `.cal-block.done { opacity: 0.6 }` (`Calendar.css:73`).
**How it picks:** BT.601 brightness `0.299R + 0.587G + 0.114B > 160` gives `#1d1d1f`, otherwise `#fff`. That is not WCAG luminance, so mid-tones get white text when dark text is far better.
**Worst cases from the built-in palettes** (block title is 0.78rem and weight 600, so it needs 4.5):

| Colour (palette) | Brightness | Picked | Ratio picked | Ratio of the other choice |
|---|---|---|---|---|
| `#FB8C00` (Bold) | 157 | white | **2.37** | 7.10 |
| `#4DB6AC` (Sunrise, Ocean) | 149 | white | **2.44** | 6.89 |
| `#90A4AE` (Earth) | 159 | white | **2.59** | 6.50 |
| `#F06292` (Sunrise) | 146 | white | **3.06** | 5.50 |
| `#7986CB` (**`DEFAULT_COLOR`**) | 138 | white | **3.45** | 4.88 |
| `#FB8C00` once done (60% opacity over white) | — | — | **1.69** | — |

12 of the 30 palette entries (11 distinct colours) fail with the colour `textOn` picks. Custom hex values near the threshold, such as `#A0A0A0` (2.61) and `#FF6F00` (2.79), fail too.
**Repro:** Settings → Colour palette → Bold. Calendar → new block → colour orange `#FB8C00` → the title is white on orange.
**Fix (v0, three lines):** return whichever of `#fff` and `#1d1d1f` has the higher WCAG contrast. Even that dips to 4.1 for some blues (`#4477ee`), so use `#000` as the dark choice: the worst case is then about 4.58. For done blocks, use the line-through and a ✓ instead of opacity, or fade only the background.

### UX-5 — Several theme tokens fail text contrast · BLOCKER
**Where:** `src/styles.css:4-54`. The values are in the table above.
- `--danger` on white is 4.21. Every error message in light mode is affected (`.error`, `styles.css:254`).
- `--accent-strong` on `--accent-soft` is 3.82. Affects the active nav tab (`:123`), the active segment (`:230`), `.chip-active` (`:225`) and the "Now" chip (`:221`, phase 2).
- `--good` is 3.09. Affects "Claimed ✓" (`Progress.css:38`) and "Reached ✓" (`MonthPlan.css:10`, phase 2).
- `--muted` is 4.30 on `--bg` (every `.page-sub`), 4.09 on `--surface-2` and 3.84 on the affirmation gradient.
- Dark mode: white on `--accent` for today's date is 2.24 (`Calendar.css:23-31`).
**Repro:** To-do → make a task save fail (go offline) → the red error text is 4.21:1 on white.
**Fix:** light `--danger: #b8324a` (5.84), `--good: #1f7d5c` (5.06) and `--muted: #6b6380` (4.79 to 5.10 on all tinted surfaces). Use `--accent-strong: #a8401f` on `--accent-soft` (5.22) or keep the token and darken only `.active` text. For today's date use dark text, `color: #1a1726` (7.85 on dark `--accent`). Re-check `--muted` on cards after the change.

### UX-6 — The task check circle is nearly invisible on light category colours · BLOCKER
**Where:** `.task-check` (`src/styles.css:304-317`). The ring is `border: 2px solid var(--cat)`. When done, the background is `var(--cat)` with a white ✓.
**Repro:** create a category with a Pastel colour, such as `#FFF9C4`, and add a task. On Home in light mode the unticked ring is 1.07:1 against the card. Ticked, the white ✓ on the pastel is 1.07:1. Other examples: `#FFD54F` 1.41, `#B3E5FC` 1.35. In dark mode, Bold purple `#8E24AA` is 2.23 against `--surface`. WCAG 1.4.11 needs 3:1 for the parts of a control and its states. This is the app's main control.
**Fix (v0):** keep the category colour as a 4px inner accent, but draw the ring in `var(--muted)` or `var(--text)`. Choose the ✓ colour with the fixed `textOn` from UX-4 instead of a fixed `#fff` (`styles.css:314`).

### UX-7 — Touch targets are below 44×44px across the app · BLOCKER
**Where and estimated size** (CSS padding plus 15px × 1.45 line height; no mobile override exists):

| Control | Size | Where |
|---|---|---|
| Task check | 24×24 | `styles.css:304-316`; `TaskItem.jsx:49` |
| Calendar block check | 18×18 | `Calendar.css:78-92`; `Calendar.jsx:101` |
| A 15-minute block (whole tap area) | about 12px tall | `Calendar.jsx:89` (`15 × 56/60 − 2`) |
| `.icon-btn`: modal ✕, task ✎, category ✕, nudge ✕ | about 27×30 | `styles.css:206`; `Modal.jsx:58`, `TaskItem.jsx:87`, `Settings.jsx:331`, `NudgeTimesPicker.jsx:94` |
| `.swatch` and the native colour input | 28×28 and 32×32 | `styles.css:282-289`; `ColorPicker.jsx:44` |
| `.btn-sm`, including the ‹ › date arrows | about 29px tall | `styles.css:205`; `Calendar.jsx:172,176`, `Tasks.jsx:66,68` |
| `button.chip` (category filters, reminder offsets) | about 25px tall | `styles.css:209-219`; `Tasks.jsx:74-85`, `OffsetPicker.jsx:9-17` |
| `.seg button` | about 30px tall | `styles.css:229` (the energy segment already fixes this at 44, `Home.css:34`) |
| `.btn` | about 40px tall | `styles.css:180-193` |

**Repro:** at 375px, open To-do and try to tick a task one-handed. The 24px circle sits beside the row text, which is not tappable.
**Fix (v0, CSS only, no visual change):** inside `@media (max-width: 760px)`, give `.icon-btn`, `.btn-sm`, `button.chip`, `.seg button`, `.swatch` and `.btn` a `min-height: 44px; min-width: 44px`. For `.task-check` and `.cal-check`, add an invisible hit area with `position: relative` and `::after { content: ""; position: absolute; inset: -10px; }`. For very short blocks, show a minimum visual height of 44px, or rely on the "Tasks in this block" check-offs in Now and To-do. **Frontend should confirm** that the `::after` approach doesn't collide with the edit ✎ in the same row.

### UX-8 — Three inputs have only a placeholder as their label · BLOCKER
**Where:**
- The custom palette hex field (`Settings.jsx:421-426`). Its neighbouring `<span>Custom palette</span>` is not a `<label>`.
- The new category name field (`Settings.jsx:453-458`), placeholder "New category (e.g. Faith, School)".
- The `ColorPicker` hex field (`ColorPicker.jsx:28-38`), placeholder "#hex". It appears in every block editor and in Settings.

**Repro:** with a screen reader, Tab into Settings → Categories → the new-category field. It is announced as "edit text" with no name once text is typed. This fails WCAG 1.3.1, 3.3.2 and 4.1.2.
**Fix:** add `aria-label="New category name"`, `aria-label="Hex colour code"` and `aria-label="Add a hex colour to your palette"`, or wrap each in a visible `<label>`.

### UX-9 — Auth fields have no `autocomplete` · BLOCKER
**Where:** `src/views/Auth.jsx:46,51,55-62`.
**Repro:** on a phone, open Notch logged out. The keyboard's password manager doesn't offer saved credentials reliably, and sign-up doesn't offer to generate a password. This fails WCAG 1.3.5 (AA) and makes 3.3.8 Accessible Authentication harder.
**Fix:** `autoComplete="name"`, `"email"`, and `mode === "signup" ? "new-password" : "current-password"`.

### UX-10 — Error messages that don't say what to do next, or show raw server text · BLOCKER
**Where:**
- **App-wide:** "Something went wrong talking to the server: {error}" (`App.jsx:63`). It shows the raw message, has no retry and no `role="alert"`, and the broken view renders under it. `DataContext` already exposes `reload` (`DataContext.jsx:112`).
- **Progress:** "We couldn't load your progress right now." (`Progress.jsx:116`) has no next step.
- **Auth:** shows PocketBase's field messages or `err.message`, such as "Failed to authenticate." (`Auth.jsx:27-28`), with no hint such as "Check your email and password", and no `role="alert"` (`:64`).
- **Editors:** show raw `err.message` (`TaskEditor.jsx:77,91`; `BlockEditor.jsx:99`), and the error `<p>` has no `role="alert"` (`TaskEditor.jsx:261`, `BlockEditor.jsx:246`).
- **Settings:** shows raw `err.message` (`Settings.jsx:47,162,185`).
- **Jargon:** "Reminders aren't set up on this server yet (missing VAPID key)." (`src/lib/push.js:31`).

**Repro:** turn on airplane mode and reload. The banner reads "Something went wrong talking to the server: Failed to fetch". It is jargon and offers no way forward.
**Fix (v0):** one helper, `friendlyError(err, action)`. It returns "We couldn't {action}. Check your connection and try again." when `status === 0`, the server's field message when there is one, and otherwise "{Action} didn't work. Try again in a moment." Add a "Try again" button that calls `reload()` to the App banner, and `role="alert"` on every error `<p>`. On Auth, use "That email and password don't match. Try again, or create an account." For push, use "Reminders aren't available on this version of Notch yet."

### UX-11 — Selected state shown by colour only and not exposed to assistive tech · BLOCKER
**Where:**
- To-do category filter chips: `.chip-active` only, no `aria-pressed` (`Tasks.jsx:74-85`).
- Settings palette preset buttons: `chip-active` only (`Settings.jsx:395-399`).
- `ColorPicker` swatches: the `.selected` border only, with no `aria-pressed` (`ColorPicker.jsx:19-26`). The border is a shape cue, so this one is a WARNING on its own.

**Repro:** To-do → tap "Fitness". The only visual change is a background tint and border colour (`styles.css:225`), and the screen reader says "Fitness, button" with no state. This fails WCAG 1.4.1 and 4.1.2.
**Fix:** add `aria-pressed={filter === c.id}` (and the same for the palette and swatches), and a non-colour cue such as a leading "✓ " in the active chip or a 2px inset ring like `.seg .active` (`styles.css:230`).

---

## Warnings

### UX-12 — Saves that fail silently
- `Progress.jsx:76-95`: `submitReward` has `try/finally` with no `catch`. When it fails, the dialog stays open with the button re-enabled and no message.
- `Progress.jsx:109-113`: `claimReward` has no handling.
- `Calendar.jsx:104-109`: the block ✓ calls `toggleTask` without `await` or `catch`. Offline, nothing happens and nothing is said. Compare `TaskItem.jsx:37-40`, which handles this.
- `Settings.jsx:371` (name), `:328` (category rename), `:351` (palette) and `:353-358` (add category) give no error.

**Repro:** go offline → Progress → Add reward → Save. Nothing happens.
**Fix:** `catch` → `setError(friendlyError(...))` shown with `role="alert"` (see UX-10).

### UX-13 — The task delete confirmation doesn't say history goes with it
**Where:** `TaskEditor.jsx:81-86`. It mentions monthly targets only. Round-1 SCOPE-5 covers the principle side.
**Repro:** To-do → ✎ on a 60-day habit → Delete. The message is "Delete "Stretch"?", but its 60 check-offs and their points also go.
**Fix:** "Delete "Stretch"? Its 60 check-offs (240 points) will be removed from past weeks." Use `completionIndex.byTask.get(task.id)` for the count.

### UX-14 — Edits that rewrite past weeks without a warning
Principle 3 says only three edits may change past totals, each with a warning (`CLAUDE.md`). These edits can also change them, with no warning:
- **Un-ticking and re-ticking a past completion.** `toggleTask` deletes the completion, and re-ticking snapshots the task's *current* points (`DataContext.jsx:87-88`). To-do lets you step back to any past day (`Tasks.jsx:66`).
- **Editing a block's repeat, date or weekday.** Past occurrences are re-derived from the block's current fields (`stats.js:93-107`), so last week's "total" and % change.
- **Editing a habit's "Starting" or "Ends" date, or its type** (`TaskEditor.jsx:127-180`).
- **Editing a reward's target or kind.** Past weeks' "reached" status is recomputed (`Progress.jsx:208-209`).

**Repro:** Calendar → a daily block with a check-off task → change Repeat to Weekly → Progress → last week. The % changes.
**Fix (v0):** an inline note, like `course-warning`, when one of these fields changes on a record that has past completions: "This also changes past weeks' totals." The Data Engineer and Analyst should decide whether any of these become accepted exceptions.

### UX-15 — Unsaved work is lost without warning
- `Modal` closes on backdrop `mousedown` and on Esc with no check for unsaved changes (`Modal.jsx:12,46`). A stray tap outside a half-filled Task or Block editor throws away the input.
- Choosing a palette preset replaces a Custom palette for good, with no confirmation (`Settings.jsx:399`).
- Tapping a custom-palette swatch removes that colour at once (`Settings.jsx:413-419`). Its only hint is a `title` tooltip, which touch users never see.

**Fix:** let `Modal` take an `isDirty` prop. When it is true, the backdrop does nothing and Esc asks "Discard changes?". Confirm before replacing a Custom palette. Give the custom swatches `aria-label="Remove {hex}"` and a visible ✕.

### UX-16 — The task toggle's semantics contradict themselves
**Where:** `TaskItem.jsx:48-56`. The button has `aria-pressed={done}` and also an `aria-label` that flips between "Mark "Gym" done" and "Mark "Gym" not done". When done, a screen reader says "Mark Gym not done, toggle button, pressed". The Calendar ✓ (`Calendar.jsx:101-103`) is named only "Mark done" or "Mark not done", without the block's name, and exposes no state.
**Fix:** use a stable name with real state: `role="checkbox" aria-checked={done} aria-label={task.title}`, or keep the button with `aria-pressed` and a fixed label such as "Done: Gym". For the Calendar, use `aria-label={`Done: ${block.title}`}` with `aria-pressed={allDone}`. Optionally add a polite live region: "Gym done, +10 points".

### UX-17 — Calendar blocks are a `div role="button"` with a button inside
**Where:** `Calendar.jsx:84-117`. This nests interactive elements (WCAG 4.1.2). `onKeyDown` handles only Enter, not Space (`:98`). `<span aria-label="repeats">` (`:117`) is a generic element, so its label is not reliably announced, and screen readers read "↻" literally.
**Fix:** make the block body a real `<button>` (the title and time) and the ✓ a sibling button, both inside a positioned `div`. Use `<span className="sr-only">, repeats</span>` with the ↻ given `aria-hidden`.

### UX-18 — `prefers-reduced-motion` is not respected
**Where:** there are no `prefers-reduced-motion` rules anywhere (grep). The transitions are at `styles.css:233`, `Calendar.css:69`, `Home.css:27` (progress ring) and `Progress.css:17,26`. All are short width and height transitions (WCAG 2.3.3 is AAA), but the checklist requires the query.
**Fix:** one global rule in `styles.css`: `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition: none !important; animation: none !important; scroll-behavior: auto !important; } }`.

### UX-19 — Gaps in dark-mode coverage and hard-coded colours
- Not redefined for dark: `--accent-grad`, `--sun`, `--sky` and `--warn` (`styles.css:15-23` compared with `:33-54`). `--warn` is unused, so it could be removed.
- Hard-coded colours: the ring gradient stops `#ffc94d` and `#ee6a45` (`Home.jsx:31-32`); `#fff` text (`Calendar.css:25`, `styles.css:199,314`); the swatch outline `rgba(0,0,0,.08)` (`styles.css:288`), which is invisible on dark swatches over a dark surface.
- The "No category" dot uses `var(--border)` (`Tasks.jsx:35`), which is 1.25:1, so it is effectively invisible.
- `theme-color` is light only (`index.html:6`; `manifest.webmanifest`, `theme_color` and `background_color`). On a dark device, the status bar and splash screen flash peach.

**Fix:** add dark values for the gradient tokens. Point the ring stops at `var(--sun)` and `var(--accent)` through `stop-color` in CSS. Add `<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#1a1726">`. Use `var(--muted)` for the "No category" dot.

### UX-20 — Input borders are too faint to show where a field is
**Where:** `.input` border `var(--border)` is 1.25 in light and 1.31 in dark against `--surface` (`styles.css:243`). That fails WCAG 1.4.11 (3:1) for identifying a field. Labels help, but empty fields on white cards are hard to find.
**Fix:** add a `--field-border` token at 3:1 or more against `--surface`. `#b0a090` is only 2.54, so the light value must be darker than that. Check it with the contrast script.

### UX-21 — A filtered To-do list can be blank or misleading
**Where:**
- "All tasks" with a category filter that matches nothing renders an empty `grid-2`, because `tasks.length > 0` hides "No tasks yet." (`Tasks.jsx:105-121`).
- "By day" with a filter shows "Nothing here yet. Add a task or a habit to get started." (`Tasks.jsx:90`) even when other categories have tasks.

**Fix:** when a filter is on, show "No {category} tasks {today / at all}." with a "Show all" button, or "+ Task in {category}" (the editor already takes the filter as the default category, `Tasks.jsx:56`).

### UX-22 — View changes aren't announced
**Where:** `document.title` is always "Notch" (`index.html:14`; nothing sets it). After a nav tap, focus stays on the nav button (`App.jsx:51-54`). A screen-reader user gets no cue that the page changed.
**Fix:** in `Shell`, on a view change, set `document.title = `${label} · Notch`` and move focus to the view's `<h1>` (give it `tabIndex={-1}`).

### UX-23 — Auth: no password rule shown and no way back in
**Where:** `Auth.jsx`. The 8-character minimum is enforced only by `minLength={8}` (`:58`), with no visible hint. There is no "Forgot password?" link. Whether PocketBase password-reset email is configured is `UNKNOWN — needs human confirmation`. The busy state disables the button without changing its text (`:65`).
**Fix:** add "At least 8 characters" under the password on sign-up. Change the button text to "Logging in…" while busy. If reset email works on the VM, add "Forgot password?" calling `requestPasswordReset`. If not, record that in an ADR as an accepted gap.

---

## Suggestions

### UX-24 — Modal robustness
The background is not `inert`. `aria-modal` support varies, and iOS VoiceOver can still reach the page behind. The body doesn't lock scrolling. `max-height: calc(100vh - 32px)` (`styles.css:269`) can hide the action row behind the iOS toolbar, so use `100dvh`. When `CourseEditor` swaps to a Task or Block editor and back (`CourseEditor.jsx:185-190`), the remounted Modal records its opener as `document.body`, so focus is lost when the course dialog then closes. Consider native `<dialog>` with `showModal()`, which gives inert and focus handling for free.

### UX-25 — The push toggle shows the wrong label while loading
`enabled` starts as `false` until `isPushEnabled()` resolves (`Settings.jsx:148,166-168`), so a device that is already subscribed briefly shows "Turn on reminders". Start with `null` and show "Checking…".

### UX-26 — Empty and success states that could guide better
- Now: "Nothing in the next 3 hours" (`Now.jsx:72`). Add "Plan a block →" linking to `#calendar`.
- Month targets: "No targets for this month yet." (`MonthPlan.jsx:135`). Add "Add one to aim for something specific."
- Settings has no empty line for Categories (`Settings.jsx:448-450`).
- Settings saves show no "Saved" confirmation (`useUserField`, `Settings.jsx:19-70`). A brief "Saved" in a `role="status"` region would help.

### UX-27 — Drag-to-create has a non-drag alternative (PASS), but the tip is wrong on phones
"+ Block" (`Calendar.jsx:158`) and a single tap, which creates a one-hour block (`:62-68`), satisfy WCAG 2.5.7. *Inferred:* on touch screens, `touch-action: pan-y` (`Calendar.css:42`) gives vertical drags to scrolling, which fires `pointercancel` (`Calendar.jsx:77`), so drag-to-create works only with a mouse. The tip says "click or drag" (`:211`). Change it to "Tap an empty slot to add a block (drag with a mouse to pick a range)." Confirm on a device.

### UX-28 — Push and microcopy tone (mostly PASS)
The copy is warm and never shames (`messages.js` throughout). Two tweaks:
- The nudge title `"0 of 5 done"` (`reminders.js:184`) reads like a score at the start of the day. Use "5 to go today" when `done === 0`.
- "Needs love" (`Progress.jsx:200`) is fine, but pair it with the action, for example "Needs love: Reading. Try one small task."

### UX-29 — Vague accessible names
- The Calendar ‹ › arrows are "Previous" and "Next" (`Calendar.jsx:172,176`). Use "Previous day" or "Previous week".
- The date buttons are named "Today" or "This week", while their action ("Jump to today") lives only in `title` (`Calendar.jsx:173`, `Tasks.jsx:67`). The Progress week and month buttons have no hint at all (`Progress.jsx:133,139`).
- Swatches are named "Color #FF8A65" (`ColorPicker.jsx:25`).

### UX-30 — Time format and steps
`formatTime` always uses 12-hour time ("6:15pm", `time.js:46-52`), while native time inputs follow the device's 24-hour setting, so a 24-hour user sees both. The task "Remind me at" (`TaskEditor.jsx:192-197`) and affirmation (`Settings.jsx:124-131`) inputs have no `step`, while nudges use 15-minute steps (`NudgeTimesPicker.jsx:111`). Use `Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" })` and `step={900}` where 15-minute snapping is wanted. `CLAUDE.md` says the format is "6:00 AM", which is drift.

### UX-31 — Focused controls may be hidden behind the mobile nav (WCAG 2.4.11, inferred)
The bottom nav is `position: fixed` (`styles.css:138-151`), and there is no `scroll-padding-bottom`. A control focused near the bottom of the screen may sit under the nav. Add `html { scroll-padding-bottom: calc(var(--nav-h) + 16px); }` inside the 760px query. Confirm on a device.

### UX-32 — Claiming a reward can't be undone
"Claim" (`Progress.jsx:109-113,215`) can't be reversed in the UI. Add "Undo" for a few seconds, or "Unclaim" on a claimed row. The reward delete confirmation (`:99`) could mention that claim history goes with it.

### UX-33 — Small screen-reader gaps
- The week progress bar has an `aria-label` but no role, so the label is ignored (`Progress.jsx:157`). `MonthPlan.jsx:88` does it correctly with `role="img"`.
- The ScoreCard streak reads "Kept 3" because 🔥 is hidden and there is no unit (`ScoreCard.jsx:14`). Add `sr-only` " day streak".
- The task meta glyphs ▦ and ↻ are read aloud (`TaskItem.jsx:69-70`). Hide them with `aria-hidden`.
- To-do group headings are `<h3>` directly under the `<h1>` (`Tasks.jsx:95`).

### UX-34 — Choices that can't be cleared or restored
Turning nudges off and on again resets custom times to the Regular preset (`NudgeTimesPicker.jsx:62`), the same lost-settings pattern as UX-15. An energy check-in can be changed but not cleared (`EnergyCheckin.jsx:22-23`). That is fine, but say so if it's intended.

---

### Checklist results

| Item | Result | Findings |
|---|---|---|
| Modal: role, label, focus trap, Esc, focus return | **PASS** (`Modal.jsx:5-64`) with robustness gaps | UX-15, UX-24 |
| Icon-only buttons have labels | **PASS** for every ✕ ✎ ‹ › button; custom swatches rely on `title` | UX-15, UX-29 |
| Checkbox semantics in TaskItem | **FAIL**: contradictory label and state; Calendar ✓ has no state | UX-16, UX-17 |
| Touch targets ≥ 44px on mobile | **FAIL** | UX-7 |
| Contrast of text on user colours | **FAIL** (worst 2.37; done blocks 1.69) | UX-4, UX-6 |
| Light and dark token coverage | **PARTIAL** | UX-3, UX-5, UX-19, UX-20 |
| Loading, empty, error and success per view | **PARTIAL**: empty states are good; errors are weak | UX-10, UX-12, UX-21, UX-25, UX-26 |
| Destructive and history-changing actions warn | **FAIL** | UX-1, UX-2, UX-13, UX-14, UX-15, UX-32 |
| Non-drag alternative for drag-to-create | **PASS** | UX-27 |
| `prefers-reduced-motion` | **FAIL** | UX-18 |
| Form labels in Auth and the editors | **PASS** in Auth and the editors; **FAIL** for 3 inputs in Settings and ColorPicker; Auth has no autocomplete | UX-8, UX-9 |
| Push copy tone | **PASS** | UX-28 |
| Keyboard reaches everything | **PASS** by code reading (native buttons and inputs; blocks have `tabIndex`); not run | UX-17, UX-22 |

### Every destructive or history-changing action

| # | Action | Where | Confirm? | Says what goes? | Finding |
|---|---|---|---|---|---|
| 1 | Delete block (all repeats, tasks, check-offs, block-task targets) | `BlockEditor.jsx:103-106` | **No** | No | UX-1 |
| 2 | Delete category | `Settings.jsx:331` | **No** | No | UX-2 |
| 3 | Delete task (check-offs and targets) | `TaskEditor.jsx:81-93` | Yes | Targets only | UX-13 |
| 4 | Un-tick a completion, including past days (re-tick re-snapshots points) | `DataContext.jsx:87-88` | No | n/a | UX-14 |
| 5 | Edit a block's repeat, date or weekday (past occurrences re-derived) | `BlockEditor.jsx:142-173` | No | No | UX-14 |
| 6 | Edit a habit's start or end date, or its type | `TaskEditor.jsx:127-180` | No | No | UX-14 |
| 7 | Edit a reward's target or kind (past weeks' "reached" changes) | `Progress.jsx:227-234` | No | No | UX-14 |
| 8 | Choose a palette preset (replaces Custom) | `Settings.jsx:399` | **No** | No | UX-15 |
| 9 | Tap a custom swatch (removes the colour) | `Settings.jsx:413-419` | **No** | `title` only | UX-15 |
| 10 | Close a dialog by backdrop or Esc (loses edits) | `Modal.jsx:12,46` | No | n/a | UX-15 |
| 11 | Delete reward | `Progress.jsx:97-107` | Yes | Name only | UX-32 |
| 12 | Claim reward (can't be undone) | `Progress.jsx:109-113` | No | n/a | UX-32 |
| 13 | Delete target | `TargetEditor.jsx:76-91` | Yes | Name (nothing cascades) | — |
| 14 | Delete course (habits and blocks kept) | `CourseEditor.jsx:81-92` | Yes | Yes | — |
| 15 | Delete these habits | `CourseEditor.jsx:94-115` | Yes | Yes, with counts (the model) | — |
| 16 | Remove a week (moves a stop course's end) | `CourseEditor.jsx:160-182` | Yes | Yes | — |
| 17 | Change course start or week number, or switch a finished course to Stop | `CourseEditor.jsx:211,226-231,261` | Inline warning | Yes | — |
| 18 | Nudges off (custom times lost) | `NudgeTimesPicker.jsx:62` | No | n/a | UX-34 |
| 19 | Discard month-plan edits | `MonthPlan.jsx:79` | No (an explicit button) | n/a | — |
| 20 | Delete account | not in the UI | — | — | `UNKNOWN`: no flow exists |

### Simpler alternatives offered
- UX-1: `window.confirm` with counts now; "Stop repeating from today" later, instead of an archive schema.
- UX-3 and UX-5: change token values only, with no component changes.
- UX-4: a three-line change to `textOn` (best of the two contrasts, using `#000`) instead of letting users pick a text colour.
- UX-7: one mobile media query plus an `::after` hit area, so nothing looks different.
- UX-10: one `friendlyError()` helper plus a `reload()` button, instead of per-screen copy.
- UX-15: an `isDirty` prop on `Modal`, instead of autosaving drafts.
- UX-18: one global CSS rule.

### Notes for other docs (for the Review Coordinator)
- `docs/domain.md` cites `blockOccursOn` at `src/lib/stats.js:104–118`, but it is at `:93–107`, which is out of date.
- `CLAUDE.md` § Layout says `time.js` formats "6:00 AM". The code renders "6am" or "6:15pm" (`time.js:46-52`).
- Round-1 SCOPE-5, DATA-6 and DATA-7 are confirmed from the UX side as UX-13, UX-1 and UX-2.

### Re-check in a later round
- Frontend: UX-1 to UX-12 when the `fix/` tasks land. The visual fixes (UX-3, UX-4, UX-5, UX-6, UX-7) need a 375px and dark-mode pass.
- SDET: a `test:stats` case for the new `textOn` (every palette colour at ≥ 4.5), and an axe or Playwright accessibility smoke test if one is added.
- Analyst and Data Engineer: decide whether the edits in UX-14 become accepted Principle 3 exceptions or get warnings.

**Sign-off: UX Designer — PASS WITH ITEMS** for `chore/adopt-agentic-mastery` (docs and process only; no UI regression; `docs/ux.md` delivered). Findings: 11 BLOCKER, 12 WARNING, 11 SUGGESTION, all pre-existing. Each BLOCKER blocks the next PR that touches its flow. UX-1 and UX-2 should be fixed before the phase 2 deploy.
