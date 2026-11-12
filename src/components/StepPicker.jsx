import { useMemo } from "react";
import { useData } from "../lib/DataContext";
import { activeWindow, courseEndDate, courseOnEnd } from "../lib/stats";
import { formatDate } from "../lib/time";

/** "Part of course" selector, plus the derived window (from activeWindow, never record.date). */
export default function StepPicker({ value, onChange, recurUntil = "" }) {
  const { courses, course_steps, schedule } = useData();

  const options = useMemo(() => {
    const byCourse = new Map(courses.map((c) => [c.id, c]));
    return course_steps
      .filter((s) => byCourse.has(s.course))
      .map((s) => ({ id: s.id, title: byCourse.get(s.course).title, week: Number(s.week) || 0 }))
      .sort((a, b) => a.title.localeCompare(b.title) || a.week - b.week);
  }, [courses, course_steps]);

  const step = schedule.stepsById.get(value);
  const course = step && schedule.coursesById.get(step.course);
  let windowText = "";
  if (step && course) {
    const win = activeWindow({ step: value, recurUntil }, schedule);
    const courseEnd = courseEndDate(course, schedule);
    windowText = `Starts ${formatDate(win.start)} (Week ${step.week})`;
    if (courseOnEnd(course) === "stop" && courseEnd) {
      windowText += ` · stops with the course on ${formatDate(courseEnd)}`;
      if (win.end && win.end < courseEnd) windowText += ` (or ${formatDate(win.end)}, your end date)`;
    } else {
      windowText += win.end ? ` · ends ${formatDate(win.end)}` : " · keeps going after the course";
    }
  }

  // A saved step that is no longer in the list still needs an option so the select stays truthful.
  const missing = value && !options.some((o) => o.id === value);

  return (
    <div className="field">
      <label htmlFor="step-picker">Part of course (optional)</label>
      <select id="step-picker" className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">None</option>
        {missing && <option value={value}>Unknown course step</option>}
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.title} · Week {o.week}
          </option>
        ))}
      </select>
      {windowText && <p className="small muted">{windowText}</p>}
    </div>
  );
}
