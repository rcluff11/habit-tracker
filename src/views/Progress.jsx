import { useMemo, useState } from "react";
import { useData } from "../lib/DataContext";
import { weekStats } from "../lib/stats";
import { addDays, formatDate, startOfWeek, todayISO } from "../lib/time";
import Modal from "../components/Modal";
import CategoryChip from "../components/CategoryChip";
import "./Progress.css";

const emptyReward = { title: "", kind: "points", target: "", category: "" };

function formatWeek(start) {
  const end = addDays(start, 6);
  const startDate = formatDate(start, { month: "short", day: "numeric" });
  const endDate = formatDate(end, { month: "short", day: "numeric" });
  return `${startDate} – ${endDate}`;
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, value || 0));
}

export default function Progress() {
  const data = useData();
  const today = todayISO();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(today));
  const [editing, setEditing] = useState(null);
  const [rewardForm, setRewardForm] = useState(emptyReward);
  const [saving, setSaving] = useState(false);

  const stats = useMemo(
    () => weekStats(data, weekStart, today),
    [data, weekStart, today]
  );

  const categoryRows = useMemo(() => {
    const rows = data.categories.map((category) => ({
      ...category,
      points: stats.pointsByCategory[category.id] || 0,
    }));
    const uncategorized = stats.pointsByCategory.none || 0;
    if (uncategorized) rows.push({ id: "none", name: "Uncategorized", color: "var(--muted)", points: uncategorized });
    return rows.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  }, [data.categories, stats.pointsByCategory]);

  const maxCategoryPoints = Math.max(1, ...categoryRows.map((row) => row.points));
  const strongest = categoryRows[0];
  const needsLove = categoryRows[categoryRows.length - 1];
  const hasTasks = stats.total > 0;

  const openNewReward = () => {
    setEditing("new");
    setRewardForm(emptyReward);
  };

  const openEditReward = (reward) => {
    setEditing(reward);
    setRewardForm({
      title: reward.title || "",
      kind: reward.kind || "points",
      target: reward.target ?? "",
      category: reward.category || "",
    });
  };

  const closeReward = () => {
    if (!saving) setEditing(null);
  };

  const submitReward = async (event) => {
    event.preventDefault();
    const title = rewardForm.title.trim();
    const target = Number(rewardForm.target);
    if (!title || !Number.isFinite(target) || target <= 0) return;
    setSaving(true);
    try {
      const payload = {
        title,
        kind: rewardForm.kind,
        target,
        category: rewardForm.kind === "points" ? rewardForm.category || "" : "",
      };
      if (editing === "new") await data.save("rewards", payload);
      else await data.save("rewards", payload, editing.id);
      setEditing(null);
    } finally {
      setSaving(false);
    }
  };

  const deleteReward = async () => {
    if (editing === "new" || !editing?.id) return;
    if (!window.confirm(`Delete “${editing.title}”?`)) return;
    setSaving(true);
    try {
      await data.remove("rewards", editing.id);
      setEditing(null);
    } finally {
      setSaving(false);
    }
  };

  const claimReward = async (reward) => {
    const claimedWeeks = Array.isArray(reward.claimedWeeks) ? reward.claimedWeeks : [];
    if (claimedWeeks.includes(weekStart)) return;
    await data.save("rewards", { claimedWeeks: [...claimedWeeks, weekStart] }, reward.id);
  };

  if (data.loading) return <div className="page progress-page"><div className="empty">Loading your progress…</div></div>;
  if (data.error) return <div className="page progress-page"><div className="empty">We couldn’t load your progress right now.</div></div>;

  return (
    <div className="page progress-page">
      <header className="page-header">
        <div>
          <h1>Progress</h1>
          <p className="page-sub">A gentle look at what’s moving forward.</p>
        </div>
        <div className="week-switcher" aria-label="Choose week">
          <button className="btn btn-ghost" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Previous week">‹</button>
          <button className="btn week-label" onClick={() => setWeekStart(startOfWeek(today))}>{formatWeek(weekStart)}</button>
          <button className="btn btn-ghost" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Next week">›</button>
        </div>
      </header>

      <section className="grid-3 summary-grid" aria-label="Week summary">
        <article className="card summary-card">
          <div className="muted small">Complete</div>
          <div className="summary-number">{stats.percent}%</div>
          <div className="progress-bar" aria-label={`${stats.percent}% complete`}><span style={{ width: `${stats.percent}%` }} /></div>
        </article>
        <article className="card summary-card">
          <div className="muted small">Points earned</div>
          <div className="summary-number">{stats.points}<span className="summary-denom"> / {stats.possiblePoints}</span></div>
          <p className="muted small">of possible points</p>
        </article>
        <article className="card summary-card">
          <div className="muted small">Tasks done</div>
          <div className="summary-number">{stats.done}<span className="summary-denom"> / {stats.total}</span></div>
          <p className="muted small">{hasTasks ? "Keep the rhythm going." : "No tasks scheduled yet."}</p>
        </article>
      </section>

      <section className="card">
        <div className="card-head"><h2>Daily progress</h2><span className="muted small">{hasTasks ? "Monday to Sunday" : "A fresh week starts here"}</span></div>
        {hasTasks ? (
          <div className="daily-chart" role="img" aria-label="Daily completion by day">
            {stats.byDay.map((day) => {
              const isToday = day.date === today;
              return <div className={`day-column${isToday ? " today" : ""}`} key={day.date}>
                <div className="day-value">{day.percent}%</div>
                <div className="bar-track"><span style={{ height: `${clampPercent(day.percent)}%` }} /></div>
                <div className="day-label">{formatDate(day.date, { weekday: "short" }).slice(0, 3)}</div>
                <div className="day-points">{day.points} pts</div>
              </div>;
            })}
          </div>
        ) : <div className="empty">No tasks this week yet. Add a task and your daily story will appear here.</div>}
      </section>

      <section className="card">
        <div className="card-head"><h2>Points by category</h2><span className="muted small">{stats.points} total points</span></div>
        {categoryRows.length ? <>
          <div className="category-list">
            {categoryRows.map((category) => <div className="category-row" key={category.id}>
              <div className="category-name"><span className="dot" style={{ background: category.color }} />{category.name}</div>
              <div className="category-track"><span style={{ width: `${(category.points / maxCategoryPoints) * 100}%`, background: category.color }} /></div>
              <strong>{category.points}</strong>
            </div>)}
          </div>
          {strongest && <p className="insight">Strongest: <strong>{strongest.name}</strong>{needsLove && needsLove.id !== strongest.id ? <> · Needs love: <strong>{needsLove.name}</strong></> : null}</p>}
        </> : <div className="empty">Your categories will show up here as you earn points.</div>}
      </section>

      <section className="card rewards-card">
        <div className="card-head"><div><h2>Rewards</h2><p className="muted small">Small celebrations make consistency feel good.</p></div><button className="btn btn-primary" onClick={openNewReward}>＋ Add reward</button></div>
        {data.rewards.length ? <div className="reward-list">
          {data.rewards.map((reward) => {
            const value = reward.kind === "percent" ? stats.percent : (reward.category ? stats.pointsByCategory[reward.category] || 0 : stats.points);
            const reached = value >= Number(reward.target);
            const claimed = Array.isArray(reward.claimedWeeks) && reward.claimedWeeks.includes(weekStart);
            const remaining = Math.max(0, Number(reward.target) - value);
            const category = reward.category ? data.categoriesById[reward.category] : null;
            return <div className="reward-row" key={reward.id}>
              <div className="reward-top"><div><strong>{reward.title}</strong>{category ? <span className="reward-category"><CategoryChip id={category.id} /></span> : null}</div><button className="btn btn-ghost btn-sm" onClick={() => openEditReward(reward)}>Edit</button></div>
              <div className="reward-meta"><span>{value} / {reward.target}{reward.kind === "percent" ? "%" : " points"}</span>{reached ? (claimed ? <span className="claimed">Claimed ✓</span> : <button className="btn btn-primary btn-sm" onClick={() => claimReward(reward)}>Claim</button>) : <span className="muted small">{remaining}{reward.kind === "percent" ? "%" : " points"} to go</span>}</div>
              <div className="progress-bar"><span style={{ width: `${clampPercent((value / Number(reward.target)) * 100)}%`, background: reached ? "var(--good)" : undefined }} /></div>
            </div>;
          })}
        </div> : <div className="empty">No rewards yet. Give yourself something lovely to work toward.</div>}
      </section>

      {editing && <Modal title={editing === "new" ? "Add reward" : "Edit reward"} onClose={closeReward}>
        <form className="form" onSubmit={submitReward}>
          <label className="field"><span>Reward title</span><input className="input" value={rewardForm.title} onChange={(e) => setRewardForm({ ...rewardForm, title: e.target.value })} placeholder="A cozy coffee date" autoFocus required /></label>
          <div className="field"><span>Measure progress by</span><div className="seg" role="group" aria-label="Reward type"><button type="button" className={rewardForm.kind === "points" ? "active" : ""} onClick={() => setRewardForm({ ...rewardForm, kind: "points" })}>Points</button><button type="button" className={rewardForm.kind === "percent" ? "active" : ""} onClick={() => setRewardForm({ ...rewardForm, kind: "percent", category: "" })}>% complete</button></div></div>
          <div className="form-row"><label className="field"><span>Target</span><input className="input" type="number" min="1" step="1" value={rewardForm.target} onChange={(e) => setRewardForm({ ...rewardForm, target: e.target.value })} required /></label>{rewardForm.kind === "points" ? <label className="field"><span>Category (optional)</span><select className="input" value={rewardForm.category} onChange={(e) => setRewardForm({ ...rewardForm, category: e.target.value })}><option value="">All categories</option>{data.categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label> : <div />}</div>
          <div className="modal-actions"><div>{editing !== "new" && <button type="button" className="btn btn-ghost btn-danger" onClick={deleteReward} disabled={saving}>Delete</button>}</div><div className="row"><button type="button" className="btn btn-ghost" onClick={closeReward}>Cancel</button><button className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : "Save reward"}</button></div></div>
        </form>
      </Modal>}
    </div>
  );
}
