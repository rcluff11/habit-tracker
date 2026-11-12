import { useMemo, useState } from "react";
import Modal from "./Modal";
import StepPicker from "./StepPicker";
import { useData } from "../lib/DataContext";
import { EFFORT_LEVELS, activeWindow, levelLabel } from "../lib/stats";
import { formatRange, todayISO } from "../lib/time";

const POINT_PRESETS = [5, 10, 25, 50];
// Same text as the server's rejection in pocketbase/pb_hooks (M-2b).
const EARLY_HISTORY = "This habit has check-offs before that course week starts. Create a new habit for the course instead, so its history stays.";

function kindOf(task) {
  if (task.block) return "block";
  if (task.daily) return "daily";
  return "once";
}

export default function TaskEditor({ task, defaults = {}, onClose }) {
  const { categories, blocks, completionIndex, schedule, plan_targets: planTargets = [], save, remove } = useData();
  const [form, setForm] = useState(() => ({
    title: task?.title ?? "",
    category: task?.category ?? defaults.category ?? categories[0]?.id ?? "",
    points: task?.points ?? 10,
    kind: task ? kindOf(task) : defaults.block ? "block" : defaults.step ? "daily" : "once",
    block: task?.block ?? defaults.block ?? "",
    date: task?.date ?? defaults.date ?? "",
    recurUntil: task?.recurUntil ?? "",
    step: task?.step ?? defaults.step ?? "",
    priority: task?.priority ?? false,
    effort: EFFORT_LEVELS.includes(task?.effort) ? task.effort : "",
    remindAt: task?.remindAt ?? "",
    remindDate: task?.remindDate ?? "",
  }));
  const [error, setError] = useState("");

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  // One-off tasks without a due date need a day to be reminded on.
  const needsRemindDate = form.kind === "once" && !form.date;
  const stepped = form.kind === "daily" && !!form.step;
  const reminderBlock = blocks.find((b) => b.id === form.block);

  // Moving an existing habit onto a course week that starts after some of its check-offs would
  // hide that history, so the server refuses it. Warn here first and block Save.
  const earlyHistory = useMemo(() => {
    if (!task || !stepped || form.step === (task.step || "")) return false;
    // Same start the habit would get once linked: max(step start, created - 1 day), as on the server.
    const start = activeWindow({ step: form.step, created: task.created }, schedule).start;
    if (!start) return false;
    return (completionIndex.byTask.get(task.id) || []).some((c) => String(c.date).slice(0, 10) < start);
  }, [task, stepped, form.step, schedule, completionIndex]);

  const submit = async (e) => {
    e.preventDefault();
    if (form.kind === "block" && !form.block) return setError("Pick a calendar block.");
    if (earlyHistory) return;
    try {
      await save(
        "tasks",
        {
          title: form.title.trim(),
          category: form.category,
          points: Number(form.points) || 0,
          priority: form.priority,
          effort: form.effort,
          block: form.kind === "block" ? form.block : "",
          daily: form.kind === "daily",
          step: stepped ? form.step : "",
          recurUntil: form.kind === "daily" && !stepped ? form.recurUntil : "",
          date: form.kind === "block" || stepped ? "" : form.kind === "daily" ? form.date || (task ? "" : todayISO()) : form.date,
          remindAt: form.kind === "block" ? "" : form.remindAt,
          remindDate: needsRemindDate && form.remindAt ? form.remindDate || todayISO() : "",
        },
        task?.id
      );
      onClose();
    } catch (err) {
      setError(err.message);
    }
  };

  const del = async () => {
    const targets = planTargets.filter((t) => t.kind === "completions" && t.task === task.id).length;
    const msg = targets
      ? `Delete “${task.title}”? ${targets === 1 ? "1 monthly target that counts" : `${targets} monthly targets that count`} its check-offs will be deleted too.`
      : `Delete “${task.title}”?`;
    if (!window.confirm(msg)) return;
    try {
      await remove("tasks", task.id);
      onClose();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <Modal title={task ? "Edit task" : "New task"} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label className="field">
          <span>Task</span>
          <input
            className="input"
            autoFocus
            required
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="e.g. Stretch for 10 minutes"
          />
        </label>

        <div className="field">
          <span id="effort-label">Effort (optional)</span>
          <div className="seg effort-seg" role="group" aria-labelledby="effort-label">
            {[["", "None"], ...EFFORT_LEVELS.map((l) => [l, levelLabel(l)])].map(([k, label]) => (
              <button
                type="button"
                key={k || "none"}
                className={form.effort === k ? "active" : ""}
                aria-pressed={form.effort === k}
                onClick={() => set("effort", k)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span id="type-label">Type</span>
          <div className="seg" role="group" aria-labelledby="type-label">
            {[
              ["once", "To-do"],
              ["daily", "Daily habit"],
              ["block", "On calendar"],
            ].map(([k, label]) => (
              <button type="button" key={k} className={form.kind === k ? "active" : ""} aria-pressed={form.kind === k} onClick={() => set("kind", k)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {form.kind === "block" ? (
          <label className="field">
            <span>Calendar block</span>
            <select className="input" value={form.block} onChange={(e) => set("block", e.target.value)}>
              <option value="">Choose a block…</option>
              {blocks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title} · {b.recurrence !== "none" ? `${b.recurrence}, ` : `${b.date}, `}
                  {formatRange(b.start, b.end)}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <>
            {form.kind === "daily" && <StepPicker value={form.step} onChange={(v) => set("step", v)} />}
            {earlyHistory && (
              <p className="error" role="alert" id="early-history">{EARLY_HISTORY}</p>
            )}
            {!stepped && (
              <div className="form-row">
                <label className="field">
                  <span>{form.kind === "daily" ? "Starting" : "Due date (optional)"}</span>
                  <input className="input" type="date" value={form.date} onChange={(e) => set("date", e.target.value)} />
                </label>
                {form.kind === "daily" && (
                  <label className="field">
                    <span>Ends (optional)</span>
                    <input
                      className="input"
                      type="date"
                      min={form.date || undefined}
                      value={form.recurUntil}
                      onChange={(e) => set("recurUntil", e.target.value)}
                    />
                  </label>
                )}
              </div>
            )}
          </>
        )}

        {form.kind === "block" ? (
          <p className="small muted">
            🔔 Reminded with {reminderBlock ? <strong>{reminderBlock.title}</strong> : "its calendar block"}.
          </p>
        ) : (
          <div className="form-row">
            <label className="field">
              <span>Remind me at (optional)</span>
              <input
                className="input"
                type="time"
                value={form.remindAt}
                onChange={(e) => set("remindAt", e.target.value)}
              />
            </label>
            {needsRemindDate && form.remindAt ? (
              <label className="field">
                <span>On (blank = today)</span>
                <input
                  className="input"
                  type="date"
                  value={form.remindDate}
                  onChange={(e) => set("remindDate", e.target.value)}
                />
              </label>
            ) : (
              <p className="small muted" style={{ alignSelf: "end" }}>
                {form.remindAt
                  ? form.kind === "daily"
                    ? "Every day, unless it's already done."
                    : "On the due date, unless it's already done."
                  : ""}
              </p>
            )}
          </div>
        )}

        <div className="form-row">
          <label className="field">
            <span>Category</span>
            <select className="input" value={form.category} onChange={(e) => set("category", e.target.value)}>
              <option value="">None</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Points</span>
            <input
              className="input"
              type="number"
              min={0}
              max={1000}
              value={form.points}
              onChange={(e) => set("points", e.target.value)}
            />
          </label>
        </div>
        <div className="row-wrap">
          {POINT_PRESETS.map((p) => (
            <button
              type="button"
              key={p}
              className={`btn btn-sm ${Number(form.points) === p ? "btn-primary" : ""}`}
              onClick={() => set("points", p)}
            >
              {p} pts
            </button>
          ))}
        </div>

        <label className="check">
          <input type="checkbox" checked={form.priority} onChange={(e) => set("priority", e.target.checked)} />
          ★ Top priority
        </label>

        {error && <p className="error">{error}</p>}
        <div className="modal-actions">
          {task ? (
            <button type="button" className="btn btn-ghost btn-danger" onClick={del}>Delete</button>
          ) : (
            <span />
          )}
          <button className="btn btn-primary" disabled={earlyHistory} aria-describedby={earlyHistory ? "early-history" : undefined}>
            {task ? "Save" : "Add task"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
