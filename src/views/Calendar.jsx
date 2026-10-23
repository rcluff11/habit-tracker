import { useEffect, useRef, useState } from "react";
import BlockEditor from "../components/BlockEditor";
import { useData } from "../lib/DataContext";
import { blocksForDate } from "../lib/stats";
import { textOn } from "../lib/colors";
import {
  STEP, addDays, formatDate, formatRange, formatTime, nowMinutes, startOfWeek, todayISO, weekDates,
} from "../lib/time";
import "./Calendar.css";

const HOUR_PX = 56;
const PX_PER_MIN = HOUR_PX / 60;

// Assign side-by-side lanes to overlapping blocks.
function layout(blocks) {
  const placed = [];
  let cluster = [];
  let clusterEnd = -1;
  const flush = () => {
    const lanes = Math.max(...cluster.map((p) => p.lane)) + 1;
    cluster.forEach((p) => (p.lanes = lanes));
    cluster = [];
  };
  for (const b of blocks) {
    if (cluster.length && b.start >= clusterEnd) flush();
    const used = new Set(cluster.filter((p) => p.block.end > b.start).map((p) => p.lane));
    let lane = 0;
    while (used.has(lane)) lane++;
    const p = { block: b, lane, lanes: 1 };
    cluster.push(p);
    placed.push(p);
    clusterEnd = Math.max(clusterEnd, b.end);
  }
  if (cluster.length) flush();
  return placed;
}

