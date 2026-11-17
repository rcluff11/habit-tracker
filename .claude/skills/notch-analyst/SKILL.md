---
name: notch-analyst
description: "[analyst] Notch scope sources, feature inventory, and how to write acceptance criteria for this app."
user-invocable: false
---
# Notch — Analyst checklist

**Where scope lives:** `tasks/T-NNN.md` (the ledger), `plan.md` (the phase 2 design), and the Status section of `CLAUDE.md`. If they disagree, flag it. Don't pick one yourself.

**The product:** a habit tracker and time-blocking calendar (installable PWA). It has calendar blocks, to-dos, daily habits, points, rewards, monthly plans and targets, and week-by-week courses. There is one user per account, and nothing is shared between accounts.

**The three kinds of task.** Every acceptance criterion that touches tasks must say which kinds it covers:
1. A block task, which happens whenever its block occurs.
2. A daily habit (`daily: true`).
3. A one-off to-do (optional `date`). Its completion counts regardless of date.

**Scope rules specific to Notch:**
- *History stays put.* An edit must not change past weeks' totals. The only allowed exceptions are the three listed in `CLAUDE.md` principle 3, and the UI warns before each. A new feature that rewrites history is out of scope unless it is explicitly accepted.
- Shared rules (principle 6) change together. A criterion that touches reminders, course windows, energy or effort levels, or target kinds must list both sides: `src/lib/*` and `pocketbase/pb_hooks/guards.js`.
- When the owner asks to *learn* something, the deliverable is an explanation and hints, not code.
- The owner wants phase work deployed once, at the end, not feature by feature.

**Writing acceptance criteria:** make each one testable through `npm run test:api`, `test:stats` or `test:reminders`, or through an attack script. "Works on mobile in dark mode" counts only with a named view and viewport (375px).
