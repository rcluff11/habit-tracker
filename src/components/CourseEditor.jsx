import { useMemo, useState } from "react";
import { useData } from "../lib/DataContext";
import { courseDeleteImpact, courseEndDate, courseOnEnd, scheduleIndex, stepStartDate } from "../lib/stats";
import { formatDate } from "../lib/time";
import Modal from "./Modal";
import TaskEditor from "./TaskEditor";
import BlockEditor from "./BlockEditor";
import "./Course.css";

const PAST_WARNING = "This also changes which past days these habits counted on.";
const fmt = (iso) => formatDate(iso, { month: "short", day: "numeric", year: "numeric" });

function errorMessage(err) {
  const fields = err?.response?.data;
  if (fields && typeof fields === "object") {
    for (const key of Object.keys(fields)) if (fields[key]?.message) return fields[key].message;
  }
  return err?.message || "Couldn't save. Try again.";
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

export default function CourseEditor({ courseId: initialId, today, onClose }) {
  const data = useData();
  const [courseId, setCourseId] = useState(initialId);
  const course = courseId ? data.courses.find((c) => c.id === courseId) || null : null;

  const [form, setForm] = useState(() => ({
    title: course?.title || "",
    startDate: course?.startDate || today,
    notes: course?.notes || "",
    onEnd: course?.onEnd === "stop" ? "stop" : "keep",
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sub, setSub] = useState(null); // { type: "task" | "block", step }
  const [newStep, setNewStep] = useState({ week: "", title: "" });
  const [stepError, setStepError] = useState("");
  const [editingStep, setEditingStep] = useState(null); // { id, week, title }
  const [stepEditError, setStepEditError] = useState("");

  const steps = useMemo(
    () => (course ? data.course_steps.filter((s) => s.course === course.id).sort((a, b) => Number(a.week) - Number(b.week)) : []),
    [data.course_steps, course]
  );
  const impact = useMemo(() => (course ? courseDeleteImpact(data, course) : null), [data, course]);

  // The end date as the form would save it: the form's start date plus the highest saved week.
  const endDate = useMemo(
    () => (course && form.startDate ? courseEndDate({ ...course, startDate: form.startDate }, data.schedule) : null),
    [course, form.startDate, data.schedule]
  );

  // Past days are affected if either the saved or the new start date has already been reached.
  const started = !!course && (form.startDate && form.startDate < course.startDate ? form.startDate : course.startDate) <= today;
  const startChanged = !!course && form.startDate !== course.startDate;
  const onEndChanged = !!course && form.onEnd !== courseOnEnd(course);
  const endPassed = !!endDate && endDate < today;

  const saveCourse = async (event) => {
    event.preventDefault();
    const title = form.title.trim();
    if (!title) return setError("Give the course a title.");
    if (!form.startDate) return setError("Choose a start date.");
    setBusy(true);
    setError("");
    try {
      const payload = { title, startDate: form.startDate, notes: form.notes.trim(), onEnd: form.onEnd };
      if (course) await data.save("courses", payload, course.id);
      else {
        const created = await data.save("courses", payload);
        setCourseId(created.id); // stay open so weeks can be added
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const deleteCourse = async () => {
    if (!course || !window.confirm(`Delete “${course.title}”? Its habits and blocks will be kept.`)) return;
    setBusy(true);
    setError("");
    try {
      await data.remove("courses", course.id);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  const deleteHabits = async () => {
    if (!course) return;
    const n = impact.tasks + impact.blockTasks;
    const m = impact.completions;
    const blockPart = impact.blocks ? `, ${plural(impact.blocks, "calendar block")}` : "";
    const msg = `This permanently deletes ${plural(n, "habit")}${blockPart} and ${plural(m, "check-off")}. Past weeks' points will go down. To stop them without losing history, choose Stop habits instead.`;
    if (!window.confirm(msg)) return;
    const stepIds = new Set(steps.map((s) => s.id));
    const tasks = data.tasks.filter((t) => t.step && stepIds.has(t.step));
    const blocks = data.blocks.filter((b) => b.step && stepIds.has(b.step));
    setBusy(true);
    setError("");
    try {
      // Tasks first; deleting a block also removes the tasks on it.
      for (const t of tasks) await data.remove("tasks", t.id);
      for (const b of blocks) await data.remove("blocks", b.id);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const parseWeek = (value) => {
    const week = Number(value);
    return Number.isInteger(week) && week >= 1 && week <= 52 ? week : null;
  };

  const addStep = async (event) => {
    event.preventDefault();
    const week = parseWeek(newStep.week);
    const title = newStep.title.trim();
    if (!week) return setStepError("Week must be a whole number from 1 to 52.");
    if (!title) return setStepError("Give this week a title.");
    if (steps.some((s) => Number(s.week) === week)) return setStepError(`Week ${week} already exists in this course.`);
    setBusy(true);
    setStepError("");
    try {
      await data.save("course_steps", { course: course.id, week, title });
      setNewStep({ week: "", title: "" });
    } catch (err) {
      setStepError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const saveStep = async (event) => {
    event.preventDefault();
    const week = parseWeek(editingStep.week);
    const title = editingStep.title.trim();
    if (!week) return setStepEditError("Week must be a whole number from 1 to 52.");
    if (!title) return setStepEditError("Give this week a title.");
    if (steps.some((s) => s.id !== editingStep.id && Number(s.week) === week)) return setStepEditError(`Week ${week} already exists in this course.`);
    setBusy(true);
    setStepEditError("");
    try {
      await data.save("course_steps", { week, title }, editingStep.id);
      setEditingStep(null);
    } catch (err) {
      setStepEditError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const removeStep = async (step) => {
    let msg = `Remove week ${step.week}? Its habits and blocks will be kept.`;
    // Removing the last week of a "stop" course pulls its end date earlier.
    const remaining = steps.filter((s) => s.id !== step.id);
    const isLast = remaining.every((s) => Number(s.week) < Number(step.week));
    if (courseOnEnd(course) === "stop" && isLast) {
      const newEnd = courseEndDate(course, scheduleIndex([course], remaining));
      if (newEnd && newEnd < today) {
        msg += ` This moves the course end to ${fmt(newEnd)}. Check-offs after that date will stop counting toward past weeks.`;
      }
    }
    if (!window.confirm(msg)) return;
    setBusy(true);
    setStepEditError("");
    try {
      await data.remove("course_steps", step.id);
      if (editingStep?.id === step.id) setEditingStep(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  // While a habit/block editor is open, show only it, so there's a single dialog (and one Escape).
  if (sub?.type === "task") {
    return <TaskEditor defaults={{ step: sub.step.id, daily: true }} onClose={() => setSub(null)} />;
  }
  if (sub?.type === "block") {
    return <BlockEditor defaults={{ step: sub.step.id, recurrence: "daily", date: stepStartDate(course, sub.step) }} onClose={() => setSub(null)} />;
  }

  const stepIdsWithRecords = (step) => ({
    tasks: data.tasks.filter((t) => t.step === step.id),
    blocks: data.blocks.filter((b) => b.step === step.id),
  });

  const endLabel = endDate ? fmt(endDate) : "the last week";

  return (
    <Modal title={course ? "Edit course" : "New course"} onClose={() => !busy && onClose()}>
      <div className="course-editor">
        <form className="form" onSubmit={saveCourse}>
          <label className="field">
            <span>Title</span>
            <input className="input" value={form.title} maxLength={120} required autoFocus onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Build a morning routine" />
          </label>
          <label className="field">
            <span>Start date</span>
            <input className="input" type="date" value={form.startDate} required aria-describedby="course-start-help" onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            <small id="course-start-help" className="muted">Week 1 starts on this day.</small>
            {started && startChanged && <p className="course-warning" role="status">{PAST_WARNING}</p>}
          </label>
          <label className="field">
            <span>Notes (optional)</span>
            <textarea className="input" rows={2} maxLength={2000} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </label>
          <div className="field">
            <span id="course-onend-label">When the course ends</span>
            <div className="seg" role="group" aria-labelledby="course-onend-label">
              <button type="button" className={form.onEnd === "keep" ? "active" : ""} aria-pressed={form.onEnd === "keep"} onClick={() => setForm({ ...form, onEnd: "keep" })}>Keep habits</button>
              <button type="button" className={form.onEnd === "stop" ? "active" : ""} aria-pressed={form.onEnd === "stop"} onClick={() => setForm({ ...form, onEnd: "stop" })}>Stop habits</button>
            </div>
            <small className="muted">
              {form.onEnd === "stop"
                ? onEndChanged && endPassed
                  ? `Stopping hides them after ${endLabel}. Days after ${endLabel} that are already over will stop counting.`
                  : `Stopping hides them after ${endLabel}; your history stays.`
                : "Habits keep going after the last week."}
            </small>
            {onEndChanged && endPassed && (
              <p className="course-warning" role="status">{PAST_WARNING} The course ended {endLabel}.</p>
            )}
          </div>
          {error && <p className="course-error" role="alert">{error}</p>}
          <div className="modal-actions">
            <div>{course && <button type="button" className="btn btn-ghost btn-danger" onClick={deleteCourse} disabled={busy}>Delete course</button>}</div>
            <div className="row">
              <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>{course ? "Close" : "Cancel"}</button>
              <button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : course ? "Save course" : "Create course"}</button>
            </div>
          </div>
        </form>

        {course ? (
          <>
            <h3>Weeks</h3>
            {steps.length === 0 && <div className="empty">No weeks yet. Add Week 1 below.</div>}
            <ul className="step-items">
              {steps.map((step) => {
                const recs = stepIdsWithRecords(step);
                const isEditing = editingStep?.id === step.id;
                const weekChanged = isEditing && Number(editingStep.week) !== Number(step.week);
                return (
                  <li className="step-item" key={step.id}>
                    {isEditing ? (
                      <form onSubmit={saveStep} className="form">
                        <div className="step-fields">
                          <label className="field"><span>Week</span><input className="input" type="number" min="1" max="52" step="1" required value={editingStep.week} onChange={(e) => setEditingStep({ ...editingStep, week: e.target.value })} /></label>
                          <label className="field"><span>Title</span><input className="input" required maxLength={120} value={editingStep.title} onChange={(e) => setEditingStep({ ...editingStep, title: e.target.value })} /></label>
                        </div>
                        {started && weekChanged && <p className="course-warning" role="status">{PAST_WARNING}</p>}
                        {stepEditError && <p className="course-error" role="alert">{stepEditError}</p>}
                        <div className="step-actions">
                          <button className="btn btn-primary btn-sm" disabled={busy}>Save week</button>
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setEditingStep(null); setStepEditError(""); }}>Cancel</button>
                        </div>
                      </form>
                    ) : (
                      <div className="step-head">
                        <div>
                          <strong>Week {step.week}: {step.title}</strong>
                          <div className="muted small">Starts {fmt(stepStartDate(course, step))}</div>
                        </div>
                        <div className="step-actions">
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setEditingStep({ id: step.id, week: String(step.week), title: step.title || "" }); setStepEditError(""); }} aria-label={`Edit week ${step.week}`}>Edit</button>
                          <button type="button" className="btn btn-ghost btn-sm btn-danger" onClick={() => removeStep(step)} disabled={busy} aria-label={`Remove week ${step.week}`}>Remove</button>
                        </div>
                      </div>
                    )}
                    {recs.tasks.length + recs.blocks.length > 0 ? (
                      <ul className="step-records" aria-label={`Week ${step.week} habits and blocks`}>
                        {recs.tasks.map((t) => <li key={t.id}>Habit: {t.title}</li>)}
                        {recs.blocks.map((b) => <li key={b.id}>Block: {b.title}</li>)}
                      </ul>
                    ) : <p className="muted small">No habits or blocks in this week yet.</p>}
                    <div className="step-actions">
                      <button type="button" className="btn btn-sm" onClick={() => setSub({ type: "task", step })}>＋ Add habit to this week</button>
                      <button type="button" className="btn btn-sm" onClick={() => setSub({ type: "block", step })}>＋ Add block to this week</button>
                    </div>
                  </li>
                );
              })}
            </ul>

            <form className="form" onSubmit={addStep} aria-label="Add a week">
              <div className="step-fields">
                <label className="field"><span>Week</span><input className="input" type="number" min="1" max="52" step="1" value={newStep.week} onChange={(e) => setNewStep({ ...newStep, week: e.target.value })} placeholder={String((steps[steps.length - 1]?.week || 0) + 1)} /></label>
                <label className="field"><span>Title</span><input className="input" maxLength={120} value={newStep.title} onChange={(e) => setNewStep({ ...newStep, title: e.target.value })} placeholder="Wake by 8" /></label>
              </div>
              {stepError && <p className="course-error" role="alert">{stepError}</p>}
              <div><button className="btn btn-sm" disabled={busy}>＋ Add week</button></div>
            </form>

            <div className="course-danger">
              <button type="button" className="btn btn-danger" onClick={deleteHabits} disabled={busy || impact.tasks + impact.blocks + impact.blockTasks === 0}>
                Delete these habits ({plural(impact.tasks + impact.blockTasks, "habit")}, {plural(impact.blocks, "block")})
              </button>
              <p className="muted small">Permanently removes the course's habits and blocks and their check-offs. To stop them without losing history, use Stop habits above.</p>
            </div>
          </>
        ) : (
          <p className="muted small">Create the course first, then add its weeks.</p>
        )}
      </div>
    </Modal>
  );
}
