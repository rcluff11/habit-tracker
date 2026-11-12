// T-3 reviewer attack script: check-ins, effort tags and suggestForEnergy.
// Needs local PocketBase (npm run pb). Run: node scripts/t3-energy-attack.mjs
// Creates two throwaway accounts and deletes them when finished.
import PocketBase from "pocketbase";
import { suggestForEnergy, instancesForDate, indexCompletions, dayScore, ENERGY_LEVELS, EFFORT_LEVELS } from "../src/lib/stats.js";
import { todayISO, addDays } from "../src/lib/time.js";

const url = process.env.VITE_PB_URL || "http://127.0.0.1:8090";
const stamp = Date.now();
const today = todayISO();
let failures = 0;
const pass = (l) => console.log(`ok    ${l}`);
const fail = (l) => { failures++; console.log(`FAIL  ${l}`); };
const note = (l) => console.log(`info  ${l}`);
async function expect(label, fn, shouldFail) {
  try { await fn(); shouldFail ? fail(`${label} (was allowed)`) : pass(label); }
  catch (e) { shouldFail ? pass(`${label} (rejected ${e.status})`) : fail(`${label}: ${e.status} ${e.message}`); }
}
async function signup(name) {
  const pb = new PocketBase(url);
  pb.autoCancellation(false);
  const email = `t3${name}${stamp}@test.invalid`;
  await pb.collection("users").create({ name, email, password: "password123", passwordConfirm: "password123" });
  await pb.collection("users").authWithPassword(email, "password123");
  return pb;
}

