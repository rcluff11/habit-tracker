import { useEffect, useState } from "react";
import TaskItem from "../components/TaskItem";
import { useData } from "../lib/DataContext";
import { instancesForDate, topThree, upcomingBlocks } from "../lib/stats";
import { formatRange, nowMinutes, todayISO } from "../lib/time";
import "./Now.css";

export default function Now({ go }) {
  const data = useData();
  // Re-render every minute so live blocks and the window stay current.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60000);
    // Catch up straight away when the tab or installed app comes back to the foreground.
    const onVisible = () => { if (document.visibilityState === "visible") setTick((t) => t + 1); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const today = todayISO();
  const upcoming = upcomingBlocks(data.blocks, today, nowMinutes(), data.schedule);
  const top3 = topThree(instancesForDate(data, today, today));

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Next 3 hours</h1>
          <p className="page-sub">What's live or starting soon.</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => go("home")}>← Home</button>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Coming up</h2>
        </div>
        {upcoming.length ? (
          <ul className="now-blocks">
            {upcoming.map(({ block: b, date, live }) => {
              const items = instancesForDate(data, date, today).filter((i) => i.task.block === b.id);
              const allDone = items.length > 0 && items.every((i) => i.done);
              return (
                <li key={`${b.id}|${date}`} className={`now-block ${live ? "live" : ""}`}>
                  <span className="now-bar" style={{ background: b.color }} aria-hidden="true" />
                  <div className="now-block-body">
                    <div className="now-head">
                      <h3 className="task-title">{b.title}</h3>
                      {live && <span className="chip live-chip">Now</span>}
                      {date !== today && <span className="chip tomorrow-chip">Tomorrow</span>}
                    </div>
                    <div className="now-time">{formatRange(b.start, b.end)}</div>
                    {items.length > 0 && (
                      <>
                        <ul className="task-list">
                          {items.map((i) => (
                            <TaskItem key={i.task.id} instance={i} />
                          ))}
                        </ul>
                        {allDone && <p className="empty">All done ✓</p>}
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="empty">Nothing in the next 3 hours</p>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Today's top 3</h2>
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
    </div>
  );
}
