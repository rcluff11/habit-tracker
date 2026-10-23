import { useState } from "react";
import Modal from "./Modal";
import { useData } from "../lib/DataContext";
import { formatRange, todayISO } from "../lib/time";

const POINT_PRESETS = [5, 10, 25, 50];

function kindOf(task) {
  if (task.block) return "block";
  if (task.daily) return "daily";
  return "once";
}

export default function TaskEditor({ task, defaults = {}, onClose }) {
  const { categories, blocks, save, remove } = useData();
  const [form, setForm] = useState(() => ({
    title: task?.title ?? "",
    category: task?.category ?? defaults.category ?? categories[0]?.id ?? "",
    points: task?.points ?? 10,
    kind: task ? kindOf(task) : defaults.block ? "block" : "once",
    block: task?.block ?? defaults.block ?? "",
    date: task?.date ?? defaults.date ?? "",
    priority: task?.priority ?? false,
  }));
  const [error, setError] = useState("");

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (form.kind === "block" && !form.block) return setError("Pick a calendar block.");
    try {
      await save(
        "tasks",
        {
          title: form.title.trim(),
          category: form.category,
          points: Number(form.points) || 0,
          priority: form.priority,
          block: form.kind === "block" ? form.block : "",
          daily: form.kind === "daily",
          date: form.kind === "block" ? "" : form.kind === "daily" ? form.date || todayISO() : form.date,
        },
        task?.id
      );
      onClose();
    } catch (err) {
      setError(err.message);
    }
  };

  const del = async () => {
    await remove("tasks", task.id);
    onClose();
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
          <span>Type</span>
          <div className="seg" role="group">
            {[
              ["once", "To-do"],
              ["daily", "Daily habit"],
              ["block", "On calendar"],
            ].map(([k, label]) => (
              <button type="button" key={k} className={form.kind === k ? "active" : ""} onClick={() => set("kind", k)}>
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
          <label className="field">
            <span>{form.kind === "daily" ? "Starting" : "Due date (optional)"}</span>
            <input className="input" type="date" value={form.date} onChange={(e) => set("date", e.target.value)} />
          </label>
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
          <button className="btn btn-primary">{task ? "Save" : "Add task"}</button>
        </div>
      </form>
    </Modal>
  );
}
