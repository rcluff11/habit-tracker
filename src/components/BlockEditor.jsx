import { useState } from "react";
import Modal from "./Modal";
import ColorPicker from "./ColorPicker";
import { useData } from "../lib/DataContext";
import { DEFAULT_COLOR } from "../lib/colors";
import { STEP, formatTime } from "../lib/time";

const TIMES = Array.from({ length: 1440 / STEP + 1 }, (_, i) => i * STEP);

const RECURRENCE = [
  ["none", "Doesn't repeat"],
  ["daily", "Every day"],
  ["weekdays", "Weekdays (Mon–Fri)"],
  ["weekly", "Weekly"],
];

export default function BlockEditor({ block, defaults = {}, onClose }) {
  const { categories, categoriesById, tasks, save, remove } = useData();
  const [form, setForm] = useState(() => ({
    title: block?.title ?? "",
    date: block?.date ?? defaults.date,
    start: block?.start ?? defaults.start ?? 540,
    end: block?.end ?? defaults.end ?? (defaults.start ?? 540) + 60,
    category: block?.category ?? "",
    color: block?.color ?? DEFAULT_COLOR,
    recurrence: block?.recurrence || "none",
    recurUntil: block?.recurUntil ?? "",
    notes: block?.notes ?? "",
  }));
  const [track, setTrack] = useState({ on: !block, points: 10 });
  const [error, setError] = useState("");

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const linkedTasks = block ? tasks.filter((t) => t.block === block.id) : [];
  // Only offer a check-off task when the block doesn't already have one.
  const canTrack = linkedTasks.length === 0;

  const setCategory = (id) => {
    setForm((f) => ({ ...f, category: id, color: categoriesById[id]?.color ?? f.color }));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (form.end <= form.start) return setError("End time must be after start time.");
    try {
      const saved = await save(
        "blocks",
        { ...form, start: Number(form.start), end: Number(form.end), title: form.title.trim() },
        block?.id
      );
      if (track.on && canTrack) {
        try {
          await save("tasks", {
            title: saved.title,
            category: saved.category,
            points: Number(track.points) || 0,
            block: saved.id,
          });
        } catch (err) {
          // Don't leave a half-created block behind.
          if (!block) await remove("blocks", saved.id);
          throw err;
        }
      }
      onClose();
    } catch (err) {
      setError(err.message);
    }
  };

  const del = async () => {
    await remove("blocks", block.id);
    onClose();
  };

  return (
    <Modal title={block ? "Edit block" : "New block"} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label className="field">
          <span>Name</span>
          <input
            className="input"
            autoFocus
            required
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="e.g. Gym, Deep work, Meal prep"
          />
        </label>

        <div className="form-row">
          <label className="field">
            <span>Start</span>
            <select className="input" value={form.start} onChange={(e) => set("start", Number(e.target.value))}>
              {TIMES.slice(0, -1).map((t) => (
                <option key={t} value={t}>{formatTime(t)}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>End</span>
            <select className="input" value={form.end} onChange={(e) => set("end", Number(e.target.value))}>
              {TIMES.filter((t) => t > form.start).map((t) => (
                <option key={t} value={t}>{t === 1440 ? "Midnight" : formatTime(t)}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="form-row">
          <label className="field">
            <span>{form.recurrence === "none" ? "Date" : "Starts on"}</span>
            <input className="input" type="date" required value={form.date} onChange={(e) => set("date", e.target.value)} />
          </label>
          <label className="field">
            <span>Repeat</span>
            <select className="input" value={form.recurrence} onChange={(e) => set("recurrence", e.target.value)}>
              {RECURRENCE.map(([v, label]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
          </label>
        </div>
        {form.recurrence !== "none" && (
          <label className="field">
            <span>Repeat until (optional)</span>
            <input className="input" type="date" value={form.recurUntil} onChange={(e) => set("recurUntil", e.target.value)} />
          </label>
        )}

        <label className="field">
          <span>Category</span>
          <select className="input" value={form.category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">None</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>

        <div className="field">
          <span>Color</span>
          <ColorPicker value={form.color} onChange={(c) => set("color", c)} />
        </div>

        <label className="field">
          <span>Notes</span>
          <textarea className="input" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </label>

        {block && linkedTasks.length > 0 && (
          <p className="small muted">
            Tasks in this block: {linkedTasks.map((t) => t.title).join(", ")}
          </p>
        )}
        {canTrack && <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
          <label className="check">
            <input type="checkbox" checked={track.on} onChange={(e) => setTrack({ ...track, on: e.target.checked })} />
            {block ? "Add a check-off task for this block" : "Check this off as a task"}
          </label>
          {track.on && (
            <label className="row small">
              <input
                className="input"
                style={{ width: 80 }}
                type="number"
                min={0}
                value={track.points}
                onChange={(e) => setTrack({ ...track, points: e.target.value })}
                aria-label="Points"
              />
              pts
            </label>
          )}
        </div>}

        {error && <p className="error">{error}</p>}
        <div className="modal-actions">
          {block ? (
            <button type="button" className="btn btn-ghost btn-danger" onClick={del}>Delete</button>
          ) : (
            <span />
          )}
          <button className="btn btn-primary">{block ? "Save" : "Add block"}</button>
        </div>
      </form>
    </Modal>
  );
}
