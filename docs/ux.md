# UX — persona, journeys, views and design system

> **Status:** descriptive, drafted 2026-11-14 on `chore/adopt-agentic-mastery`; in review (Tier 2, task T-001.7). **Owner:** UX Designer. Every claim cites the file it came from. Known usability and accessibility gaps are listed with IDs in `docs/reviews/chore-adopt-agentic-mastery/round-2-ux.md` (UX-1 to UX-34) and are only referenced here.

## 1. Who Notch is for

**Primary persona: "the one-handed planner".** One person running their own day from their phone, often with one hand and in a hurry. They plan blocks and habits, tick things off as they go, and want a kind nudge rather than a scolding. (Source: `.claude/skills/notch-ux/SKILL.md`; the product description in `CLAUDE.md` and `index.html`.)

- **Single-user product.** Every record belongs to one user and nothing is shared (`CLAUDE.md` § Data model). There are no team, sharing or admin journeys.
- **Phone first, desktop supported.** Below 760px the side nav becomes a fixed bottom tab bar (`src/styles.css:136-155`). The Calendar opens in Day mode below 760px and in Week mode above it (`src/views/Calendar.jsx:135`).
- **Installed PWA.** There is a web manifest with a "Next 3 hours" app shortcut (`public/manifest.webmanifest:17-24`). Push reminders work only after the user turns them on for each device (`src/views/Settings.jsx:191-205`). On iPhone, Notch must first be added to the Home Screen (`src/lib/push.js:27`).
- **Secondary personas:** UNKNOWN — needs human confirmation. No other persona is described in the code or in `plan.md`.

## 2. Voice and tone

- **Tagline:** "Notch every win." (`src/views/Auth.jsx:38`). The supporting line is "Your calendar, to-dos and habits — with rewards you actually want." (`Auth.jsx:40`).
- **Encouraging, never guilt-tripping.** This rule is written into the copy source itself (`src/lib/messages.js:87`). A missed day is "a fresh start" (`src/components/ScoreCard.jsx:12`), not a failure. A weak category "Needs love" (`src/views/Progress.jsx:200`).
- **Energy-aware.** On a low-energy check-in day, nudges give permission to go easy and never push for more (`messages.js:103-116`). On a high-energy day they encourage bigger tasks (`messages.js:118-131`).
- **Plain words, short sentences, second person.** Examples: "Nothing scheduled — open time is yours." (`src/views/Home.jsx:190`) and "Mark tasks with ★ to make them today's priorities." (`Home.jsx:159`).
- **Celebrate completion.** "Everything's done. Huge win! 🎉" (`Home.jsx:205`) and the `CELEBRATIONS` list (`messages.js:6-27`).
- **Consequence-first warnings.** The best example is the "Delete these habits" confirmation: "This permanently deletes 3 habits, 1 calendar block and 12 check-offs. Past weeks' points will go down. To stop them without losing history, choose Stop habits instead." (`src/components/CourseEditor.jsx:99`). New destructive confirmations should follow this pattern: say what goes, give the counts, and offer the safer option.

## 3. Navigation and views map

Routing is hash based. `useHashView` reads `location.hash` and falls back to `home` for an unknown hash (`src/App.jsx:25-37`). The nav shows five tabs. `now` is hidden from the nav (`App.jsx:13-23`). A view loads only after `DataProvider` has loaded every collection (`App.jsx:64`).

