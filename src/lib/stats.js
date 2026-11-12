import { dayNumber } from "./affirmations.js";
import { addDays, monthDates, startOfWeek, weekday, weekDates } from "./time.js";

// --- Course windows (D-14, D-15) -----------------------------------------------------------
// Keep in sync with stepStart / courseEnd in pocketbase/pb_hooks/guards.js (plan.md sync point 6):
//   step start = course.startDate + (week - 1) * 7
//   course end = course.startDate + maxWeek * 7 - 1   (over all of the course's steps)
//   stepped TASK start = max(step start, addDays(task.created.slice(0, 10), -1))   compared as ISO text
//     (created is UTC, hence the day back; stepped blocks: just the step start, never clamped)
//   guards.js stamps this same start onto a task when its step or course is deleted.
// activeWindow() is the only start/end rule (sync point 5): blockOccursOn, instancesForDate,
// habitStreak, dueReminders and dueDailyMessages all go through it.

const EMPTY_SCHEDULE = Object.freeze({ stepsById: new Map(), coursesById: new Map(), maxWeekByCourse: new Map() });

/**
 * Build once per data change (NFR-7): { stepsById, coursesById, maxWeekByCourse }, all Maps keyed by id.
 * An empty schedule (or none at all) means "no courses".
 */
export function scheduleIndex(courses = [], courseSteps = []) {
  const coursesById = new Map((courses || []).map((c) => [c.id, c]));
  const stepsById = new Map();
  const maxWeekByCourse = new Map();
  for (const s of courseSteps || []) {
    stepsById.set(s.id, s);
    const week = Number(s.week) || 0;
    if (week > (maxWeekByCourse.get(s.course) || 0)) maxWeekByCourse.set(s.course, week);
  }
  return { stepsById, coursesById, maxWeekByCourse };
}

const scheduleOf = (schedule) => (schedule && schedule.stepsById ? schedule : EMPTY_SCHEDULE);

/** "stop" stops; "", missing or anything else means "keep" (a superuser-created course can skip the hook default). */
export const courseOnEnd = (course) => (course?.onEnd === "stop" ? "stop" : "keep");

/** First day of a step's week: course.startDate + (week - 1) * 7. */
export function stepStartDate(course, step) {
  return addDays(course.startDate, (Number(step.week) - 1) * 7);
}

/** Last day of the course's highest week (course.startDate + maxWeek * 7 - 1), or null with no steps. */
export function courseEndDate(course, schedule) {
  const maxWeek = course ? scheduleOf(schedule).maxWeekByCourse.get(course.id) : 0;
  return maxWeek ? addDays(course.startDate, maxWeek * 7 - 1) : null;
}

// The step and course a record is linked to, if both are in the schedule.
function linkedStep(record, schedule) {
  if (!record?.step) return null;
  const s = scheduleOf(schedule);
  const step = s.stepsById.get(record.step);
  const course = step && s.coursesById.get(step.course);
  if (!course || !course.startDate || !(Number(step.week) >= 1)) return null;
  return { step, course };
}

// Blocks always carry a recurrence and numeric start/end minutes; tasks never do.
const isBlockRecord = (record) => "recurrence" in record || typeof record.start === "number";

/**
 * The dates a task or block is active: { start, end } (inclusive ISO dates; end null = open-ended).
 *  - With a step (found in the schedule): start = the step's start date; end = the course end if
 *    onEnd is "stop", else null. A record's own recurUntil (blocks) caps the end if earlier.
 *    A stepped task (not a block) never starts more than a day before it was created: start =
 *    max(step start, created date - 1 day) when `created` is present, so a habit added mid-week
 *    isn't counted as missed on the days before it existed (the day back covers UTC vs local).
 *  - Otherwise: record.date || created date, to record.recurUntil || null (phase 1 behaviour).
 *    A step missing from the schedule (or no schedule) falls back to this rule.
 * For a stepped block, block.date is only the weekday anchor for weekly repeats.
 */
export function activeWindow(record, schedule) {
  const linked = linkedStep(record, schedule);
  if (!linked) {
    return { start: record.date || (record.created || "").slice(0, 10), end: record.recurUntil || null };
  }
  let start = stepStartDate(linked.course, linked.step);
  // `created` is UTC, so allow one day back: a habit made in the evening west of UTC still
  // shows on the local day it was made.
  const created = isBlockRecord(record) ? "" : String(record.created || "").slice(0, 10);
  const earliest = created ? addDays(created, -1) : "";
  if (earliest && earliest > start) start = earliest;
  let end = courseOnEnd(linked.course) === "stop" ? courseEndDate(linked.course, schedule) : null;
  if (record.recurUntil && (!end || record.recurUntil < end)) end = record.recurUntil;
  return { start, end };
}

