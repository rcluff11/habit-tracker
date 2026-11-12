import { useMemo, useState } from "react";
import { useData } from "../lib/DataContext";
import { monthStats, targetProgress } from "../lib/stats";
import CategoryChip from "./CategoryChip";
import TargetEditor from "./TargetEditor";
import "./MonthPlan.css";

const KIND_LABEL = { points: "points", percent: "%", completions: "times" };

function saveMessage(err) {
  const fields = err?.response?.data;
  if (fields && typeof fields === "object") {
    for (const key of Object.keys(fields)) if (fields[key]?.message) return fields[key].message;
  }
  return err?.message || "Couldn't save. Try again.";
}

// Month view of Progress: intention + notes, month stats, and target progress.
// Owns the TargetEditor (add/edit targets); `children` renders below the cards.
export default function MonthPlan({ month, today, children = null }) {
  const data = useData();
  const [editing, setEditing] = useState(null); // null | "new" | target record
  const plan = useMemo(() => data.plans.find((p) => p.month === month) || null, [data.plans, month]);
  const [intention, setIntention] = useState(plan?.intention || "");
  const [notes, setNotes] = useState(plan?.notes || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const savedIntention = plan?.intention || "";
  const savedNotes = plan?.notes || "";
  const dirty = intention !== savedIntention || notes !== savedNotes;

  const stats = useMemo(() => monthStats(data, month, today), [data, month, today]);
  const targets = useMemo(
    () => (plan ? data.plan_targets.filter((t) => t.plan === plan.id) : []),
    [data.plan_targets, plan]
  );

  const submit = async (event) => {
    event.preventDefault();
    if (!dirty || saving) return;
    setSaving(true);
    setError("");
    try {
      const payload = { intention: intention.trim(), notes: notes.trim() };
      if (plan) await data.save("plans", payload, plan.id);
      else await data.save("plans", { month, ...payload });
      // Server accepted: show the trimmed values as saved.
      setIntention(payload.intention);
      setNotes(payload.notes);
    } catch (err) {
      // Nothing was stored locally; keep the draft so the user can fix it.
      setError(saveMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const revert = () => {
    setIntention(savedIntention);
    setNotes(savedNotes);
    setError("");
  };

  return (
    <div className="month-plan">
      <form className="card month-form" onSubmit={submit}>
        <div className="card-head"><h2>Plan for the month</h2></div>
        <label className="field">
          <span>Intention</span>
          <input className="input" value={intention} maxLength={200} onChange={(e) => setIntention(e.target.value)} placeholder="What matters most this month?" />
        </label>
        <label className="field">
          <span>Notes</span>
          <textarea className="input month-notes" value={notes} maxLength={4000} rows={4} onChange={(e) => setNotes(e.target.value)} placeholder="Themes, reminders, things to try" />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="row month-actions">
          {dirty && !saving && <button type="button" className="btn btn-ghost" onClick={revert}>Discard</button>}
          <button className="btn btn-primary" disabled={!dirty || saving}>{saving ? "Saving…" : plan ? "Save plan" : "Create plan"}</button>
        </div>
      </form>

      <section className="grid-3 summary-grid" aria-label="Month summary">
        <article className="card summary-card">
          <div className="muted small">Complete</div>
          <div className="summary-number">{stats.percent}%</div>
          <div className="progress-bar" role="img" aria-label={`${stats.percent}% complete`}><span style={{ width: `${stats.percent}%` }} /></div>
        </article>
        <article className="card summary-card">
          <div className="muted small">Points earned</div>
          <div className="summary-number">{stats.points}<span className="summary-denom"> / {stats.possiblePoints}</span></div>
          <p className="muted small">of possible points</p>
        </article>
        <article className="card summary-card">
          <div className="muted small">Tasks done</div>
          <div className="summary-number">{stats.done}<span className="summary-denom"> / {stats.total}</span></div>
          <p className="muted small">{stats.total > 0 ? "Keep the rhythm going." : "No tasks scheduled this month."}</p>
        </article>
      </section>

      <section className="card targets-card" aria-label="Month targets">
        <div className="card-head">
          <div><h2>Targets</h2><p className="muted small">Measurable goals for this month.</p></div>
          <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>＋ Add target</button>
        </div>
        {targets.length ? (
          <div className="target-list">
            {targets.map((target) => {
              const p = targetProgress(data, target, plan, today);
              const category = target.category ? data.categoriesById[target.category] : null;
              const task = target.task ? data.tasks.find((t) => t.id === target.task) : null;
              const unit = KIND_LABEL[target.kind] || "";
              return (
                <div className="target-row" key={target.id}>
                  <div className="target-top">
                    <div>
                      <strong>{target.title}</strong>
                      {category && <span className="target-chip"><CategoryChip id={category.id} /></span>}
                      {task && <span className="muted small target-chip">{task.title}</span>}
                    </div>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(target)}>Edit</button>
                  </div>
                  <div className="target-meta">
                    <span>{p.current} / {p.target} {unit}</span>
                    {p.reached ? <span className="claimed">Reached ✓</span> : <span className="muted small">{p.percent}%</span>}
                  </div>
                  <div className="progress-bar" role="img" aria-label={`${target.title}: ${p.percent}% of target`}>
                    <span style={{ width: `${p.percent}%`, background: p.reached ? "var(--good)" : undefined }} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : <div className="empty">No targets for this month yet.</div>}
      </section>

      {editing && <TargetEditor target={editing === "new" ? null : editing} plan={plan} month={month} onClose={() => setEditing(null)} />}

      {children}
    </div>
  );
}
