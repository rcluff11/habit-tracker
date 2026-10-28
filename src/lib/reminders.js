// Reminder rules shared by the app (editors) and push/sender.mjs.
import { blockOccursOn } from "./stats.js";
import { addDays } from "./time.js";

// Minutes before a block starts.
export const REMINDER_OPTIONS = [0, 5, 10, 15, 30, 60];
export const DEFAULT_REMINDERS = [10];
// A task reminder is still useful for this long after its time; after that it's dropped.
export const TASK_GRACE_MINUTES = 15;

export function offsetLabel(minutes) {
  if (minutes === 0) return "At start";
  if (minutes === 60) return "1 hour";
  return `${minutes} min`;
}

export function describeOffsets(offsets) {
  if (!offsets.length) return "None";
  return [...offsets].sort((a, b) => a - b).map((m) => (m === 0 ? "at start" : `${offsetLabel(m)} before`)).join(", ");
}

/** Keep only allowed values, unique, largest first. Returns null for anything that isn't an array. */
export function cleanOffsets(value) {
  if (!Array.isArray(value)) return null;
  return [...new Set(value.map(Number))].filter((m) => REMINDER_OPTIONS.includes(m)).sort((a, b) => b - a);
}

/** The user's default block reminders (null/missing means the app default). */
export function userOffsets(user) {
  return cleanOffsets(user?.remindBefore) ?? DEFAULT_REMINDERS;
}

/** A block's reminders: null = the user's default, [] = none, otherwise its own list. */
export function blockOffsets(block, userDefault = DEFAULT_REMINDERS) {
  return cleanOffsets(block.remindBefore) ?? cleanOffsets(userDefault) ?? DEFAULT_REMINDERS;
}

/** "Starting now", "Starts in 5 min", "Starts in 1 hour", "Starts in 1 hr 15 min" */
export function leadText(minutesLeft) {
  if (minutesLeft <= 0) return "Starting now";
  if (minutesLeft < 60) return `Starts in ${minutesLeft} min`;
  const h = Math.floor(minutesLeft / 60);
  const m = minutesLeft % 60;
  if (m === 0) return `Starts in ${h} ${h === 1 ? "hour" : "hours"}`;
  return `Starts in ${h} hr ${m} min`;
}

export function parseHHMM(value) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value || "");
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/**
 * Reminders that should go out right now for one user.
 *
 * now:             { date: "YYYY-MM-DD", minutes } in the user's timezone
 * blocks, tasks:   that user's records
 * completionIndex: from indexCompletions() (stats.js)
 * userDefault:     the user's default block offsets
 *
 * Returns [{ key, title, body, url, tag, topic, ttl }]. `key` identifies the
 * item + day + offset so the caller can avoid sending the same reminder twice.
 * `ttl` (seconds) makes the push service drop it rather than deliver it late.
 */
export function dueReminders({ now, blocks, tasks, completionIndex, userDefault }) {
  const out = [];

  // Blocks: today, plus tomorrow so reminders before an early-morning block work across midnight.
  for (const [day, dayOffset] of [[now.date, 0], [addDays(now.date, 1), 1440]]) {
    for (const block of blocks) {
      if (!blockOccursOn(block, day)) continue;
      const start = block.start + dayOffset;
      // An offset is due from (start - offset) until the block starts; "at start" gets one minute.
      const due = blockOffsets(block, userDefault).filter((o) => {
        const deadline = o === 0 ? start + 1 : start;
        return start - o <= now.minutes && now.minutes < deadline;
      });
      if (!due.length) continue;
      // If several have already passed (e.g. the sender was down), send only the closest one.
      const offset = Math.min(...due);
      const deadline = offset === 0 ? start + 1 : start;
      const todo = tasks
        .filter((t) => t.block === block.id && !completionIndex.byKey.has(`${t.id}|${day}`))
        .map((t) => t.title);
      out.push({
        key: `block|${block.id}|${day}|${offset}`,
        title: block.title,
        body: leadText(start - now.minutes) + (todo.length ? ` · To do: ${todo.join(", ")}` : ""),
        url: "/#calendar",
        tag: `block-${block.id}`,
        topic: `b${block.id}`,
        ttl: Math.max(60, (deadline - now.minutes) * 60),
      });
    }
  }

  // Tasks with a "remind me at" time (block tasks are reminded with their block).
  for (const task of tasks) {
    const at = parseHHMM(task.remindAt);
    if (at === null || task.block) continue;
    if (now.minutes < at || now.minutes >= at + TASK_GRACE_MINUTES) continue;

    let done;
    if (task.daily) {
      const starts = task.date || (task.created || "").slice(0, 10);
      if (now.date < starts) continue;
      done = completionIndex.byKey.has(`${task.id}|${now.date}`);
    } else {
      if ((task.date || task.remindDate) !== now.date) continue;
      done = (completionIndex.byTask.get(task.id) || []).length > 0;
    }
    if (done) continue;

    out.push({
      key: `task|${task.id}|${now.date}|at`,
      title: `Don't forget: ${task.title}`,
      body: task.points ? `Worth ${task.points} points. Tap to check it off.` : "Tap to check it off.",
      url: "/#tasks",
      tag: `task-${task.id}`,
      topic: `t${task.id}`,
      ttl: (at + TASK_GRACE_MINUTES - now.minutes) * 60,
    });
  }

  return out;
}
