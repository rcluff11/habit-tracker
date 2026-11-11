// Unit tests for scheduling and summaries in src/lib/stats.js. Run: npm run test:stats
import { blockOccursOn, blocksForDate, indexCompletions, instancesForDate, summarize, topThree, upcomingBlocks, weekStats } from "../src/lib/stats.js";

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
  check("summarize: possible points sum all tasks", s.possiblePoints, 25);
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

console.log(`\n${count - failures}/${count} passed`);
process.exit(failures ? 1 : 0);
