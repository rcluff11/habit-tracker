// Shared validation for user-owned records. Loaded with require() from main.pb.js
// (JSVM handlers can't see outer-scope functions).

const RELATIONS = {
  blocks: { category: "categories", step: "course_steps" },
  tasks: { category: "categories", block: "blocks", step: "course_steps" },
  completions: { task: "tasks" },
  rewards: { category: "categories" },
  plan_targets: { plan: "plans", category: "categories", task: "tasks" },
  course_steps: { course: "courses" },
};

// --- Dates -------------------------------------------------------------------------------
// Calendar dates are "YYYY-MM-DD" strings. UTC arithmetic gives the same calendar result
// as the local-date helpers in src/lib/time.js (addDays), with no DST surprises.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// True for a real calendar date: rejects 2026-13-40 and 2026-02-30, which match the pattern
// but don't survive a round trip through Date.
function isRealDate(s) {
  if (typeof s !== "string" || !ISO_DATE.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function addDays(iso, n) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function weekday(iso) {
  return new Date(iso + "T00:00:00Z").getUTCDay();
}

// --- Course window maths -----------------------------------------------------------------
// Keep in sync with activeWindow / courseEndDate in src/lib/stats.js (plan.md sync point 6).
//   step start  = course.startDate + (week - 1) * 7
//   course end  = course.startDate + maxWeek * 7 - 1   (over all of the course's steps)
//   stepped TASK start = max(step start, addDays(task.created.slice(0, 10), -1))  (text compare;
//                        blocks: step start)
// Used only when a step or course is deleted, to freeze the derived window onto the
// records that were linked to it (D-14, FR-20).

function stepStart(course, step) {
  return addDays(course.getString("startDate"), (step.getInt("week") - 1) * 7);
}

// A stepped task can't start before it existed, so a habit made mid-step doesn't count
// as missed for the days before it was created (M-2).
// created is UTC, so one day earlier keeps a habit made in the evening west of UTC visible
// on the local day it was made.
function taskStart(start, task) {
  const created = task.getString("created").slice(0, 10);
  if (!isRealDate(created)) return start;
  const from = addDays(created, -1);
  return from > start ? from : start;
}

function courseEnd(app, course) {
  const steps = app.findRecordsByFilter("course_steps", "course = {:id}", "", 0, 0, { id: course.id });
  let maxWeek = 0;
  for (const s of steps) maxWeek = Math.max(maxWeek, s.getInt("week"));
  return maxWeek ? addDays(course.getString("startDate"), maxWeek * 7 - 1) : "";
}

// Writes the step's window onto every task and block still linked to it, and unlinks them.
// end is the course's end date when onEnd is "stop", otherwise "".
function stampStep(app, step, start, end) {
  const tasks = app.findRecordsByFilter("tasks", "step = {:id}", "", 0, 0, { id: step.id });
  for (const t of tasks) {
    t.set("date", taskStart(start, t));
    t.set("recurUntil", end);
    t.set("step", "");
    app.save(t);
  }
  const blocks = app.findRecordsByFilter("blocks", "step = {:id}", "", 0, 0, { id: step.id });
  for (const b of blocks) {
    let date = start;
    if (b.getString("recurrence") === "weekly") {
      // First date on or after the step start that keeps the block's weekday anchor.
      const anchor = b.getString("date");
      if (isRealDate(anchor)) date = addDays(start, (weekday(anchor) - weekday(start) + 7) % 7);
    }
    b.set("date", date);
    if (end) {
      const until = b.getString("recurUntil");
      b.set("recurUntil", until && until < end ? until : end);
    }
    b.set("step", "");
    app.save(b);
  }
}

function ownerExists(app, record) {
  try {
    app.findRecordById("users", record.getString("user"));
    return true;
  } catch (_) {
    return false;
  }
}

// onRecordDelete("courses"): runs before the course and its steps are deleted, so every step
// still exists and the course end uses all of them. Linked records are unlinked here, so the
// cascaded step deletes find nothing left to stamp (whatever order PocketBase cascades in).
function stampCourseDelete(app, course) {
  if (!ownerExists(app, course)) return; // account deletion: everything goes anyway
  const end = course.getString("onEnd") === "stop" ? courseEnd(app, course) : "";
  const steps = app.findRecordsByFilter("course_steps", "course = {:id}", "", 0, 0, { id: course.id });
  for (const step of steps) stampStep(app, step, stepStart(course, step), end);
}

// onRecordDelete("course_steps"): a step deleted on its own. When the course is already gone
// (cascade from a course delete) the course hook has done the work.
function stampStepDelete(app, step) {
  if (!ownerExists(app, step)) return;
  let course;
  try {
    course = app.findRecordById("courses", step.getString("course"));
  } catch (_) {
    return;
  }
  const end = course.getString("onEnd") === "stop" ? courseEnd(app, course) : "";
  stampStep(app, step, stepStart(course, step), end);
}

function exists(collection, filter, params) {
  try {
    $app.findFirstRecordByFilter(collection, filter, params);
    return true;
  } catch (_) {
    return false;
  }
}

function ownedBy(collection, id, userId) {
  let rec;
  try {
    rec = $app.findRecordById(collection, id);
  } catch (_) {
    return null;
  }
  return rec.get("user") === userId ? rec : null;
}

// Keep in sync with REMINDER_OPTIONS in src/lib/reminders.js.
const REMINDER_OPTIONS = [0, 5, 10, 15, 30, 60];

// Validates a remindBefore JSON field. Returns a clean array, or null when unset.
function cleanRemindBefore(record) {
  const raw = record.getString("remindBefore");
  if (raw === "" || raw === "null") return null;
  let value;
  try {
    value = JSON.parse(raw);
  } catch (_) {
    value = undefined;
  }
  if (!Array.isArray(value) || value.some((m) => REMINDER_OPTIONS.indexOf(m) === -1)) {
    throw new BadRequestError("Reminders must be a list of: " + REMINDER_OPTIONS.join(", ") + " minutes.");
  }
  const unique = [];
  for (const m of value) if (unique.indexOf(m) === -1) unique.push(m);
  return unique.sort((a, b) => b - a);
}

// Keep in sync with NUDGE_STEP and MAX_NUDGES in src/lib/reminders.js.
const NUDGE_STEP = 15;
const MAX_NUDGES = 6;
// Keep in sync with EARLIEST_DAY_END in src/lib/reminders.js.
const EARLIEST_DAY_END = "12:00";

// Validates users.nudgeTimes (minutes since midnight). Returns a sorted, unique array;
// unset/null becomes [] (nudges off).
function cleanNudgeTimes(record) {
  const raw = record.getString("nudgeTimes");
  if (raw === "" || raw === "null") return [];
  let value;
  try {
    value = JSON.parse(raw);
  } catch (_) {
    value = undefined;
  }
  const ok =
    Array.isArray(value) &&
    value.length <= MAX_NUDGES &&
    value.every((m) => typeof m === "number" && Number.isInteger(m) && m >= 0 && m <= 1440 - NUDGE_STEP && m % NUDGE_STEP === 0);
  if (!ok) {
    throw new BadRequestError("Nudge times must be up to " + MAX_NUDGES + " times in " + NUDGE_STEP + "-minute steps.");
  }
  const unique = [];
  for (const m of value) if (unique.indexOf(m) === -1) unique.push(m);
  return unique.sort((a, b) => a - b);
}

function check(e) {
  if (e.hasSuperuserAuth()) return;
  const userId = e.auth ? e.auth.id : "";
  const record = e.record;
  const name = record.collection().name;

  // Stepped tasks are daily habits whose start and end come from the course (D-14), so
  // there is no second copy of their dates and no block (tasks on a block follow the block).
  if (name === "tasks" && record.getString("step")) {
    record.set("daily", true);
    record.set("block", "");
    record.set("date", "");
    record.set("remindDate", "");
    record.set("recurUntil", "");
  }

  // Related records must belong to the same user.
  const relations = RELATIONS[name] || {};
  for (const field in relations) {
    const id = record.getString(field);
    if (id && !ownedBy(relations[field], id, userId)) {
      throw new BadRequestError("Invalid " + field + ".");
    }
  }

  // Course checks need the step's start date (step ownership was checked above).
  if ((name === "tasks" || name === "blocks") && record.getString("step")) {
    const step = ownedBy("course_steps", record.getString("step"), userId);
    const course = step ? ownedBy("courses", step.getString("course"), userId) : null;
    if (course) {
      const start = stepStart(course, step);
      // m-7: a block that stops repeating before its course week starts would never show.
      if (name === "blocks") {
        const until = record.getString("recurUntil");
        if (until && until < start) throw new BadRequestError("Repeat until can't be before the course week starts.");
      }
      // M-2: linking a habit with earlier check-offs would hide them from its history.
      if (name === "tasks" && !record.isNew() && record.getString("step") !== record.original().getString("step")) {
        const from = taskStart(start, record);
        if (exists("completions", "task = {:id} && date < {:start}", { id: record.id, start: from })) {
          throw new BadRequestError(
            "This habit has check-offs before that course week starts. Create a new habit for the course instead, so its history stays."
          );
        }
      }
    }
  }

  // m-1: a habit target needs its task to stay a habit (daily or on a block).
  if (name === "tasks" && !record.isNew() && !record.getBool("daily") && !record.getString("block")) {
    if (exists("plan_targets", "kind = 'completions' && task = {:id}", { id: record.id })) {
      throw new BadRequestError("This habit is used by a monthly target. Remove the target first.");
    }
  }

  if (name === "blocks" && record.getInt("end") <= record.getInt("start")) {
    throw new BadRequestError("A block must end after it starts.");
  }

  // Reminder offsets: blocks keep null (= use the user's default); users default to 10 minutes.
  if (name === "blocks" || name === "users") {
    const offsets = cleanRemindBefore(record);
    record.set("remindBefore", offsets === null && name === "users" ? [10] : offsets);
  }

  if (name === "users") {
    record.set("nudgeTimes", cleanNudgeTimes(record));
    // "HH:MM" compares as text. "" means the default (21:00).
    const dayEndAt = record.getString("dayEndAt");
    if (dayEndAt && dayEndAt < EARLIEST_DAY_END) throw new BadRequestError("The day must end at 12:00 PM or later.");
  }

  // A stepped block appears every week of its course window, so it must repeat (A-8).
  if (name === "blocks" && record.getString("step")) {
    const rec = record.getString("recurrence");
    if (rec === "" || rec === "none") throw new BadRequestError("A course block must repeat.");
  }

  // recurUntil is the last day of an unstepped daily habit; it means nothing on other tasks.
  if (name === "tasks") {
    if (!record.getBool("daily")) record.set("recurUntil", "");
    const until = record.getString("recurUntil");
    if (until && !isRealDate(until)) throw new BadRequestError("Invalid end date.");
  }

  if (name === "checkins") {
    if (!isRealDate(record.getString("date"))) throw new BadRequestError("Invalid date.");
    // A check-in belongs to one day; only its energy can change.
    if (!record.isNew() && record.getString("date") !== record.original().getString("date")) {
      throw new BadRequestError("A check-in's date can't change.");
    }
  }

  if (name === "plans") {
    const month = record.getString("month");
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !isRealDate(month + "-01")) {
      throw new BadRequestError("Invalid month.");
    }
  }

  if (name === "courses") {
    if (!isRealDate(record.getString("startDate"))) throw new BadRequestError("Invalid start date.");
    if (!record.getString("onEnd")) record.set("onEnd", "keep");
  }

  // Each target kind uses only its own fields. Keep the kinds in sync with targetProgress
  // in src/lib/stats.js and the plan_targets.kind select (plan.md sync point 4).
  if (name === "plan_targets") {
    const kind = record.getString("kind");
    if (kind === "points") {
      record.set("task", "");
    } else if (kind === "percent") {
      record.set("category", "");
      record.set("task", "");
      if (record.getInt("target") > 100) throw new BadRequestError("A % target must be 1–100.");
    } else if (kind === "completions") {
      record.set("category", "");
      // Ownership was checked above; it must also be a habit (daily or on a block).
      const task = record.getString("task") ? ownedBy("tasks", record.getString("task"), userId) : null;
      if (!task || !(task.getBool("daily") || task.getString("block"))) {
        throw new BadRequestError("A habit target needs a habit.");
      }
    }
  }

  // Block tasks are reminded with their block; only one-offs without a due date use remindDate.
  if (name === "tasks") {
    if (record.getString("block")) {
      record.set("remindAt", "");
      record.set("remindDate", "");
    } else if (record.getBool("daily") || record.getString("date")) {
      record.set("remindDate", "");
    }
  }

  // Points earned always come from the task, never from the client.
  if (name === "completions") {
    const task = ownedBy("tasks", record.getString("task"), userId);
    record.set("points", task ? task.getInt("points") : 0);
  }

  // The endpoint (one per device) always comes from the subscription itself.
  if (name === "push_subscriptions") {
    let sub;
    try {
      sub = JSON.parse(record.getString("subscription"));
    } catch (_) {
      sub = null;
    }
    const endpoint = sub && typeof sub.endpoint === "string" ? sub.endpoint : "";
    if (!endpoint.startsWith("https://") || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) {
      throw new BadRequestError("Invalid push subscription.");
    }
    record.set("endpoint", endpoint);
  }
}

module.exports = { check, stampCourseDelete, stampStepDelete };