| Hash | Nav label (icon) | File | What it is for | Main parts | Entry points |
|------|------------------|------|----------------|------------|--------------|
| `#home` (default) | Home (☀) | `src/views/Home.jsx` | The day at a glance | Greeting and date; day-end score card (after "Day ends at", or once everything is done; can be dismissed for the day, `Home.jsx:90-97`); today's affirmation; energy check-in (`EnergyCheckin`); Today's top 3 (★ tasks); Next 3 hours preview; Today's progress ring; This week, with the closest reward | Nav; affirmation, nudge and day-end pushes open `/#home` (`src/lib/reminders.js:142,170,186,199`) |
| `#now` (hidden) | — | `src/views/Now.jsx` | "Next 3 hours": live and upcoming blocks with their tasks, plus top 3 | Coming up; Today's top 3; "← Home" button (`Now.jsx:34`) | Home "Open →" (`Home.jsx:167`); app shortcut `/#now` (`manifest.webmanifest:22`) |
| `#calendar` | Calendar (▦) | `src/views/Calendar.jsx` | Time blocking on a 15-minute grid | Day/Week toggle; previous/next and jump to today; day headers (tap one to open that day); grid with drag-to-create; "+ Block" button; tip line | Nav; block reminder pushes open `/#calendar` (`reminders.js:247`) |
| `#tasks` | To-do (✓) | `src/views/Tasks.jsx` | Every task kind in one list | "By day" (groups: ★ Top priorities, On your calendar, Daily habits, To-dos) or "All tasks" (one card per category); category filter chips; "+ Task" | Nav; Home "All tasks →"; task reminder pushes open `/#tasks` (`reminders.js:275`) |
| `#progress` | Progress (↗) | `src/views/Progress.jsx` | Looking back and planning ahead | **Week:** summary cards, a daily bar chart (tap a day to open its score card), points by category, rewards with Claim. **Month:** `MonthPlan` (intention, notes, month stats, targets) and `CourseList` | Nav; Home "Progress →" |
| `#settings` | Settings (⚙) | `src/views/Settings.jsx` | Profile and preferences | Profile and Log out; Notifications (device toggle, default block reminders, daily affirmation, progress nudges); End of day ("Day ends at", day-end push); Colour palette; Categories; Quick access help | Nav |
| — | — | `src/views/Auth.jsx` | Log in or create an account | Name (sign-up only), email, password; switch between log in and sign-up | Shown whenever there is no valid login (`App.jsx:98`) |

**Dialogs** all use `src/components/Modal.jsx`, which has `role="dialog"`, `aria-modal`, a labelled title, Esc to close, a Tab trap and focus return:

| Dialog | Opened from |
|--------|-------------|
| `TaskEditor` (New/Edit task) | Home "+ Task"; To-do "+ Task" and ✎; CourseEditor "＋ Add habit to this week" |
| `BlockEditor` (New/Edit block) | Calendar "+ Block", a tap or drag on the grid, a tap on a block; CourseEditor "＋ Add block to this week" |
| Add/Edit reward (inline in `Progress.jsx:227-234`) | Progress "＋ Add reward" and "Edit" |
| Score card (`Progress.jsx:223-225`) | Progress daily chart, a day's bar |
| `TargetEditor` | Progress Month "＋ Add target" and "Edit" |
| `CourseEditor` | Progress Month "＋ New course" and "Edit". It swaps itself for a Task or Block editor while one is open, so only one dialog is ever on screen (`CourseEditor.jsx:184-190`). |

Destructive confirmations use the browser's `window.confirm` (for example `TaskEditor.jsx:86` and `CourseEditor.jsx:82,100,171`). There is no in-app confirm dialog component.

## 4. Core journeys

Each journey lists its steps, where it lives in the code, and the known gaps (by UX ID).

### 4.1 Plan the day
1. Open Home. Read the affirmation, then pick an energy level (High, Normal or Low). The card then suggests up to three tasks that suit that energy (`EnergyCheckin.jsx:17-19,81-93`).
2. Add tasks with "+ Task". The type can be a To-do, a Daily habit or On calendar (a task tied to a block). The editor also takes effort, points (presets 5, 10, 25, 50), category, ★ Top priority and an optional reminder (`TaskEditor.jsx:96-272`).
3. Block out time in Calendar. Tap an empty slot to create a one-hour block, drag to choose a range, or use "+ Block" (`Calendar.jsx:51-68,158`). Times snap to 15 minutes (`Calendar.jsx:45-49`; the editor lists 15-minute steps, `BlockEditor.jsx:14,126-139`). A new block has "Check this off as a task" turned on by default (`BlockEditor.jsx:41,225-244`).
4. Check "Next 3 hours" (Home card or `#now`) during the day.
- Gaps: UX-4 (block text contrast), UX-7 (touch targets), UX-17 (block semantics), UX-27 (drag on touch), UX-30 (time format).

