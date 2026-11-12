import { useEffect, useRef, useState } from "react";
import TaskItem from "../components/TaskItem";
import ScoreCard from "../components/ScoreCard";
import EnergyCheckin from "../components/EnergyCheckin";
import { dayEndMinutes } from "../lib/reminders";
import TaskEditor from "../components/TaskEditor";
import { useData } from "../lib/DataContext";
import { instancesForDate, isDayComplete, summarize, topThree, upcomingBlocks, weekStats } from "../lib/stats";
import { affirmationFor } from "../lib/affirmations";
import { textOn } from "../lib/colors";
import { formatDate, formatRange, greeting, nowMinutes, startOfWeek, todayISO } from "../lib/time";
import "./Home.css";

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
      <defs>
        <linearGradient id="ring-sunrise" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffc94d" />
          <stop offset="100%" stopColor="#ee6a45" />
        </linearGradient>
      </defs>
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

const DISMISS_KEY = "notch.scorecard.dismissed";

function readDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) || null;
  } catch {
    return null;
  }
}

function writeDismissed(date) {
  try {
    localStorage.setItem(DISMISS_KEY, date);
  } catch {
    // storage blocked: dismissal lasts until the page reloads
  }
}

export default function Home({ go }) {
  const data = useData();
  const { user, categoriesById, rewards } = data;
  const today = todayISO();
  const now = nowMinutes();
  const [editing, setEditing] = useState(null);
  const [dismissedDate, setDismissedDate] = useState(readDismissed);

  // Re-render every minute (and on return to the app) so the card appears at day end.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60000);
    const onVisible = () => { if (document.visibilityState === "visible") setTick((t) => t + 1); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const instances = instancesForDate(data, today, today);
  const day = summarize(instances, categoriesById);
  const dayComplete = isDayComplete(day);
  const showScoreCard = dismissedDate !== today && (now >= dayEndMinutes(user) || dayComplete);
  const afterCardRef = useRef(null);
  const focusAfterDismiss = useRef(false);
  const dismissScoreCard = () => {
    writeDismissed(today);
    focusAfterDismiss.current = true;
    setDismissedDate(today);
  };
  // The Dismiss button disappears, so hand focus to the next card's label.
  useEffect(() => {
    if (!showScoreCard && focusAfterDismiss.current) {
      focusAfterDismiss.current = false;
      afterCardRef.current?.focus();
    }
  }, [showScoreCard]);
  const week = weekStats(data, startOfWeek(today), today);

  const top3 = topThree(instances);

  const upcoming = upcomingBlocks(data.blocks, today, now, data.schedule);

  const nextReward = rewards
    .filter((r) => !(r.claimedWeeks || []).includes(week.weekStart))
    .map((r) => ({ reward: r, ...rewardProgress(r, week) }))
    .sort((a, b) => a.remaining - b.remaining)[0];

  const affirmation = affirmationFor(today);
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

      {showScoreCard && (
        <section className="card score-home-card" aria-label="Today's score card">
          <div className="card-head">
            <h2>Today's score card</h2>
            <button className="btn btn-ghost btn-sm" onClick={dismissScoreCard} aria-label="Dismiss today's score card">Dismiss</button>
          </div>
          <ScoreCard date={today} />
        </section>
      )}

      <div className="card affirmation">
        <span className="muted small" tabIndex={-1} ref={afterCardRef}>Today's affirmation</span>
        <p>{affirmation}</p>
      </div>

      <EnergyCheckin today={today} now={now} instances={instances} />

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
            <div className="card-actions">
              <button className="btn btn-ghost btn-sm" aria-label="Open Next 3 hours" onClick={() => go("now")}>Open →</button>
              <button className="btn btn-ghost btn-sm" onClick={() => go("calendar")}>Calendar →</button>
            </div>
          </div>
          {upcoming.length ? (
            <ul className="upcoming">
              {upcoming.map(({ block: b, date, live }) => {
                return (
                  <li key={`${b.id}|${date}`} className={live ? "live" : ""}>
                    <span className="upcoming-bar" style={{ background: b.color, color: textOn(b.color) }} />
                    <div>
                      <div className="task-title">{b.title}</div>
                      <div className="task-meta">
                        {formatRange(b.start, b.end)}
                        {live && <span className="chip live-chip">Now</span>}
                        {date !== today && <span className="chip tomorrow-chip">Tomorrow</span>}
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
