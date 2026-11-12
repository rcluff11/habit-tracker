// Unit tests for the reminder rules in src/lib/reminders.js. Run: npm run test:reminders
import {
  dueReminders, leadText, blockOffsets, cleanOffsets,
  dueDailyMessages, cleanNudgeTimes, nudgeTimesFor, NUDGE_PRESETS, NUDGE_STEP, MAX_NUDGES,
} from "../src/lib/reminders.js";
import { indexCompletions, scheduleIndex } from "../src/lib/stats.js";
import { affirmationFor } from "../src/lib/affirmations.js";
import {
  CELEBRATIONS, TOMORROW_LINES, NUDGE_LINES, LOW_ENERGY_LINES, HIGH_ENERGY_LINES, LOW_ENERGY_CELEBRATIONS, nudgeText,
} from "../src/lib/messages.js";

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${label}${ok ? "" : `\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`}`);
}

const D = "2026-10-28"; // a Wednesday
const block = (over = {}) => ({ id: "b1", title: "Gym", date: D, start: 600, end: 660, recurrence: "none", remindBefore: null, ...over });
const run = ({ minutes, date = D, blocks = [], tasks = [], completions = [], userDefault = [10] }) =>
  dueReminders({ now: { date, minutes }, blocks, tasks, completionIndex: indexCompletions(completions), userDefault });
const pick = (list) => list.map((r) => ({ key: r.key, body: r.body, ttl: r.ttl }));

// Wording
check("lead: now", leadText(0), "Starting now");
check("lead: minutes", leadText(5), "Starts in 5 min");
check("lead: 1 hour", leadText(60), "Starts in 1 hour");
check("lead: 2 hours", leadText(120), "Starts in 2 hours");
check("lead: mixed", leadText(75), "Starts in 1 hr 15 min");

// Offsets
check("block null uses user default", blockOffsets(block(), [30]), [30]);
check("block [] means none", blockOffsets(block({ remindBefore: [] }), [30]), []);
check("block custom", blockOffsets(block({ remindBefore: [10, 60] }), [30]), [60, 10]);
check("missing user default falls back to 10", blockOffsets(block(), null), [10]);
check("invalid offsets are dropped", cleanOffsets([10, 7, 10, "15"]), [15, 10]);

// Block reminders
check("default 10 min fires at start-10", pick(run({ minutes: 590, blocks: [block()] })),
  [{ key: `block|b1|${D}|10`, body: "Starts in 10 min", ttl: 600 }]);
check("nothing before the window", run({ minutes: 589, blocks: [block()] }).length, 0);
check("same key later in the window (caller dedupes)", run({ minutes: 595, blocks: [block()] })[0]?.key, `block|b1|${D}|10`);
check("nothing once the block has started (no 'at start')", run({ minutes: 600, blocks: [block()] }).length, 0);
check("several past offsets: only the closest", pick(run({ minutes: 575, blocks: [block({ remindBefore: [60, 30, 10] })] })),
  [{ key: `block|b1|${D}|30`, body: "Starts in 25 min", ttl: 1500 }]);
check("1 hour wording", run({ minutes: 540, blocks: [block({ remindBefore: [60] })] })[0]?.body, "Starts in 1 hour");
check("at start fires at start", pick(run({ minutes: 600, blocks: [block({ remindBefore: [0] })] })),
  [{ key: `block|b1|${D}|0`, body: "Starting now", ttl: 60 }]);
check("at start is not sent late", run({ minutes: 601, blocks: [block({ remindBefore: [0] })] }).length, 0);
check("block with no reminders", run({ minutes: 590, blocks: [block({ remindBefore: [] })] }).length, 0);
check("block uses user default 30", run({ minutes: 570, blocks: [block()], userDefault: [30] })[0]?.key, `block|b1|${D}|30`);
check("weekly block on another weekday", run({ minutes: 590, date: "2026-10-29", blocks: [block({ recurrence: "weekly" })] }).length, 0);
check("across midnight: 12:05am block reminded at 11:55pm",
  pick(run({ minutes: 1435, blocks: [block({ start: 5, end: 60, recurrence: "daily" })] })),
  [{ key: "block|b1|2026-10-29|10", body: "Starts in 10 min", ttl: 600 }]);

// Block body lists only incomplete tasks for that day
const blockTasks = [
  { id: "t1", title: "Squats", block: "b1" },
  { id: "t2", title: "Protein shake", block: "b1" },
];
check("lists incomplete tasks",
  run({ minutes: 590, blocks: [block()], tasks: blockTasks, completions: [{ task: "t1", date: D }] })[0]?.body,
  "Starts in 10 min · To do: Protein shake");
check("completion on another day doesn't count",
  run({ minutes: 590, blocks: [block()], tasks: blockTasks, completions: [{ task: "t1", date: "2026-10-27" }] })[0]?.body,
  "Starts in 10 min · To do: Squats, Protein shake");

// Task reminders
const daily = { id: "d1", title: "Stretching", daily: true, date: "2026-10-01", remindAt: "07:30", points: 5 };
check("daily task at its time", pick(run({ minutes: 450, tasks: [daily] })),
  [{ key: `task|d1|${D}|at`, body: "Worth 5 points. Tap to check it off.", ttl: 900 }]);
check("daily task title", run({ minutes: 450, tasks: [daily] })[0]?.title, "Don't forget: Stretching");
check("daily task still sent within grace", run({ minutes: 464, tasks: [daily] })[0]?.ttl, 60);
check("daily task not sent after grace", run({ minutes: 465, tasks: [daily] }).length, 0);
check("daily task done today: skipped", run({ minutes: 450, tasks: [daily], completions: [{ task: "d1", date: D }] }).length, 0);
check("daily task done yesterday: still reminded", run({ minutes: 450, tasks: [daily], completions: [{ task: "d1", date: "2026-10-27" }] }).length, 1);
check("daily task before its start date", run({ minutes: 450, tasks: [{ ...daily, date: "2026-11-01" }] }).length, 0);

const due = { id: "o1", title: "Pay rent", date: D, remindAt: "09:00" };
check("one-off on its due date", run({ minutes: 540, tasks: [due] }).length, 1);
check("one-off not on other days", run({ minutes: 540, date: "2026-10-27", tasks: [due] }).length, 0);
check("one-off already done (any day): skipped", run({ minutes: 540, tasks: [due], completions: [{ task: "o1", date: "2026-10-20" }] }).length, 0);
const undated = { id: "o2", title: "Call Mom", date: "", remindDate: D, remindAt: "18:00" };
check("undated one-off uses remindDate", run({ minutes: 1080, tasks: [undated] })[0]?.key, `task|o2|${D}|at`);
check("undated one-off without remindDate: never", run({ minutes: 1080, tasks: [{ ...undated, remindDate: "" }] }).length, 0);
check("block task with remindAt: only via block", run({ minutes: 450, tasks: [{ ...daily, block: "b1" }] }).length, 0);
check("no points: simpler body", run({ minutes: 1080, tasks: [undated] })[0]?.body, "Tap to check it off.");

// Nudge times: constants and validation (must match cleanNudgeTimes in pb_hooks/guards.js)
check("NUDGE_STEP / MAX_NUDGES", [NUDGE_STEP, MAX_NUDGES], [15, 6]);
check("preset light", NUDGE_PRESETS.light, [1080]);
check("preset regular", NUDGE_PRESETS.regular, [720, 1080]);
check("preset frequent", NUDGE_PRESETS.frequent, [600, 840, 1080]);
check("presets pass validation", Object.values(NUDGE_PRESETS).map((p) => cleanNudgeTimes(p)), Object.values(NUDGE_PRESETS));
check("ok: [720, 1080]", cleanNudgeTimes([720, 1080]), [720, 1080]);
check("ok: 0 and 1425", cleanNudgeTimes([1425, 0]), [0, 1425]);
check("dedupe and sort", cleanNudgeTimes([1080, 720, 720]), [720, 1080]);
check("reject 725 (off-step)", cleanNudgeTimes([725]), null);
check("reject 1440", cleanNudgeTimes([1440]), null);
check("reject -15", cleanNudgeTimes([-15]), null);
check("reject 900.5", cleanNudgeTimes([900.5]), null);
check("reject 7", cleanNudgeTimes([7]), null);
check("reject string element", cleanNudgeTimes(["720"]), null);
check("reject string value", cleanNudgeTimes("720"), null);
check("reject 'noon'", cleanNudgeTimes("noon"), null);
check("reject object", cleanNudgeTimes({ a: 720 }), null);
check("reject 7 entries", cleanNudgeTimes([0, 15, 30, 45, 60, 75, 90]), null);
check("6 entries ok", cleanNudgeTimes([0, 15, 30, 45, 60, 75]), [0, 15, 30, 45, 60, 75]);
check("'' -> []", cleanNudgeTimes(""), []);
check("null -> []", cleanNudgeTimes(null), []);
check("[] -> []", cleanNudgeTimes([]), []);
check("nudgeTimesFor: unset", nudgeTimesFor({}), []);
check("nudgeTimesFor: null user", nudgeTimesFor(null), []);
check("nudgeTimesFor: invalid -> off", nudgeTimesFor({ nudgeTimes: [7] }), []);
check("nudgeTimesFor: valid", nudgeTimesFor({ nudgeTimes: [1080, 720] }), [720, 1080]);

// Daily messages
const habitA = { id: "h1", title: "Read", daily: true, date: "2026-10-01", points: 5 };
const habitB = { id: "h2", title: "Walk", daily: true, date: "2026-10-01", points: 10, priority: true };
const habits = [habitA, habitB];
const doneAll = [{ task: "h1", date: D, points: 5 }, { task: "h2", date: D, points: 10 }];
const doneOne = [{ task: "h1", date: D, points: 5 }];
const msgs = ({ minutes, date = D, user = {}, tasks = habits, completions = [], schedule, checkins }) =>
  dueDailyMessages({
    now: { date, minutes },
    user,
    data: { tasks, blocks: [], completionIndex: indexCompletions(completions), schedule, checkins },
  });
const keys = (list) => list.map((m) => m.key);

// Off / empty settings
check("everything off: nothing", msgs({ minutes: 720 }), []);
check("all off at day end: nothing", msgs({ minutes: 1260, user: { dayEndPush: false } }), []);
check("affirmationAt '' is off", msgs({ minutes: 0, user: { affirmationAt: "" } }), []);
check("bad affirmationAt is off", msgs({ minutes: 425, user: { affirmationAt: "7:5" } }), []);
check("nudgeTimes [] is off", msgs({ minutes: 720, user: { nudgeTimes: [] } }), []);

// Affirmation
const aff = { affirmationAt: "07:30" };
const affMsg = msgs({ minutes: 450, user: aff });
check("affirmation at its time", affMsg.map((m) => ({ key: m.key, body: m.body, ttl: m.ttl, tag: m.tag, url: m.url })),
  [{ key: `affirmation|${D}`, body: affirmationFor(D), ttl: 900, tag: "affirmation", url: "/#home" }]);
check("affirmation not before", msgs({ minutes: 449, user: aff }), []);
check("affirmation last grace minute", msgs({ minutes: 464, user: aff })[0]?.ttl, 60);
check("affirmation not after grace", msgs({ minutes: 465, user: aff }), []);
check("affirmation even with no tasks", keys(msgs({ minutes: 450, user: aff, tasks: [] })), [`affirmation|${D}`]);

// Nudges
const reg = { nudgeTimes: NUDGE_PRESETS.regular };
const n1 = msgs({ minutes: 720, user: reg });
check("nudge at 12:00", n1.map((m) => ({ key: m.key, title: m.title, tag: m.tag, ttl: m.ttl })),
  [{ key: `nudge|${D}|720`, title: "0 of 2 done", tag: "nudge", ttl: 900 }]);
check("nudge suggests the open priority", n1[0]?.body.startsWith("2 left · Next: Walk. "), true);
check("nudge not before", msgs({ minutes: 719, user: reg }), []);
check("nudge within grace", keys(msgs({ minutes: 734, user: reg })), [`nudge|${D}|720`]);
check("nudge not after grace", msgs({ minutes: 735, user: reg }), []);
check("second slot has its own key", keys(msgs({ minutes: 1080, user: reg, completions: doneOne })), [`nudge|${D}|1080`]);
check("custom time 08:45", keys(msgs({ minutes: 525, user: { nudgeTimes: [525] } })), [`nudge|${D}|525`]);
check("no tasks: no nudge", msgs({ minutes: 720, user: reg, tasks: [] }), []);
check("invalid nudgeTimes: no nudge", msgs({ minutes: 720, user: { nudgeTimes: [725] } }), []);

// Celebration once the day is complete: one key per day, so later slots dedupe to nothing new
const c1 = msgs({ minutes: 720, user: reg, completions: doneAll });
check("complete: celebration", c1.map((m) => ({ key: m.key, title: m.title })), [{ key: `nudge-done|${D}`, title: "All done!" }]);
check("celebration text is a celebration", CELEBRATIONS.includes(c1[0]?.body), true);
check("later slot reuses the celebration key (caller sends it once)",
  keys(msgs({ minutes: 1080, user: reg, completions: doneAll })), [`nudge-done|${D}`]);
check("no regular nudge once complete", keys(msgs({ minutes: 1080, user: reg, completions: doneAll })).some((k) => k.startsWith("nudge|")), false);

// Nudges at or after day end are skipped (default day end 21:00 = 1260)
check("nudge at day end skipped", msgs({ minutes: 1260, user: { nudgeTimes: [1260] } }), []);
check("nudge after day end skipped", msgs({ minutes: 1320, user: { nudgeTimes: [1320] } }), []);
check("nudge after custom day end skipped", msgs({ minutes: 1080, user: { nudgeTimes: [1080], dayEndAt: "18:00" } }), []);
check("nudge before custom day end fires", keys(msgs({ minutes: 1080, user: { nudgeTimes: [1080], dayEndAt: "19:00" } })), [`nudge|${D}|1080`]);
check("nudge window clamped at day end", msgs({ minutes: 1080, user: { nudgeTimes: [1080], dayEndAt: "18:05" } })[0]?.ttl, 300);
check("nothing in the nudge slot once day end passed", msgs({ minutes: 1085, user: { nudgeTimes: [1080], dayEndAt: "18:05" } }), []);

// Day-end push
const de = { dayEndPush: true };
const d1 = msgs({ minutes: 1260, user: de, completions: doneOne });
check("day end at 21:00", d1.map((m) => ({ key: m.key, tag: m.tag, ttl: m.ttl })), [{ key: `dayend|${D}`, tag: "dayend", ttl: 900 }]);
check("day end unfinished: headline + tomorrow line",
  TOMORROW_LINES.some((l) => d1[0]?.body === `1 of 2 done · 5 points. ${l}`), true);
const d2 = msgs({ minutes: 1260, user: de, completions: doneAll })[0]?.body;
check("day end complete: headline + celebration", CELEBRATIONS.some((l) => d2 === `All 2 done · 15 points. ${l}`), true);
check("day end not before", msgs({ minutes: 1259, user: de }), []);
check("day end within grace", keys(msgs({ minutes: 1274, user: de })), [`dayend|${D}`]);
check("day end not after grace", msgs({ minutes: 1275, user: de }), []);
check("day end off", msgs({ minutes: 1260, user: { dayEndPush: false } }), []);
check("day end, no tasks: nothing", msgs({ minutes: 1260, user: de, tasks: [] }), []);
check("custom day end", keys(msgs({ minutes: 1350, user: { dayEndPush: true, dayEndAt: "22:30" } })), [`dayend|${D}`]);

// 23:55 day end is clamped at midnight
const late = { dayEndPush: true, dayEndAt: "23:55" };
check("23:55 fires", msgs({ minutes: 1435, user: late })[0]?.ttl, 300);
check("23:59 last minute", msgs({ minutes: 1439, user: late })[0]?.ttl, 60);
check("next day 00:05: no day-end for anyone", msgs({ minutes: 5, date: "2026-10-29", user: late }), []);

// Local date, not UTC: the subscription's local date drives the key and the text around midnight
const mid = { affirmationAt: "00:00" };
const justAfter = msgs({ minutes: 0, date: "2026-10-29", user: mid })[0];
check("local date key after local midnight", justAfter?.key, "affirmation|2026-10-29");
check("local date text after local midnight", justAfter?.body, affirmationFor("2026-10-29"));
const lateAff = msgs({ minutes: 1439, user: { affirmationAt: "23:59" } })[0];
check("late evening stays on the local date", [lateAff?.key, lateAff?.body], [`affirmation|${D}`, affirmationFor(D)]);
check("23:59 window clamped at midnight", lateAff?.ttl, 60);

// Several due at once
check("affirmation + day end together; the 20:45 nudge has closed",
  keys(msgs({ minutes: 1260, user: { affirmationAt: "21:00", nudgeTimes: [1245], dayEndPush: true, dayEndAt: "21:00" } })),
  [`affirmation|${D}`, `dayend|${D}`]);
check("nudge one minute before day end",
  keys(msgs({ minutes: 1260, user: { nudgeTimes: [1260], dayEndPush: true, dayEndAt: "21:01" } })), [`nudge|${D}|1260`]);

// schedule passes through untouched (no courses yet)
check("empty schedule == no schedule", keys(msgs({ minutes: 720, user: reg, schedule: {} })), [`nudge|${D}|720`]);

// nudgeText wording
check("nudgeText: complete is a celebration", CELEBRATIONS.includes(nudgeText({ total: 2, done: 2 }, null, D)), true);
check("nudgeText: open, no next", NUDGE_LINES.some((l) => nudgeText({ total: 3, done: 1 }, null, D) === `2 left. ${l}`), true);
check("nudgeText: never 'tomorrow' mid-day", /tomorrow/i.test(nudgeText({ total: 3, done: 0 }, null, D)), false);
check("nudgeText: deterministic", nudgeText({ total: 3, done: 1 }, null, D), nudgeText({ total: 3, done: 1 }, null, D));

// Energy-aware nudges (F-14): low is gentler and suggests a non-heavy task, high is upbeat and suggests
// the heaviest, normal or no check-in keeps the default wording.
const heavyTask = { id: "h3", title: "Deep work", daily: true, date: "2026-10-01", points: 60, effort: "heavy" };
const withHeavy = [...habits, heavyTask];
const checkin = (energy, date = D) => [{ date, energy }];
const bodyAt = (opts) => msgs({ minutes: 720, user: reg, tasks: withHeavy, ...opts })[0]?.body;
const plain = bodyAt({});
const lineOf = (body) => body.slice(body.indexOf(". ") + 2);
check("energy: no check-in keeps default wording", plain.startsWith("3 left · Next: Walk. ") && NUDGE_LINES.includes(lineOf(plain)), true);
check("energy: normal matches no check-in", bodyAt({ checkins: checkin("normal") }), plain);
check("energy: yesterday's check-in is ignored", bodyAt({ checkins: checkin("low", "2026-10-27") }), plain);
check("energy: unknown level is ignored", bodyAt({ checkins: checkin("sleepy") }), plain);
const low = bodyAt({ checkins: checkin("low") });
check("energy low: suggests an easy task", low.startsWith("3 left · Easy one: Walk. "), true);
check("energy low: gentler line", LOW_ENERGY_LINES.includes(lineOf(low)), true);
const lowHeavyOnly = bodyAt({ checkins: checkin("low"), completions: doneAll });
check("energy low: never suggests a heavy task", lowHeavyOnly.startsWith("1 left. ") && LOW_ENERGY_LINES.includes(lineOf(lowHeavyOnly)), true);
const high = bodyAt({ checkins: checkin("high") });
check("energy high: suggests the heavy task", high.startsWith("3 left · Next: Deep work. "), true);
check("energy high: upbeat line", HIGH_ENERGY_LINES.includes(lineOf(high)), true);
check("energy: title unchanged", msgs({ minutes: 720, user: reg, tasks: withHeavy, checkins: checkin("low") })[0]?.title, "0 of 3 done");
const lowDone = msgs({ minutes: 720, user: reg, completions: doneAll, checkins: checkin("low") })[0];
check("energy low complete: gentle celebration, same key", [lowDone?.key, LOW_ENERGY_CELEBRATIONS.includes(lowDone?.body)], [`nudge-done|${D}`, true]);
check("energy high complete: normal celebration",
  CELEBRATIONS.includes(msgs({ minutes: 720, user: reg, completions: doneAll, checkins: checkin("high") })[0]?.body), true);
check("energy: day-end push unchanged by check-in",
  msgs({ minutes: 1260, user: de, completions: doneOne, checkins: checkin("low") })[0]?.body, d1[0]?.body);
check("nudgeText: energy omitted == null", nudgeText({ total: 3, done: 1 }, null, D), nudgeText({ total: 3, done: 1 }, null, D, null));
check("nudgeText: energy shifts with progress like the default",
  nudgeText({ total: 3, done: 1 }, null, D, "low") !== nudgeText({ total: 3, done: 2 }, null, D, "low"), true);

// Sender wiring (push/sender.mjs helpers; importing it connects to nothing and sends nothing)
const { localNow, buildMessagesForSub, completionsSince, COMPLETIONS_FILTER } = await import("../push/sender.mjs");
const at = new Date("2026-10-28T03:30:00Z");
check("localNow: Denver is the previous local day", localNow("America/Denver", at), { date: "2026-10-27", minutes: 1290 });
check("localNow: Tokyo", localNow("Asia/Tokyo", at), { date: "2026-10-28", minutes: 750 });
check("localNow: bad zone falls back to Denver", localNow("Not/AZone", at), localNow("America/Denver", at));
check("completionsSince: server date minus 2", completionsSince(at), "2026-10-26");
check("completions filter covers all one-offs", COMPLETIONS_FILTER, "date >= {:since} || (task.daily = false && task.block = '')");

const oldOneOff = { id: "o1", title: "File taxes", daily: false, block: "", date: "", points: 20 };
const sub = ({ minutes, user, tasks = [habitA, oldOneOff], completions = [], blocks = [], checkins }) =>
  buildMessagesForSub({ now: { date: D, minutes }, user, blocks, tasks, completionIndex: indexCompletions(completions), checkins });
const habitDone = { task: "h1", date: D, points: 5 };
const oldDone = { task: "o1", date: "2026-10-01", points: 20 };
check("sender: old completed one-off is not open today (nudge-done)",
  keys(sub({ minutes: 720, user: reg, completions: [habitDone, oldDone] })), [`nudge-done|${D}`]);
check("sender: without its completion the one-off counts as open",
  sub({ minutes: 720, user: reg, completions: [habitDone] }).map((m) => [m.key, m.title]), [[`nudge|${D}|720`, "1 of 2 done"]]);
check("sender: everything off sends only the block reminder",
  keys(sub({ minutes: 590, user: { remindBefore: [10], affirmationAt: "", nudgeTimes: [], dayEndAt: "", dayEndPush: false }, blocks: [block()] })),
  [`block|b1|${D}|10`]);
check("sender: reminders and daily messages together",
  keys(sub({ minutes: 590, user: { remindBefore: [10], affirmationAt: "09:50" }, blocks: [block()] })),
  [`block|b1|${D}|10`, `affirmation|${D}`]);
check("sender: unknown user still gets block reminders (default offsets), no daily messages",
  keys(sub({ minutes: 590, user: undefined, blocks: [block()] })), [`block|b1|${D}|10`]);
check("sender: today's low check-in reaches the nudge",
  LOW_ENERGY_LINES.includes(lineOf(sub({ minutes: 720, user: reg, checkins: checkin("low") })[0]?.body)), true);
check("sender: no check-ins uses default wording",
  NUDGE_LINES.includes(lineOf(sub({ minutes: 720, user: reg })[0]?.body)), true);

// T-4 m-4: the default nudge never suggests a task whose block is already over today.
const liftTask = { id: "bt", title: "Lift", block: "b1", priority: true, points: 50 };
const nudgeBody = (minutes, nudgeTimes) =>
  sub({ minutes, user: { nudgeTimes }, tasks: [habitA, liftTask], blocks: [block()] }).find((m) => m.key.startsWith("nudge"))?.body;
check("default nudge: block still to come is suggested", nudgeBody(585, [585])?.includes("Next: Lift."), true);
check("default nudge: ended block's task isn't suggested", nudgeBody(720, [720])?.startsWith("2 left · Next: Read. "), true);
check("default nudge: only an ended block's task left suggests nothing",
  /^1 left\. /.test(sub({ minutes: 720, user: reg, tasks: [habitA, liftTask], blocks: [block()], completions: [habitDone] })[0]?.body), true);

// T-4 m-5: the sent log survives a restart, so a message isn't sent twice inside its window.
const { parseSentLog } = await import("../push/sender.mjs");
const nowMs = Date.parse("2026-10-28T12:00:00Z");
const savedLog = JSON.stringify({ "s1|nudge|2026-10-28|720": nowMs - 60_000, "s1|old": nowMs - 3 * 86_400_000, "s1|bad": "x" });
check("sent log: recent keys load, old and malformed ones are dropped", [...parseSentLog(savedLog, nowMs).keys()], ["s1|nudge|2026-10-28|720"]);
check("sent log: unreadable file loads as empty", parseSentLog("{not json", nowMs).size, 0);

// Missing phase 2 collections are read as empty: block and task reminders still go out.
check("sender: empty check-ins and empty schedule still send block and task reminders",
  keys(buildMessagesForSub({ now: { date: D, minutes: 590 }, user: { remindBefore: [10] }, blocks: [block()],
    tasks: [{ ...daily, remindAt: "09:50" }], completionIndex: indexCompletions([]), checkins: [], schedule: scheduleIndex([], []) })),
  [`block|b1|${D}|10`, `task|d1|${D}|at`]);

// Sender + course schedule (B-8). Same course dates as the F-15 checks below:
// "keep" course k has weeks 1-2; "stop" course s has weeks 1 and 3 and ends 2026-03-24.
{
  const sched = scheduleIndex(
    [{ id: "k", startDate: "2026-03-04", onEnd: "keep" }, { id: "s", startDate: "2026-03-04", onEnd: "stop" }],
    [{ id: "k1", course: "k", week: 1 }, { id: "k2", course: "k", week: 2 }, { id: "s1", course: "s", week: 1 }, { id: "s3", course: "s", week: 3 }],
  );
  const W1 = "2026-03-10", W2 = "2026-03-11", LAST = "2026-03-24", AFTER = "2026-03-25";
  const cBlock = (step) => block({ id: "cb", date: "2026-01-01", recurrence: "daily", step });
  const cHabit = (step) => ({ id: "ch", title: "Gym", daily: true, step, date: "", created: "2026-01-01 10:00:00Z", remindAt: "08:00", points: 5 });
  const user = { remindBefore: [10], nudgeTimes: [720], dayEndAt: "21:00", dayEndPush: true };
  const csub = (date, minutes, { blocks = [], tasks = [], completions = [], checkins, schedule = sched } = {}) =>
    keys(buildMessagesForSub({ now: { date, minutes }, user, blocks, tasks, completionIndex: indexCompletions(completions), checkins, schedule }));

  check("sender: stepped block not reminded before its week", csub(W1, 590, { blocks: [cBlock("k2")] }), []);
  check("sender: stepped block reminded in its week", csub(W2, 590, { blocks: [cBlock("k2")] }), [`block|cb|${W2}|10`]);
  check("sender: stop course block reminded on its last day, not after",
    [csub(LAST, 590, { blocks: [cBlock("s1")] }), csub(AFTER, 590, { blocks: [cBlock("s1")] })],
    [[`block|cb|${LAST}|10`], []]);
  check("sender: keep course block still reminded after the last week", csub(AFTER, 590, { blocks: [cBlock("k2")] }), [`block|cb|${AFTER}|10`]);

  check("sender: stepped habit not reminded before its week", csub(W1, 480, { tasks: [cHabit("k2")] }), []);
  check("sender: stepped habit reminded in its week", csub(W2, 480, { tasks: [cHabit("k2")] }), [`task|ch|${W2}|at`]);
  check("sender: stop course habit not reminded after the end",
    [csub(LAST, 480, { tasks: [cHabit("s1")] }), csub(AFTER, 480, { tasks: [cHabit("s1")] })],
    [[`task|ch|${LAST}|at`], []]);

  check("sender: week 2 habit not counted in week 1 (no nudge, no day-end push)",
    [csub(W1, 720, { tasks: [cHabit("k2")] }), csub(W1, 1260, { tasks: [cHabit("k2")] })], [[], []]);
  check("sender: week 2 habit counted in week 2",
    [csub(W2, 720, { tasks: [cHabit("k2")] }), csub(W2, 1260, { tasks: [cHabit("k2")] })], [[`nudge|${W2}|720`], [`dayend|${W2}`]]);
  check("sender: stop course habit not counted after the end",
    [csub(AFTER, 720, { tasks: [cHabit("s1")] }), csub(AFTER, 1260, { tasks: [cHabit("s1")] })], [[], []]);
  check("sender: stepped block task not counted before the block's week",
    csub(W1, 720, { blocks: [cBlock("k2")], tasks: [{ id: "bt", title: "Lift", block: "cb", points: 5 }] }), []);
  check("sender: out-of-window habit doesn't hold back nudge-done",
    csub(W1, 720, { tasks: [cHabit("k2"), { ...habitA, date: "2026-03-01" }], completions: [{ task: "h1", date: W1, points: 5 }] }), [`nudge-done|${W1}`]);
  check("sender: without a schedule a stepped habit falls back to its own dates",
    csub(W1, 480, { tasks: [cHabit("k2")], schedule: null }), [`task|ch|${W1}|at`]);
  check("sender: check-ins still shape the nudge with a schedule",
    LOW_ENERGY_LINES.includes(lineOf(buildMessagesForSub({ now: { date: W2, minutes: 720 }, user, blocks: [], tasks: [cHabit("k2"), { ...habitA, date: "2026-03-01" }],
      completionIndex: indexCompletions([]), checkins: checkin("low", W2), schedule: sched })[0]?.body)), true);
}

// Course windows (F-15). Course starts Wed 2026-03-04; week 2 starts 2026-03-11.
// "keep" has weeks 1-2; "stop" has weeks 1-3 and ends 2026-03-24.
{
  const sched = scheduleIndex(
    [{ id: "k", startDate: "2026-03-04", onEnd: "keep" }, { id: "s", startDate: "2026-03-04", onEnd: "stop" }],
    [{ id: "k1", course: "k", week: 1 }, { id: "k2", course: "k", week: 2 }, { id: "s1", course: "s", week: 1 }, { id: "s3", course: "s", week: 3 }],
  );
  const W1 = "2026-03-10"; // still week 1
  const W2 = "2026-03-11"; // first day of week 2
  const AFTER = "2026-03-25"; // day after the stop course ends
  const cBlock = (over) => block({ id: "cb", date: "2026-01-01", recurrence: "daily", step: "k2", ...over });
  const remind = (date, minutes, over = {}) =>
    keys(dueReminders({ now: { date, minutes }, blocks: [], tasks: [], completionIndex: indexCompletions([]), userDefault: [10], schedule: sched, ...over }));

  check("course: stepped block not reminded before its week", remind(W1, 590, { blocks: [cBlock()] }), []);
  check("course: stepped block reminded in its week", remind(W2, 590, { blocks: [cBlock()] }), [`block|cb|${W2}|10`]);
  check("course: stepped block not reminded after a stop course ends",
    [remind("2026-03-24", 590, { blocks: [cBlock({ step: "s1" })] }), remind(AFTER, 590, { blocks: [cBlock({ step: "s1" })] })],
    [[`block|cb|2026-03-24|10`], []]);
  check("course: across midnight, tomorrow's first stepped occurrence is reminded",
    remind(W1, 1435, { blocks: [cBlock({ start: 0, end: 60 })] }), [`block|cb|${W2}|10`]);
  check("course: no schedule keeps phase 1 behaviour (from block.date)",
    keys(dueReminders({ now: { date: W1, minutes: 590 }, blocks: [cBlock()], tasks: [], completionIndex: indexCompletions([]), userDefault: [10] })),
    [`block|cb|${W1}|10`]);

  const habit = { id: "w2", title: "Gym", daily: true, step: "k2", date: "", created: "2026-01-01 10:00:00Z", remindAt: "08:00", points: 5 };
  check("course: stepped habit not reminded before its week", remind(W1, 480, { tasks: [habit] }), []);
  check("course: stepped habit reminded in its week", remind(W2, 480, { tasks: [habit] }), [`task|w2|${W2}|at`]);
  check("course: stop course habit not reminded after the end", remind(AFTER, 480, { tasks: [{ ...habit, step: "s1" }] }), []);
  check("course: unstepped habit's recurUntil ends reminders",
    [remind("2026-03-31", 480, { tasks: [{ ...habit, step: "", recurUntil: "2026-03-31" }] }), remind("2026-04-01", 480, { tasks: [{ ...habit, step: "", recurUntil: "2026-03-31" }] })],
    [[`task|w2|2026-03-31|at`], []]);

  // Daily messages: a day whose only task is a Week 2 habit gets no nudge or day-end push in Week 1.
  const user = { nudgeTimes: [720], dayEndAt: "21:00", dayEndPush: true };
  const daily = (date, minutes, tasks = [habit], completions = []) =>
    keys(dueDailyMessages({ now: { date, minutes }, user, data: { tasks, blocks: [], completionIndex: indexCompletions(completions), schedule: sched } }));
  check("course: week 2 habit gives no nudge in week 1", daily(W1, 720), []);
  check("course: week 2 habit gives no day-end push in week 1", daily(W1, 1260), []);
  check("course: week 2 habit nudges in week 2", daily(W2, 720), [`nudge|${W2}|720`]);
  check("course: week 2 habit day-end push in week 2", daily(W2, 1260), [`dayend|${W2}`]);
  const one = { id: "one", title: "Taxes", daily: false, block: "", date: "", points: 5 };
  check("course: out-of-window habit doesn't block nudge-done",
    daily(W1, 720, [habit, one], [{ task: "one", date: W1, points: 5 }]), [`nudge-done|${W1}`]);
  check("course: stepped block task outside its window isn't counted",
    keys(dueDailyMessages({ now: { date: W1, minutes: 720 }, user,
      data: { tasks: [{ id: "bt", title: "Lift", block: "cb" }], blocks: [cBlock()], completionIndex: indexCompletions([]), schedule: sched } })),
    []);
  check("course: stop course habit gives no nudge after the end", daily(AFTER, 720, [{ ...habit, step: "s1" }]), []);
}

console.log(failures ? `\n${failures} check(s) failed` : "\nAll reminder checks passed");
process.exit(failures ? 1 : 0);
