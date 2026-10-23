import { addDays, weekday, weekDates } from "./time.js";

export function blockOccursOn(block, date) {
  if (date < block.date) return false;
  if (block.recurUntil && date > block.recurUntil) return false;
  switch (block.recurrence) {
    case "daily":
      return true;
    case "weekdays": {
      const d = weekday(date);
      return d >= 1 && d <= 5;
    }
    case "weekly":
      return weekday(date) === weekday(block.date);
    default:
      return block.date === date;
  }
}

export function blocksForDate(blocks, date) {
  return blocks.filter((b) => blockOccursOn(b, date)).sort((a, b) => a.start - b.start);
}

function completionKey(taskId, date) {
  return `${taskId}|${date}`;
}

export function indexCompletions(completions) {
  const byKey = new Map();
  const byTask = new Map();
  for (const c of completions) {
    byKey.set(completionKey(c.task, c.date), c);
    if (!byTask.has(c.task)) byTask.set(c.task, []);
    byTask.get(c.task).push(c);
  }
  return { byKey, byTask };
}

/**
 * Task instances scheduled for a date: [{ task, date, done, completion }].
 *  - block tasks happen whenever their block happens
 *  - daily tasks happen every day from their start date (or creation)
 *  - dated one-off tasks happen on their date (and stay on today while overdue)
 *  - undated one-off tasks appear on the day they were completed, or on today while open
 */
export function instancesForDate({ tasks, blocks, completionIndex }, date, today) {
  const blockById = new Map(blocks.map((b) => [b.id, b]));
  const out = [];
  for (const task of tasks) {
    const created = (task.created || "").slice(0, 10);
    let completion = completionIndex.byKey.get(completionKey(task.id, date));
    let include = false;

    if (task.block) {
      const block = blockById.get(task.block);
      include = !!block && blockOccursOn(block, date);
    } else if (task.daily) {
      include = date >= (task.date || created);
    } else {
      const any = completionIndex.byTask.get(task.id)?.at(-1);
      if (any) {
        include = any.date === date;
        completion = include ? any : undefined;
      } else if (task.date) {
        include = task.date === date || (date === today && task.date < today);
      } else {
        include = date === today;
      }
    }
    if (include) out.push({ task, date, done: !!completion, completion });
  }
  return out;
}

export function summarize(instances, categoriesById) {
  const total = instances.length;
  const done = instances.filter((i) => i.done).length;
  const pointsByCategory = {};
  let points = 0;
  let possiblePoints = 0;
  for (const i of instances) {
    possiblePoints += i.task.points || 0;
    if (!i.done) continue;
    const p = i.completion?.points ?? i.task.points ?? 0;
    points += p;
    const key = i.task.category && categoriesById?.[i.task.category] ? i.task.category : "none";
    pointsByCategory[key] = (pointsByCategory[key] || 0) + p;
  }
  return {
    total,
    done,
    percent: total ? Math.round((done / total) * 100) : 0,
    points,
    possiblePoints,
    pointsByCategory,
  };
}

/**
 * Stats for the Monday-start week containing weekStart.
 * Returns summary fields plus `byDay: [{ date, ...summary }]`.
 */
export function weekStats(data, weekStart, today) {
  const byDay = weekDates(weekStart).map((date) => {
    const instances = instancesForDate(data, date, today);
    return { date, instances, ...summarize(instances, data.categoriesById) };
  });
  const all = byDay.flatMap((d) => d.instances);
  return { weekStart, weekEnd: addDays(weekStart, 6), byDay, ...summarize(all, data.categoriesById) };
}
