---
name: notch-data-engineer
description: "[data-engineer] Notch PocketBase schema rules, migration procedure, and data invariants to check."
user-invocable: false
---
# Notch — Data Engineer checklist

**Schema source of truth:** `pocketbase/pb_migrations/*.js`, applied in filename order. The current state is the result of all of them together. Summarize it in `CLAUDE.md` "Data model" and in `docs/data-model.md`.

## Migration rules (hard)
- Never edit an existing migration. Add a new timestamped file with **both** `up` and `down`.
- Before deploying, `down` must restore the previous schema exactly: rules, select values and indexes.
- Select values must match the app constants: `ENERGY_LEVELS` and `EFFORT_LEVELS` (`src/lib/stats.js`) and the target kinds (`targetProgress`).
- Deploy order: migrations and hooks go to the VM, restart PocketBase, then the sender, then Netlify.

## Invariants to check
- One fact, one place. Records refer to each other by id. Nothing is copied between records, and there are no reverse lists.
- Derived values (week and month %, streaks, target progress, course end dates) are **not stored**. The one exception is `completions.points`, a deliberate snapshot.
- Unique indexes: completions `(task, date)`, checkins `(user, date)`, plans `(user, month)`, course_steps `(course, week)`.
- Cascades: task→block, completion→task, plan_target→plan and →task, course_step→course. Deleting a course or step keeps its habits and blocks, and the server first writes their dates onto them (`guards.js`). That logic must match `activeWindow()` in `stats.js`.
- Stored units: minutes since midnight in 15-minute steps, ISO `YYYY-MM-DD` dates, `"HH:MM"` strings for times of day.
- PII: `users.email`, plus free-text titles and notes. There is no other PII. Never log it from the sender.