function DayColumn({ date, isToday, onCreate, onEdit }) {
  const data = useData();
  const { tasks, completionIndex, toggleTask } = data;
  const [drag, setDrag] = useState(null);
  const ref = useRef(null);
  const now = nowMinutes();

  const minutesAt = (e) => {
    const rect = ref.current.getBoundingClientRect();
    const m = Math.floor((e.clientY - rect.top) / PX_PER_MIN / STEP) * STEP;
    return Math.max(0, Math.min(1440 - STEP, m));
  };

  const onPointerDown = (e) => {
    if (e.target !== ref.current || e.button !== 0) return;
    const m = minutesAt(e);
    ref.current.setPointerCapture(e.pointerId);
    setDrag({ anchor: m, start: m, end: m + STEP });
  };
  const onPointerMove = (e) => {
    if (!drag) return;
    const m = minutesAt(e);
    setDrag({ ...drag, start: Math.min(drag.anchor, m), end: Math.max(drag.anchor, m) + STEP });
  };
  const onPointerUp = () => {
    if (!drag) return;
    // A plain click creates a one-hour block; a drag uses the dragged range.
    const end = drag.end - drag.start === STEP ? Math.min(1440, drag.start + 60) : drag.end;
    onCreate({ date, start: drag.start, end });
    setDrag(null);
  };

  return (
    <div
      ref={ref}
      className={`cal-col ${isToday ? "today" : ""}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => setDrag(null)}
    >
      {layout(blocksForDate(data.blocks, date)).map(({ block, lane, lanes }) => {
        const linked = tasks.filter((t) => t.block === block.id);
        const allDone = linked.length > 0 && linked.every((t) => completionIndex.byKey.has(`${t.id}|${date}`));
        const short = block.end - block.start <= 30;
        return (
          <div
            key={block.id}
            className={`cal-block ${short ? "short" : ""} ${allDone ? "done" : ""}`}
            style={{
              top: block.start * PX_PER_MIN,
              height: Math.max(STEP, block.end - block.start) * PX_PER_MIN - 2,
              left: `calc(${(lane / lanes) * 100}% + 2px)`,
              width: `calc(${100 / lanes}% - 4px)`,
              background: block.color,
              color: textOn(block.color),
            }}
            onClick={() => onEdit(block)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && onEdit(block)}
          >
            {linked.length > 0 && (
              <button
                className="cal-check"
                aria-label={allDone ? "Mark not done" : "Mark done"}
                onClick={(e) => {
                  e.stopPropagation();
                  linked.forEach((t) => {
                    const done = completionIndex.byKey.has(`${t.id}|${date}`);
                    if (done === allDone) toggleTask(t, date);
                  });
                }}
              >
                {allDone ? "✓" : ""}
              </button>
            )}
            <div className="cal-block-title">
              {block.title}
              {block.recurrence !== "none" && <span aria-label="repeats"> ↻</span>}
            </div>
            {!short && <div className="cal-block-time">{formatRange(block.start, block.end)}</div>}
          </div>
        );
      })}
      {drag && (
        <div className="cal-ghost" style={{ top: drag.start * PX_PER_MIN, height: (drag.end - drag.start) * PX_PER_MIN }}>
          {formatRange(drag.start, drag.end)}
        </div>
      )}
      {isToday && <div className="cal-now" style={{ top: now * PX_PER_MIN }} />}
    </div>
  );
}

export default function Calendar() {
  const today = todayISO();
  const [mode, setMode] = useState(() => (window.innerWidth < 760 ? "day" : "week"));
  const [date, setDate] = useState(today);
  const [editing, setEditing] = useState(null);
  const scroller = useRef(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: 7 * HOUR_PX });
  }, []);

  const dates = mode === "day" ? [date] : weekDates(startOfWeek(date));
  const step = mode === "day" ? 1 : 7;
  const title =
    mode === "day"
      ? formatDate(date, { weekday: "long", month: "long", day: "numeric" })
      : `${formatDate(dates[0], { month: "short", day: "numeric" })} – ${formatDate(dates[6], { month: "short", day: "numeric" })}`;

  return (
    <div className="page cal-page">
      <div className="page-header">
        <div>
          <h1>Calendar</h1>
          <p className="page-sub">{title}</p>
        </div>
        <div className="row-wrap">
          <div className="seg">
            {["day", "week"].map((m) => (
              <button key={m} className={mode === m ? "active" : ""} onClick={() => setMode(m)}>
                {m === "day" ? "Day" : "Week"}
              </button>
            ))}
          </div>
          <div className="row">
            <button className="btn btn-sm" onClick={() => setDate(addDays(date, -step))} aria-label="Previous">‹</button>
            <button className="btn btn-sm" onClick={() => setDate(today)}>Today</button>
            <button className="btn btn-sm" onClick={() => setDate(addDays(date, step))} aria-label="Next">›</button>
          </div>
          <button className="btn btn-primary" onClick={() => setEditing({ defaults: { date, start: 540, end: 600 } })}>
            + Block
          </button>
        </div>
      </div>

      <div className="card cal-card">
        <div className="cal-head" style={{ "--cols": dates.length }}>
          <div />
          {dates.map((d) => (
            <button key={d} className={`cal-day-label ${d === today ? "today" : ""}`} onClick={() => { setDate(d); setMode("day"); }}>
              <span>{formatDate(d, { weekday: "short" })}</span>
              <strong>{formatDate(d, { day: "numeric" })}</strong>
            </button>
          ))}
        </div>
        <div className="cal-scroll" ref={scroller}>
          <div className="cal-grid" style={{ "--cols": dates.length, height: 24 * HOUR_PX }}>
            <div className="cal-hours">
              {Array.from({ length: 24 }, (_, h) => (
                <div key={h} className="cal-hour" style={{ top: h * HOUR_PX }}>
                  {h > 0 && formatTime(h * 60)}
                </div>
              ))}
            </div>
            {dates.map((d) => (
              <DayColumn
                key={d}
                date={d}
                isToday={d === today}
                onCreate={(defaults) => setEditing({ defaults })}
                onEdit={(block) => setEditing({ block })}
              />
            ))}
          </div>
        </div>
      </div>
      <p className="small muted">Tip: click or drag on an empty slot to add a block. Times snap to 15 minutes.</p>

      {editing && <BlockEditor block={editing.block} defaults={editing.defaults} onClose={() => setEditing(null)} />}
    </div>
  );
}
