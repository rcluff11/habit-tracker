import { useRef, useState } from "react";
import { useData } from "../lib/DataContext";
import { pb } from "../lib/pb";
import { ENERGY_LEVELS, levelLabel, suggestForEnergy } from "../lib/stats";
import TaskItem from "./TaskItem";

export default function EnergyCheckin({ today, now, instances }) {
  const data = useData();
  const { checkins, save } = data;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const queued = useRef(null);

  const existing = checkins.find((c) => c.date === today);
  const energy = existing?.energy || null;
  const suggestions = energy
    ? suggestForEnergy(instances, energy, 3, { blocks: data.blocks, today, nowMinutes: now, schedule: data.schedule })
    : [];

  // Saves run one at a time; taps during a save queue the latest level (last write wins).
  async function choose(level) {
    if (level === energy && !inFlight.current) return;
    queued.current = level;
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    let id = existing?.id;
    try {
      while (queued.current) {
        const next = queued.current;
        queued.current = null;
        try {
          const rec = await save("checkins", { date: today, energy: next }, id);
          id = rec.id;
        } catch (err) {
          if (id || err?.status !== 400) {
            err.createStatus = err.status;
            throw err;
          }
          // The record may exist on the server but not locally (another device, lost response).
          const found = await pb.collection("checkins").getFirstListItem(pb.filter("date = {:d}", { d: today }));
          const rec = await save("checkins", { date: today, energy: next }, found.id);
          id = rec.id;
        }
      }
    } catch (err) {
      queued.current = null;
      setError(
        err?.createStatus === 404
          ? "Energy check-ins aren't available yet."
          : "Couldn't save your energy check-in. Please try again."
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <section className="card energy-card" aria-label="Energy check-in" aria-busy={busy}>
      <div className="card-head">
        <h2 id="energy-label">How's your energy today?</h2>
      </div>
      <div className="seg energy-seg" role="group" aria-labelledby="energy-label">
        {ENERGY_LEVELS.map((level) => (
          <button
            key={level}
            type="button"
            className={energy === level ? "active" : ""}
            aria-pressed={energy === level}
            onClick={() => choose(level)}
          >
            {levelLabel(level)}
          </button>
        ))}
      </div>
      {error && <p className="error" role="alert">{error}</p>}

      {energy && (
        <div className="energy-suggestions">
          <h3 className="energy-sub">Good fits for {levelLabel(energy).toLowerCase()} energy</h3>
          {suggestions.length ? (
            <ul className="task-list">
              {suggestions.map((i) => (
                <TaskItem key={i.task.id} instance={i} />
              ))}
            </ul>
          ) : (
            <p className="empty">Nothing open that fits right now. Enjoy the breathing room.</p>
          )}
        </div>
      )}
    </section>
  );
}
