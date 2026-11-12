import { useMemo, useRef, useState } from "react";
import { useData } from "../lib/DataContext";
import Modal from "./Modal";

const KINDS = [
  { value: "points", label: "Points" },
  { value: "percent", label: "% complete" },
  { value: "completions", label: "Habit count" },
];

function serverMessage(err) {
  const fields = err?.response?.data;
  if (fields && typeof fields === "object") {
    for (const key of Object.keys(fields)) if (fields[key]?.message) return fields[key].message;
  }
  return err?.message || "Couldn't save. Try again.";
}

// Add or edit a month target. `target` is null for a new one. `plan` may be null
// (month has no plan yet); it is created first, exactly once.
export default function TargetEditor({ target = null, plan, month, onClose }) {
  const data = useData();
  const [form, setForm] = useState({
    title: target?.title || "",
    kind: target?.kind || "points",
    target: target?.target ?? "",
    category: target?.category || "",
    task: target?.task || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const planRef = useRef(plan);
  if (plan) planRef.current = plan;

  const habits = useMemo(() => data.tasks.filter((t) => t.daily || t.block), [data.tasks]);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const submit = async (event) => {
    event.preventDefault();
    if (busy.current) return;
    const title = form.title.trim();
    const number = Number(form.target);
    if (!title) return setError("Give the target a title.");
    if (!Number.isInteger(number) || number < 1) return setError("The target must be a whole number of at least 1.");
    if (form.kind === "percent" && number > 100) return setError("A % target must be 1–100.");
    if (form.kind === "completions" && !form.task) return setError("A habit target needs a habit.");
    busy.current = true;
    setSaving(true);
    setError("");
    try {
      let planId = planRef.current?.id;
      if (!planId) {
        const created = await data.save("plans", { month, intention: "", notes: "" });
        planRef.current = created;
        planId = created.id;
      }
      const payload = {
        title,
        kind: form.kind,
        target: number,
        category: form.kind === "points" ? form.category || "" : "",
        task: form.kind === "completions" ? form.task : "",
      };
      if (target) await data.save("plan_targets", payload, target.id);
      else await data.save("plan_targets", { plan: planId, ...payload });
      onClose();
    } catch (err) {
      setError(serverMessage(err));
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  const del = async () => {
    if (!target || busy.current) return;
    if (!window.confirm(`Delete “${target.title}”?`)) return;
    busy.current = true;
    setSaving(true);
    setError("");
    try {
      await data.remove("plan_targets", target.id);
      onClose();
    } catch (err) {
      setError(serverMessage(err));
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  return (
    <Modal title={target ? "Edit target" : "Add target"} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label className="field"><span>Target title</span><input className="input" value={form.title} maxLength={120} onChange={(e) => set({ title: e.target.value })} placeholder="400 Fitness points" autoFocus required /></label>
        <div className="field">
          <span>Measure progress by</span>
          <div className="seg" role="group" aria-label="Target type">
            {KINDS.map((k) => (
              <button type="button" key={k.value} className={form.kind === k.value ? "active" : ""} aria-pressed={form.kind === k.value} onClick={() => set({ kind: k.value })}>{k.label}</button>
            ))}
          </div>
        </div>
        <div className="form-row">
          <label className="field"><span>Target{form.kind === "percent" ? " (1–100)" : ""}</span><input className="input" type="number" min="1" max={form.kind === "percent" ? 100 : undefined} step="1" value={form.target} onChange={(e) => set({ target: e.target.value })} required /></label>
          {form.kind === "points" ? (
            <label className="field"><span>Category (optional)</span><select className="input" value={form.category} onChange={(e) => set({ category: e.target.value })}><option value="">All categories</option>{data.categories.map((c) => <option value={c.id} key={c.id}>{c.name}</option>)}</select></label>
          ) : form.kind === "completions" ? (
            <label className="field"><span>Habit</span><select className="input" value={form.task} onChange={(e) => set({ task: e.target.value })} required><option value="">Choose a habit…</option>{habits.map((t) => <option value={t.id} key={t.id}>{t.title}</option>)}</select></label>
          ) : <div />}
        </div>
        {form.kind === "completions" && habits.length === 0 && <p className="muted small">No daily habits or block tasks yet. Add one first.</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="modal-actions">
          <div>{target && <button type="button" className="btn btn-ghost btn-danger" onClick={del} disabled={saving}>Delete</button>}</div>
          <div className="row"><button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : "Save target"}</button></div>
        </div>
      </form>
    </Modal>
  );
}
