---
name: build
description: Plan, review, get approval, build, verify — the AGENTS.md § 7 flow for a Notch feature or fix.
argument-hint: "<what to build>"
---
Build the following by following `AGENTS.md` § 7 with the 9-agent team: $ARGUMENTS

1. Open or create `tasks/T-NNN.md` from `_TEMPLATE.md`. Use a branch named `feat/`, `fix/`, `chore/` or `refactor/`.
2. Plan the change, then run the review cycle on the **plan** (Rounds 1–3, plus the 7 lenses if it's a major decision).
3. **Stop and ask the owner to approve the plan** (step 4b). Record their exact words in the task's activity log. Silence is not approval.
4. Build. Backend work follows `notch-backend` and `notch-data-engineer`, and UI work follows `notch-frontend` and `notch-ux`.
5. Run the review cycle on the **build**. The `sdet` round runs every relevant suite.
6. Update `/docs/contracts.md` (and `api.md`/`data-model.md`) for any contract touched, and record the regression-safety line.
7. Commit with the task ID in the message. Don't push or deploy until the owner says so (they deploy once at the end of a phase).
