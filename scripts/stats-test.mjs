// Unit tests for scheduling and summaries in src/lib/stats.js. Run: npm run test:stats
import { readFileSync } from "node:fs";
import { AFFIRMATIONS, STRIDE, affirmationFor } from "../src/lib/affirmations.js";
import { CELEBRATIONS, QUIET_LINES, TOMORROW_LINES, closingLine, scoreHeadline } from "../src/lib/messages.js";
import { DEFAULT_DAY_END, dayEndMinutes } from "../src/lib/reminders.js";
import { addDays, addMonths, monthDates, monthOf } from "../src/lib/time.js";
import { ENERGY_LEVELS, EFFORT_LEVELS, suggestForEnergy, blockOccursOn, blocksForDate, dayScore, habitStreak, indexCompletions, instancesForDate, summarize, topThree, upcomingBlocks, weekStats } from "../src/lib/stats.js";
import { scheduleIndex, courseEndDate, stepStartDate, activeWindow, courseStats, courseDeleteImpact, monthStats, targetProgress } from "../src/lib/stats.js";

let failures = 0;
let count = 0;
function check(label, actual, expected) {
  count++;
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${label}${ok ? "" : `\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`}`);
}

// Calendar: 2026-10-26 Mon, 27 Tue, 28 Wed, 29 Thu, 30 Fri, 31 Sat, 11-01 Sun, 11-02 Mon
const WED = "2026-10-28";
const block = (over = {}) => ({ id: "b1", title: "Gym", date: WED, start: 600, end: 660, recurrence: "none", recurUntil: "", ...over });
const occurs = (b, dates) => dates.map((d) => blockOccursOn(b, d));

// blockOccursOn: none
check("none: only its own date", occurs(block(), ["2026-10-27", WED, "2026-10-29"]), [false, true, false]);
check("missing recurrence behaves as none", occurs(block({ recurrence: undefined }), [WED, "2026-10-29"]), [true, false]);

// daily
check("daily: never before start", blockOccursOn(block({ recurrence: "daily" }), "2026-10-27"), false);
check("daily: start, next days, weekend", occurs(block({ recurrence: "daily" }), [WED, "2026-10-29", "2026-10-31", "2026-11-01"]), [true, true, true, true]);
check("daily: recurUntil inclusive", occurs(block({ recurrence: "daily", recurUntil: "2026-10-30" }), ["2026-10-30", "2026-10-31"]), [true, false]);

// weekdays
const wd = block({ recurrence: "weekdays" });
check("weekdays: Wed..Fri yes, Sat/Sun no, Mon yes", occurs(wd, [WED, "2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]), [true, true, false, false, true]);
check("weekdays: starting on a Saturday still skips the weekend", occurs(block({ recurrence: "weekdays", date: "2026-10-31" }), ["2026-10-31", "2026-11-01", "2026-11-02"]), [false, false, true]);
check("weekdays: recurUntil", occurs(block({ recurrence: "weekdays", recurUntil: "2026-10-29" }), ["2026-10-29", "2026-10-30"]), [true, false]);

// weekly
const wk = block({ recurrence: "weekly" });
check("weekly: same weekday only", occurs(wk, [WED, "2026-10-29", "2026-11-04", "2026-11-11", "2026-11-10"]), [true, false, true, true, false]);
check("weekly: not before start", blockOccursOn(wk, "2026-10-21"), false);
check("weekly: recurUntil cuts later weeks", occurs(block({ recurrence: "weekly", recurUntil: "2026-11-05" }), ["2026-11-04", "2026-11-11"]), [true, false]);
check("weekly: recurUntil on the day itself", blockOccursOn(block({ recurrence: "weekly", recurUntil: "2026-11-04" }), "2026-11-04"), true);

// blocksForDate
check("blocksForDate: filtered and sorted by start",
  blocksForDate([block({ id: "late", start: 900 }), block({ id: "other", date: "2026-10-29" }), block({ id: "early", start: 480 })], WED).map((b) => b.id),
  ["early", "late"]);

// instancesForDate
const TODAY = "2026-10-28";
const mk = ({ tasks = [], blocks = [], completions = [] }) => ({ tasks, blocks, completionIndex: indexCompletions(completions) });
const ids = (list) => list.map((i) => i.task.id);
const comp = (task, date, points = 5) => ({ id: `c-${task}-${date}`, task, date, points });

// block tasks
{
  const data = mk({ blocks: [block({ recurrence: "daily" })], tasks: [{ id: "t1", block: "b1", points: 5 }] });
  check("block task: follows its block", ids(instancesForDate(data, "2026-10-30", TODAY)), ["t1"]);
  check("block task: absent before block starts", ids(instancesForDate(data, "2026-10-27", TODAY)), []);
  const none = mk({ blocks: [block()], tasks: [{ id: "t1", block: "b1" }] });
  check("block task: absent on non-occurring day", ids(instancesForDate(none, "2026-10-29", TODAY)), []);
  check("block task: missing block is skipped", ids(instancesForDate(mk({ tasks: [{ id: "t1", block: "gone" }] }), TODAY, TODAY)), []);
  const done = mk({ blocks: [block({ recurrence: "daily" })], tasks: [{ id: "t1", block: "b1" }], completions: [comp("t1", "2026-10-29")] });
  check("block task: done is per date", [instancesForDate(done, "2026-10-28", TODAY)[0].done, instancesForDate(done, "2026-10-29", TODAY)[0].done], [false, true]);
}

// daily habits
{
  const task = { id: "d1", daily: true, date: "2026-10-27", points: 3 };
  const data = mk({ tasks: [task], completions: [comp("d1", "2026-10-28", 3)] });
  check("daily: not before its start date", ids(instancesForDate(data, "2026-10-26", TODAY)), []);
  check("daily: every day from start (past and future)", [ids(instancesForDate(data, "2026-10-27", TODAY)), ids(instancesForDate(data, "2026-11-20", TODAY))], [["d1"], ["d1"]]);
  check("daily: done only on completed date", [instancesForDate(data, "2026-10-28", TODAY)[0].done, instancesForDate(data, "2026-10-29", TODAY)[0].done], [true, false]);
  const created = mk({ tasks: [{ id: "d2", daily: true, created: "2026-10-27 08:00:00.000Z" }] });
  check("daily: falls back to created date", [ids(instancesForDate(created, "2026-10-26", TODAY)), ids(instancesForDate(created, "2026-10-27", TODAY))], [[], ["d2"]]);
}

// one-off tasks
{
  const dated = mk({ tasks: [{ id: "o1", date: "2026-10-30" }] });
  check("one-off dated: on its date", ids(instancesForDate(dated, "2026-10-30", TODAY)), ["o1"]);
  check("one-off dated: not on other future days", ids(instancesForDate(dated, "2026-10-29", TODAY)), []);
  check("one-off dated: not on today before it is due", ids(instancesForDate(dated, TODAY, TODAY)), []);
  const overdue = mk({ tasks: [{ id: "o2", date: "2026-10-25" }] });
  check("one-off overdue: on its date and rolls onto today", [ids(instancesForDate(overdue, "2026-10-25", TODAY)), ids(instancesForDate(overdue, TODAY, TODAY)), ids(instancesForDate(overdue, "2026-10-26", TODAY))], [["o2"], ["o2"], []]);
  const undated = mk({ tasks: [{ id: "o3" }] });
  check("one-off undated: shows on today only", [ids(instancesForDate(undated, TODAY, TODAY)), ids(instancesForDate(undated, "2026-10-29", TODAY))], [["o3"], []]);
  const doneUndated = mk({ tasks: [{ id: "o3" }], completions: [comp("o3", "2026-10-26")] });
  check("one-off completed: moves to completion day, done", [ids(instancesForDate(doneUndated, "2026-10-26", TODAY)), instancesForDate(doneUndated, "2026-10-26", TODAY)[0]?.done, ids(instancesForDate(doneUndated, TODAY, TODAY))], [["o3"], true, []]);
  const doneDated = mk({ tasks: [{ id: "o1", date: "2026-10-30" }], completions: [comp("o1", TODAY)] });
  check("one-off dated completed early: shown on completion day, not due date", [ids(instancesForDate(doneDated, TODAY, TODAY)), ids(instancesForDate(doneDated, "2026-10-30", TODAY))], [["o1"], []]);
}

// toggleTask rule (mirrors src/lib/DataContext.jsx): a completion matches if same task and
// (same date OR the task is a one-off). Block/daily tasks match by date only.
const findExisting = (completions, task, date) => completions.find((c) => c.task === task.id && (c.date === date || (!task.block && !task.daily)));
check("toggle: one-off matches a completion on any date", findExisting([comp("o1", "2026-10-26")], { id: "o1" }, "2026-10-28")?.date, "2026-10-26");
check("toggle: daily needs the same date", findExisting([comp("d1", "2026-10-26")], { id: "d1", daily: true }, "2026-10-28"), undefined);
check("toggle: block task needs the same date", findExisting([comp("t1", "2026-10-26")], { id: "t1", block: "b1" }, "2026-10-28"), undefined);
check("toggle: block task same date matches", findExisting([comp("t1", "2026-10-28")], { id: "t1", block: "b1" }, "2026-10-28")?.id, "c-t1-2026-10-28");

// summarize
{
  const cats = { c1: { id: "c1" } };
  const inst = [
    { task: { points: 10, category: "c1" }, done: true, completion: { points: 4 } },
    { task: { points: 5, category: "c1" }, done: true, completion: undefined },
    { task: { points: 3, category: "gone" }, done: true, completion: { points: 3 } },
    { task: { points: 7 }, done: false },
  ];
  const s = summarize(inst, cats);
  check("summarize: totals and percent", [s.total, s.done, s.percent], [4, 3, 75]);
  check("summarize: points use completion snapshot, fall back to task points", s.points, 12);
  check("summarize: possible points use the snapshot for done tasks, task points otherwise", s.possiblePoints, 19);
  check("summarize: by category, unknown category -> none", s.pointsByCategory, { c1: 9, none: 3 });
  check("summarize: empty list", summarize([], {}), { total: 0, done: 0, percent: 0, points: 0, possiblePoints: 0, pointsByCategory: {} });
  check("summarize: percent rounds", summarize([{ task: {}, done: true }, { task: {}, done: false }, { task: {}, done: false }], {}).percent, 33);
  check("summarize: missing categoriesById is ok", summarize([{ task: { category: "c1", points: 2 }, done: true }]).pointsByCategory, { none: 2 });
}

// weekStats
{
  const data = {
    ...mk({
      blocks: [block({ recurrence: "weekdays", date: "2026-10-26" })],
      tasks: [{ id: "t1", block: "b1", points: 2 }, { id: "d1", daily: true, date: "2026-10-26", points: 1 }],
      completions: [comp("t1", "2026-10-26", 2), comp("d1", "2026-10-27", 1)],
    }),
    categoriesById: {},
  };
  const w = weekStats(data, "2026-10-26", TODAY);
  check("weekStats: range and 7 days", [w.weekStart, w.weekEnd, w.byDay.length], ["2026-10-26", "2026-11-01", 7]);
  check("weekStats: totals (5 block + 7 daily instances)", [w.total, w.done, w.points, w.possiblePoints], [12, 2, 3, 17]);
  check("weekStats: weekend only has the daily habit", [w.byDay[5].total, w.byDay[6].total], [1, 1]);
}

// upcomingBlocks (today = WED, default 180-minute window)
{
  const brief = (list) => list.map((u) => [u.block.id, u.date, u.start, u.end, u.live]);
  const THU = "2026-10-29";

  const late = block({ id: "early", date: THU, start: 15, end: 60 });
  check("upcoming: 12:15 AM block tomorrow appears at 11:30 PM (+1440)",
    brief(upcomingBlocks([late], WED, 1410)), [["early", THU, 1455, 1500, false]]);
  check("upcoming: same block hidden when window doesn't reach it",
    brief(upcomingBlocks([late], WED, 1200)), []);

  check("upcoming: start exactly at now + window is excluded",
    brief(upcomingBlocks([block({ start: 780, end: 840 })], WED, 600)), []);
  check("upcoming: start 15 min before window edge is included",
    brief(upcomingBlocks([block({ start: 765, end: 840 })], WED, 600)), [["b1", WED, 765, 840, false]]);
  check("upcoming: window edge across midnight (start == now + window excluded)",
    brief(upcomingBlocks([block({ id: "x", date: THU, start: 150, end: 180 })], WED, 1410)), []);
  check("upcoming: custom windowMinutes",
    brief(upcomingBlocks([block({ start: 780, end: 840 })], WED, 600, undefined, 240)), [["b1", WED, 780, 840, false]]);

  check("upcoming: live block flagged (started, not ended)",
    brief(upcomingBlocks([block({ start: 600, end: 660 })], WED, 630)), [["b1", WED, 600, 660, true]]);
  check("upcoming: block starting right now is live",
    upcomingBlocks([block({ start: 600, end: 660 })], WED, 600)[0]?.live, true);
  check("upcoming: block that already ended is excluded",
    brief(upcomingBlocks([block({ start: 540, end: 600 })], WED, 600)), []);

  const daily = block({ id: "d", date: "2026-10-20", recurrence: "daily", start: 1380, end: 1425 });
  const dawn = block({ id: "w", date: "2026-10-20", recurrence: "weekdays", start: 30, end: 60 });
  check("upcoming: recurring blocks use the occurrence date, not block.date",
    brief(upcomingBlocks([dawn, daily], WED, 1370)), [["d", WED, 1380, 1425, false], ["w", THU, 1470, 1500, false]]);
  check("upcoming: weekdays block skipped on Saturday morning",
    brief(upcomingBlocks([dawn], "2026-10-30", 1410)), []);
  check("upcoming: recurUntil today excludes tomorrow's occurrence",
    brief(upcomingBlocks([block({ id: "d", date: "2026-10-20", recurrence: "daily", recurUntil: WED, start: 1425, end: 1440 }),
      block({ id: "e", date: "2026-10-20", recurrence: "daily", recurUntil: WED, start: 30, end: 60 })], WED, 1410)),
    [["d", WED, 1425, 1440, false]]);
  check("upcoming: sorted today then tomorrow",
    upcomingBlocks([block({ id: "t", date: THU, start: 0, end: 30 }), block({ id: "a", start: 1395, end: 1410 }), block({ id: "b", start: 1380, end: 1440 })], WED, 1370).map((u) => u.block.id),
    ["b", "a", "t"]);
}

// topThree
{
  const inst = (id, points, priority) => ({ task: { id, points, priority }, done: false });
  const tid = (list) => list.map((i) => i.task.id);
  check("topThree: starred only, max 3", tid(topThree([inst("a", 9), inst("s1", 1, true), inst("s2", 1, true), inst("s3", 1, true), inst("s4", 1, true)])), ["s1", "s2", "s3"]);
  check("topThree: starred fewer than 3 are not padded", tid(topThree([inst("a", 9), inst("s1", 1, true)])), ["s1"]);
  check("topThree: no stars -> top 3 by points", tid(topThree([inst("a", 2), inst("b", 8), inst("c", 5), inst("d", 9)])), ["d", "b", "c"]);
  check("topThree: fewer than 3 items", tid(topThree([inst("a", 1), inst("b", 4)])), ["b", "a"]);
  check("topThree: empty input", topThree([]), []);
  check("topThree: missing points count as 0", tid(topThree([inst("a", undefined), inst("b", 1), inst("c", undefined), inst("d", 2)])), ["d", "b", "a"]);
  const src = [inst("a", 1), inst("b", 2)];
  topThree(src);
  check("topThree: does not reorder its input", tid(src), ["a", "b"]);
}

{
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  const L = AFFIRMATIONS.length;
  const dayAfter = (i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
  const dates = Array.from({ length: L + 1 }, (_, i) => dayAfter(i));
  check("affirmations: about 250 entries", L >= 240 && L <= 270, true);
  check("affirmationFor: 2026-11-11 is pinned", affirmationFor("2026-11-11"), "A new day, a new chance, and a calm place to begin.");
  for (const bad of ["bogus", "", "2026-13-45", "2026-11-11T00:00", "2026-02-31", undefined]) {
    const got = affirmationFor(bad);
    check(`affirmationFor: malformed ${JSON.stringify(bad)} falls back to a listed non-empty string`, typeof got === "string" && got.length > 0 && AFFIRMATIONS.includes(got), true);
  }
  check("affirmationFor: consecutive dates differ", dates.slice(1).every((d, i) => affirmationFor(d) !== affirmationFor(dates[i])), true);
  check("affirmationFor: no repeats across length consecutive dates", new Set(dates.slice(0, L).map(affirmationFor)).size, L);
  check("affirmationFor: works for dates before 1970", AFFIRMATIONS.includes(affirmationFor("1960-03-05")), true);
  check("affirmations: no duplicate entries", new Set(AFFIRMATIONS.map((a) => a.trim().toLowerCase())).size, L);
  check("affirmations: every entry non-empty and at most 120 chars", AFFIRMATIONS.every((a) => a.trim().length > 0 && a.length <= 120), true);
  check("affirmations: STRIDE coprime with length", gcd(STRIDE, L), 1);
  const asrc = readFileSync(new URL("../src/lib/affirmations.js", import.meta.url), "utf8");
  check("affirmations.js: no Date.now or Math.random", /Date\.now|Math\.random/.test(asrc.replace(/\/\/.*$/gm, "")), false);
}

// habitStreak (today = WED 2026-10-28)
{
  const run = (data, task, date = TODAY, today = TODAY) => habitStreak(data, task, date, today);
  const dates = (from, n) => Array.from({ length: n }, (_, i) => addDays(from, i));
  const habit = { id: "d1", daily: true, date: "2026-10-20", points: 1 };
  const cs = (id, list) => list.map((d) => comp(id, d));

  const wdBlock = block({ recurrence: "weekdays", date: "2026-10-19" });
  const bt = { id: "t1", block: "b1" };
  // Thu 29, Fri 30 and Mon 11-02 done; the weekend between them is skipped
  const wkend = mk({ blocks: [wdBlock], tasks: [bt], completions: cs("t1", ["2026-10-29", "2026-10-30", "2026-11-02"]) });
  check("streak: weekdays block over a weekend does not break", run(wkend, bt, "2026-11-02", "2026-11-02"), 3);
  check("streak: counting from the Sunday still sees Thu and Fri", run(wkend, bt, "2026-11-01", "2026-11-02"), 2);

  const undoneToday = mk({ tasks: [habit], completions: cs("d1", ["2026-10-26", "2026-10-27"]) });
  check("streak: undone today does not break it yet", run(undoneToday, habit), 2);
  check("streak: done today adds one", run(mk({ tasks: [habit], completions: cs("d1", ["2026-10-26", "2026-10-27", TODAY]) }), habit), 3);

  check("streak: missed yesterday (and today undone) = 0", run(mk({ tasks: [habit], completions: cs("d1", ["2026-10-25", "2026-10-26"]) }), habit), 0);
  check("streak: missed yesterday but done today = 1", run(mk({ tasks: [habit], completions: cs("d1", ["2026-10-25", "2026-10-26", TODAY]) }), habit), 1);

  const fresh = { id: "d2", daily: true, created: "2026-10-28 09:00:00.000Z" };
  check("streak: habit created today, undone = 0", run(mk({ tasks: [fresh] }), fresh), 0);
  check("streak: habit created today, done = 1 (does not look before its start)", run(mk({ tasks: [fresh], completions: [comp("d2", TODAY)] }), fresh), 1);

  const old = { id: "d3", daily: true, date: "2024-01-01" };
  const all = mk({ tasks: [old], completions: cs("d3", dates("2025-06-01", 500)) });
  check("streak: capped at 400 days", run(all, old, "2026-10-13", "2026-10-28"), 400);

  const once = block({ id: "bo", recurrence: "none", date: "2026-10-26" });
  const ot = { id: "ot", block: "bo" };
  const onceData = mk({ blocks: [once], tasks: [ot], completions: cs("ot", ["2026-10-26"]) });
  check("streak: task on a one-time block returns 0", [run(onceData, ot, "2026-10-26"), run(mk({ blocks: [block({ recurrence: undefined })], tasks: [bt], completions: [comp("t1", WED)] }), bt)], [0, 0]);
  const onceScore = dayScore({ ...mk({ blocks: [once], tasks: [ot] }), categoriesById: {} }, "2026-10-26", TODAY);
  check("dayScore: one-time block task is left out of streaks (and not broken)", [onceScore.total, onceScore.streaks], [1, []]);
  const monthly = block({ id: "bm", recurrence: "monthly", date: "2026-10-26" });
  const mt = { id: "mt", block: "bm" };
  const monthlyData = { ...mk({ blocks: [monthly], tasks: [mt], completions: cs("mt", ["2026-10-26"]) }), categoriesById: {} };
  check("streak: unknown recurrence (monthly) returns 0 and is left out of dayScore streaks", [run(monthlyData, mt, "2026-10-26"), dayScore(monthlyData, "2026-10-26", TODAY).streaks], [0, []]);
  const ended = block({ recurrence: "daily", date: "2026-10-01", recurUntil: "2026-10-20" });
  const et = { id: "et", block: "b1" };
  const endedData = mk({ blocks: [ended], tasks: [et], completions: cs("et", dates("2026-10-18", 3)) });
  check("streak: ended block counts up to recurUntil, then 0 afterwards", [run(endedData, et, "2026-10-20"), run(endedData, et, "2026-10-21"), run(endedData, et, TODAY)], [3, 0, 0]);
  const wkly = block({ recurrence: "weekly", date: "2026-10-07" });
  const wt = { id: "wt", block: "b1" };
  check("streak: weekly block counts its weekday only", run(mk({ blocks: [wkly], tasks: [wt], completions: cs("wt", ["2026-10-14", "2026-10-21", WED]) }), wt), 3);
  check("streak: one-off returns 0", run(mk({ tasks: [{ id: "o" }], completions: [comp("o", TODAY)] }), { id: "o" }), 0);
  check("streak: task on a missing block returns 0", run(mk({}), { id: "x", block: "gone" }), 0);
}

// dayScore
{
  const cats = { c1: { id: "c1" }, c2: { id: "c2" } };
  const tasks = [
    { id: "d1", daily: true, date: "2026-10-26", points: 2, category: "c1" },
    { id: "d2", daily: true, date: "2026-10-26", points: 5, category: "c2" },
    { id: "o1", points: 1 },
  ];
  const data = { ...mk({ tasks, completions: [comp("d1", "2026-10-27", 2), comp("d1", TODAY, 2), comp("d2", TODAY, 5)] }), categoriesById: cats };
  const s = dayScore(data, TODAY, TODAY);
  check("dayScore: totals", [s.date, s.total, s.done, s.percent, s.points, s.possiblePoints], [TODAY, 3, 2, 67, 7, 8]);
  check("dayScore: not complete, best category, energy null", [s.complete, s.bestCategory, s.energy], [false, "c2", null]);
  const withEnergy = { ...data, checkins: [{ id: "k1", date: "2026-10-27", energy: "high" }, { id: "k2", date: TODAY, energy: "low" }] };
  check("dayScore: energy comes from that date's check-in", [dayScore(withEnergy, TODAY, TODAY).energy, dayScore(withEnergy, "2026-10-27", TODAY).energy, dayScore(withEnergy, "2026-10-26", TODAY).energy], ["low", "high", null]);
  check("dayScore: streaks cover habits only, with counts", s.streaks.map((x) => [x.task.id, x.count, x.keptToday, x.broken]), [["d1", 2, true, false], ["d2", 1, true, false]]);
  check("dayScore: week average covers days up to today with tasks, not future days", s.weekAvgPercent, 39);
  check("dayScore: complete when all done", dayScore({ ...data, tasks: tasks.slice(0, 2) }, TODAY, TODAY).complete, true);
  const past = dayScore(data, "2026-10-27", TODAY);
  check("dayScore: past undone habit is broken", past.streaks.map((x) => [x.task.id, x.keptToday, x.broken]), [["d1", true, false], ["d2", false, true]]);
  const empty = dayScore({ ...mk({}), categoriesById: cats }, TODAY, TODAY);
  check("dayScore: empty day is not complete, no category", [empty.total, empty.complete, empty.bestCategory, empty.weekAvgPercent, empty.streaks], [0, false, null, 0, []]);
}

// past days use the snapshotted points, even when the task's points changed later
{
  const t = { id: "p1", daily: true, date: "2026-10-20", points: 10 };
  const data = { ...mk({ tasks: [t], completions: [comp("p1", "2026-10-27", 4)] }), categoriesById: {} };
  const past = dayScore(data, "2026-10-27", TODAY);
  check("dayScore: past day uses completions.points for points and possiblePoints", [past.points, past.possiblePoints], [4, 4]);
  check("dayScore: an undone day still counts the task's current points as possible", dayScore(data, "2026-10-26", TODAY).possiblePoints, 10);
}

// scoreHeadline and closingLine
{
  const sum = (total, done, points = 0) => ({ total, done, percent: 0, points, possiblePoints: 0, pointsByCategory: {} });
  check("scoreHeadline: partial", scoreHeadline(sum(5, 3, 12)), "3 of 5 done · 12 points");
  check("scoreHeadline: all done", scoreHeadline(sum(5, 5, 20)), "All 5 done · 20 points");
  check("scoreHeadline: singular point", scoreHeadline(sum(2, 1, 1)), "1 of 2 done · 1 point");
  check("scoreHeadline: nothing scheduled", scoreHeadline(sum(0, 0)), "Nothing scheduled today");
  check("scoreHeadline: missing summary is safe", scoreHeadline(undefined), "Nothing scheduled today");

  check("closingLine: complete -> celebration", CELEBRATIONS.includes(closingLine(sum(3, 3), "2026-11-11")), true);
  check("closingLine: incomplete -> tomorrow line", TOMORROW_LINES.includes(closingLine(sum(3, 1), "2026-11-11")), true);
  check("closingLine: none done -> tomorrow line", TOMORROW_LINES.includes(closingLine(sum(3, 0), "2026-11-11")), true);
  check("closingLine: empty day -> quiet line", QUIET_LINES.includes(closingLine(sum(0, 0), "2026-11-11")), true);
  check("closingLine: same date same text", closingLine(sum(3, 3), "2026-11-11"), closingLine(sum(3, 3), "2026-11-11"));
  const days20 = (done) => Array.from({ length: 20 }, (_, i) => closingLine(sum(3, done), addDays("2026-11-01", i)));
  check("closingLine: 20 consecutive dates cover every celebration", new Set(days20(3)).size, CELEBRATIONS.length);
  check("closingLine: 20 consecutive dates cover every tomorrow line", new Set(days20(1)).size, TOMORROW_LINES.length);
  check("closingLine: malformed date falls back", closingLine(sum(3, 3), "bogus"), CELEBRATIONS[0]);
  check("messages: 20 each, unique, short",
    [CELEBRATIONS.length, TOMORROW_LINES.length, new Set(CELEBRATIONS).size, new Set(TOMORROW_LINES).size, [...CELEBRATIONS, ...TOMORROW_LINES].every((l) => l.length <= 80)],
    [20, 20, 20, 20, true]);
  const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const libs = ["messages", "stats", "reminders"].map((n) => strip(readFileSync(new URL(`../src/lib/${n}.js`, import.meta.url), "utf8")));
  check("lib files: no browser globals", libs.map((t) => /\b(window|document|localStorage)\b|import\.meta/.test(t)), [false, false, false]);
}

// suggestForEnergy (today = WED, now = 10:00)
{
  const inst = (id, over = {}, done = false) => ({ task: { id, title: id, points: 20, ...over }, date: WED, done });
  const CTX = { blocks: [], today: WED, nowMinutes: 600 };
  const sug = (list, energy, ctx = CTX, limit) => suggestForEnergy(list, energy, limit, ctx).map((i) => i.task.id);
  check("energy/effort levels match the selects", [ENERGY_LEVELS, EFFORT_LEVELS], [["high", "normal", "low"], ["light", "medium", "heavy"]]);

  const mix = [inst("h", { effort: "heavy", points: 30 }), inst("m", { effort: "medium", points: 30 }), inst("l", { effort: "light", points: 5 })];
  check("low: light, then medium, heavy excluded", sug(mix, "low"), ["l", "m"]);
  check("low: priority wins ties within a level", sug([inst("a", { effort: "light" }), inst("b", { effort: "light", priority: true })], "low"), ["b", "a"]);
  check("normal: priority first, even heavy", sug([...mix, inst("p", { effort: "heavy", priority: true })], "normal"), ["p", "m", "l"]);
  check("normal: medium and light before heavy, then points", sug(mix, "normal", CTX, 5), ["m", "l", "h"]);
  check("high: heavy first, then most points", sug([inst("m", { effort: "medium", points: 40 }), inst("h", { effort: "heavy", points: 20 }), inst("x", { effort: "light", points: 8 })], "high"), ["h", "m", "x"]);
  check("high: includes overdue one-offs", sug([inst("od", { date: "2026-10-01", points: 15 })], "high"), ["od"]);

  const light = inst("t", { points: 10 });
  check("untagged 10 -> light (ahead of a medium on low)", sug([inst("z", { effort: "medium" }), light], "low"), ["t", "z"]);
  check("untagged 11 -> medium (ties with tagged medium, so title order)", sug([inst("t", { points: 11 }), inst("a", { effort: "medium", points: 11 })], "low"), ["a", "t"]);
  check("untagged 49 -> medium (kept on low)", sug([inst("t", { points: 49 })], "low"), ["t"]);
  check("untagged 50 -> heavy (excluded on low)", sug([inst("t", { points: 50 })], "low"), []);
  check("untagged 50 -> heavy (first on high)", sug([inst("z", { effort: "medium", points: 60 }), inst("t", { points: 50 })], "high"), ["t", "z"]);
  check("tag overrides points", sug([inst("t", { effort: "light", points: 90 })], "low"), ["t"]);

  check("done tasks excluded", sug([inst("d", {}, true), inst("o")], "normal"), ["o"]);
  const gym = block({ id: "g", start: 900, end: 960 });
  const past = block({ id: "p", start: 480, end: 540 });
  const live = block({ id: "v", start: 570, end: 660 });
  const blockData = [inst("tg", { block: "g" }), inst("tp", { block: "p" }), inst("tv", { block: "v" })];
  check("ended block excluded; live and upcoming included", sug(blockData, "normal", { blocks: [gym, past, live], today: WED, nowMinutes: 600 }).sort(), ["tg", "tv"]);
  check("block later today (beyond 3h) still included", sug([inst("tg", { block: "g" })], "normal", { blocks: [block({ id: "g", start: 1200, end: 1260 })], today: WED, nowMinutes: 600 }), ["tg"]);
  check("tomorrow's occurrence does not count", sug([inst("tg", { block: "g" })], "normal", { blocks: [block({ id: "g", date: "2026-10-29", start: 60, end: 90 })], today: WED, nowMinutes: 1400 }), []);
  check("block task skipped without ctx", suggestForEnergy([inst("tg", { block: "g" })], "normal"), []);
  check("block task skipped when its block is missing", sug([inst("tg", { block: "nope" })], "normal"), []);

  const many = ["a", "b", "c", "d", "e"].map((id) => inst(id));
  check("at most 3 results by default", sug(many, "normal").length, 3);
  check("custom limit", sug(many, "normal", CTX, 2).length, 2);
  check("empty input", sug([], "high"), []);
  check("unknown energy -> []", [sug(many, "tired"), sug(many, undefined)], [[], []]);
  check("final tiebreak: points, then title, then id", sug([inst("b", { title: "x" }), inst("a", { title: "x" }), inst("c", { title: "w" }), inst("d", { title: "x", points: 25 })], "normal", CTX, 4), ["d", "c", "a", "b"]);
}

// dayEndMinutes
{
  check("dayEndMinutes: default is 21:00", [DEFAULT_DAY_END, dayEndMinutes({})], ["21:00", 1260]);
  check("dayEndMinutes: valid value", dayEndMinutes({ dayEndAt: "20:30" }), 1230);
  check("dayEndMinutes: edge values", [dayEndMinutes({ dayEndAt: "12:00" }), dayEndMinutes({ dayEndAt: "23:59" })], [720, 1439]);
  check("dayEndMinutes: before noon -> default (M-1)", [dayEndMinutes({ dayEndAt: "00:00" }), dayEndMinutes({ dayEndAt: "00:30" }), dayEndMinutes({ dayEndAt: "11:59" })], [1260, 1260, 1260]);
  check("dayEndMinutes: empty -> default", dayEndMinutes({ dayEndAt: "" }), 1260);
  for (const bad of ["25:00", "9:00", "20:60", "abc", null, 5]) check(`dayEndMinutes: invalid ${JSON.stringify(bad)} -> default`, dayEndMinutes({ dayEndAt: bad }), 1260);
  check("dayEndMinutes: no user -> default", [dayEndMinutes(undefined), dayEndMinutes(null)], [1260, 1260]);
}

// --- Course windows (F-15). 2026-03-04 is a Wednesday; 2026-01-05 is a Monday. ---
{
  const keep = { id: "k", startDate: "2026-03-04", onEnd: "keep" };
  const stop = { id: "s", startDate: "2026-03-04", onEnd: "stop" };
  const solo = { id: "o", startDate: "2026-03-04", onEnd: "stop" };
  const empty = { id: "e", startDate: "2026-03-04", onEnd: "stop" };
  const steps = [
    { id: "k1", course: "k", week: 1 }, { id: "k2", course: "k", week: 2 }, { id: "k3", course: "k", week: 3 },
    { id: "s1", course: "s", week: 1 }, { id: "s3", course: "s", week: 3 },
    { id: "o1", course: "o", week: 1 }, { id: "o2", course: "o", week: 2 },
  ];
  const sched = scheduleIndex([keep, stop, solo, empty], steps);
  const habit = (id, step, over = {}) => ({ id, title: id, daily: true, step, date: "", recurUntil: "", created: "2026-01-01 10:00:00.000Z", points: 5, ...over });
  const sblock = (id, step, recurrence, date, over = {}) => ({ id, title: id, date, start: 420, end: 480, recurrence, recurUntil: "", step, ...over });
  const first = (b, schedule, from = "2026-01-01") => {
    for (let d = from, i = 0; i < 400; i++, d = addDays(d, 1)) if (blockOccursOn(b, d, schedule)) return d;
    return null;
  };

  // scheduleIndex
  check("scheduleIndex: maps by id and max week per course",
    [sched.stepsById.size, sched.coursesById.size, sched.maxWeekByCourse.get("k"), sched.maxWeekByCourse.get("s"), sched.maxWeekByCourse.has("e")],
    [7, 4, 3, 3, false]);
  check("scheduleIndex: defaults to empty", [scheduleIndex().stepsById.size, scheduleIndex().coursesById.size], [0, 0]);

  // Parity with the B-7 api-test (pocketbase/pb_hooks/guards.js stepStart / courseEnd)
  check("parity: keep course week 1 and 2 habits start 2026-03-04 and 2026-03-11, no end",
    [activeWindow(habit("a", "k1"), sched), activeWindow(habit("b", "k2"), sched)],
    [{ start: "2026-03-04", end: null }, { start: "2026-03-11", end: null }]);
  check("parity: stop course (weeks 1 and 3) ends 2026-03-24; week 3 starts 2026-03-18",
    [courseEndDate(stop, sched), activeWindow(habit("a", "s1"), sched), activeWindow(habit("b", "s3"), sched)],
    ["2026-03-24", { start: "2026-03-04", end: "2026-03-24" }, { start: "2026-03-18", end: "2026-03-24" }]);
  check("parity: keep course with 3 weeks ends 2026-03-24", courseEndDate(keep, sched), "2026-03-24");
  check("parity: solo stop course (weeks 1 and 2) ends 2026-03-17", courseEndDate(solo, sched), "2026-03-17");
  check("parity: stepStartDate matches stepStart", [stepStartDate(keep, { week: 1 }), stepStartDate(keep, { week: 2 }), stepStartDate(stop, { week: 3 })],
    ["2026-03-04", "2026-03-11", "2026-03-18"]);
  check("parity: weekly stepped block keeps its Monday (first day 2026-03-16)", first(sblock("w", "k2", "weekly", "2026-01-05"), sched), "2026-03-16");
  check("parity: daily and weekday stepped blocks start on the step start (2026-03-11)",
    [first(sblock("d", "k2", "daily", "2026-01-01"), sched), first(sblock("wd", "k2", "weekdays", "2026-01-01"), sched)], ["2026-03-11", "2026-03-11"]);
  {
    const be = sblock("be", "s1", "weekly", "2026-01-05", { recurUntil: "2026-03-20" });
    const bl = sblock("bl", "s3", "daily", "2026-01-01", { recurUntil: "2026-06-01" });
    check("parity: stop blocks end at the earlier of recurUntil and the course end",
      [first(be, sched), activeWindow(be, sched).end, first(bl, sched), activeWindow(bl, sched).end],
      ["2026-03-09", "2026-03-20", "2026-03-18", "2026-03-24"]);
  }
  check("courseEndDate: no steps -> null", [courseEndDate(empty, sched), courseEndDate(keep, undefined)], [null, null]);

  // onEnd "" or missing means keep
  {
    const blank = { id: "x", startDate: "2026-03-04", onEnd: "" };
    const none = { id: "y", startDate: "2026-03-04" };
    const s2 = scheduleIndex([blank, none], [{ id: "x1", course: "x", week: 1 }, { id: "y1", course: "y", week: 1 }]);
    check("onEnd \"\" or missing: keep (no end), course end still derived",
      [activeWindow(habit("a", "x1"), s2), activeWindow(habit("b", "y1"), s2), courseEndDate(blank, s2)],
      [{ start: "2026-03-04", end: null }, { start: "2026-03-04", end: null }, "2026-03-10"]);
    const data = { tasks: [habit("a", "x1")], blocks: [], completionIndex: indexCompletions([]), schedule: s2 };
    check("onEnd \"\": courseStats reports keep, habit runs past the end",
      [courseStats(data, blank, "2026-03-20").onEnd, courseStats(data, none, "2026-03-20").onEnd, ids(instancesForDate(data, "2026-04-30", "2026-04-30"))],
      ["keep", "keep", ["a"]]);
  }

  // activeWindow without a step / without a schedule: phase 1 rule
  check("activeWindow: unstepped task uses date, else created, to recurUntil",
    [activeWindow({ date: "2026-02-01", created: "2026-01-01 1" }, sched), activeWindow({ date: "", created: "2026-01-01 10:00:00Z", recurUntil: "2026-03-31" })],
    [{ start: "2026-02-01", end: null }, { start: "2026-01-01", end: "2026-03-31" }]);
  check("activeWindow: unstepped block is block.date to recurUntil", activeWindow(sblock("b", "", "daily", "2026-02-02", { recurUntil: "2026-02-09" })),
    { start: "2026-02-02", end: "2026-02-09" });
  check("activeWindow: missing schedule or unknown step falls back to the phase 1 rule",
    [activeWindow(habit("a", "k2"), undefined), activeWindow(habit("a", "gone"), sched)],
    [{ start: "2026-01-01", end: null }, { start: "2026-01-01", end: null }]);

  // M-2a: a stepped task starts no earlier than the day it was created (blocks unchanged)
  {
    // Created 2026-03-15 01:00 UTC = the evening of 03-14 west of UTC, so it starts 03-14 (created - 1 day).
    const lateHabit = habit("late", "k2", { created: "2026-03-15 01:00:00.000Z" });
    const earlyHabit = habit("early", "k2", { created: "2026-02-01 09:00:00.000Z" });
    check("activeWindow: stepped habit created mid-week starts the day before its UTC created date; created earlier uses the step start",
      [activeWindow(lateHabit, sched), activeWindow(earlyHabit, sched), activeWindow(habit("nc", "k2", { created: undefined }), sched)],
      [{ start: "2026-03-14", end: null }, { start: "2026-03-11", end: null }, { start: "2026-03-11", end: null }]);
    check("activeWindow: created the day after the step start still uses the step start",
      activeWindow(habit("d1", "k2", { created: "2026-03-12 08:00:00.000Z" }), sched), { start: "2026-03-11", end: null });
    check("activeWindow: stepped block ignores created",
      activeWindow(sblock("sb", "k2", "daily", "2026-01-01", { created: "2026-03-14 09:00:00.000Z" }), sched),
      { start: "2026-03-11", end: null });
    const d = { tasks: [lateHabit], blocks: [], completionIndex: indexCompletions([]), schedule: sched };
    check("habit created 3 days into its week isn't missed on those 3 days",
      ["2026-03-11", "2026-03-12", "2026-03-13", "2026-03-14"].map((date) => ids(instancesForDate(d, date, "2026-03-17"))),
      [[], [], [], ["late"]]);
    check("courseStats: week 2 % only counts days since the habit was created",
      courseStats(d, keep, "2026-03-17").weeks.find((w) => w.week === 2).percent, 0);
    const d2 = { ...d, completionIndex: indexCompletions([14, 15, 16, 17].map((n) => ({ task: "late", date: `2026-03-${n}`, points: 5 }))) };
    check("courseStats: all days since creation done -> 100%", courseStats(d2, keep, "2026-03-17").weeks.find((w) => w.week === 2).percent, 100);
  }

  // instancesForDate with data.schedule
  const T = "2026-04-01";
  const dataOf = (tasks, blocks = [], completions = [], schedule = sched) => ({ tasks, blocks, completionIndex: indexCompletions(completions), schedule });
  {
    const d = dataOf([habit("w2", "k2")]);
    check("week 2 habit hidden in week 1, shown in week 2",
      [ids(instancesForDate(d, "2026-03-10", T)), ids(instancesForDate(d, "2026-03-11", T))], [[], ["w2"]]);
    check("keep course habit runs past the end", ids(instancesForDate(d, "2026-05-01", T)), ["w2"]);
    check("no schedule: phase 1 behaviour (from created)", ids(instancesForDate({ ...d, schedule: undefined }, "2026-03-10", T)), ["w2"]);
  }
  {
    const d = dataOf([habit("st", "s1")], [], [comp("st", "2026-03-20")]);
    check("stop course habit shown on its last day, hidden the day after",
      [ids(instancesForDate(d, "2026-03-24", "2026-03-24")), ids(instancesForDate(d, "2026-03-25", "2026-03-25"))], [["st"], []]);
    const past = instancesForDate(d, "2026-03-20", T);
    check("stop course habit still counted on past days after the end", [ids(past), past[0]?.done, summarize(past).points], [["st"], true, 5]);
  }
  {
    const wk = sblock("wk", "k2", "weekly", "2026-01-05");
    check("stepped weekly block: its weekday, from the step start",
      ["2026-01-05", "2026-03-09", "2026-03-11", "2026-03-16", "2026-03-17", "2026-03-23"].map((d) => blockOccursOn(wk, d, sched)),
      [false, false, false, true, false, true]);
    const wdb = sblock("wd", "k2", "weekdays", "2026-01-01");
    check("stepped weekdays block: from the step start, no weekends",
      ["2026-03-10", "2026-03-11", "2026-03-14", "2026-03-15", "2026-03-16"].map((d) => blockOccursOn(wdb, d, sched)),
      [false, true, false, false, true]);
    const db = sblock("db", "s3", "daily", "2026-01-01");
    check("stepped daily block in a stop course: step start to course end",
      ["2026-03-17", "2026-03-18", "2026-03-24", "2026-03-25"].map((d) => blockOccursOn(db, d, sched)), [false, true, true, false]);
    check("stepped block without a schedule: phase 1 (from its date)", blockOccursOn(db, "2026-03-01"), true);
    check("blocksForDate: passes schedule", [blocksForDate([wk, db], "2026-03-23", sched).map((b) => b.id), blocksForDate([wk, db], "2026-03-25", sched).map((b) => b.id)],
      [["wk", "db"], []]);
    const d = dataOf([{ id: "bt", block: "wk", points: 3 }], [wk]);
    check("task on a stepped block follows the block",
      [ids(instancesForDate(d, "2026-03-09", T)), ids(instancesForDate(d, "2026-03-16", T))], [[], ["bt"]]);
    const daily = sblock("dd", "k2", "daily", "2026-01-01");
    check("upcomingBlocks: stepped block hidden before its week, shown in it",
      [upcomingBlocks([daily], "2026-03-10", 360, sched).length, upcomingBlocks([daily], "2026-03-11", 360, sched).map((u) => u.date),
        upcomingBlocks([daily], "2026-03-10", 360).length],
      [0, ["2026-03-11"], 1]);
  }
  {
    const fewer = scheduleIndex([stop], [{ id: "s1", course: "s", week: 1 }, { id: "s2", course: "s", week: 2 }]);
    const d = dataOf([habit("st", "s1")], [], [], fewer);
    check("removing the last step moves the end earlier",
      [courseEndDate(stop, fewer), ids(instancesForDate(d, "2026-03-17", T)), ids(instancesForDate(d, "2026-03-18", T))],
      ["2026-03-17", ["st"], []]);
  }

  // habitStreak clipped by the window
  {
    const days = (from, n) => Array.from({ length: n }, (_, i) => addDays(from, i));
    const cs2 = (task, dates) => dates.map((d) => comp(task, d));
    const st = habit("st", "s1");
    const d = dataOf([st], [], cs2("st", days("2026-03-04", 21)));
    check("streak: stop habit counts to the course end, then 0",
      [habitStreak(d, st, "2026-03-24", "2026-03-24"), habitStreak(d, st, "2026-03-25", "2026-03-25")], [21, 0]);
    const w2 = habit("w2", "k2");
    const d2 = dataOf([w2], [], cs2("w2", ["2026-03-01", "2026-03-11", "2026-03-12"]));
    check("streak: does not look before a stepped habit's start", habitStreak(d2, w2, "2026-03-12", "2026-03-12"), 2);
    check("streak: without a schedule it uses phase 1 rules (created)", habitStreak({ ...d2, schedule: undefined }, w2, "2026-03-12", "2026-03-12"), 2);
    const wk = sblock("wk", "k2", "weekly", "2026-01-05");
    const bt = { id: "bt", block: "wk" };
    const d3 = dataOf([bt], [wk], cs2("bt", ["2026-03-09", "2026-03-16", "2026-03-23"]));
    check("streak: stepped weekly block counts its weekday from the step start", habitStreak(d3, bt, "2026-03-23", "2026-03-23"), 2);
    const db = sblock("db", "s3", "daily", "2026-01-01");
    const bt2 = { id: "bt2", block: "db" };
    const d4 = dataOf([bt2], [db], cs2("bt2", days("2026-03-18", 7)));
    check("streak: stepped block task ends with a stop course",
      [habitStreak(d4, bt2, "2026-03-24", "2026-03-24"), habitStreak(d4, bt2, "2026-03-26", "2026-03-26")], [7, 0]);
  }

  // courseDeleteImpact
  {
    const tasks = [habit("h1", "k1"), habit("h2", "k2"), { id: "bt1", block: "bw" }, { id: "bt2", block: "bd" }, habit("other", ""), { id: "bt3", block: "free" }, habit("sx", "s1")];
    const blocks = [sblock("bw", "k2", "weekly", "2026-01-05"), sblock("bd", "k3", "daily", "2026-01-01"), sblock("free", "", "daily", "2026-01-01")];
    const completions = [
      ...["2026-03-04", "2026-03-05", "2026-03-06"].map((d) => comp("h1", d)), comp("bt1", "2026-03-16"), comp("bt2", "2026-03-18"),
      comp("other", "2026-03-04"), comp("bt3", "2026-03-04"), comp("sx", "2026-03-04"),
    ];
    const d = dataOf(tasks, blocks, completions);
    check("courseDeleteImpact: habits, blocks, block tasks and all their completions",
      courseDeleteImpact(d, keep), { tasks: 2, blocks: 2, blockTasks: 2, completions: 5 });
    check("courseDeleteImpact: course with no steps -> zeros", courseDeleteImpact(d, empty), { tasks: 0, blocks: 0, blockTasks: 0, completions: 0 });
    check("courseDeleteImpact: changes nothing", [d.tasks.length, d.blocks.length, d.completionIndex.byKey.size], [7, 3, 8]);
  }

  // courseStats
  {
    const h1 = habit("h1", "k1");
    const h2 = habit("h2", "k2");
    const d = dataOf([h1, h2], [], [
      ...["2026-03-04", "2026-03-05", "2026-03-06", "2026-03-07", "2026-03-08", "2026-03-09", "2026-03-10"].map((x) => comp("h1", x)),
      comp("h1", "2026-03-11"), comp("h2", "2026-03-11"),
    ]);
    const cs = courseStats(d, keep, "2026-03-12");
    check("courseStats: current week, end, keep, not ended",
      [cs.currentWeek, cs.endDate, cs.onEnd, cs.ended], [2, "2026-03-24", "keep", false]);
    check("courseStats: per-week % (cumulative habits, days up to today; future week null)",
      cs.weeks.map((w) => [w.week, w.step.id, w.startDate, w.percent]),
      [[1, "k1", "2026-03-04", 100], [2, "k2", "2026-03-11", 50], [3, "k3", "2026-03-18", null]]);
    check("courseStats: before start week 0; after the end capped and ended",
      [courseStats(d, keep, "2026-03-01").currentWeek, courseStats(d, stop, "2026-04-10").currentWeek, courseStats(d, stop, "2026-04-10").ended, courseStats(d, stop, "2026-03-24").ended],
      [0, 3, true, false]);
  }
}

// --- Months (F-15) ---
{
  check("monthDates: lengths, first and last", [monthDates("2026-02").length, monthDates("2024-02").length, monthDates("2026-03")[0], monthDates("2026-03").at(-1), monthDates("2026-12").length],
    [28, 29, "2026-03-01", "2026-03-31", 31]);
  check("monthOf", [monthOf("2026-03-31"), monthOf("2026-11-01")], ["2026-03", "2026-11"]);
  check("addMonths: across years", [addMonths("2026-12", 1), addMonths("2026-01", -1), addMonths("2026-11", 0), addMonths("2026-03", 13)], ["2027-01", "2025-12", "2026-11", "2027-04"]);

  const tasks = [
    { id: "h", daily: true, date: "2026-02-01", points: 5, category: "fit" },
    { id: "r", daily: true, date: "2026-02-01", points: 3, category: "read" },
  ];
  const completions = [
    { task: "h", date: "2026-02-28", points: 5 }, { task: "h", date: "2026-03-01", points: 5 }, { task: "h", date: "2026-03-02", points: 7 },
    { task: "r", date: "2026-03-01", points: 3 }, { task: "h", date: "2026-04-01", points: 5 },
  ];
  const data = { tasks, blocks: [], completionIndex: indexCompletions(completions), categoriesById: { fit: {}, read: {} } };
  const ms = monthStats(data, "2026-03", "2026-03-31");
  check("monthStats: whole month, summary fields", [ms.month, ms.byDay.length, ms.total, ms.done, ms.points, ms.percent], ["2026-03", 31, 62, 3, 15, 5]);
  const plan = { month: "2026-03" };
  check("targetProgress: points in the month (snapshots)", targetProgress(data, { kind: "points", target: 30 }, plan, "2026-03-31"),
    { current: 15, target: 30, percent: 50, reached: false });
  check("targetProgress: points within a category", targetProgress(data, { kind: "points", target: 12, category: "fit" }, plan, "2026-03-31"),
    { current: 12, target: 12, percent: 100, reached: true });
  check("targetProgress: percent uses monthStats", targetProgress(data, { kind: "percent", target: 10 }, plan, "2026-03-31"),
    { current: 5, target: 10, percent: 50, reached: false });
  check("targetProgress: completions of one habit in the month", targetProgress(data, { kind: "completions", target: 1, task: "h" }, plan, "2026-03-31"),
    { current: 2, target: 1, percent: 100, reached: true });
  check("targetProgress: unknown kind counts 0", targetProgress(data, { kind: "streak", target: 5 }, plan, "2026-03-31"),
    { current: 0, target: 5, percent: 0, reached: false });
  {
    // A check-off outside the habit's window doesn't count, same as the Month card (m-2).
    const late = [{ id: "n", daily: true, date: "2026-03-10", points: 4, category: "fit" }];
    const lc = [{ task: "n", date: "2026-03-05", points: 4 }, { task: "n", date: "2026-03-12", points: 4 }];
    const ld = { tasks: late, blocks: [], completionIndex: indexCompletions(lc), categoriesById: { fit: {} } };
    check("targetProgress: points match monthStats (only completions inside the window)",
      [targetProgress(ld, { kind: "points", target: 8 }, plan, "2026-03-31").current, monthStats(ld, "2026-03", "2026-03-31").points,
        targetProgress(ld, { kind: "points", target: 8, category: "read" }, plan, "2026-03-31").current],
      [4, 4, 0]);
  }
}

console.log(`\n${count - failures}/${count} passed`);
process.exit(failures ? 1 : 0);
