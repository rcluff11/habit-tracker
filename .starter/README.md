# `.starter/` — the upstream starter's own history

> **Not your project's files.** This is the upstream starter's own task and decision history: how the template itself was built. **Agents:** never read this for project work. Your ledger is `tasks/`, your docs are `docs/`, and you exclude `.starter/` when searching for task IDs. **Humans:** see `ADOPTING.md` § 1 to decide whether to keep it.

## What's here

| Path | What it holds |
|------|---------------|
| `tasks/` | The starter's own tasks (`T-NNN.md`) and their `INDEX.md`. |
| `docs/decisions/` | The starter's own ADRs, e.g. why CI runs on Azure DevOps. |
| `docs/reviews/<branch>/` | Review artifacts for the starter's own changes. |

Your project's `tasks/` and `docs/` start clean: the docs-bootstrap seeds (`T-001`, `T-001.1`–`T-001.17`) and `T-002`, plus the templates. Nothing in here is yours to finish.

## Keep it or delete it?

**Will you pull future updates from this starter?**

- **No** (you created your repo from the template and won't sync): delete it in your first PR with `git rm -r .starter`. Nothing depends on it.
- **Yes, or not sure:** keep it. Agents ignore it, and deleting it would cause a conflict every time you pull an update. You can delete it later.

## Task IDs

Both ledgers use `T-NNN` IDs. The folders keep the files apart, but in a repo that syncs upstream, `git log --grep T-013` can match the starter's commits as well as yours. When the starter's shipped code or docs cite one of its own tasks, they write **"starter T-0NN"**. That means `.starter/tasks/T-0NN.md` in the upstream repo, not your T-0NN.

## For starter maintainers

- **Changing the starter itself:** open the task here (`.starter/tasks/T-NNN.md`, copying `tasks/_TEMPLATE.md`; take the next ID after the highest one in use here, and skip any ID an open PR already holds), and put its review artifact under `.starter/docs/reviews/<branch>/`. Project-facing templates and seeds still live in `tasks/` and `docs/`.
- **`.starter/docs/` is outside the mechanical `/docs` consensus gate** (the hooks and CI only gate `docs/`). Starter records follow the same rule **by convention**: a change to `.starter/docs/` carries `unanimous-consensus: T-NNN` after a full review. `CODEOWNERS` routes `/.starter/` to the tech lead and architect. This trade-off was accepted explicitly when the folder was created (starter T-015, ADR 0004).
- **Markdown only.** Nothing here is configuration: no hook, script or CI file reads `.starter/`, and `.placeholder-allow` must never match it. `scripts/test/test-task-ledgers.sh` enforces both.
