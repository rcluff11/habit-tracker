// Unit tests for the reminder rules in src/lib/reminders.js. Run: npm run test:reminders
import { dueReminders, leadText, blockOffsets, cleanOffsets } from "../src/lib/reminders.js";
import { indexCompletions } from "../src/lib/stats.js";

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

console.log(failures ? `\n${failures} check(s) failed` : "\nAll reminder checks passed");
process.exit(failures ? 1 : 0);