/** Is `date` inside a window from activeWindow()? */
export function isActiveOn(span, date) {
  return date >= span.start && (!span.end || date <= span.end);
}

export function blockOccursOn(block, date, schedule) {
  if (!isActiveOn(activeWindow(block, schedule), date)) return false;
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

export function blocksForDate(blocks, date, schedule) {
  return blocks.filter((b) => blockOccursOn(b, date, schedule)).sort((a, b) => a.start - b.start);
}

/**
 * Block instances that overlap [nowMinutes, nowMinutes + windowMinutes), sorted by start.
 * Looks at today and tomorrow so a window that crosses midnight still sees early-morning
 * blocks (same approach as dueReminders in reminders.js).
 *
 * schedule: from scheduleIndex(); stepped blocks only show inside their course window.
 *           Missing means "no courses" (callers pass it from F-21).
 *
 * Returns [{ block, date, start, end, live }]:
 *  - date: the occurrence date (for a recurring block, not block.date)
 *  - start, end: minutes relative to today's midnight (tomorrow's blocks get +1440)
 *  - live: started but not yet ended
 */
export function upcomingBlocks(blocks, today, nowMinutes, schedule, windowMinutes = 180) {
  const until = nowMinutes + windowMinutes;
  const out = [];
  for (const [date, dayOffset] of [[today, 0], [addDays(today, 1), 1440]]) {
    for (const block of blocksForDate(blocks, date, schedule)) {
      const start = block.start + dayOffset;
      const end = block.end + dayOffset;
      if (end > nowMinutes && start < until) {
        out.push({ block, date, start, end, live: start <= nowMinutes });
      }
    }
  }
  return out;
}

/** Today's top 3: starred tasks if any, otherwise the highest-point instances. */
export function topThree(instances) {
  const priorities = instances.filter((i) => i.task.priority);
  return (priorities.length ? priorities : [...instances].sort((a, b) => (b.task.points || 0) - (a.task.points || 0)))
    .slice(0, 3);
}

// Keep in sync with the checkins.energy and tasks.effort selects (migration 1794300000_energy.js).
export const ENERGY_LEVELS = ["high", "normal", "low"];
export const EFFORT_LEVELS = ["light", "medium", "heavy"];

/** The energy level checked in on `date` ("high" | "normal" | "low"), or null when there's no check-in. */
export function energyOn(checkins, date) {
  return (checkins || []).find((c) => c.date === date && ENERGY_LEVELS.includes(c.energy))?.energy ?? null;
}

/** Display label for an energy or effort level: "low" -> "Low". */
export function levelLabel(level) {
  return level ? level[0].toUpperCase() + level.slice(1) : "";
}

/** A task's effort: its tag, or (untagged) a bucket by points: <= 10 light, >= 50 heavy, else medium. */
function effortOf(task) {
  if (EFFORT_LEVELS.includes(task.effort)) return task.effort;
  const points = task.points || 0;
  return points <= 10 ? "light" : points >= 50 ? "heavy" : "medium";
}

const byPoints = (a, b) => (b.task.points || 0) - (a.task.points || 0);
const byPriority = (a, b) => (b.task.priority ? 1 : 0) - (a.task.priority ? 1 : 0);
const byText = (a, b) =>
  (a.task.title || "").localeCompare(b.task.title || "") || String(a.task.id).localeCompare(String(b.task.id));

/**
 * Today's open instances that can still be done now: block tasks only while their block is live or
 * still to come today. ctx = { blocks, today, nowMinutes, schedule }; without it, block tasks are skipped.
 */
export function openNow(instances, ctx = {}) {
  let liveBlocks = null;
  if (ctx.blocks && ctx.today != null && ctx.nowMinutes != null) {
    // The window runs to midnight, so tomorrow's blocks (start >= 1440) fall outside it.
    const span = Math.max(1440 - ctx.nowMinutes, 1);
    const upcoming = upcomingBlocks(ctx.blocks, ctx.today, ctx.nowMinutes, ctx.schedule, span);
    liveBlocks = new Set(upcoming.filter((u) => u.date === ctx.today).map((u) => u.block.id));
  }
  return instances.filter((i) => !i.done && (!i.task.block || (liveBlocks && liveBlocks.has(i.task.block))));
}

/**
 * Up to `limit` open instances that fit an energy level (instances are today's, from instancesForDate).
 * Block tasks count only while their block is live or still to come today; pass
 * ctx = { blocks, today, nowMinutes, schedule } so upcomingBlocks can decide. Without ctx, block tasks are skipped.
 *  - low:    light, then medium (heavy excluded); priority wins ties
 *  - normal: priority first, then light/medium before heavy
 *  - high:   heavy first, then most points
 * Final tiebreaks are deterministic: points (desc), title, id. An unknown energy returns [].
 */
export function suggestForEnergy(instances, energy, limit = 3, ctx = {}) {
  if (!ENERGY_LEVELS.includes(energy)) return [];
  const heavy = (i) => effortOf(i.task) === "heavy";
  const open = openNow(instances, ctx);
  let pool = open;
  let order;
  if (energy === "low") {
    pool = open.filter((i) => !heavy(i));
    const level = (i) => (effortOf(i.task) === "light" ? 0 : 1);
    order = [(a, b) => level(a) - level(b), byPriority, byPoints, byText];
  } else if (energy === "normal") {
    order = [byPriority, (a, b) => heavy(a) - heavy(b), byPoints, byText];
  } else {
    order = [(a, b) => heavy(b) - heavy(a), byPoints, byPriority, byText];
  }
  return pool
    .slice()
    .sort((a, b) => {
      for (const cmp of order) {
        const d = cmp(a, b);
        if (d) return d;
      }
      return 0;
    })
    .slice(0, limit);
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
 *  - block tasks happen whenever their block happens (so they follow a stepped block's window)
 *  - daily tasks happen every day inside their activeWindow (step, or date/created to recurUntil)
 *  - dated one-off tasks happen on their date (and stay on today while overdue)
 *  - undated one-off tasks appear on the day they were completed, or on today while open
 * data.schedule (from scheduleIndex) is optional; missing means "no courses".
 */
export function instancesForDate({ tasks, blocks, completionIndex, schedule }, date, today) {
  const blockById = new Map(blocks.map((b) => [b.id, b]));
  const out = [];
  for (const task of tasks) {
    let completion = completionIndex.byKey.get(completionKey(task.id, date));
    let include = false;

    if (task.block) {
      const block = blockById.get(task.block);
      include = !!block && blockOccursOn(block, date, schedule);
    } else if (task.daily) {
      include = isActiveOn(activeWindow(task, schedule), date);
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

/** Something was scheduled and all of it is done. */
export function isDayComplete(summary) {
  return summary.total > 0 && summary.done === summary.total;
}

export function summarize(instances, categoriesById) {
  const total = instances.length;
  const done = instances.filter((i) => i.done).length;
  const pointsByCategory = {};
  let points = 0;
  let possiblePoints = 0;
  for (const i of instances) {
    if (!i.done) {
      possiblePoints += i.task.points || 0;
      continue;
    }
    // Done instances use the snapshot, so a past day can't show more earned than possible.
    const p = i.completion?.points ?? i.task.points ?? 0;
    possiblePoints += p;
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

const STREAK_LOOKBACK_DAYS = 400;

// Epoch day 0 (1970-01-01) was a Thursday; 0 = Sunday, like Date.getDay().
const weekdayOf = (n) => (((n + 4) % 7) + 7) % 7;

const isRecurring = (block) => ["daily", "weekdays", "weekly"].includes(block.recurrence);

/**
 * Consecutive scheduled occurrences completed, counting back from `date` (A-6).
 * The habit's dates come from activeWindow (its block's window for block tasks), via data.schedule.
 *  - Unscheduled days (a weekdays block on a weekend, before the window starts) are skipped.
 *  - Asked for a date after the window ends (a recurUntil or a stopped course), it returns 0.
 *  - A scheduled, undone day breaks the streak, except `today` (or later), which isn't over yet.
 *  - Looks back at most 400 days. One-off tasks return 0.
 */
export function habitStreak(data, task, date, today) {
  const dateN = dayNumber(date);
  const todayN = dayNumber(today);
  if (Number.isNaN(dateN)) return 0;
  let span;
  let rule = null; // null = every day in the window
  if (task.block) {
    const block = data.blocks.find((b) => b.id === task.block);
    if (!block || !isRecurring(block)) return 0;
    span = activeWindow(block, data.schedule);
    if (block.recurrence === "weekdays") rule = (n) => { const w = weekdayOf(n); return w >= 1 && w <= 5; };
    else if (block.recurrence === "weekly") {
      // block.date is the weekday anchor (for a stepped block, the start comes from the step).
      const w0 = weekdayOf(dayNumber(String(block.date).slice(0, 10)));
      rule = (n) => weekdayOf(n) === w0;
    }
  } else if (task.daily) {
    span = activeWindow(task, data.schedule);
  } else {
    return 0;
  }
  const startN = dayNumber(String(span.start).slice(0, 10));
  const endN = span.end ? dayNumber(String(span.end).slice(0, 10)) : NaN;
  const lowN = Number.isNaN(startN) ? -Infinity : startN; // first day the habit can be scheduled
  const untilN = Number.isNaN(endN) ? Infinity : endN; // last day
  if (dateN > untilN) return 0; // the habit has ended
  const doneDays = new Set();
  for (const c of data.completionIndex.byTask.get(task.id) || []) doneDays.add(dayNumber(c.date));
  let count = 0;
  for (let i = 0; i < STREAK_LOOKBACK_DAYS; i++) {
    const n = dateN - i;
    if (n < lowN) break;
    if (n > untilN || (rule && !rule(n))) continue;
    if (doneDays.has(n)) count++;
    else if (n >= todayN) continue;
    else break;
  }
  return count;
}

/**
 * The end-of-day score card data for one date.
 * Returns { date, total, done, percent, points, possiblePoints, bestCategory, complete,
 *           streaks: [{ task, count, keptToday, broken }], weekAvgPercent, energy }.
 *  - bestCategory: category id with the most points that day, or null (uncategorised points don't count)
 *  - complete: something was scheduled and all of it is done
 *  - streaks: one entry per daily habit or task on a recurring block scheduled that day (none for one-time blocks); `broken` = missed on a day that is over
 *  - weekAvgPercent: mean percent of that week's days up to and including today that had tasks (0 if none)
 *  - energy: the day's check-in level from data.checkins, or null
 */
export function dayScore(data, date, today) {
  const instances = instancesForDate(data, date, today);
  const s = summarize(instances, data.categoriesById);
  let bestCategory = null;
  let bestPoints = 0;
  for (const [id, p] of Object.entries(s.pointsByCategory)) {
    if (id !== "none" && p > bestPoints) {
      bestCategory = id;
      bestPoints = p;
    }
  }
  const blockById = new Map(data.blocks.map((b) => [b.id, b]));
  const streaks = instances
    .filter((i) => i.task.daily || (i.task.block && blockById.get(i.task.block) && isRecurring(blockById.get(i.task.block))))
    .map((i) => ({
      task: i.task,
      count: habitStreak(data, i.task, date, today),
      keptToday: i.done,
      broken: !i.done && date < today,
    }));
  const week = weekStats(data, startOfWeek(date), today).byDay.filter((d) => d.date <= today && d.total > 0);
  const weekAvgPercent = week.length ? Math.round(week.reduce((n, d) => n + d.percent, 0) / week.length) : 0;
  return {
    date,
    total: s.total,
    done: s.done,
    percent: s.percent,
    points: s.points,
    possiblePoints: s.possiblePoints,
    bestCategory,
    complete: isDayComplete(s),
    streaks,
    weekAvgPercent,
    energy: energyOn(data.checkins, date),
  };
}

// --- Courses ------------------------------------------------------------------------------

/** The course's steps from the schedule, by week. */
function courseSteps(schedule, courseId) {
  return [...scheduleOf(schedule).stepsById.values()]
    .filter((s) => s.course === courseId)
    .sort((a, b) => Number(a.week) - Number(b.week));
}

/** The course's stepped tasks, stepped blocks and the tasks on those blocks. */
function courseRecords(data, course) {
  const stepIds = new Set(courseSteps(data.schedule, course.id).map((s) => s.id));
  const tasks = data.tasks.filter((t) => t.step && stepIds.has(t.step));
  const blocks = data.blocks.filter((b) => b.step && stepIds.has(b.step));
  const blockIds = new Set(blocks.map((b) => b.id));
  const blockTasks = data.tasks.filter((t) => t.block && blockIds.has(t.block));
  return { tasks, blocks, blockTasks };
}

/**
 * A course's progress:
 * { currentWeek, endDate, onEnd, ended, weeks: [{ week, step, startDate, percent }] }
 *  - currentWeek: 0 before the start, otherwise the course week containing today (capped at the last step's week)
 *  - endDate: courseEndDate (null with no steps); onEnd: "keep" | "stop" ("" or missing = keep)
 *  - ended: today is after endDate
 *  - weeks: one per step. percent = done / scheduled of the course's habits and block tasks over that
 *    course week's days up to today (weeks are cumulative, D-6); null if no day of it has had any yet.
 */
export function courseStats(data, course, today) {
  const schedule = data.schedule;
  const steps = courseSteps(schedule, course.id);
  const endDate = courseEndDate(course, schedule);
  const startN = dayNumber(course.startDate);
  const todayN = dayNumber(today);
  let currentWeek = todayN >= startN ? Math.floor((todayN - startN) / 7) + 1 : 0;
  const maxWeek = scheduleOf(schedule).maxWeekByCourse.get(course.id) || 0;
  if (maxWeek && currentWeek > maxWeek) currentWeek = maxWeek;

  const { tasks, blockTasks } = courseRecords(data, course);
  const ids = new Set([...tasks, ...blockTasks].map((t) => t.id));
  const weeks = steps.map((step) => {
    const startDate = stepStartDate(course, step);
    let total = 0;
    let done = 0;
    for (let i = 0; i < 7; i++) {
      const date = addDays(startDate, i);
      if (date > today) break;
      for (const inst of instancesForDate(data, date, today)) {
        if (!ids.has(inst.task.id)) continue;
        total++;
        if (inst.done) done++;
      }
    }
    return { week: Number(step.week), step, startDate, percent: total ? Math.round((done / total) * 100) : null };
  });

  return { currentWeek, endDate, onEnd: courseOnEnd(course), ended: !!endDate && today > endDate, weeks };
}

/**
 * What "Delete these habits" (FR-21) would remove, without changing anything:
 * { tasks, blocks, blockTasks, completions } counts of the course's stepped tasks, stepped blocks,
 * the tasks on those blocks, and all completions of those tasks.
 */
export function courseDeleteImpact(data, course) {
  const { tasks, blocks, blockTasks } = courseRecords(data, course);
  const ids = new Set([...tasks, ...blockTasks].map((t) => t.id));
  let completions = 0;
  for (const id of ids) completions += (data.completionIndex.byTask.get(id) || []).length;
  return { tasks: tasks.length, blocks: blocks.length, blockTasks: blockTasks.length, completions };
}

// --- Monthly plans ------------------------------------------------------------------------

/** Stats for a "YYYY-MM" month: summary fields (like summarize) plus month and byDay, like weekStats. */
export function monthStats(data, month, today) {
  const byDay = monthDates(month).map((date) => {
    const instances = instancesForDate(data, date, today);
    return { date, instances, ...summarize(instances, data.categoriesById) };
  });
  const all = byDay.flatMap((d) => d.instances);
  return { month, byDay, ...summarize(all, data.categoriesById) };
}

/**
 * Progress toward a plan target: { current, target, percent, reached }.
 * Keep the kinds in sync with the plan_targets.kind select (plan.md sync point 4).
 *  - points:      points of the month's done instances, counted exactly like monthStats (completions
 *                 of instances inside their window that month); only the category's tasks if set
 *  - percent:     monthStats(...).percent
 *  - completions: completions of target.task dated in the month
 * An unknown kind counts 0.
 */
export function targetProgress(data, target, plan, today) {
  const month = plan.month;
  const inMonth = (c) => String(c.date).slice(0, 7) === month;
  let current = 0;
  if (target.kind === "points") {
    // Same instances and snapshots as monthStats, so the target and the Month card agree.
    for (const day of monthStats(data, month, today).byDay) {
      for (const i of day.instances) {
        if (!i.done || (target.category && i.task.category !== target.category)) continue;
        current += i.completion?.points ?? i.task.points ?? 0;
      }
    }
  } else if (target.kind === "percent") {
    current = monthStats(data, month, today).percent;
  } else if (target.kind === "completions") {
    current = (data.completionIndex.byTask.get(target.task) || []).filter(inMonth).length;
  }
  const goal = Number(target.target) || 0;
  return {
    current,
    target: goal,
    percent: goal > 0 ? Math.min(100, Math.round((current / goal) * 100)) : 0,
    reached: goal > 0 && current >= goal,
  };
}