### 4.2 Check off a habit or task
1. Tap the round check button on a task row (`TaskItem.jsx:48-56`). It works on Home, Now, To-do and in the energy suggestions. A block's check-off can also be ticked on the Calendar block itself (`Calendar.jsx:100-113`).
2. Success: the circle fills with the category colour and the title gets a line-through (`styles.css:317,320`). Streaks of 2 or more show 🔥 n (`TaskItem.jsx:74-76`). Points are a snapshot taken at completion (`DataContext.jsx:88`).
3. Failure: "Couldn't save. Check your connection and try again." appears inline for 5 seconds (`TaskItem.jsx:37-40,79-83`). The Calendar check has no failure message (UX-12).
4. Un-check: tapping again deletes the completion (`DataContext.jsx:87`).
- Gaps: UX-6, UX-7, UX-16, UX-14 (re-checking takes a new points snapshot).

### 4.3 End-of-day score
1. After the user's "Day ends at" time (default 9:00 PM; 12:00 PM at the earliest; set in Settings, `Settings.jsx:237-308`), or as soon as every task is done, Home shows "Today's score card" (`Home.jsx:90,129-137`).
2. The card shows a headline ("3 of 5 done · 12 points"), % complete, points, best category, the week average, habit streaks, energy and a closing line (`ScoreCard.jsx:38-89`, `messages.js:71-85`).
3. "Dismiss" hides it until tomorrow (stored in `localStorage` as `notch.scorecard.dismissed`). Focus then moves to the affirmation label (`Home.jsx:49-104,140`).
4. If "Send my day-end score" is on, a "Your day" push arrives at the same time (`reminders.js:196-199`).
5. Past days: Progress → Week → tap a bar to open that day's score card in a dialog (`Progress.jsx:177-184,223-225`).

### 4.4 Set up a monthly plan or a course
1. Progress → Month. Pick the month with ‹ and › (`Progress.jsx:137-141`).
2. Write an intention and notes, then "Create plan" or "Save plan". "Discard" undoes unsaved edits (`MonthPlan.jsx:67-82`).
3. "＋ Add target": Points (optionally in one category), % complete (1–100), or Habit count (pick a daily habit or block task) (`TargetEditor.jsx:5-9,96-113`). Adding a target creates the month's plan if it doesn't exist yet (`TargetEditor.jsx:52-57`).
4. "＋ New course": title, start date (Week 1 starts that day), notes, and when the course ends: Keep habits or Stop habits. Create it, then add weeks (1–52, each with a title), then "＋ Add habit to this week" or "＋ Add block to this week" (`CourseEditor.jsx:200-313`).
5. Changes that rewrite history show an inline warning before saving: changing the start date or a week number of a course that has started, and switching a finished course to Stop (`CourseEditor.jsx:10,211,226-231,261`). Deletes ask for confirmation (`CourseEditor.jsx:82,99-100,161-171`).
6. Course progress shows as per-week bars in `CourseList` (`CourseList.jsx:66-82`).

### 4.5 Reminders and daily messages
1. Settings → Notifications → "Turn on reminders" (once per device; the browser asks for permission) (`Settings.jsx:171-189`).
2. Default block reminders: a multi-select of minutes before the block (`OffsetPicker`, `REMINDER_OPTIONS`). Each block can use the default, None or Custom (`BlockEditor.jsx:175-198`).
3. Task reminders: "Remind me at" (plus "On" for an undated to-do) (`TaskEditor.jsx:189-218`).
4. Daily affirmation at a chosen time (`Settings.jsx:72-138`). Progress nudges: presets Light, Regular or Frequent, or up to 6 custom times in 15-minute steps (`NudgeTimesPicker.jsx`). Day-end score push (`Settings.jsx:223-235`).
5. Settings fields save as you go, with an inline `role="alert"` error that rolls back on failure (`Settings.jsx:14-70`). There is no "Saved" confirmation (UX-26 notes the missing success cues).

## 5. Screen states

`App` shows "Loading…" until the login is checked and every collection has loaded (`App.jsx:64,97`). It shows one error banner for load failures (`App.jsx:63`). Views do not have their own skeletons.