// ---------------- API ----------------
const a = await signup("tester");
const b = await signup("intruder");
const ua = a.authStore.record.id;
const ub = b.authStore.record.id;
try {
  // Double-create race: 30 parallel creates for the same date.
  const results = await Promise.allSettled(
    Array.from({ length: 30 }, (_, i) => a.collection("checkins").create({ user: ua, date: today, energy: ENERGY_LEVELS[i % 3] }))
  );
  const ok = results.filter((r) => r.status === "fulfilled").length;
  const statuses = [...new Set(results.filter((r) => r.status === "rejected").map((r) => r.reason.status))];
  const rows = await a.collection("checkins").getFullList({ filter: `date = "${today}"` });
  ok === 1 && rows.length === 1 ? pass(`30 parallel creates -> 1 row (rejections: ${statuses})`) : fail(`race: ${ok} created, ${rows.length} rows`);
  const ci = rows[0];

  // Rapid switching: 30 parallel updates, final value is one of the levels and still one row.
  await Promise.allSettled(Array.from({ length: 30 }, (_, i) => a.collection("checkins").update(ci.id, { energy: ENERGY_LEVELS[i % 3] })));
  const after = await a.collection("checkins").getFullList();
  after.length === 1 && ENERGY_LEVELS.includes(after[0].energy) ? pass("30 parallel updates keep one valid row") : fail("parallel updates");

  // Bad values
  for (const [label, body] of [
    ["energy ''", { energy: "" }], ["energy 'HIGH'", { energy: "HIGH" }],    ["energy 1", { energy: 1 }], ["energy null", { energy: null }], ["energy <script>", { energy: "<script>alert(1)</script>" }],
  ]) await expect(`create check-in ${label}`, () => a.collection("checkins").create({ user: ua, date: "2001-01-01", energy: "low", ...body }), true);
  for (const d of ["2026-1-1", "26-01-01", "2026/01/01", "", " 2026-01-01", "2026-01-01T00:00", "'; DROP TABLE checkins;--"])
    await expect(`check-in date ${JSON.stringify(d)}`, () => a.collection("checkins").create({ user: ua, date: d, energy: "low" }), true);
  // Pattern-only date check: impossible calendar dates.
  for (const d of ["2026-13-40", "2026-02-30", "0000-00-00"]) {
    try {
      const r = await a.collection("checkins").create({ user: ua, date: d, energy: "low" });
      note(`impossible date ${d} ACCEPTED (id ${r.id})`);
      await a.collection("checkins").delete(r.id);
    } catch (e) { pass(`impossible date ${d} rejected`); }
  }
  // Ownership
  await expect("intruder create for owner id", () => b.collection("checkins").create({ user: ua, date: "2002-01-01", energy: "low" }), true);
  await expect("owner moves own check-in to intruder", () => a.collection("checkins").update(ci.id, { user: ub }), true);
  await expect("intruder filter by owner id", async () => {
    const l = await b.collection("checkins").getList(1, 50, { filter: `user = "${ua}"` });
    if (l.items.length) throw new Error("leak");
  }, false);
  await expect("unauthenticated list", async () => {
    const anon = new PocketBase(url);
    const l = await anon.collection("checkins").getFullList();
    if (l.length) throw new Error("leak");
  }, false);
  await expect("update with extra unknown field", () => a.collection("checkins").update(ci.id, { energy: "low", bogus: 1 }), false);
  // Delete then update then recreate
  await a.collection("checkins").delete(ci.id);
  await expect("update deleted check-in", () => a.collection("checkins").update(ci.id, { energy: "high" }), true);
  await expect("recreate after delete", () => a.collection("checkins").create({ user: ua, date: today, energy: "normal" }), false);

  // MJ-1 re-check: two "tabs" for the same user. Tab B creates; stale tab A (no local record)
  // follows EnergyCheckin.choose(): create -> 400 -> getFirstListItem(pb.filter) -> update.
  {
    const tabA = new PocketBase(url); tabA.autoCancellation(false); tabA.authStore.save(a.authStore.token, a.authStore.record);
    const tabB = new PocketBase(url); tabB.autoCancellation(false); tabB.authStore.save(a.authStore.token, a.authStore.record);
    const d = "2003-03-03";
    const fromB = await tabB.collection("checkins").create({ user: ua, date: d, energy: "high" });
    let status = null;
    try { await tabA.collection("checkins").create({ user: ua, date: d, energy: "low" }); } catch (e) { status = e.status; }
    status === 400 ? pass("stale tab create -> 400 (fallback trigger)") : fail(`stale tab create status ${status}`);
    const found = await tabA.collection("checkins").getFirstListItem(tabA.filter("date = {:d}", { d }));
    found.id === fromB.id ? pass("getFirstListItem(pb.filter) finds tab B's record") : fail("fallback found wrong record");
    const upd = await tabA.collection("checkins").update(found.id, { date: d, energy: "low" });
    const rows = await tabA.collection("checkins").getFullList({ filter: tabA.filter("date = {:d}", { d }) });
    rows.length === 1 && upd.energy === "low" ? pass("fallback updates, still one row") : fail(`fallback: ${rows.length} rows`);
    // Hostile value through pb.filter is escaped, not injected.
    const inj = await tabA.collection("checkins").getList(1, 5, { filter: tabA.filter("date = {:d}", { d: `x" || user != "` }) });
    inj.items.length === 0 ? pass("pb.filter escapes quotes") : fail("pb.filter injection");
    // Fallback when nothing exists: getFirstListItem -> 404 (UI then shows the 'not available' message).
    let s404 = null;
    try { await tabA.collection("checkins").getFirstListItem(tabA.filter("date = {:d}", { d: "1999-09-09" })); } catch (e) { s404 = e.status; }
    note(`getFirstListItem with no match -> ${s404}`);
    // M-3: create on a missing collection.
    let sMissing = null;
    try { await tabA.collection("checkins_missing").create({ user: ua }); } catch (e) { sMissing = e.status; }
    sMissing === 404 ? pass("create on missing collection -> 404") : fail(`missing collection status ${sMissing}`);
  }

  // Effort on all three kinds, persistence and clearing.
  const blk = await a.collection("blocks").create({ user: ua, title: "B", date: today, start: 600, end: 660, recurrence: "none" });
  const kinds = {
    block: { block: blk.id }, daily: { daily: true, date: today }, once: {},
  };
  for (const [k, extra] of Object.entries(kinds)) {
    const t = await a.collection("tasks").create({ user: ua, title: k, points: 10, effort: "medium", ...extra });
    t.effort === "medium" ? pass(`effort on ${k} task`) : fail(`effort on ${k}: ${t.effort}`);
    const t2 = await a.collection("tasks").update(t.id, { title: k + "!", points: 20 });
    t2.effort === "medium" ? pass(`effort persists through edit (${k})`) : fail(`effort lost on edit (${k}): ${t2.effort}`);
    const t3 = await a.collection("tasks").update(t.id, { effort: "" });
    t3.effort === "" ? pass(`effort clears (${k})`) : fail(`effort clear (${k}): ${t3.effort}`);
    const t4 = await a.collection("tasks").update(t.id, { effort: null });
    t4.effort === "" ? pass(`effort null -> "" (${k})`) : fail(`effort null (${k}): ${JSON.stringify(t4.effort)}`);
  }
  for (const v of ["Heavy", 3, " light"])
    await expect(`effort ${JSON.stringify(v)}`, () => a.collection("tasks").create({ user: ua, title: "x", effort: v }), true);
} finally {
  for (const pb of [a, b]) await pb.collection("users").delete(pb.authStore.record.id).catch(() => {});
}

// ---------------- stats ----------------
const mk = (id, o = {}) => ({ id, title: id, points: 0, ...o });
const inst = (task, done = false) => ({ task, date: today, done });
const ids = (r) => r.map((i) => i.task.id).join(",");
const eq = (label, got, want) => (got === want ? pass(`${label}: ${got}`) : fail(`${label}: got ${got}, want ${want}`));

