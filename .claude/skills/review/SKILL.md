---
name: review
description: Run the AGENTS.md 3-round, 9-agent review on the current branch (or a named focus) and write the review artifact. Reports findings; does not fix.
argument-hint: "[optional focus area]"
---
Run a review of this project using the 9-agent team in `AGENTS.md`. Focus (if any): $ARGUMENTS

1. Run the Session Start Procedure: read `/docs` and `tasks/INDEX.md`.
2. Follow the `review-coordinator` procedure: Round 1 is `analyst`, `architect` and `data-engineer` in parallel. Round 2 is `backend-engineer`, `frontend-engineer` and `ux-designer`. Round 3 is `sdet` and `devops`. Each agent also uses its `notch-*` skill.
3. The `sdet` round runs the test suites for real (see `notch-sdet`) and reports actual output.
4. Write `docs/reviews/<branch>/final.md` using the template in `AGENTS.md` § 9.
5. Report the verdict, the blockers, and the top warnings. Don't fix anything.