| View | Loading | Empty | Error | Success |
|------|---------|-------|-------|---------|
| Home | App "Loading…" | Top 3: "Mark tasks with ★…"; Next 3 hours: "Nothing scheduled — open time is yours."; Progress: "Add a few tasks to start earning points."; Reward: "Set a reward on Progress…" (`Home.jsx:159,190,203,235`) | App banner; energy save error with "Please try again." (`EnergyCheckin.jsx:50-54`) | Ring and copy update; "Everything's done. Huge win! 🎉" |
| Now | App "Loading…" | "Nothing in the next 3 hours" (`Now.jsx:72`); top 3 as Home | App banner; per-task toggle error | "All done ✓" under a block (`Now.jsx:63`) |
| Calendar | App "Loading…" | Empty grid plus the tip line (`Calendar.jsx:211`) | App banner; editor `error` text (`BlockEditor.jsx:246`). The block check has none (UX-12). | Editor closes; block appears; finished blocks fade and get a line-through (`Calendar.css:73-74`) |
| To-do | App "Loading…" | Day: "Nothing here yet. Add a task or a habit to get started."; All: "No tasks yet." (`Tasks.jsx:90,121`). Filtered "All" can render blank (UX-21). | App banner; editor `error` | Header count "x/y done · n pts" |
| Progress | "Loading your progress…" (`Progress.jsx:115`; in practice App's loader shows first) | Chart, categories, rewards, targets and courses each have an empty line (`Progress.jsx:187,201,219`; `MonthPlan.jsx:135`; `CourseList.jsx:44`) | "We couldn't load your progress right now." (`Progress.jsx:116`); target, plan and course errors use `role="alert"` | "Claimed ✓", "Reached ✓" |
| Settings | Push status loads in the background (UX-25) | Categories: no empty line (UX-26) | `role="alert"` per field | Push toggle message with `role="status"` (`Settings.jsx:205`) |
| Auth | Button disabled while busy (`Auth.jsx:65`) | n/a | Raw server message (UX-10) | Moves into the app |

## 6. Design system pointers

**Source of truth:** `src/styles.css` (global tokens and shared classes). View CSS adds only view-specific rules: `src/views/{Calendar,Home,Now,Progress}.css` and `src/components/{Course,MonthPlan,ScoreCard}.css` (`CLAUDE.md` § Working with the agents).

**Theme.** Light is "Sunrise" (`styles.css:3-31`). Dark is "Pre-dawn", applied automatically through `@media (prefers-color-scheme: dark)` (`styles.css:33-54`). There is no in-app theme switch.

| Token | Light | Dark | Used for |
|-------|-------|------|----------|
| `--bg` / `--bg-sky` | `#fff8f1` / sunrise gradient | `#1a1726` / indigo gradient | Page background (`body`, `styles.css:62`) |
| `--surface` / `--surface-2` | `#ffffff` / `#fff1e6` | `#242036` / `#2f2a44` | Cards, modals, inputs / chips, tracks, hover |
| `--text` / `--muted` | `#2b2540` / `#7a7290` | `#f6f0f8` / `#a99fc0` | Body text / secondary text |
| `--border` | `#f2e4d8` | `#39324f` | Card, input and row borders |
| `--accent` / `--accent-strong` / `--accent-soft` | `#ee6a45` / `#c9502d` / `#ffe8dc` | `#ff8f66` / `#ffb08f` / `#42293a` | Focus ring, today marker / active text, points / active backgrounds |
| `--accent-grad` | `#ff9a5a → #ee6a45 → #e8566a` | not redefined | `.btn-primary`, brand wordmark |
| `--sun`, `--sun-soft`, `--sky`, `--sky-soft` | `#ffc94d`, `#fff4d6`, `#7cb8f2`, `#e6f1fc` | `--sun-soft` `#3a3226`, `--sky-soft` `#232c45`; `--sun` and `--sky` not redefined | Progress gradients, affirmation card |
| `--good` / `--good-soft` | `#2fa57c` / `#def5ea` | `#5cd0a2` / `#1c3530` | Done, Claimed, Reached |
| `--warn` | `#e0a21c` | not redefined | Defined but not used in `src/` (grep) |
| `--danger` | `#d9465e` | `#ff7a8f` | `.error`, `.btn-danger`, Calendar now-line |
| `--radius` / `--radius-sm` | 18px / 12px | same | Cards / inputs, nav items |
| `--font` / `--font-display` | DM Sans / Fraunces (Google Fonts, `styles.css:1`) | same | Body / `h1`, brand, affirmation |
| `--nav-h` | 64px | same | Mobile bottom-nav height |

Measured contrast for these tokens is in round-2-ux.md (UX-3, UX-5, UX-20).

**Shared classes** (`styles.css`): layout `.page`, `.page-header`, `.page-sub`, `.card`, `.card-head`, `.grid-2`, `.grid-3`, `.row`, `.row-wrap`, `.spread`. Buttons `.btn`, `.btn-primary`, `.btn-ghost`, `.btn-danger`, `.btn-sm`, `.icon-btn`. Toggles `.seg` (segmented, with `aria-pressed`), `.chip`, `.chip-active`. Forms `.form`, `.form-row`, `.field` (label `<span>` plus control), `.input`, `.check`, `.error`. Feedback `.empty`, `.progress-bar`, `.muted`, `.small`. Overlays `.modal-backdrop`, `.modal`, `.modal-head`, `.modal-actions`. Tasks `.task-list`, `.task`, `.task-check`, `.task-body`, `.task-title`, `.task-meta`, `.points`. Colour `.swatches`, `.swatch`, `.hex-input`, `.dot`. Accessibility `.sr-only` (`styles.css:337`).

**Breakpoints in use:** 900px (`.grid-3` goes to two columns), 760px (nav moves to the bottom; Calendar defaults to Day), 640px (grids go to one column), 560px and 380px (Progress), 480px (`.form-row` stacks), 360px (Course and MonthPlan card heads).

**User-chosen colours** (`src/lib/colors.js`):
- `PALETTES`: Sunrise, Ocean, Pastel, Earth and Bold, six colours each (`colors.js:1-7`). `DEFAULT_COLOR` is `#7986CB` (`colors.js:9`).
- The user's palette is stored on `users.palette` as `{ name, colors }`. Settings offers the five presets or a "Custom" list built from hex codes (`Settings.jsx:390-440`). `ColorPicker` shows the user's palette (Sunrise if none is set), a hex text field and a native colour input (`ColorPicker.jsx:6-47`).
- Category colours fill the task check ring (`--cat`, `TaskItem.jsx:47`; `styles.css:309,317`), dots, Progress category bars and Calendar block backgrounds. A block can have its own colour; picking a category copies the category's colour into the block (`BlockEditor.jsx:70-72`).
- Text on a coloured block is picked by `textOn(hex)`. It uses BT.601 perceived brightness with a threshold of 160, returning `#1d1d1f` or `#ffffff` (`colors.js:15-22`). It is used for Calendar blocks (`Calendar.jsx:93`) and the Home upcoming bar (`Home.jsx:176`). It does **not** guarantee WCAG contrast (UX-4).

**Icons** are Unicode glyphs, not an icon font: ☀ ▦ ✓ ↗ ⚙ in the nav (`App.jsx:14-18`, `aria-hidden`), plus ✕ ✎ ‹ › ★ ↻ 🔥. Every icon-only button must have an `aria-label`.

**Time display:** `formatTime` renders 12-hour lowercase without a space, such as "6am" or "6:15pm" (`src/lib/time.js:46-52`). Note that `CLAUDE.md` § Layout says "6:00 AM", which is drift. Native `<input type="time">` fields follow the device locale.

## 7. Push notification copy

All wording is pure data shared with the sender (`push/sender.mjs` imports `src/lib/reminders.js`), so the app and the notifications say the same thing (`messages.js:1-3`).

| Kind | Title | Body | Opens | Source |
|------|-------|------|-------|--------|
| Block reminder | The block's title | "Starts in 10 min" / "Starts in 1 hour" / "Starting now", plus " · To do: …" | `/#calendar` | `reminders.js:42-49,244-247` |
| Task reminder | "Don't forget: {title}" | "Worth {n} points. Tap to check it off." or "Tap to check it off." | `/#tasks` | `reminders.js:272-275` |
| Affirmation | "Today's affirmation" | `affirmationFor(date)` from `src/lib/affirmations.js` | `/#home` | `reminders.js:139-142` |
| Nudge (open day) | "{done} of {total} done" | "{left} left · Next: {task}. {line}". On a low-energy day: "Easy one: …" with a gentle line. | `/#home` | `reminders.js:183-186`, `messages.js:150-161` |
| Nudge (all done) | "All done!" | A celebration line (a gentler one on low days) | `/#home` | `reminders.js:167-170` |
| Day-end score | "Your day" | "{scoreHeadline}. {closingLine}" | `/#home` | `reminders.js:196-199` |
| Test push | "Notch" | "Reminders are working. Go notch a win! ✅" | `/` | `push/sender.mjs:243` |

**Rules for new copy:**
1. Encourage; never shame. Name what is left, never what was missed.
2. Lead with the useful fact (time, task), then the warm line.
3. Choose lines deterministically by date (`pick`, `messages.js:63-68`). No randomness, so the sender and app agree.
4. On low-energy days: no "push harder" wording.
5. Keep a body short enough for a lock screen. The longest current pattern is the nudge body.

## 8. Accessibility standards

- **Target:** WCAG 2.2 level AA as the minimum on every flow, and AAA where reasonable (`.claude/agents/ux-designer.md` redlines). Current conformance: **not met.** See round-2-ux.md for 11 blocker-level gaps.
- **Project rules, stricter than WCAG:** touch targets at least 44×44px on mobile breakpoints (WCAG 2.5.8 asks for 24px); every screen defines loading, empty, error and success states; every error says what to do next; destructive actions confirm and name what goes with them; no colour-only meaning; no dark patterns.
- **Patterns that already work and should be reused:**
  - The `Modal` dialog: role, label, Tab trap, Esc, focus return (`Modal.jsx:5-64`).
  - Segmented toggles that are `role="group"` plus a label and `aria-pressed` buttons (e.g. `TaskEditor.jsx:110-140`, `EnergyCheckin.jsx:66-78`).
  - Inline errors with `role="alert"` and `aria-describedby` (`Settings.jsx:286-304`, `TaskEditor.jsx:158-160,268`).
  - Moving focus to a stable element when the focused control disappears (`NudgeTimesPicker.jsx:20-33`, `Home.jsx:98-104`).
  - `aria-busy` on controls that are saving (`TaskItem.jsx:51`, `EnergyCheckin.jsx:62`).
  - `.sr-only` units for icons ("day streak", "Effort:") (`TaskItem.jsx:72,75`).
  - Charts with full spoken labels (`Progress.jsx:179`).
  - `aria-current="page"` on the active nav tab (`App.jsx:54`).
- **How to check a change:** use keyboard only (Tab, Shift+Tab, Enter, Space, Esc); test at 375px wide in light and dark mode; check text contrast of at least 4.5:1 (3:1 for large text, control borders and states); check any text on a user-chosen colour against all five `PALETTES`; use a screen reader for any new control.

## 9. Destructive and history-changing actions policy

- Every delete confirms first, and names what cascades with it, with counts. Model: `CourseEditor.jsx:94-100`. Use `courseDeleteImpact` (`src/lib/stats.js`) or a similar helper for counts.
- Every edit that changes past weeks' totals warns before saving (`CLAUDE.md` Principle 3). Model: the inline `course-warning` (`CourseEditor.jsx:211,231`).
- Offer the non-destructive option alongside ("Stop habits instead").
- The current gaps are UX-1 (block delete), UX-2 (category delete), UX-13 (task delete wording), UX-14 (past-changing edits) and UX-15 (unsaved-work loss).

## 10. How this doc was verified

Drafted by reading `src/App.jsx`, every file in `src/views/` and `src/components/`, `src/styles.css` and all view and component CSS, `src/lib/colors.js`, `messages.js`, `push.js`, `time.js` (`formatTime`, `dayLabel`), the relevant lines of `reminders.js`, `DataContext.jsx` (`save`, `remove`, `toggleTask`), `stats.js` (`blockOccursOn`), `public/manifest.webmanifest`, `public/sw.js` (grep) and `index.html` (grep). Contrast figures were computed with the WCAG 2.x relative-luminance formula (scratch script, not committed). Nothing was run in a browser. Layout at 375px, screen-reader output and the touch behaviour of the Calendar are inferred from the code and marked as such in the review.

## Update this doc when

- A view, hash route, nav tab, dialog or app shortcut is added, removed or renamed (`src/App.jsx`, `src/views/`, `src/components/*Editor.jsx`, `public/manifest.webmanifest`).
- A token, shared class or breakpoint in `src/styles.css` changes, or dark mode changes.
- `src/lib/colors.js` changes (palettes, `DEFAULT_COLOR`, `textOn`).
- Notification titles, bodies or click URLs change (`src/lib/reminders.js`, `src/lib/messages.js`, `src/lib/affirmations.js`, `push/sender.mjs`).
- A journey in § 4 gains or loses a step, or a destructive or history-changing action is added.
- A UX-n item in the round-2 review is fixed: update the "Gaps" lines and § 8.
