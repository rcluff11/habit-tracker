import { useData } from "../lib/DataContext";
import { formatDate, formatTime } from "../lib/time";

export default function TaskItem({ instance, onEdit, showDate = false }) {
  const { categoriesById, blocks, toggleTask } = useData();
  const { task, date, done } = instance;
  const cat = categoriesById[task.category];
  const block = task.block && blocks.find((b) => b.id === task.block);

  return (
    <li className={`task ${done ? "done" : ""}`} style={cat ? { "--cat": cat.color } : undefined}>
      <button
        className="task-check"
        onClick={() => toggleTask(task, date)}
        aria-label={done ? `Mark "${task.title}" not done` : `Mark "${task.title}" done`}
        aria-pressed={done}
      >
        {done && "✓"}
      </button>
      <div className="task-body">
        <div className="task-title">
          {task.priority && <span title="Top priority">★ </span>}
          {task.title}
        </div>
        <div className="task-meta">
          {cat && (
            <span className="row" style={{ gap: 4 }}>
              <span className="dot" style={{ background: cat.color }} />
              {cat.name}
            </span>
          )}
          {block && <span>▦ {formatTime(block.start)} · {block.title}</span>}
          {task.daily && <span>↻ Daily</span>}
          {showDate && task.date && !task.daily && !task.block && <span>Due {formatDate(task.date)}</span>}
        </div>
      </div>
      {task.points > 0 && <span className="points">+{task.points}</span>}
      {onEdit && (
        <button className="icon-btn" onClick={() => onEdit(task)} aria-label={`Edit "${task.title}"`}>
          ✎
        </button>
      )}
    </li>
  );
}
