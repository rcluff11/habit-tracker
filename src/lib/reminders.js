// Reminder rules shared by the app (editors) and push/sender.mjs.
// Node-safe (NFR-3): no browser, Vite or pb.js imports here or in what this file imports.
import { activeWindow, blockOccursOn, energyOn, instancesForDate, isActiveOn, openNow, suggestForEnergy, summarize, topThree } from "./stats.js";
import { addDays } from "./time.js";
import { affirmationFor } from "./affirmations.js";
import { scoreHeadline, closingLine, nudgeText } from "./messages.js";

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

// When the day "ends" for the score card and the day-end push. users.dayEndAt "" = this default.
export const DEFAULT_DAY_END = "21:00";
// A day can't end before noon: an after-midnight end would belong to the next date and skip every nudge.
// Keep in sync with EARLIEST_DAY_END in pb_hooks/guards.js.
export const EARLIEST_DAY_END = "12:00";

/** Minutes since midnight at which the user's day ends: user.dayEndAt if a valid HH:MM from noon on, else the default. */
export function dayEndMinutes(user) {
  const at = parseHHMM(user?.dayEndAt);
  return at !== null && at >= parseHHMM(EARLIEST_DAY_END) ? at : parseHHMM(DEFAULT_DAY_END);
}

// Progress nudges: users.nudgeTimes is minutes since midnight. [] = off (the default, D-12).
// Keep NUDGE_STEP, MAX_NUDGES and cleanNudgeTimes in sync with cleanNudgeTimes in pocketbase/pb_hooks/guards.js.
export const NUDGE_STEP = 15;
export const MAX_NUDGES = 6;
export const NUDGE_PRESETS = {
  light: [1080], // 6 PM
  regular: [720, 1080], // 12 PM, 6 PM
  frequent: [600, 840, 1080], // 10 AM, 2 PM, 6 PM
};

/**
 * Validate nudge times the way the server does. "" / null / undefined (unset) -> [] (off).
 * Otherwise at most MAX_NUDGES integers, each 0..1440-NUDGE_STEP and a multiple of NUDGE_STEP,
 * returned unique and ascending. Anything else -> null.
 */
export function cleanNudgeTimes(value) {
  if (value === "" || value === null || value === undefined) return [];
  const ok =
    Array.isArray(value) &&
    value.length <= MAX_NUDGES &&
    value.every((m) => typeof m === "number" && Number.isInteger(m) && m >= 0 && m <= 1440 - NUDGE_STEP && m % NUDGE_STEP === 0);
  if (!ok) return null;
  return [...new Set(value)].sort((a, b) => a - b);
}

/** The user's nudge times; unset or invalid means none. */
export function nudgeTimesFor(user) {
  return cleanNudgeTimes(user?.nudgeTimes) ?? [];
}

// [start, end) window for a message due at `at`: TASK_GRACE_MINUTES long, never past `limit`
// (midnight by default, so a late time can't spill into the next local day).
function windowFor(at, limit = 1440) {
  return { start: at, end: Math.min(at + TASK_GRACE_MINUTES, limit, 1440) };
}
const inWindow = (w, minutes) => w.start <= minutes && minutes < w.end;
const ttlFor = (w, minutes) => Math.max(60, (w.end - minutes) * 60);

/**
 * Affirmation, nudge and day-end pushes due right now for one user. Pure.
 *
 * now:  { date: "YYYY-MM-DD", minutes } in the subscription's local timezone (never server UTC)
 * user: { affirmationAt, nudgeTimes, dayEndAt, dayEndPush }
 * data: what instancesForDate takes: { tasks, blocks, completionIndex, schedule?, categoriesById?, checkins? }.
 *       A missing schedule means "no courses". Counts go only through instancesForDate, so stepped
 *       habits and blocks outside their activeWindow are skipped (a day whose only task is a Week 2
 *       habit gets no nudge or day-end push in Week 1).
 *       Today's check-in in `checkins` shapes nudges: low picks gentler lines and a non-heavy next task
 *       (none if only heavy ones are left), high picks upbeat lines and the heaviest task. Normal or no
 *       check-in keeps the default wording and topThree's pick.
 *
 * Returns [{ key, title, body, url, tag, topic, ttl }]. Keys:
 *   affirmation|DATE       at affirmationAt
 *   nudge|DATE|SLOT        at each nudge time before day end, while the day has tasks and isn't done
 *   nudge-done|DATE        at the first nudge time reached once the day is complete (one key per day,
 *                          so the caller's dedupe sends it once and later slots send nothing)
 *   dayend|DATE            at day end, if dayEndPush is on and the day has tasks
 * Each is due for TASK_GRACE_MINUTES from its time, clamped at midnight (nudges also at day end);
 * the caller dedupes by key, and ttl is the time left in the window.
 */
