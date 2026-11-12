// End-to-end check of the PocketBase schema, access rules and hooks.
// Start PocketBase first (npm run pb), then: npm run test:api
// Creates two throwaway accounts and deletes them when finished.
import PocketBase from "pocketbase";
import { instancesForDate, weekStats, indexCompletions } from "../src/lib/stats.js";
import { todayISO, startOfWeek } from "../src/lib/time.js";

const url = process.env.VITE_PB_URL || "http://127.0.0.1:8090";
const stamp = Date.now();
const today = todayISO();
let failures = 0;

const pass = (label) => console.log(`ok    ${label}`);
const fail = (label) => {
  failures++;
  console.log(`FAIL  ${label}`);
};

async function expect(label, fn, shouldFail) {
  try {
    await fn();
    shouldFail ? fail(`${label} (was allowed)`) : pass(label);
  } catch (e) {
    shouldFail ? pass(`${label} (rejected)`) : fail(`${label}: ${e.message}`);
  }
}

// A stepped task's window starts at the later of its step start and the day before it was
// created (UTC date of `created`, minus one day for time zones west of UTC). Same rule as
// taskStart in pb_hooks/guards.js and stats.js (sync point 6).
const dayBefore = (iso) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};
const taskStartFor = (stepStart, task) => {
  const from = dayBefore(String(task.created || "").slice(0, 10));
  return from > stepStart ? from : stepStart;
};

async function signup(name) {
  const pb = new PocketBase(url);
  pb.autoCancellation(false);
  const email = `${name}${stamp}@test.invalid`;
  await pb.collection("users").create({ name, email, password: "password123", passwordConfirm: "password123" });
  await pb.collection("users").authWithPassword(email, "password123");
  return pb;
}

try {
  await new PocketBase(url).health.check();
} catch {
  console.error(`Can't reach PocketBase at ${url}. Start it with: npm run pb`);
  process.exit(1);
}

const a = await signup("tester");
const b = await signup("intruder");
const ua = a.authStore.record.id;
const ub = b.authStore.record.id;

