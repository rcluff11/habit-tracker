---
name: notch-backend
description: "[backend-engineer] How Notch's server side is built (PocketBase JS hooks + Node push sender) and what to check."
user-invocable: false
---
# Notch — Backend checklist

**Server code:** `pocketbase/pb_hooks/main.pb.js` (hook registration) and `pocketbase/pb_hooks/guards.js` (the shared rules, loaded with `require`). Hooks run in PocketBase's JSVM (goja), which has no npm packages and no `import`/`export` syntax. Local version: `pocketbase/pocketbase.exe --version` (0.41.0).

**Push sender:** `push/sender.mjs` (Node + `web-push`, a systemd unit `notch-push`). It ticks every minute, imports `src/lib/reminders.js` and `messages.js`, and stores what it has sent in `push/.sent.json` so a restart doesn't resend.

## Check on every backend change
- [ ] Each guard runs on **create and update**, and on delete where it matters (course and step deletes write dates first).
- [ ] Validation lives in `guards.js`, not only in the UI: block start and end in 15-minute steps with start < end, points bounds, `remindBefore` ⊂ `REMINDER_OPTIONS`, `nudgeTimes` ≤ `MAX_NUDGES` in `NUDGE_STEP` steps, `dayEndAt` ≥ `EARLIEST_DAY_END`.
- [ ] Shared constants (`CLAUDE.md` principle 6) are identical in `src/lib/reminders.js`, `stats.js` and `guards.js`.
- [ ] Errors are thrown as PocketBase `BadRequestError`/`ForbiddenError` with a message the UI can show. Don't swallow them.
- [ ] Sender: any one user's failure (a 404/410 subscription, bad data) must not stop the loop. Expired subscriptions are deleted. Writes to `.sent.json` are atomic (tmp + rename). Time zones come from the user's settings, not the VM clock.
- [ ] No endpoint, token, or user email is written to logs.
- [ ] The tests are `npm run test:api` (needs `npm run pb`) and the attack scripts `scripts/t4-*.mjs` and `t5-*.mjs`.
