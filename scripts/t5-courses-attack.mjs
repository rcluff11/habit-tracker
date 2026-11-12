// T-5 reviewer attack script: plans, targets, courses, course steps, stepped tasks and blocks.
// Needs local PocketBase (npm run pb). Run: node scripts/t5-courses-attack.mjs
// Creates two throwaway accounts and deletes them (and everything they own) when finished.
import PocketBase from "pocketbase";
import {
  activeWindow, blockOccursOn, courseDeleteImpact, courseEndDate, indexCompletions, instancesForDate,
  monthStats, scheduleIndex, targetProgress, weekStats,
} from "../src/lib/stats.js";
import { addDays, todayISO, weekday } from "../src/lib/time.js";

const url = process.env.VITE_PB_URL || "http://127.0.0.1:8090";
const stamp = Date.now();
const today = todayISO();
let failures = 0;
const pass = (l) => console.log(`ok    ${l}`);
const fail = (l) => { failures++; console.log(`FAIL  ${l}`); };
const note = (l) => console.log(`info  ${l}`);
async function expect(label, fn, shouldFail) {
  try { const r = await fn(); shouldFail ? fail(`${label} (was allowed)`) : pass(label); return r; }
  catch (e) {
    const msg = e?.response?.message || e.message;
    shouldFail ? pass(`${label} (rejected ${e.status}: ${msg})`) : fail(`${label}: ${e.status} ${msg} ${JSON.stringify(e?.response?.data || {})}`);
  }
}
async function signup(name) {
  const pb = new PocketBase(url);
  pb.autoCancellation(false);
  const email = `t5${name}${stamp}@test.invalid`;
  await pb.collection("users").create({ name, email, password: "password123", passwordConfirm: "password123" });
  await pb.collection("users").authWithPassword(email, "password123");
  return pb;
}

// Loads the user's data the way DataContext does.
async function load(pb) {
  const get = (c) => pb.collection(c).getFullList({ sort: "created" });
  const [categories, blocks, tasks, completions, courses, course_steps, plans, plan_targets] = await Promise.all(
    ["categories", "blocks", "tasks", "completions", "courses", "course_steps", "plans", "plan_targets"].map(get)
  );
  return {
    categories, blocks, tasks, completions, courses, course_steps, plans, plan_targets,
    categoriesById: Object.fromEntries(categories.map((c) => [c.id, c])),
    completionIndex: indexCompletions(completions),
    schedule: scheduleIndex(courses, course_steps),
  };
}
const WEEKS = ["2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26"];
function history(data) {
  const w = WEEKS.map((ws) => { const s = weekStats(data, ws, today); return `${ws}:${s.done}/${s.total}/${s.points}`; });
  const m = ["2026-09", "2026-10"].map((mo) => { const s = monthStats(data, mo, today); return `${mo}:${s.done}/${s.total}/${s.points}`; });
  return [...w, ...m];
}
function diff(before, after) {
  return before.map((b, i) => (b === after[i] ? null : `${b} -> ${after[i]}`)).filter(Boolean);
}

const a = await signup("tester");
const b = await signup("intruder");
const ua = a.authStore.record.id;
const ub = b.authStore.record.id;

