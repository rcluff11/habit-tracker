import { useMemo } from "react";
import { useData } from "../lib/DataContext";
import { dayScore, levelLabel } from "../lib/stats";
import { closingLine, scoreHeadline } from "../lib/messages";
import { todayISO } from "../lib/time";
import CategoryChip from "./CategoryChip";
import "./ScoreCard.css";

const FIRE = <span aria-hidden="true">🔥</span>;

function streakText(s) {
  if (s.broken) return "Missed · fresh start next time";
  if (s.count < 2) return s.keptToday ? "Kept" : "Not yet";
  return <>{s.keptToday ? "Kept" : "Keep it going"} · {FIRE} {s.count}</>;
}

export default function ScoreCard({ date }) {
  const data = useData();
  const today = todayISO();
  const score = useMemo(() => dayScore(data, date, today), [data, date, today]);

  if (date > today) {
    return (
      <div className="score-card">
        <p className="score-headline">Coming up</p>
        <p className="small score-line">
          {score.total === 0
            ? "Nothing is scheduled yet."
            : `${score.total} ${score.total === 1 ? "task" : "tasks"} planned · ${score.possiblePoints} possible points`}
        </p>
      </div>
    );
  }

  const emptyPast = score.total === 0 && date !== today;
  const headline = emptyPast ? "Nothing was scheduled" : scoreHeadline(score);

  return (
    <div className="score-card">
      <p className="score-headline">{headline}</p>

      {score.total > 0 && (
        <>
          <div className="score-stats">
            <div>
              <div className="score-num">{score.percent}%</div>
              <div className="muted small">complete</div>
            </div>
            <div>
              <div className="score-num">
                {score.points}
                <span className="score-denom"> / {score.possiblePoints}</span>
              </div>
              <div className="muted small">points</div>
            </div>
          </div>

          <p className="small score-line">
            {score.bestCategory && (
              <span className="score-best">
                Best category: <CategoryChip id={score.bestCategory} />
              </span>
            )}
            <span>Week average: <strong>{score.weekAvgPercent}%</strong></span>
          </p>

          {score.streaks.length > 0 && (
            <div>
              <h3 className="score-sub">Habit streaks</h3>
              <ul className="score-streaks">
                {score.streaks.map((s) => (
                  <li key={s.task.id}>
                    <span className="score-streak-title">{s.task.title}</span>
                    <span className={`small ${s.broken ? "muted" : ""}`}>{streakText(s)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {score.energy && (
        <p className="small score-line">Energy: <strong>{levelLabel(score.energy)}</strong></p>
      )}

      {!emptyPast && <p className="score-closing">{closingLine(score, date)}</p>}
    </div>
  );
}
