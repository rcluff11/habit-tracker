# Codex task: Progress view + Rewards

You are collaborating with Claude Code on a React (Vite) + PocketBase habit tracker.
Claude owns the app shell, Home, Calendar and Tasks views. **You own only these two new files:**

- `src/views/Progress.jsx` (default export `Progress`, no props)
- `src/views/Progress.css` (import it from Progress.jsx)

Do not edit any other file. Do not run `npm install`, do not start servers. Plain JS + JSX, no TypeScript, no new dependencies (no chart libraries — draw charts with divs or inline SVG).

## What already exists (read these first)

- `src/lib/DataContext.jsx` — `useData()` returns:
  `{ user, categories, blocks, tasks, completions, rewards, categoriesById, completionIndex, save(collection, data, id?), remove(collection, id), toggleTask(task, date) }`.
  `save` creates when `id` is omitted (the `user` field is filled in automatically) and updates otherwise.
- `src/lib/stats.js` — `weekStats(data, weekStart, today)` where `data` is the object from `useData()`.
  Returns `{ weekStart, weekEnd, total, done, percent, points, possiblePoints, pointsByCategory, byDay }`.
  `pointsByCategory` maps category id (or `"none"`) → points. `byDay` is 7 entries of `{ date, total, done, percent, points, pointsByCategory, instances }`.
- `src/lib/time.js` — `todayISO()`, `startOfWeek(iso)` (Monday), `addDays(iso, n)`, `formatDate(iso, opts)`.
- `src/components/Modal.jsx` — `<Modal title onClose>{children}</Modal>`.
- `src/components/CategoryChip.jsx` — `<CategoryChip id={categoryId} />`.
- `src/styles.css` — design tokens and classes. **Reuse these**, only add view-specific CSS in Progress.css:
  `.page .page-header .page-sub .card .card-head .grid-2 .grid-3 .btn .btn-primary .btn-ghost .btn-sm .btn-danger .icon-btn .chip .dot .seg .progress-bar>span .field .input .form .form-row .empty .muted .small .row .spread .points`
  CSS vars: `--accent --accent-soft --accent-strong --good --good-soft --surface --surface-2 --border --muted --radius`. Dark mode is handled by the vars.
- `pocketbase/pb_migrations/1761100000_init_schema.js` — the schema. The `rewards` collection:
  `title` (text), `kind` ("points" | "percent"), `target` (number), `category` (optional category id; for points rewards, only that category's points count), `claimedWeeks` (JSON array of week-start ISO dates on which it was claimed).

## What to build

Page layout like the other views: `<div className="page">` with a `.page-header` containing `<h1>Progress</h1>` and a week switcher (‹ prev / "This week" / next ›, showing e.g. "Oct 20 – Oct 26").

1. **Week summary cards** (`.grid-3`): % complete (big number + `.progress-bar`), points earned (of possible), tasks done (x / y).
2. **Daily bars**: a 7-column bar chart of percent complete per day (Mon–Sun labels, today highlighted), bar height = percent, show points under each bar.
3. **Points by category**: horizontal bars per category using the category color, sorted desc, with points value. Include categories with 0 points so neglected areas are visible (that is the point of this feature: "crushing fitness but neglecting relationships"). Add a one-line insight, e.g. "Strongest: Fitness · Needs love: Relationships".
4. **Rewards**:
   - List each reward with progress toward its target for the selected week (points → that week's points, or that category's points if `category` is set; percent → week percent). Show "58 points to go" style copy and a progress bar.
   - When reached: a "Claim" button that appends the weekStart to `claimedWeeks` via `save("rewards", { claimedWeeks: [...] }, id)`. Show "Claimed ✓" if already claimed this week.
   - "Add reward" button opens a Modal form: title, kind (seg control: Points / % complete), target, optional category select (only for points). Edit and delete existing rewards via the same modal.
5. Empty states that are friendly (e.g. no tasks yet this week).

Keep it accessible (buttons are `<button>`, labels on inputs) and responsive down to ~380px width.
When done, briefly summarize what you built.
