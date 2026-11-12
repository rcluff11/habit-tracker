import { useMemo, useState } from "react";
import { useData } from "../lib/DataContext";
import { courseStats } from "../lib/stats";
import { formatDate, monthDates } from "../lib/time";
import CourseEditor from "./CourseEditor";
import "./Course.css";

const fmt = (iso) => formatDate(iso, { month: "short", day: "numeric", year: "numeric" });

// Courses that overlap `month`. A course with no steps has no end, so it shows only in its start month.
function activeIn(month, course, endDate) {
  const dates = monthDates(month);
  const first = dates[0];
  const last = dates[dates.length - 1];
  if (!course.startDate || course.startDate > last) return false;
  if (!endDate) return course.startDate >= first;
  return endDate >= first;
}

export default function CourseList({ month, today }) {
  const data = useData();
  const [editing, setEditing] = useState(null); // null | "new" | course id

  const rows = useMemo(
    () =>
      data.courses
        .map((course) => ({ course, stats: courseStats(data, course, today) }))
        .filter(({ course, stats }) => activeIn(month, course, stats.endDate))
        .sort((a, b) => a.course.startDate.localeCompare(b.course.startDate)),
    [data, month, today]
  );

  return (
    <section className="card course-list" aria-label="Courses">
      <div className="card-head">
        <div>
          <h2>Courses</h2>
          <p className="muted small">Week-by-week plans that add habits as you go.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>＋ New course</button>
      </div>

      {rows.length === 0 ? (
        <div className="empty">No courses this month. Start one to build habits a week at a time.</div>
      ) : (
        <ul className="course-items">
          {rows.map(({ course, stats }) => (
            <li className="course-item" key={course.id}>
              <div className="course-top">
                <div>
                  <strong>{course.title}</strong>
                  <div className="muted small">
                    {stats.currentWeek === 0
                      ? `Starts ${fmt(course.startDate)}`
                      : stats.ended
                      ? "Finished"
                      : `Week ${stats.currentWeek}${stats.weeks.length ? ` of ${stats.weeks[stats.weeks.length - 1].week}` : ""}`}
                    {stats.endDate ? ` · ends ${fmt(stats.endDate)}` : " · no weeks added yet"}
                  </div>
                </div>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(course.id)} aria-label={`Edit course ${course.title}`}>Edit</button>
              </div>
              <p className="small course-end">
                {stats.onEnd === "stop" && stats.endDate ? `Habits stop on ${fmt(stats.endDate)}` : "Habits keep going"}
              </p>
              {stats.weeks.length > 0 && (
                <ul className="course-weeks">
                  {stats.weeks.map((w) => (
                    <li key={w.step.id} className={w.week === stats.currentWeek ? "current" : ""}>
                      <span className="course-week-label">Week {w.week}</span>
                      <div
                        className="progress-bar"
                        role="img"
                        aria-label={w.percent === null ? `Week ${w.week}: no days yet` : `Week ${w.week}: ${w.percent}% complete`}
                      >
                        <span style={{ width: `${w.percent || 0}%` }} />
                      </div>
                      <span className="small course-week-pct">{w.percent === null ? "–" : `${w.percent}%`}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      {editing && <CourseEditor courseId={editing === "new" ? null : editing} today={today} onClose={() => setEditing(null)} />}
    </section>
  );
}