try {
  // ---------------- Fixtures ----------------
  const catA = await a.collection("categories").create({ user: ua, name: "Fit", color: "#FF8A65" });
  const catB = await b.collection("categories").create({ user: ub, name: "B", color: "#FF8A65" });
  const planA = await a.collection("plans").create({ user: ua, month: "2026-10" });
  const planB = await b.collection("plans").create({ user: ub, month: "2026-10" });
  const courseA = await a.collection("courses").create({ user: ua, title: "A", startDate: "2026-09-07" });
  const courseB = await b.collection("courses").create({ user: ub, title: "B", startDate: "2026-09-07" });
  const stepA = await a.collection("course_steps").create({ user: ua, course: courseA.id, week: 1, title: "w1" });
  const stepB = await b.collection("course_steps").create({ user: ub, course: courseB.id, week: 1, title: "w1" });
  const habitA = await a.collection("tasks").create({ user: ua, title: "hA", daily: true, date: "2026-09-01", points: 5 });
  const habitB = await b.collection("tasks").create({ user: ub, title: "hB", daily: true, date: "2026-09-01", points: 5 });
  const blockA = await a.collection("blocks").create({ user: ua, title: "bA", date: "2026-09-09", start: 600, end: 660, recurrence: "weekly" });
  const targetA = await a.collection("plan_targets").create({ user: ua, plan: planA.id, title: "t", kind: "points", target: 10 });
  courseA.onEnd === "keep" ? pass("course onEnd defaults to keep") : fail(`onEnd default = ${courseA.onEnd}`);

  // ---------------- Cross-user (create + PATCH) ----------------
  console.log("\n# cross-user relations");
  await expect("PATCH own task.step -> other user's step", () => a.collection("tasks").update(habitA.id, { step: stepB.id }), true);
  await expect("PATCH own block.step -> other user's step", () => a.collection("blocks").update(blockA.id, { step: stepB.id }), true);
  await expect("PATCH own target.task -> other user's habit", () => a.collection("plan_targets").update(targetA.id, { kind: "completions", task: habitB.id }), true);
  await expect("PATCH own target.category -> other user's category", () => a.collection("plan_targets").update(targetA.id, { category: catB.id }), true);
  await expect("PATCH own target.plan -> other user's plan", () => a.collection("plan_targets").update(targetA.id, { plan: planB.id }), true);
  await expect("percent target with other user's category", () =>
    a.collection("plan_targets").create({ user: ua, plan: planA.id, title: "p", kind: "percent", target: 50, category: catB.id }), true);
  await expect("create course owned by other user", () => a.collection("courses").create({ user: ub, title: "x", startDate: "2026-09-07" }), true);
  await expect("PATCH course user -> other user", () => a.collection("courses").update(courseA.id, { user: ub }), true);
  await expect("create step with user=me but course of other user", () =>
    a.collection("course_steps").create({ user: ua, course: courseB.id, week: 2, title: "x" }), true);
  await expect("stepped task on other user's block is cleared, not linked", async () => {
    const t = await a.collection("tasks").create({ user: ua, title: "x", step: stepA.id, block: "nonexistent" });
    if (t.block !== "" || !t.daily) throw new Error("block not cleared");
    await a.collection("tasks").delete(t.id);
  }, false);
  (await b.collection("plan_targets").getFullList()).length === 0 ? pass("intruder lists no targets") : fail("intruder sees targets");
  await expect("intruder views course", () => b.collection("courses").getOne(courseA.id), true);
  await expect("unauthenticated list of courses returns nothing", async () => {
    const anon = new PocketBase(url);
    const l = await anon.collection("courses").getFullList();
    if (l.length) throw new Error(`anon sees ${l.length}`);
  }, false);

  // ---------------- Boundaries / hostile ----------------
  console.log("\n# boundary and hostile input");
  for (const week of [0, 53, 1.5, -1, "abc", null]) {
    await expect(`step week ${JSON.stringify(week)}`, () => a.collection("course_steps").create({ user: ua, course: courseA.id, week, title: "x" }), true);
  }
  await expect("step week 52", async () => {
    const s = await a.collection("course_steps").create({ user: ua, course: courseA.id, week: 52, title: "x" });
    await a.collection("course_steps").delete(s.id);
  }, false);
  for (const month of ["2026-13", "2026-00", "2026-1", "26-10", "2026-10-01", "", "2026-10' OR '1'='1"]) {
    await expect(`plan month ${JSON.stringify(month)}`, () => a.collection("plans").create({ user: ua, month }), true);
  }
  await expect("duplicate plan month", () => a.collection("plans").create({ user: ua, month: "2026-10" }), true);
  for (const startDate of ["2026-02-30", "2026-13-01", "", "1/1/2026"]) {
    await expect(`course startDate ${JSON.stringify(startDate)}`, () => a.collection("courses").create({ user: ua, title: "x", startDate }), true);
  }
  await expect('onEnd "pause"', () => a.collection("courses").create({ user: ua, title: "x", startDate: "2026-09-07", onEnd: "pause" }), true);
  await expect("course title 121 chars", () => a.collection("courses").create({ user: ua, title: "x".repeat(121), startDate: "2026-09-07" }), true);
  await expect("course title empty", () => a.collection("courses").create({ user: ua, title: "", startDate: "2026-09-07" }), true);
  for (const [kind, target] of [["percent", 101], ["percent", 0], ["points", 0], ["points", 1.5], ["points", -5]]) {
    await expect(`${kind} target ${target}`, () => a.collection("plan_targets").create({ user: ua, plan: planA.id, title: "x", kind, target }), true);
  }
  await expect("percent target 100", async () => {
    const t = await a.collection("plan_targets").create({ user: ua, plan: planA.id, title: "x", kind: "percent", target: 100, category: catA.id, task: habitA.id });
    if (t.category || t.task) throw new Error(`fields not cleared: ${t.category} ${t.task}`);
    await a.collection("plan_targets").delete(t.id);
  }, false);
  await expect("PATCH percent target to 150", () => a.collection("plan_targets").update(targetA.id, { kind: "percent", target: 150 }), true);
  await expect('kind "streak"', () => a.collection("plan_targets").create({ user: ua, plan: planA.id, title: "x", kind: "streak", target: 5 }), true);
  const oneOff = await a.collection("tasks").create({ user: ua, title: "oneoff", points: 3 });
  await expect("completions target on a one-off", () =>
    a.collection("plan_targets").create({ user: ua, plan: planA.id, title: "x", kind: "completions", target: 3, task: oneOff.id }), true);
  await expect("completions target on a nonexistent task", () =>
    a.collection("plan_targets").create({ user: ua, plan: planA.id, title: "x", kind: "completions", target: 3, task: "zzzzzzzzzzzzzzz" }), true);
  const xss = await expect("hostile course title is stored verbatim (React escapes it)", () =>
    a.collection("courses").create({ user: ua, title: "<img src=x onerror=alert(1)>", startDate: "2026-09-07" }), false);
  if (xss) await a.collection("courses").delete(xss.id);

  // Stepped task / block rules
  console.log("\n# stepped task and block rules");
  const st = await a.collection("tasks").create({
    user: ua, title: "st", step: stepA.id, daily: false, block: blockA.id, date: "2026-01-01", recurUntil: "2026-02-01", remindDate: "2026-01-01",
  });
  st.daily && !st.block && !st.date && !st.recurUntil && !st.remindDate
    ? pass("stepped task forced daily, block/date/recurUntil/remindDate cleared")
    : fail(`stepped task = ${JSON.stringify({ daily: st.daily, block: st.block, date: st.date, ru: st.recurUntil, rd: st.remindDate })}`);
  await expect("PATCH stepped task to daily=false stays daily", async () => {
    const t = await a.collection("tasks").update(st.id, { daily: false });
    if (!t.daily) throw new Error("became one-off while stepped");
  }, false);
  await a.collection("tasks").delete(st.id);
  await expect("stepped block recurrence none", () => a.collection("blocks").create({ user: ua, title: "x", date: today, start: 60, end: 120, recurrence: "none", step: stepA.id }), true);
  await expect("stepped block recurrence missing", () => a.collection("blocks").create({ user: ua, title: "x", date: today, start: 60, end: 120, step: stepA.id }), true);
  const sb = await a.collection("blocks").create({ user: ua, title: "sb", date: today, start: 60, end: 120, recurrence: "daily", step: stepA.id });
  await expect("PATCH stepped block to recurrence none", () => a.collection("blocks").update(sb.id, { recurrence: "none" }), true);
  await expect("PATCH one-off block to add a step", async () => {
    const one = await a.collection("blocks").create({ user: ua, title: "one", date: today, start: 60, end: 120, recurrence: "none" });
    try { await a.collection("blocks").update(one.id, { step: stepA.id }); } finally { await a.collection("blocks").delete(one.id); }
  }, true);
  await expect("stepped weekly block with no date", async () => {
    const nb = await a.collection("blocks").create({ user: ua, title: "nd", start: 60, end: 120, recurrence: "weekly", step: stepA.id });
    note(`stepped weekly block saved with date=${JSON.stringify(nb.date)}`);
    await a.collection("blocks").delete(nb.id);
  }, true);
  await a.collection("blocks").delete(sb.id);
  await expect("unstepped habit recurUntil 2026-02-30", () => a.collection("tasks").create({ user: ua, title: "x", daily: true, recurUntil: "2026-02-30" }), true);
  const ru = await a.collection("tasks").create({ user: ua, title: "x", daily: false, recurUntil: "2026-12-01" });
  ru.recurUntil === "" ? pass("recurUntil cleared on one-off") : fail(`one-off kept recurUntil ${ru.recurUntil}`);
  await a.collection("tasks").delete(ru.id);

  // ---------------- Concurrency ----------------
  console.log("\n# concurrency");
  {
    const r = await Promise.allSettled(Array.from({ length: 25 }, (_, i) =>
      a.collection("course_steps").create({ user: ua, course: courseA.id, week: 7, title: `dup${i}` })));
    const rows = await a.collection("course_steps").getFullList({ filter: `course = "${courseA.id}" && week = 7` });
    rows.length === 1 ? pass(`25 parallel creates of week 7 -> 1 row (${r.filter((x) => x.status === "fulfilled").length} ok)`) : fail(`week 7 rows = ${rows.length}`);
    for (const s of rows) await a.collection("course_steps").delete(s.id);
    const r2 = await Promise.allSettled(Array.from({ length: 25 }, () => a.collection("plans").create({ user: ua, month: "2026-11" })));
    const p2 = await a.collection("plans").getFullList({ filter: 'month = "2026-11"' });
    const codes = [...new Set(r2.filter((x) => x.status === "rejected").map((x) => x.reason.status))];
    p2.length === 1 ? pass(`25 parallel plan creates -> 1 plan (errors: ${codes})`) : fail(`plans for 2026-11 = ${p2.length}`);
    for (const p of p2) await a.collection("plans").delete(p.id);
  }

  // ---------------- Habit target -> habit turned into a one-off ----------------
  console.log("\n# open design question: habit target whose habit becomes a one-off");
  const habitT = await a.collection("plan_targets").create({ user: ua, plan: planA.id, title: "h", kind: "completions", target: 3, task: habitA.id });
  await expect("turn the targeted habit into a one-off is refused", () => a.collection("tasks").update(habitA.id, { daily: false }), true);
  const stillThere = await a.collection("plan_targets").getOne(habitT.id).catch(() => null);
  stillThere ? note(`target still points at a now-one-off task (task=${stillThere.task})`) : note("target was removed");
  await expect("re-save the target afterwards still works", () => a.collection("plan_targets").update(habitT.id, { title: "h2" }), false);
  await a.collection("tasks").update(habitA.id, { daily: true });

  // ---------------- NFR-8: history stable across step/course delete ----------------
  console.log("\n# NFR-8 (keep course): delete a step, then the course");
  async function buildCourse(onEnd) {
    const c = await a.collection("courses").create({ user: ua, title: `nfr-${onEnd}`, startDate: "2026-09-07", onEnd });
    const s = [];
    for (const w of [1, 2, 3]) s.push(await a.collection("course_steps").create({ user: ua, course: c.id, week: w, title: `w${w}` }));
    const h1 = await a.collection("tasks").create({ user: ua, title: `h1-${onEnd}`, step: s[0].id, points: 10 });
    const h2 = await a.collection("tasks").create({ user: ua, title: `h2-${onEnd}`, step: s[1].id, points: 7 });
    const h3 = await a.collection("tasks").create({ user: ua, title: `h3-${onEnd}`, step: s[2].id, points: 3 });
    // weekly block anchored on a Wednesday, linked to week 2 (starts Mon 09-14 -> first occurrence Wed 09-16)
    const wb = await a.collection("blocks").create({ user: ua, title: `wb-${onEnd}`, date: "2026-12-02", start: 600, end: 660, recurrence: "weekly", step: s[1].id });
    const wbt = await a.collection("tasks").create({ user: ua, title: `wbt-${onEnd}`, block: wb.id, points: 20 });
    const days = [];
    for (let d = 0; d < 56; d++) days.push(addDays("2026-09-07", d));
    for (const d of days) {
      if (d.endsWith("1") || d.endsWith("5") || d.endsWith("8")) continue; // some misses
      await a.collection("completions").create({ user: ua, task: h1.id, date: d });
      if (d >= "2026-09-14") await a.collection("completions").create({ user: ua, task: h2.id, date: d });
      if (d >= "2026-09-21") await a.collection("completions").create({ user: ua, task: h3.id, date: d });
      if (weekday(d) === 3 && d >= "2026-09-16") await a.collection("completions").create({ user: ua, task: wbt.id, date: d });
    }
    return { c, s, h1, h2, h3, wb, wbt };
  }
  async function cleanupCourse(x) {
    for (const t of [x.h1, x.h2, x.h3, x.wbt]) await a.collection("tasks").delete(t.id).catch(() => {});
    await a.collection("blocks").delete(x.wb.id).catch(() => {});
    await a.collection("courses").delete(x.c.id).catch(() => {});
  }

  for (const onEnd of ["keep", "stop"]) {
    const x = await buildCourse(onEnd);
    let data = await load(a);
    const occurs = blockOccursOn(data.blocks.find((b0) => b0.id === x.wb.id), "2026-09-16", data.schedule) &&
      !blockOccursOn(data.blocks.find((b0) => b0.id === x.wb.id), "2026-09-09", data.schedule);
    occurs ? pass(`[${onEnd}] stepped weekly block first shows Wed 09-16, not 09-09`) : fail(`[${onEnd}] stepped weekly block weekday/start wrong`);
    const impact = courseDeleteImpact(data, data.courses.find((c) => c.id === x.c.id));
    note(`[${onEnd}] courseDeleteImpact = ${JSON.stringify(impact)}`);
    const end = courseEndDate(x.c, data.schedule);
    const before = history(data);

    // delete the LAST step (week 3) on its own
    await a.collection("course_steps").delete(x.s[2].id);
    data = await load(a);
    const h3 = data.tasks.find((t) => t.id === x.h3.id);
    note(`[${onEnd}] after deleting week 3: h3 = date ${h3.date} recurUntil ${JSON.stringify(h3.recurUntil)} step ${JSON.stringify(h3.step)}; old course end ${end}, new ${courseEndDate(x.c, data.schedule)}`);
    const d1 = diff(before, history(data));
    // keep: history must not move. stop: moving the end earlier is the accepted NFR-8 exception (CourseEditor warns first).
    if (onEnd === "stop") note(`[stop] accepted exception, end moved earlier: ${d1.join("; ") || "no change"}`);
    else d1.length === 0 ? pass(`[${onEnd}] past weeks unchanged after deleting the last step`) : fail(`[${onEnd}] past weeks changed after deleting the last step: ${d1.join("; ")}`);

    const before2 = history(data);
    await a.collection("courses").delete(x.c.id);
    data = await load(a);
    const wb = data.blocks.find((b0) => b0.id === x.wb.id);
    note(`[${onEnd}] after course delete: wb date ${wb.date} (${weekday(wb.date)}) recurUntil ${JSON.stringify(wb.recurUntil)}`);
    const d2 = diff(before2, history(data));
    d2.length === 0 ? pass(`[${onEnd}] past weeks unchanged after deleting the course`) : fail(`[${onEnd}] past weeks changed after deleting the course: ${d2.join("; ")}`);
    const d3 = diff(before, history(data));
    d3.length === 0 ? pass(`[${onEnd}] past weeks unchanged end to end`) : note(`[${onEnd}] end-to-end diffs: ${d3.join("; ")}`);
    await cleanupCourse(x);
  }

  // ---------------- NFR-8: linking an existing habit with history to a step ----------------
  console.log("\n# NFR-8: attach an existing habit (with history) to a later course week");
  {
    const c = await a.collection("courses").create({ user: ua, title: "late", startDate: "2026-10-05", onEnd: "keep" });
    const s2 = await a.collection("course_steps").create({ user: ua, course: c.id, week: 2, title: "w2" }); // starts 10-12
    const h = await a.collection("tasks").create({ user: ua, title: "old habit", daily: true, date: "2026-09-07", points: 4 });
    for (let d = 0; d < 35; d++) await a.collection("completions").create({ user: ua, task: h.id, date: addDays("2026-09-07", d) });
    let data = await load(a);
    const before = history(data);
    // M-2: the server refuses to link a habit with check-offs before the course week starts.
    await expect("link an old habit (check-offs before the step start) to a step", () =>
      a.collection("tasks").update(h.id, { step: s2.id }), true);
    data = await load(a);
    const t = data.tasks.find((t0) => t0.id === h.id);
    t.step === "" && t.date === "2026-09-07" ? pass("refused link left the old habit unlinked with its start date") : fail(`old habit after refused link = ${JSON.stringify([t.step, t.date])}`);
    const d = diff(before, history(data));
    d.length === 0 ? pass("refused link keeps past weeks") : fail(`refused link rewrote past weeks: ${d.join("; ")}`);
    await a.collection("tasks").delete(h.id);
    await a.collection("courses").delete(c.id);
  }

  // ---------------- Adding a habit to a week that already started ----------------
  console.log("\n# adding a habit to the current, already-started week");
  {
    const start = addDays(today, -3);
    const c = await a.collection("courses").create({ user: ua, title: "running", startDate: start, onEnd: "keep" });
    const s1 = await a.collection("course_steps").create({ user: ua, course: c.id, week: 1, title: "w1" });
    let data = await load(a);
    const pastDays = [1, 2, 3].map((n) => addDays(today, -n));
    const before = pastDays.map((d0) => instancesForDate(data, d0, today).length);
    await a.collection("tasks").create({ user: ua, title: "new in w1", step: s1.id, points: 5 });
    data = await load(a);
    const after = pastDays.map((d0) => instancesForDate(data, d0, today).length);
    JSON.stringify(before) === JSON.stringify(after)
      ? pass("new habit doesn't appear on days before it was created")
      : note(`new habit added today is scheduled (as missed) on past days: instances ${before} -> ${after}`);
    await a.collection("courses").delete(c.id);
    for (const t of (await a.collection("tasks").getFullList({ filter: 'title = "new in w1"' }))) await a.collection("tasks").delete(t.id);
  }

  // ---------------- Old recurUntil before the new course week ----------------
  console.log("\n# m-7: block recurUntil before its step start");
  {
    const c = await a.collection("courses").create({ user: ua, title: "ru", startDate: "2026-11-02", onEnd: "stop" });
    const s3 = await a.collection("course_steps").create({ user: ua, course: c.id, week: 3, title: "w3" }); // 11-16 .. 11-22
    const blk = await expect("stepped block with recurUntil before its step start", () =>
      a.collection("blocks").create({ user: ua, title: "ru", date: "2026-11-16", start: 60, end: 120, recurrence: "daily", recurUntil: "2026-11-01", step: s3.id }), true);
    if (!blk) await a.collection("courses").delete(c.id);
    if (blk) {
      const data = await load(a);
      const win = activeWindow(blk, data.schedule);
      note(`window = ${JSON.stringify(win)} -> the block never occurs`);
      await a.collection("courses").delete(c.id);
      const after = await a.collection("blocks").getOne(blk.id);
      note(`after stop-course delete: date ${after.date} recurUntil ${after.recurUntil}`);
      await a.collection("blocks").delete(blk.id);
    }
  }

  // ---------------- targetProgress vs monthStats points for out-of-window completions ----------------
  console.log("\n# targetProgress points vs monthStats points");
  {
    const p = await a.collection("plans").create({ user: ua, month: "2026-08" });
    const tgt = await a.collection("plan_targets").create({ user: ua, plan: p.id, title: "pts", kind: "points", target: 100 });
    const c = await a.collection("courses").create({ user: ua, title: "aug", startDate: "2026-08-17", onEnd: "keep" });
    const s1 = await a.collection("course_steps").create({ user: ua, course: c.id, week: 1, title: "w1" });
    const h = await a.collection("tasks").create({ user: ua, title: "aug habit", daily: true, date: "2026-08-01", points: 10 });
    for (let d = 0; d < 31; d++) await a.collection("completions").create({ user: ua, task: h.id, date: addDays("2026-08-01", d) });
    // M-2: check-offs from 2026-08-01 are before the step start (08-17), so linking is refused.
    await expect("link a habit with August history to an August 17 step", () =>
      a.collection("tasks").update(h.id, { step: s1.id }), true);
    (await a.collection("tasks").getOne(h.id)).step === "" ? pass("refused link left the August habit unlinked") : fail("August habit got linked");
    const data = await load(a);
    const tp = targetProgress(data, tgt, p, today).current;
    const ms = monthStats(data, "2026-08", today).points;
    tp === ms ? pass(`points target (${tp}) equals month points (${ms})`) : note(`points target counts ${tp} but Month stats show ${ms} for 2026-08`);
    await a.collection("tasks").delete(h.id);
    await a.collection("courses").delete(c.id);
    await a.collection("plans").delete(p.id);
  }
} catch (e) {
  fail(`script error: ${e.status || ""} ${e.message} ${JSON.stringify(e?.response?.data || {})}`);
} finally {
  await a.collection("users").delete(ua).catch((e) => console.log("cleanup a:", e.message));
  await b.collection("users").delete(ub).catch((e) => console.log("cleanup b:", e.message));
}
console.log(failures ? `\n${failures} failure(s)` : "\nAll T-5 attack checks passed");
process.exit(failures ? 1 : 0);