try {
  const cat = await a.collection("categories").create({ user: ua, name: "Fitness", color: "#FF8A65" });
  const block = await a.collection("blocks").create({
    user: ua, title: "Gym", date: today, start: 360, end: 435, category: cat.id, recurrence: "daily",
  });
  const gym = await a.collection("tasks").create({ user: ua, title: "Gym", category: cat.id, points: 25, block: block.id });
  await a.collection("tasks").create({ user: ua, title: "Stretch", category: cat.id, points: 5, daily: true, date: today });

  const c = await a.collection("completions").create({ user: ua, task: gym.id, date: today, points: 999999 });
  c.points === 25 ? pass("completion points come from the task") : fail(`completion points = ${c.points} (hooks not loaded?)`);

  await expect("duplicate completion", () => a.collection("completions").create({ user: ua, task: gym.id, date: today }), true);
  (await b.collection("blocks").getFullList()).length === 0 ? pass("users can't see each other's data") : fail("data leak");
  await expect("create record owned by someone else", () => b.collection("tasks").create({ user: ua, title: "x" }), true);
  await expect("edit someone else's task", () => b.collection("tasks").update(gym.id, { title: "x" }), true);
  await expect("link task to someone else's block", () => b.collection("tasks").create({ user: ub, title: "x", block: block.id }), true);
  await expect("complete someone else's task", () => b.collection("completions").create({ user: ub, task: gym.id, date: today }), true);
  await expect("block that ends before it starts", () =>
    a.collection("blocks").create({ user: ua, title: "Bad", date: today, start: 600, end: 540 }), true);
  await expect("save color palette", () => a.collection("users").update(ua, { palette: { name: "Ocean", colors: ["#4FC3F7"] } }), false);
  await expect("create reward", () =>
    a.collection("rewards").create({ user: ua, title: "Coffee", kind: "points", target: 100, claimedWeeks: [] }), false);

  const lists = await Promise.all(["categories", "blocks", "tasks", "completions"].map((n) => a.collection(n).getFullList()));
  const [categories, blocks, tasks, completions] = lists;
  const data = {
    categories, blocks, tasks, completions,
    completionIndex: indexCompletions(completions),
    categoriesById: Object.fromEntries(categories.map((x) => [x.id, x])),
  };
  const todays = instancesForDate(data, today, today);
  todays.length === 2 && todays.filter((i) => i.done).length === 1
    ? pass("today's tasks: Gym done, Stretch open")
    : fail(`today's tasks: ${todays.map((i) => i.task.title).join(", ")}`);
  const week = weekStats(data, startOfWeek(today), today);
  week.points === 25 ? pass(`weekly stats (${week.done}/${week.total}, ${week.points} pts)`) : fail(`weekly points = ${week.points}`);

  // Push subscriptions: one per device, endpoint always taken from the subscription.
  const endpoint = `https://push.example.test/${stamp}`;
  const subscription = { endpoint, keys: { p256dh: "BTestKey", auth: "testauth" } };
  const ps = await a.collection("push_subscriptions").create({
    user: ua, subscription, endpoint: "https://forged.example", timezone: "America/Denver",
  });
  ps.endpoint === endpoint ? pass("push endpoint set by the server") : fail(`push endpoint = ${ps.endpoint}`);
  await expect("push subscription without keys", () =>
    a.collection("push_subscriptions").create({ user: ua, subscription: { endpoint: `${endpoint}/x` } }), true);
  await expect("push subscription with non-https endpoint", () =>
    a.collection("push_subscriptions").create({ user: ua, subscription: { ...subscription, endpoint: "http://x.test/1" } }), true);
  await expect("claim another account's device", () =>
    b.collection("push_subscriptions").create({ user: ub, subscription }), true);
  (await b.collection("push_subscriptions").getFullList()).length === 0
    ? pass("users can't see each other's devices")
    : fail("push subscription leak");
  await expect("update own device timezone", () =>
    a.collection("push_subscriptions").update(ps.id, { timezone: "America/New_York" }), false);

  // Per-item reminders.
  const me = await a.collection("users").getOne(ua);
  JSON.stringify(me.remindBefore) === "[10]" ? pass("new users default to 10 min reminders") : fail(`user remindBefore = ${JSON.stringify(me.remindBefore)}`);
  const u2 = await a.collection("users").update(ua, { remindBefore: [10, 60, 10, 0] });
  JSON.stringify(u2.remindBefore) === "[60,10,0]" ? pass("user reminders cleaned and sorted") : fail(`user remindBefore = ${JSON.stringify(u2.remindBefore)}`);
  await expect("user reminder of 7 minutes", () => a.collection("users").update(ua, { remindBefore: [7] }), true);
  (await a.collection("blocks").getOne(block.id)).remindBefore === null
    ? pass("block reminders default to null (use my default)")
    : fail("block remindBefore not null by default");
  const none = await a.collection("blocks").update(block.id, { remindBefore: [] });
  JSON.stringify(none.remindBefore) === "[]" ? pass("block reminders can be none ([])") : fail(`block remindBefore = ${JSON.stringify(none.remindBefore)}`);
  const back = await a.collection("blocks").update(block.id, { remindBefore: null });
  back.remindBefore === null ? pass("block reminders can go back to default (null)") : fail(`block remindBefore = ${JSON.stringify(back.remindBefore)}`);
  await expect("block reminder that isn't a list", () => a.collection("blocks").update(block.id, { remindBefore: 10 }), true);
  await expect("task remind time 25:00", () => a.collection("tasks").create({ user: ua, title: "x", remindAt: "25:00" }), true);
  const bt = await a.collection("tasks").create({ user: ua, title: "x", block: block.id, remindAt: "08:00", remindDate: today });
  bt.remindAt === "" && bt.remindDate === "" ? pass("block task reminder fields cleared") : fail("block task kept remindAt/remindDate");
  const dt = await a.collection("tasks").create({ user: ua, title: "x", daily: true, remindAt: "08:00", remindDate: today });
  dt.remindAt === "08:00" && dt.remindDate === "" ? pass("daily task keeps time, drops remindDate") : fail("daily task reminder fields wrong");
  const ot = await a.collection("tasks").create({ user: ua, title: "x", remindAt: "08:00", remindDate: today });
  ot.remindDate === today ? pass("undated one-off keeps remindDate") : fail("undated one-off lost remindDate");

  // Day end time.
  const de = await a.collection("users").update(ua, { dayEndAt: "21:30" });
  de.dayEndAt === "21:30" ? pass("day end time 21:30 saves") : fail(`dayEndAt = ${JSON.stringify(de.dayEndAt)}`);
  await expect("day end time at noon", () => a.collection("users").update(ua, { dayEndAt: "12:00" }), false);
  // Before noon would belong to the next date and turn off every nudge (T-4 M-1).
  for (const bad of ["25:00", "9:30", "21:60", "00:00", "00:30", "11:59"]) {
    await expect(`day end time ${bad}`, () => a.collection("users").update(ua, { dayEndAt: bad }), true);
  }
  await expect("day end time cleared to empty", () => a.collection("users").update(ua, { dayEndAt: "" }), false);
  await expect("day end time on someone else's account", () => b.collection("users").update(ua, { dayEndAt: "22:00" }), true);
  (await a.collection("users").getOne(ua)).dayEndAt === "" ? pass("other user's day end change had no effect") : fail("dayEndAt changed by another user");

  // Notification prefs.
  const np = await a.collection("users").getOne(ua);
  JSON.stringify(np.nudgeTimes) === "[]" && np.affirmationAt === "" && np.dayEndPush === false
    ? pass("new users have notifications off by default")
    : fail(`defaults = ${JSON.stringify([np.nudgeTimes, np.affirmationAt, np.dayEndPush])}`);
  const n1 = await a.collection("users").update(ua, { nudgeTimes: [720, 1080], affirmationAt: "08:15", dayEndPush: true });
  JSON.stringify(n1.nudgeTimes) === "[720,1080]" && n1.affirmationAt === "08:15" && n1.dayEndPush === true
    ? pass("notification prefs save")
    : fail(`prefs = ${JSON.stringify([n1.nudgeTimes, n1.affirmationAt, n1.dayEndPush])}`);
  const n2 = await a.collection("users").update(ua, { nudgeTimes: [1080, 720, 720] });
  JSON.stringify(n2.nudgeTimes) === "[720,1080]" ? pass("nudge times deduplicated and sorted") : fail(`nudgeTimes = ${JSON.stringify(n2.nudgeTimes)}`);
  const n3 = await a.collection("users").update(ua, { nudgeTimes: null });
  JSON.stringify(n3.nudgeTimes) === "[]" ? pass("null nudge times become []") : fail(`nudgeTimes = ${JSON.stringify(n3.nudgeTimes)}`);
  await a.collection("users").update(ua, { nudgeTimes: [0, 1425] });
  const badNudges = { "725": [725], "1440": [1440], "-15": [-15], "7 times": [0, 15, 30, 45, 60, 75, 90], "noon": "noon", "string 720": "720", "object": { a: 1 }, "1.5": [900.5], "string item": ["720"] };
  for (const [label, bad] of Object.entries(badNudges)) {
    await expect(`nudge times ${label}`, () => a.collection("users").update(ua, { nudgeTimes: bad }), true);
  }
  for (const bad of ["7:5", "24:00", "08:60", "noon"]) {
    await expect(`affirmation time ${bad}`, () => a.collection("users").update(ua, { affirmationAt: bad }), true);
  }
  await expect("affirmation time cleared", () => a.collection("users").update(ua, { affirmationAt: "" }), false);
  await expect("nudge times on someone else's account", () => b.collection("users").update(ua, { nudgeTimes: [60], dayEndPush: false }), true);
  const after = await a.collection("users").getOne(ua);
  JSON.stringify(after.nudgeTimes) === "[0,1425]" && after.dayEndPush === true
    ? pass("other user's notification change had no effect")
    : fail("notification prefs changed by another user");

  // Energy check-ins: one per day, owner only.
  const ci = await a.collection("checkins").create({ user: ua, date: today, energy: "high" });
  ci.energy === "high" ? pass("create check-in") : fail(`check-in energy = ${ci.energy}`);
  const ci2 = await a.collection("checkins").update(ci.id, { energy: "low" });
  ci2.energy === "low" ? pass("update check-in energy") : fail(`check-in energy = ${ci2.energy}`);
  await expect("second check-in for the same date", () => a.collection("checkins").create({ user: ua, date: today, energy: "normal" }), true);
  await expect("check-in energy \"tired\"", () => a.collection("checkins").create({ user: ua, date: "2000-01-01", energy: "tired" }), true);
  await expect("check-in with bad date", () => a.collection("checkins").create({ user: ua, date: "tomorrow", energy: "low" }), true);
  (await b.collection("checkins").getFullList()).length === 0 ? pass("intruder can't list check-ins") : fail("check-in leak");
  await expect("intruder views check-in", () => b.collection("checkins").getOne(ci.id), true);
  await expect("intruder updates check-in", () => b.collection("checkins").update(ci.id, { energy: "high" }), true);
  await expect("intruder deletes check-in", () => b.collection("checkins").delete(ci.id), true);
  await expect("intruder creates check-in owned by someone else", () =>
    b.collection("checkins").create({ user: ua, date: "2000-01-02", energy: "low" }), true);
  (await a.collection("checkins").getOne(ci.id)).energy === "low" ? pass("check-in unchanged by intruder") : fail("check-in changed by another user");

  // Effort tags.
  await expect("task effort extreme", () => a.collection("tasks").create({ user: ua, title: "x", effort: "extreme" }), true);
  const et = await a.collection("tasks").create({ user: ua, title: "Heavy one", points: 40, effort: "heavy" });
  et.effort === "heavy" ? pass("task effort heavy saves") : fail(`effort = ${et.effort}`);
  await expect("task effort cleared", () => a.collection("tasks").update(et.id, { effort: "" }), false);

  // Impossible check-in dates, and a check-in's date never changes.
  for (const bad of ["2026-13-40", "2026-02-30"]) {
    await expect(`check-in dated ${bad}`, () => a.collection("checkins").create({ user: ua, date: bad, energy: "low" }), true);
  }
  await expect("move a check-in to another date", () => a.collection("checkins").update(ci.id, { date: "2000-01-03" }), true);
  (await a.collection("checkins").getOne(ci.id)).date === today ? pass("check-in date unchanged") : fail("check-in date changed");

  // Monthly plans.
  const plan = await a.collection("plans").create({ user: ua, month: "2026-03", intention: "Move more" });
  plan.month === "2026-03" ? pass("create plan") : fail(`plan month = ${plan.month}`);
  for (const bad of ["2026-13", "2026-00", "2026-3", "March"]) {
    await expect(`plan month ${bad}`, () => a.collection("plans").create({ user: ua, month: bad }), true);
  }
  await expect("second plan for the same month", () => a.collection("plans").create({ user: ua, month: "2026-03" }), true);

  // Courses and steps.
  await expect("course onEnd \"pause\"", () =>
    a.collection("courses").create({ user: ua, title: "x", startDate: "2026-03-04", onEnd: "pause" }), true);
  await expect("course start date 2026-02-30", () =>
    a.collection("courses").create({ user: ua, title: "x", startDate: "2026-02-30" }), true);
  // 2026-03-04 is a Wednesday. Week 2 starts 2026-03-11; with 3 weeks the course ends 2026-03-24.
  const keepCourse = await a.collection("courses").create({ user: ua, title: "Mornings", startDate: "2026-03-04" });
  keepCourse.onEnd === "keep" ? pass("course onEnd defaults to keep") : fail(`onEnd = ${JSON.stringify(keepCourse.onEnd)}`);
  const kStep1 = await a.collection("course_steps").create({ user: ua, course: keepCourse.id, week: 1, title: "Wake by 8" });
  const kStep2 = await a.collection("course_steps").create({ user: ua, course: keepCourse.id, week: 2, title: "Gym" });
  await a.collection("course_steps").create({ user: ua, course: keepCourse.id, week: 3, title: "Read" });
  for (const bad of [0, 53, 1.5]) {
    await expect(`course week ${bad}`, () =>
      a.collection("course_steps").create({ user: ua, course: keepCourse.id, week: bad, title: "x" }), true);
  }
  await expect("duplicate course week", () =>
    a.collection("course_steps").create({ user: ua, course: keepCourse.id, week: 2, title: "x" }), true);

  // Daily habit end dates.
  for (const bad of ["soon", "2026-02-30", "2026-3-1"]) {
    await expect(`habit recurUntil ${bad}`, () =>
      a.collection("tasks").create({ user: ua, title: "x", daily: true, recurUntil: bad }), true);
  }
  const ru = await a.collection("tasks").create({ user: ua, title: "Until", daily: true, date: "2026-03-01", recurUntil: "2026-03-31" });
  ru.recurUntil === "2026-03-31" ? pass("daily habit keeps recurUntil") : fail(`recurUntil = ${ru.recurUntil}`);
  const ruOne = await a.collection("tasks").create({ user: ua, title: "x", recurUntil: "2026-03-31" });
  ruOne.recurUntil === "" ? pass("one-off task drops recurUntil") : fail(`one-off recurUntil = ${ruOne.recurUntil}`);

  // Stepped tasks are daily habits with no block or dates of their own.
  const st = await a.collection("tasks").create({
    user: ua, title: "Wake", points: 5, step: kStep1.id, daily: false, block: block.id,
    date: "2026-01-01", remindDate: "2026-01-01", recurUntil: "2026-12-31", remindAt: "07:45",
  });
  st.daily === true && st.block === "" && st.date === "" && st.remindDate === "" && st.recurUntil === "" && st.remindAt === "07:45"
    ? pass("stepped task becomes daily with no block or dates")
    : fail(`stepped task = ${JSON.stringify({ daily: st.daily, block: st.block, date: st.date, remindDate: st.remindDate, recurUntil: st.recurUntil })}`);
  const st2 = await a.collection("tasks").create({ user: ua, title: "Gym habit", points: 10, step: kStep2.id });
  st2.step === kStep2.id ? pass("a new habit can be linked to a step") : fail(`new stepped habit step = ${st2.step}`);

  // Linking an existing habit: refused if it has check-offs before its (clamped) course start.
  // kStep2 starts 2026-03-11, so the clamped start is the day before the habit's created date (UTC).
  const oldHabit = await a.collection("tasks").create({ user: ua, title: "Old habit", daily: true, points: 5 });
  await a.collection("completions").create({ user: ua, task: oldHabit.id, date: "2026-01-02" });
  await expect("link a habit with check-offs before the course start", () =>
    a.collection("tasks").update(oldHabit.id, { step: kStep2.id }), true);
  (await a.collection("tasks").getOne(oldHabit.id)).step === "" ? pass("refused link left the habit unlinked") : fail("old habit got linked");
  const freshHabit = await a.collection("tasks").create({ user: ua, title: "Fresh habit", daily: true, points: 5 });
  await a.collection("completions").create({ user: ua, task: freshHabit.id, date: taskStartFor("2026-03-11", freshHabit) });
  await expect("link a habit whose check-offs are all on/after the course start", () =>
    a.collection("tasks").update(freshHabit.id, { step: kStep2.id }), false);
  await expect("unlink a habit from its step", () => a.collection("tasks").update(freshHabit.id, { step: "" }), false);
  (await a.collection("tasks").getOne(freshHabit.id)).step === "" ? pass("unlinked habit has no step") : fail("unlink didn't stick");
  await expect("re-saving a stepped habit without changing its step", () =>
    a.collection("tasks").update(st2.id, { title: "Gym habit!" }), false);

  // Stepped blocks must repeat.
  const blockAt = (fields) => ({ user: ua, title: "Course block", start: 420, end: 480, ...fields });
  await expect("stepped one-off block", () =>
    a.collection("blocks").create(blockAt({ date: "2026-03-11", recurrence: "none", step: kStep2.id })), true);
  await expect("stepped block with no recurrence", () =>
    a.collection("blocks").create(blockAt({ date: "2026-03-11", step: kStep2.id })), true);
  // 2026-01-05 is a Monday: the weekly block's weekday anchor.
  const kWeekly = await a.collection("blocks").create(blockAt({ date: "2026-01-05", recurrence: "weekly", step: kStep2.id }));
  const kDaily = await a.collection("blocks").create(blockAt({ date: "2026-01-01", recurrence: "daily", step: kStep2.id }));
  const kWeekdays = await a.collection("blocks").create(blockAt({ date: "2026-01-01", recurrence: "weekdays", step: kStep2.id }));
  await expect("change a stepped block to one-off", () => a.collection("blocks").update(kDaily.id, { recurrence: "none" }), true);
  // kStep2 starts 2026-03-11: a stepped block can't stop repeating before that.
  await expect("stepped block recurUntil before its step start", () =>
    a.collection("blocks").create(blockAt({ date: "2026-01-01", recurrence: "daily", step: kStep2.id, recurUntil: "2026-03-10" })), true);
  await expect("move a stepped block's recurUntil before its step start", () =>
    a.collection("blocks").update(kDaily.id, { recurUntil: "2026-03-01" }), true);
  await expect("stepped block recurUntil on its step start", async () => {
    const ok = await a.collection("blocks").create(blockAt({ date: "2026-01-01", recurrence: "daily", step: kStep2.id, recurUntil: "2026-03-11" }));
    await a.collection("blocks").delete(ok.id);
  }, false);

  // Targets by kind.
  const habit = await a.collection("tasks").create({ user: ua, title: "Walk", daily: true, points: 5 });
  const oneOff = await a.collection("tasks").create({ user: ua, title: "Taxes", points: 5 });
  const tgt = (fields) => ({ user: ua, plan: plan.id, title: "Target", ...fields });
  const tp = await a.collection("plan_targets").create(tgt({ kind: "points", target: 400, category: cat.id, task: habit.id }));
  tp.category === cat.id && tp.task === "" ? pass("points target keeps category, drops task") : fail(`points target = ${JSON.stringify([tp.category, tp.task])}`);
  await expect("percent target of 150", () => a.collection("plan_targets").create(tgt({ kind: "percent", target: 150 })), true);
  const tpc = await a.collection("plan_targets").create(tgt({ kind: "percent", target: 80, category: cat.id, task: habit.id }));
  tpc.category === "" && tpc.task === "" ? pass("percent target drops category and task") : fail(`percent target = ${JSON.stringify([tpc.category, tpc.task])}`);
  await expect("raise a percent target to 101", () => a.collection("plan_targets").update(tpc.id, { target: 101 }), true);
  await expect("completions target with no task", () => a.collection("plan_targets").create(tgt({ kind: "completions", target: 20 })), true);
  await expect("completions target on a one-off to-do", () =>
    a.collection("plan_targets").create(tgt({ kind: "completions", target: 20, task: oneOff.id })), true);
  const tco = await a.collection("plan_targets").create(tgt({ kind: "completions", target: 20, task: habit.id, category: cat.id }));
  tco.task === habit.id && tco.category === "" ? pass("completions target keeps habit, drops category") : fail(`completions target = ${JSON.stringify([tco.task, tco.category])}`);
  await expect("remove the habit from a completions target", () => a.collection("plan_targets").update(tco.id, { task: "" }), true);
  // m-1: the habit behind a completions target must stay a habit.
  await expect("turn a targeted habit into a one-off", () => a.collection("tasks").update(habit.id, { daily: false }), true);
  (await a.collection("tasks").getOne(habit.id)).daily === true ? pass("targeted habit is still daily") : fail("targeted habit became a one-off");
  await expect("move a targeted habit onto a block", () => a.collection("tasks").update(habit.id, { daily: false, block: block.id }), false);
  await expect("move a targeted habit back to daily", () => a.collection("tasks").update(habit.id, { daily: true, block: "" }), false);
  await expect("turn an untargeted habit into a one-off", async () => {
    const h = await a.collection("tasks").create({ user: ua, title: "Spare", daily: true, points: 5 });
    await a.collection("tasks").update(h.id, { daily: false });
  }, false);
  await expect("percent target of 0", () => a.collection("plan_targets").create(tgt({ kind: "percent", target: 0 })), true);
  await expect("target kind \"streak\"", () => a.collection("plan_targets").create(tgt({ kind: "streak", target: 5 })), true);

  // Intruder: can't see or change the owner's plans and courses, or link to them.
  const owned = { plans: plan, plan_targets: tp, courses: keepCourse, course_steps: kStep1 };
  for (const [col, rec] of Object.entries(owned)) {
    (await b.collection(col).getFullList()).length === 0 ? pass(`intruder can't list ${col}`) : fail(`${col} leak`);
    await expect(`intruder views ${col}`, () => b.collection(col).getOne(rec.id), true);
    await expect(`intruder updates ${col}`, () => b.collection(col).update(rec.id, { title: "x", intention: "x" }), true);
    await expect(`intruder deletes ${col}`, () => b.collection(col).delete(rec.id), true);
  }
  (await a.collection("plans").getOne(plan.id)).intention === "Move more" ? pass("plan unchanged by intruder") : fail("plan changed by another user");
  const bPlan = await b.collection("plans").create({ user: ub, month: "2026-03" });
  const bCourse = await b.collection("courses").create({ user: ub, title: "Mine", startDate: "2026-03-04" });
  await expect("intruder links task to someone else's step", () =>
    b.collection("tasks").create({ user: ub, title: "x", step: kStep1.id }), true);
  await expect("intruder links block to someone else's step", () =>
    b.collection("blocks").create({ user: ub, title: "x", date: "2026-03-11", start: 420, end: 480, recurrence: "daily", step: kStep1.id }), true);
  await expect("intruder adds a target to someone else's plan", () =>
    b.collection("plan_targets").create({ user: ub, plan: plan.id, title: "x", kind: "percent", target: 50 }), true);
  await expect("intruder target on someone else's category", () =>
    b.collection("plan_targets").create({ user: ub, plan: bPlan.id, title: "x", kind: "points", target: 50, category: cat.id }), true);
  await expect("intruder target on someone else's habit", () =>
    b.collection("plan_targets").create({ user: ub, plan: bPlan.id, title: "x", kind: "completions", target: 5, task: habit.id }), true);
  await expect("intruder adds a step to someone else's course", () =>
    b.collection("course_steps").create({ user: ub, course: keepCourse.id, week: 4, title: "x" }), true);
  await expect("intruder moves own step into someone else's course", async () => {
    const s = await b.collection("course_steps").create({ user: ub, course: bCourse.id, week: 1, title: "x" });
    await b.collection("course_steps").update(s.id, { course: keepCourse.id });
  }, true);
  await expect("intruder moves own target into someone else's plan", async () => {
    const t = await b.collection("plan_targets").create({ user: ub, plan: bPlan.id, title: "x", kind: "percent", target: 50 });
    await b.collection("plan_targets").update(t.id, { plan: plan.id });
  }, true);
  (await a.collection("course_steps").getFullList()).length === 3 ? pass("owner's course has only its own steps") : fail("intruder step in course");

  // Deleting a "keep" course: habits and blocks stay, with the step start written on and no end.
  await a.collection("courses").delete(keepCourse.id);
  const kt1 = await a.collection("tasks").getOne(st.id);
  const kt2 = await a.collection("tasks").getOne(st2.id);
  // These habits were created after their step starts, so they start the day before their created date.
  kt1.step === "" && kt1.date === taskStartFor("2026-03-04", st) && kt1.recurUntil === "" && kt1.daily === true
    ? pass("keep course delete: week 1 habit starts max(2026-03-04, created - 1 day), no end")
    : fail(`week 1 habit = ${JSON.stringify([kt1.step, kt1.date, kt1.recurUntil])}`);
  kt2.step === "" && kt2.date === taskStartFor("2026-03-11", st2) && kt2.recurUntil === ""
    ? pass("keep course delete: week 2 habit starts max(2026-03-11, created - 1 day), no end")
    : fail(`week 2 habit = ${JSON.stringify([kt2.step, kt2.date, kt2.recurUntil])}`);
  const kw = await a.collection("blocks").getOne(kWeekly.id);
  kw.step === "" && kw.date === "2026-03-16" && kw.recurUntil === ""
    ? pass("weekly stepped block keeps its Monday (2026-03-16)")
    : fail(`weekly block = ${JSON.stringify([kw.step, kw.date, kw.recurUntil])}`);
  const kd = await a.collection("blocks").getOne(kDaily.id);
  const kwd = await a.collection("blocks").getOne(kWeekdays.id);
  kd.date === "2026-03-11" && kwd.date === "2026-03-11" && kd.step === "" && kwd.step === ""
    ? pass("daily and weekday stepped blocks get the step start")
    : fail(`daily/weekdays blocks = ${JSON.stringify([kd.date, kwd.date])}`);
  (await a.collection("course_steps").getFullList()).length === 0 ? pass("course delete removes its steps") : fail("steps survived course delete");

  // Deleting a "stop" course: start and end written on; a block's earlier recurUntil is kept.
  const stopCourse = await a.collection("courses").create({ user: ua, title: "Gym month", startDate: "2026-03-04", onEnd: "stop" });
  const sStep1 = await a.collection("course_steps").create({ user: ua, course: stopCourse.id, week: 1, title: "a" });
  const sStep3 = await a.collection("course_steps").create({ user: ua, course: stopCourse.id, week: 3, title: "c" });
  const sh1 = await a.collection("tasks").create({ user: ua, title: "Stop 1", step: sStep1.id });
  const sh3 = await a.collection("tasks").create({ user: ua, title: "Stop 3", step: sStep3.id });
  const sbEarly = await a.collection("blocks").create(blockAt({ date: "2026-01-05", recurrence: "weekly", step: sStep1.id, recurUntil: "2026-03-20" }));
  const sbLate = await a.collection("blocks").create(blockAt({ date: "2026-01-01", recurrence: "daily", step: sStep3.id, recurUntil: "2026-06-01" }));
  await a.collection("courses").delete(stopCourse.id);
  const [s1, s3] = await Promise.all([a.collection("tasks").getOne(sh1.id), a.collection("tasks").getOne(sh3.id)]);
  s1.date === taskStartFor("2026-03-04", sh1) && s1.recurUntil === "2026-03-24" &&
  s3.date === taskStartFor("2026-03-18", sh3) && s3.recurUntil === "2026-03-24"
    ? pass("stop course delete: habits get their clamped start and the course end (2026-03-24)")
    : fail(`stop habits = ${JSON.stringify([s1.date, s1.recurUntil, s3.date, s3.recurUntil])}`);
  const [be, bl] = await Promise.all([a.collection("blocks").getOne(sbEarly.id), a.collection("blocks").getOne(sbLate.id)]);
  be.date === "2026-03-09" && be.recurUntil === "2026-03-20" && bl.date === "2026-03-18" && bl.recurUntil === "2026-03-24"
    ? pass("stop course delete: blocks end at the earlier of recurUntil and the course end")
    : fail(`stop blocks = ${JSON.stringify([be.date, be.recurUntil, bl.date, bl.recurUntil])}`);

  // Deleting one step on its own: only its records are stamped, using the course end from all steps.
  const soloCourse = await a.collection("courses").create({ user: ua, title: "Solo", startDate: "2026-03-04", onEnd: "stop" });
  const so1 = await a.collection("course_steps").create({ user: ua, course: soloCourse.id, week: 1, title: "a" });
  const so2 = await a.collection("course_steps").create({ user: ua, course: soloCourse.id, week: 2, title: "b" });
  const soh1 = await a.collection("tasks").create({ user: ua, title: "Solo 1", step: so1.id });
  const soh2 = await a.collection("tasks").create({ user: ua, title: "Solo 2", step: so2.id });
  await a.collection("course_steps").delete(so1.id);
  const [o1, o2] = await Promise.all([a.collection("tasks").getOne(soh1.id), a.collection("tasks").getOne(soh2.id)]);
  const createdDay = soh1.created.slice(0, 10);
  createdDay > "2026-03-05" && o1.step === "" && o1.date === dayBefore(createdDay) && o1.recurUntil === "2026-03-17"
    ? pass("step delete: a habit created after the step start starts the day before it was created, ends 2026-03-17")
    : fail(`step-deleted habit = ${JSON.stringify([o1.step, o1.date, o1.recurUntil, createdDay])}`);
  o2.step === so2.id && o2.date === "" && o2.recurUntil === ""
    ? pass("step delete: other steps' habits are untouched")
    : fail(`other habit = ${JSON.stringify([o2.step, o2.date, o2.recurUntil])}`);
  // A course that starts in the future: the bare step start wins over the created date.
  const futureCourse = await a.collection("courses").create({ user: ua, title: "Later", startDate: "2099-03-04" });
  const fs2 = await a.collection("course_steps").create({ user: ua, course: futureCourse.id, week: 2, title: "b" });
  const fh = await a.collection("tasks").create({ user: ua, title: "Later habit", step: fs2.id });
  await a.collection("course_steps").delete(fs2.id);
  const fhAfter = await a.collection("tasks").getOne(fh.id);
  fhAfter.step === "" && fhAfter.date === "2099-03-11" && fhAfter.recurUntil === ""
    ? pass("step delete: a future step stamps its own start (2099-03-11)")
    : fail(`future step habit = ${JSON.stringify([fhAfter.step, fhAfter.date, fhAfter.recurUntil])}`);

  // soloCourse is left in place so deleting the account below also exercises the delete hooks.

  await a.collection("blocks").delete(block.id);
  const left = await a.collection("tasks").getFullList();
  !left.some((t) => t.block === block.id) && left.some((t) => t.title === "Stretch")
    ? pass("deleting a block removes its tasks (and keeps others)")
    : fail("block cascade");
} finally {
  await a.collection("users").delete(ua);
  await b.collection("users").delete(ub);
}

console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
