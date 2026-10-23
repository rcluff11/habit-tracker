import { useState } from "react";
import TaskItem from "../components/TaskItem";
import TaskEditor from "../components/TaskEditor";
import { useData } from "../lib/DataContext";
import { instancesForDate, summarize } from "../lib/stats";
import { addDays, formatDate, todayISO } from "../lib/time";

const GROUPS = [
  ["priority", "★ Top priorities", (i) => i.task.priority],
  ["block", "On your calendar", (i) => i.task.block],
  ["daily", "Daily habits", (i) => i.task.daily],
  ["once", "To-dos", () => true],
];

export default function Tasks() {
  const data = useData();
  const { categories, categoriesById, tasks, completionIndex } = data;
  const today = todayISO();
  const [mode, setMode] = useState("day");
  const [date, setDate] = useState(today);
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState(null);

  const dayInstances = instancesForDate(data, date, today);
  const visible = dayInstances.filter((i) => !filter || i.task.category === filter);
  const stats = summarize(dayInstances, categoriesById);

  // Each instance lands in the first group that matches it.
  const grouped = GROUPS.map(([key, label]) => [key, label, []]);
  for (const i of visible) {
    const idx = GROUPS.findIndex(([, , match]) => match(i));
    grouped[idx][2].push(i);
  }

  const allByCategory = [...categories, { id: "", name: "No category", color: "var(--border)" }].map((c) => ({
    cat: c,
    items: tasks
      .filter((t) => (t.category || "") === c.id && (!filter || t.category === filter))
      .map((t) => {
        const c2 = completionIndex.byKey.get(`${t.id}|${today}`) ?? (!t.block && !t.daily ? completionIndex.byTask.get(t.id)?.at(-1) : undefined);
        return { task: t, date: today, done: !!c2, completion: c2 };
      }),
  }));

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>To-do</h1>
          <p className="page-sub">
            {mode === "day"
              ? `${date === today ? "Today" : formatDate(date)} · ${stats.done}/${stats.total} done · ${stats.points} pts`
              : `${tasks.length} tasks`}
          </p>
        </div>
        <div className="row-wrap">
          <div className="seg">
            <button className={mode === "day" ? "active" : ""} onClick={() => setMode("day")}>By day</button>
            <button className={mode === "all" ? "active" : ""} onClick={() => setMode("all")}>All tasks</button>
          </div>
          {mode === "day" && (
            <div className="row">
              <button className="btn btn-sm" onClick={() => setDate(addDays(date, -1))} aria-label="Previous day">‹</button>
              <button className="btn btn-sm" onClick={() => setDate(today)}>Today</button>
              <button className="btn btn-sm" onClick={() => setDate(addDays(date, 1))} aria-label="Next day">›</button>
            </div>
          )}
          <button className="btn btn-primary" onClick={() => setEditing({ defaults: { category: filter } })}>+ Task</button>
        </div>
      </div>

      <div className="row-wrap">
        <button className={`chip ${!filter ? "chip-active" : ""}`} onClick={() => setFilter("")}>All</button>
        {categories.map((c) => (
          <button
            key={c.id}
            className={`chip ${filter === c.id ? "chip-active" : ""}`}
            onClick={() => setFilter(filter === c.id ? "" : c.id)}
          >
            <span className="dot" style={{ background: c.color }} />
            {c.name}
            {mode === "day" && stats.pointsByCategory[c.id] ? ` · ${stats.pointsByCategory[c.id]}` : ""}
          </button>
        ))}
      </div>

      {mode === "day" ? (
        <div className="card">
          {visible.length === 0 && <p className="empty">Nothing here yet. Add a task or a habit to get started.</p>}
          {grouped
            .filter(([, , items]) => items.length)
            .map(([key, label, items]) => (
              <section key={key} style={{ marginBottom: 14 }}>
                <h3 className="muted small" style={{ textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</h3>
                <ul className="task-list">
                  {items.map((i) => (
                    <TaskItem key={i.task.id} instance={i} onEdit={(task) => setEditing({ task })} showDate />
                  ))}
                </ul>
              </section>
            ))}
        </div>
      ) : (
        <div className="grid-2">
          {allByCategory
            .filter((g) => g.items.length)
            .map(({ cat, items }) => (
              <div className="card" key={cat.id || "none"}>
                <div className="card-head">
                  <h2 className="row"><span className="dot" style={{ background: cat.color }} />{cat.name}</h2>
                  <span className="muted small">{items.reduce((s, i) => s + (i.task.points || 0), 0)} pts possible</span>
                </div>
                <ul className="task-list">
                  {items.map((i) => (
                    <TaskItem key={i.task.id} instance={i} onEdit={(task) => setEditing({ task })} showDate />
                  ))}
                </ul>
              </div>
            ))}
          {tasks.length === 0 && <p className="empty">No tasks yet.</p>}
        </div>
      )}

      {editing && (
        <TaskEditor
          task={editing.task}
          defaults={{ date: mode === "day" && date !== today ? date : "", ...editing.defaults }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