// Bucket edges 10/11/49/50 (untagged).
const edges = [mk("p10", { points: 10 }), mk("p11", { points: 11 }), mk("p49", { points: 49 }), mk("p50", { points: 50 })].map((t) => inst(t));
eq("low edges (p50 heavy excluded; p10 light first)", ids(suggestForEnergy(edges, "low", 10)), "p10,p49,p11");
eq("normal edges", ids(suggestForEnergy(edges, "normal", 10)), "p49,p11,p10,p50");
eq("high edges", ids(suggestForEnergy(edges, "high", 10)), "p50,p49,p11,p10");
// Tag beats points.
eq("tag beats points on low", ids(suggestForEnergy([inst(mk("h", { points: 1, effort: "heavy" })), inst(mk("l", { points: 99, effort: "light" }))], "low")), "l");
// Priority on low energy.
const pri = [inst(mk("lightA", { points: 5 })), inst(mk("medPri", { points: 20, priority: true })), inst(mk("heavyPri", { points: 5, effort: "heavy", priority: true }))];
eq("low: heavy priority dropped, light beats medium priority", ids(suggestForEnergy(pri, "low")), "lightA,medPri");
eq("normal: priority tier first, heavy last within it", ids(suggestForEnergy(pri, "normal")), "medPri,heavyPri,lightA");
// Overdue one-off on high.
const od = mk("overdue", { points: 50, date: addDays(today, -3) });
const data = { tasks: [od, mk("small", { points: 5 })], blocks: [], completionIndex: indexCompletions([]) };
eq("high includes overdue one-off", ids(suggestForEnergy(instancesForDate(data, today, today), "high")), "overdue,small");
// Blocks: ended, later today, tomorrow-only.
const blocks = [
  { id: "ended", date: today, start: 480, end: 540, recurrence: "none" },
  { id: "later", date: today, start: 1320, end: 1380, recurrence: "none" },
  { id: "tom", date: addDays(today, 1), start: 60, end: 120, recurrence: "none" },
  { id: "endsAtNow", date: today, start: 660, end: 720, recurrence: "none" },
  { id: "startsNow", date: today, start: 720, end: 780, recurrence: "none" },
];
const bt = blocks.map((bl) => mk("t-" + bl.id, { block: bl.id, points: 20 }));
const bInst = instancesForDate({ tasks: bt, blocks, completionIndex: indexCompletions([]) }, today, today);
eq("block tasks at 12:00", ids(suggestForEnergy(bInst, "normal", 10, { blocks, today, nowMinutes: 720 })), "t-later,t-startsNow");
eq("block tasks at 23:59", ids(suggestForEnergy(bInst, "normal", 10, { blocks, today, nowMinutes: 1439 })), "");
eq("block tasks at 0", ids(suggestForEnergy(bInst, "normal", 10, { blocks, today, nowMinutes: 0 })), "t-ended,t-endsAtNow,t-later,t-startsNow");
// All done / none.
eq("all done", suggestForEnergy(edges.map((i) => ({ ...i, done: true })), "high").length, 0);
eq("no tasks", suggestForEnergy([], "low").length, 0);
eq("limit 0", suggestForEnergy(edges, "high", 0).length, 0);
eq("missing points / null effort", ids(suggestForEnergy([inst({ id: "x", title: "x", effort: null })], "low")), "x");
eq("energy as array", suggestForEnergy(edges, ["high"]).length, 0);
// Stable input: does not mutate.
const before = ids(edges);
suggestForEnergy(edges, "high");
eq("input not mutated", ids(edges), before);
// dayScore energy
const ds = dayScore({ tasks: [], blocks: [], completions: [], completionIndex: indexCompletions([]), categoriesById: {}, checkins: [{ date: today, energy: "tired" }, { date: today, energy: "low" }] }, today, today);
eq("dayScore skips invalid energy", ds.energy, "low");
eq("dayScore no checkins key", dayScore({ tasks: [], blocks: [], completions: [], completionIndex: indexCompletions([]), categoriesById: {} }, today, today).energy, null);
// Performance
const many = Array.from({ length: 20000 }, (_, i) => inst(mk("t" + i, { points: i % 80, priority: i % 7 === 0, effort: ["", ...EFFORT_LEVELS][i % 4] })));
const manyBlocks = Array.from({ length: 2000 }, (_, i) => ({ id: "b" + i, date: today, start: (i % 90) * 15, end: (i % 90) * 15 + 15, recurrence: "daily" }));
let t0 = performance.now();
for (const e of ENERGY_LEVELS) suggestForEnergy(many, e, 3, { blocks: manyBlocks, today, nowMinutes: 600 });
note(`20k instances + 2k blocks x3 energies: ${(performance.now() - t0).toFixed(1)} ms`);

console.log(failures ? `\n${failures} failed` : "\nAll T-3 attack checks passed");
process.exit(failures ? 1 : 0);
