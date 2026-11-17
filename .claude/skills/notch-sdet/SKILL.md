---
name: notch-sdet
description: "[sdet] Notch test inventory, how to run each suite, and the coverage gaps to close."
user-invocable: false
---
# Notch — Test Engineer checklist

## Suites (plain Node scripts, no framework)
| Command | Covers | Needs |
|---|---|---|
| `npm run test:stats` | scheduling, weekStats/monthStats, streaks, course windows, targets | nothing |
| `npm run test:reminders` | reminder and daily-message timing, message wording | nothing |
| `npm run test:api` | collection rules, ownership, hooks, guards | PocketBase running on :8090 |
| `node scripts/t3-energy-attack.mjs` | energy and effort attack cases | PocketBase |
| `node scripts/t4-nudges-attack.mjs` | nudge and setting validation attacks | PocketBase |
| `node scripts/t5-courses-attack.mjs` | course and step attack cases | PocketBase |
| `npm run build` | the bundle compiles | nothing |

The API suites create throwaway accounts and delete them. To run them locally, start `pocketbase.exe serve` from `pocketbase/` in the background, wait for `http://127.0.0.1:8090/api/health`, run the suites, then stop it. Never point them at production.

## Rules
- Every bug fix gets a failing test first, added to the matching script.
- Every ownership rule gets a cross-user attack case: user B must not be able to read, update, delete, or link to user A's record.
- A shared-rule change (principle 6) needs a test on both sides: `stats-test`/`reminders-test` for the app and `api-test` for the hook.
- "No manual-only testing" (`AGENTS.md` § 8): every suite must run in CI (`.github/workflows/checks.yml`). The API suites need PocketBase in CI too.
- Known gaps to track: no component or UI tests, no end-to-end browser test, no coverage measurement.