export function dueDailyMessages({ now, user, data }) {
  const out = [];
  const date = now.date;
  const minutes = now.minutes;
  const dayEnd = dayEndMinutes(user);

  const affirmAt = parseHHMM(user?.affirmationAt);
  if (affirmAt !== null) {
    const w = windowFor(affirmAt);
    if (inWindow(w, minutes)) {
      out.push({
        key: `affirmation|${date}`,
        title: "Today's affirmation",
        body: affirmationFor(date),
        url: "/#home",
        tag: "affirmation",
        topic: "affirmation",
        ttl: ttlFor(w, minutes),
      });
    }
  }

  // Only one nudge slot can be open at a time (slots are NUDGE_STEP apart, windows are that long).
  const slot = nudgeTimesFor(user).find((at) => at < dayEnd && inWindow(windowFor(at, dayEnd), minutes));
  const dayEndWindow = windowFor(dayEnd);
  const dayEndDue = user?.dayEndPush === true && inWindow(dayEndWindow, minutes);
  if (slot === undefined && !dayEndDue) return out;

  // Today's progress, only through instancesForDate so course windows (data.schedule) apply.
  const instances = instancesForDate(data, date, date);
  const summary = summarize(instances, data.categoriesById);
  if (summary.total === 0) return out; // no tasks today: no nudge, no day-end push (D-13)
  const complete = summary.done >= summary.total;

  if (slot !== undefined) {
    const w = windowFor(slot, dayEnd);
    const energy = energyOn(data.checkins, date);
    if (complete) {
      out.push({
        key: `nudge-done|${date}`,
        title: "All done!",
        body: nudgeText(summary, null, date, energy),
        url: "/#home",
        tag: "nudge",
        topic: "nudge",
        ttl: ttlFor(w, minutes),
      });
    } else {
      // Never suggest a block task whose block is already over today.
      const ctx = { blocks: data.blocks, today: date, nowMinutes: minutes, schedule: data.schedule };
      const next =
        energy === "low" || energy === "high"
          ? suggestForEnergy(instances, energy, 1, ctx)[0] || null
          : topThree(openNow(instances, ctx))[0] || null;
      out.push({
        key: `nudge|${date}|${slot}`,
        title: `${summary.done} of ${summary.total} done`,
        body: nudgeText(summary, next, date, energy),
        url: "/#home",
        tag: "nudge",
        topic: "nudge",
        ttl: ttlFor(w, minutes),
      });
    }
  }

  if (dayEndDue) {
    out.push({
      key: `dayend|${date}`,
      title: "Your day",
      body: `${scoreHeadline(summary)}. ${closingLine(summary, date)}`,
      url: "/#home",
      tag: "dayend",
      topic: "dayend",
      ttl: ttlFor(dayEndWindow, minutes),
    });
  }

  return out;
}

/**
 * Reminders that should go out right now for one user.
 *
 * now:             { date: "YYYY-MM-DD", minutes } in the user's timezone
 * blocks, tasks:   that user's records
 * completionIndex: from indexCompletions() (stats.js)
 * userDefault:     the user's default block offsets
 * schedule:        from scheduleIndex() (stats.js); missing means "no courses". Stepped blocks
 *                  and habits are only reminded inside their activeWindow.
 *
 * Returns [{ key, title, body, url, tag, topic, ttl }]. `key` identifies the
 * item + day + offset so the caller can avoid sending the same reminder twice.
 * `ttl` (seconds) makes the push service drop it rather than deliver it late.
 */
export function dueReminders({ now, blocks, tasks, completionIndex, userDefault, schedule }) {
  const out = [];

  // Blocks: today, plus tomorrow so reminders before an early-morning block work across midnight.
  for (const [day, dayOffset] of [[now.date, 0], [addDays(now.date, 1), 1440]]) {
    for (const block of blocks) {
      if (!blockOccursOn(block, day, schedule)) continue;
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
      if (!isActiveOn(activeWindow(task, schedule), now.date)) continue;
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
