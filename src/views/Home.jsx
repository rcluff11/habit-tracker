import { useState } from "react";
import TaskItem from "../components/TaskItem";
import TaskEditor from "../components/TaskEditor";
import { useData } from "../lib/DataContext";
import { blocksForDate, instancesForDate, summarize, weekStats } from "../lib/stats";
import { textOn } from "../lib/colors";
import { formatDate, formatRange, greeting, nowMinutes, startOfWeek, todayISO } from "../lib/time";
import "./Home.css";

const AFFIRMATIONS = [
  "Small steps every day add up to big change.",
  "You don't have to be perfect to make progress.",
  "Discipline is choosing what you want most over what you want now.",
  "Done is better than perfect.",
  "You've handled hard days before. You can handle this one.",
  "Show up for yourself the way you show up for others.",
  "Rest is part of the plan, not a break from it.",
  "Your future self is cheering you on.",
  "One focused hour beats a distracted day.",
  "Progress, not pressure.",
];

function rewardProgress(reward, week) {
  const current =
    reward.kind === "percent"
      ? week.percent
      : reward.category
        ? week.pointsByCategory[reward.category] || 0
        : week.points;
  return { current, remaining: Math.max(0, reward.target - current) };
}

function Ring({ percent }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  return (
    <svg className="ring" viewBox="0 0 100 100" role="img" aria-label={`${percent}% complete`}>
      <circle cx="50" cy="50" r={r} className="ring-track" />
      <circle
        cx="50"
        cy="50"
        r={r}
        className="ring-fill"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - percent / 100)}
      />
      <text x="50" y="50" dominantBaseline="central" textAnchor="middle">{percent}%</text>
    </svg>
  );
}

export default function Home({ go }) {
  const data = useData();
  const { user, categoriesById, rewards } = data;
  const today = todayISO();
  const now = nowMinutes();
  const [editing, setEditing] = useState(null);

  const instances = instancesForDate(data, today, today);
  const day = summarize(instances, categoriesById);
  const week = weekStats(data, startOfWeek(today), today);

  const priorities = instances.filter((i) => i.task.priority);
  const top3 = (priorities.length ? priorities : [...instances].sort((a, b) => (b.task.points || 0) - (a.task.points || 0)))
    .slice(0, 3);

  const upcoming = blocksForDate(data.blocks, today).filter((b) => b.end > now && b.start < now + 180);

  const nextReward = rewards
    .filter((r) => !(r.claimedWeeks || []).includes(week.weekStart))
    .map((r) => ({ reward: r, ...rewardProgress(r, week) }))
    .sort((a, b) => a.remaining - b.remaining)[0];

  const affirmation = AFFIRMATIONS[Math.floor(Date.now() / 86400000) % AFFIRMATIONS.length];
  const firstName = (user.name || "").split(" ")[0];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>{greeting()}{firstName ? `, ${firstName}` : ""} ☀️</h1>
          <p className="page-sub">{formatDate(today, { weekday: "long", month: "long", day: "numeric" })}</p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing({})}>+ Task</button>
      </div>

      <div className="card affirmation">
        <span className="muted small">Today's affirmation</span>
        <p>{affirmation}</p>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <h2>Today's top 3</h2>
            <button className="btn btn-ghost btn-sm" onClick={() => go("tasks")}>All tasks →</button>
          </div>
          {top3.length ? (
            <ul className="task-list">
              {top3.map((i) => (
                <TaskItem key={i.task.id} instance={i} />
              ))}
            </ul>
          ) : (
            <p className="empty">Mark tasks with ★ to make them today's priorities.</p>
          )}
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Next 3 hours</h2>
            <button className="btn btn-ghost btn-sm" onClick={() => go("calendar")}>Calendar →</button>
          </div>
          {upcoming.length ? (
            <ul className="upcoming">
              {upcoming.map((b) => {
                const live = b.start <= now;
                return (
                  <li key={b.id} className={live ? "live" : ""}>
                    <span className="upcoming-bar" style={{ background: b.color, color: textOn(b.color) }} />
                    <div>
                      <div className="task-title">{b.title}</div>
                      <div className="task-meta">
                        {formatRange(b.start, b.end)}
                        {live && <span className="chip live-chip">Now</span>}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="empty">Nothing scheduled — open time is yours.</p>
          )}
        </div>
      </div>

      <div className="grid-2">
        <div className="card today-progress">
          <Ring percent={day.percent} />
          <div className="stack">
            <h2>Today's progress</h2>
            <p><strong>{day.done}</strong> of {day.total} done · <strong>{day.points}</strong> pts</p>
            <p className="muted small">
              {day.total === 0
                ? "Add a few tasks to start earning points."
                : day.done === day.total
                  ? "Everything's done. Huge win! 🎉"
                  : `${day.total - day.done} left — you've got this.`}
            </p>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>This week</h2>
            <button className="btn btn-ghost btn-sm" onClick={() => go("progress")}>Progress →</button>
          </div>
          <div className="spread small" style={{ marginBottom: 6 }}>
            <span>{week.percent}% complete</span>
            <span className="points">{week.points} pts</span>
          </div>
          <div className="progress-bar"><span style={{ width: `${week.percent}%` }} /></div>
          <p className="small" style={{ marginTop: 12 }}>
            {nextReward ? (
              nextReward.remaining === 0 ? (
                <>🏆 You earned <strong>{nextReward.reward.title}</strong>! Claim it on Progress.</>
              ) : (
                <>
                  🎁 <strong>
                    {nextReward.remaining}
                    {nextReward.reward.kind === "percent" ? "%" : " points"}
                  </strong>{" "}
                  until {nextReward.reward.title}
                </>
              )
            ) : (
              <span className="muted">Set a reward on Progress to work toward something.</span>
            )}
          </p>
        </div>
      </div>

      {editing && <TaskEditor task={editing.task} onClose={() => setEditing(null)} />}
    </div>
  );
}
