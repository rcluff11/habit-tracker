---
name: notch-review-coordinator
description: "[review-coordinator] How the AGENTS.md review cycle maps onto Notch (solo DRI, paths, sync points)."
user-invocable: false
---
# Notch — Review Coordinator notes

- **Mode:** single repo (no `workspace.manifest.md` at the root). `agentic-mastery/` is the vendored starter source. Ignore it, like `.starter/`.
- **DRI / approver:** the sole maintainer, GitHub `rcluff11`. Every plan approval (§ 7 step 4b) is asked of them in the main session. A subagent returns the ask and never records an approval itself.
- **Artifacts:** `docs/reviews/<branch>/<round>.md` and `final.md`.
- **Agent → Notch skill:** analyst `notch-analyst`, architect `notch-architect`, data-engineer `notch-data-engineer`, backend-engineer `notch-backend`, frontend-engineer `notch-frontend`, ux-designer `notch-ux`, sdet `notch-sdet`, devops `notch-devops`.
- **Extra gate for Notch:** any change to a shared rule (`CLAUDE.md` principle 6) must show both sides changed. A missing side is a BLOCK.
- **Tests that must be green before sign-off:** `test:stats`, `test:reminders` and `build` always. `test:api` and the t3/t4/t5 attack scripts whenever migrations, hooks or rules changed.
- The owner deploys once at the end of a phase, so don't ask to deploy per task.
