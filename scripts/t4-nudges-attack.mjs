// T-4 reviewer probes for Feature 4 (nudges, affirmations, day-end push). Run: node scripts/t4-nudges-attack.mjs
// Pure checks always run. The PocketBase part runs only if http://127.0.0.1:8090 is up; it creates one throwaway
// non-superuser account and deletes it at the end. Never sends a push and never reads push/.env.
import { readFileSync } from "node:fs";
import PocketBase from "pocketbase";
import { dueDailyMessages, cleanNudgeTimes, TASK_GRACE_MINUTES, NUDGE_STEP, MAX_NUDGES } from "../src/lib/reminders.js";
import { indexCompletions } from "../src/lib/stats.js";
import { CELEBRATIONS, NUDGE_LINES, TOMORROW_LINES, LOW_ENERGY_LINES, HIGH_ENERGY_LINES, LOW_ENERGY_CELEBRATIONS, nudgeText } from "../src/lib/messages.js";
import { addDays } from "../src/lib/time.js";
import { localNow, buildMessagesForSub, completionsSince, COMPLETIONS_FILTER } from "../push/sender.mjs";

let failures = 0;
const results = [];
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${label}${ok ? "" : `\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`}`);
}
const note = (label, value) => console.log(`info  ${label}: ${JSON.stringify(value)}`);

const D = "2026-10-28";
const daily = (id, over = {}) => ({ id, title: `Habit ${id}`, daily: true, date: "2026-01-01", block: "", points: 1, created: "2026-01-01 00:00:00.000Z", ...over });
const oneoff = (id, over = {}) => ({ id, title: `Todo ${id}`, daily: false, date: "", block: "", points: 1, created: "2026-01-01 00:00:00.000Z", ...over });
const msgs = (minutes, user, tasks, completions = [], date = D) =>
  dueDailyMessages({ now: { date, minutes }, user, data: { tasks, blocks: [], completionIndex: indexCompletions(completions) } });

// Simulates the sender over a whole local day, one tick a minute, deduping on msg.key like tick() does.
function simulateDay(user, tasks, completionsAt = () => [], date = D) {
  const sent = new Map();
  for (let m = 0; m < 1440; m++) {
    for (const msg of msgs(m, user, tasks, completionsAt(m), date)) {
      if (!sent.has(msg.key)) sent.set(msg.key, { minute: m, ttl: msg.ttl, title: msg.title, body: msg.body });
    }
  }
  return sent;
}

// ---------------------------------------------------------------------------------------------
// 1. Windows and TTL: ttl == seconds left in the window, every minute of every window.
{
  const tasks = [daily("a"), daily("b")];
  const user = { affirmationAt: "08:00", nudgeTimes: [0, 720, 1080, 1425], dayEndAt: "21:00", dayEndPush: true };
  let bad = [];
  for (let m = 0; m < 1440; m++) {
    for (const msg of msgs(m, user, tasks)) {
      const kind = msg.key.split("|")[0];
      const at = kind === "affirmation" ? 480 : kind === "dayend" ? 1260 : Number(msg.key.split("|")[2]);
      const end = Math.min(at + TASK_GRACE_MINUTES, kind === "nudge" ? 1260 : 1440, 1440);
      if (m < at || m >= end || msg.ttl !== Math.max(60, (end - m) * 60)) bad.push([msg.key, m, msg.ttl]);
    }
  }
  check("every message is inside its window and ttl == time left", bad, []);
  const day = simulateDay(user, tasks);
  check("whole-day keys (1425 nudge is after day end -> skipped)", [...day.keys()],
    [`nudge|${D}|0`, `affirmation|${D}`, `nudge|${D}|720`, `nudge|${D}|1080`, `dayend|${D}`]);
  check("first ttl of each = 900s", [...day.values()].map((v) => v.ttl), [900, 900, 900, 900, 900]);
}

// 2. Midnight clamps.
{
  const tasks = [daily("a")];
  const u = { affirmationAt: "23:50", nudgeTimes: [], dayEndAt: "23:55", dayEndPush: true };
  check("23:50 affirmation at 23:59 ttl 60", msgs(1439, u, tasks).map((x) => [x.key, x.ttl]),
    [[`affirmation|${D}`, 60], [`dayend|${D}`, 60]]);
  check("23:55 day end at 23:55 ttl 300", msgs(1435, u, tasks).filter((x) => x.key.startsWith("dayend")).map((x) => x.ttl), [300]);
  check("next day 00:00..00:14: nothing from a 23:55 day end", Array.from({ length: 15 }, (_, m) => msgs(m, u, tasks, [], "2026-10-29").length).every((n) => n === 0), true);
}

// 3. Day end at 00:00 (the known edge case).
{
  const tasks = [daily("a"), daily("b")];
  const u = { nudgeTimes: [600, 720, 1080], dayEndAt: "00:00", dayEndPush: true };
  const day = simulateDay(u, tasks);
  note("dayEndAt 00:00, two daily habits, nothing done yet: keys sent over the day", [...day.keys()]);
  note("dayEndAt 00:00 day-end push", day.get(`dayend|${D}`));
  // Fixed (M-1): a day end before noon falls back to the 21:00 default, so nudges still go out.
  check("dayEndAt 00:00 falls back to 21:00: nudges still sent", [...day.keys()].filter((k) => k.startsWith("nudge")), [`nudge|${D}|600`, `nudge|${D}|720`, `nudge|${D}|1080`]);
  // With no tasks today (no daily habits, no open one-offs) nothing is sent: the no-tasks rule only helps that case.
  check("dayEndAt 00:00, no tasks: nothing", simulateDay(u, []).size, 0);
}

// 4. Celebration once, and later slots skipped. Day completes at 13:00.
{
  const tasks = [daily("a")];
  const u = { nudgeTimes: [600, 720, 840, 1080], dayEndPush: true };
  const comps = (m) => (m >= 780 ? [{ id: "c1", task: "a", date: D, points: 1 }] : []);
  const day = simulateDay(u, tasks, comps);
  check("keys: two open nudges, one celebration at 14:00, day end", [...day.keys()],
    [`nudge|${D}|600`, `nudge|${D}|720`, `nudge-done|${D}`, `dayend|${D}`]);
  check("celebration sent at 840 only", day.get(`nudge-done|${D}`).minute, 840);
  check("day-end body uses a celebration line", CELEBRATIONS.some((c) => day.get(`dayend|${D}`).body.endsWith(c)), true);
  // Complete, then a new task makes it incomplete again, then complete again.
  const tasks2 = [daily("a"), oneoff("o", { created: `${D} 15:00:00.000Z` })];
  const t = (m) => (m < 900 ? [daily("a")] : tasks2);
  const sent = new Map();
  for (let m = 0; m < 1440; m++) {
    const c = [{ id: "c1", task: "a", date: D }].concat(m >= 1100 ? [{ id: "c2", task: "o", date: D }] : []);
    for (const msg of dueDailyMessages({ now: { date: D, minutes: m }, user: { nudgeTimes: [600, 1080, 1140] }, data: { tasks: t(m), blocks: [], completionIndex: indexCompletions(c) } }))
      if (!sent.has(msg.key)) sent.set(msg.key, m);
  }
  check("done -> new task -> done again: celebration still only once", [...sent.keys()], [`nudge-done|${D}`, `nudge|${D}|1080`]);
}

// 5. Mid-day wording: no "tomorrow" in nudges; celebration lines that assume evening.
{
  const lines = new Set();
  for (let i = 0; i < 400; i++) {
    const date = addDays("2026-01-01", i);
    for (let done = 0; done < 5; done++) lines.add(nudgeText({ total: 5, done, points: 0 }, { task: { title: "Gym" } }, date));
  }
  check("no open-day nudge mentions tomorrow/tonight", [...lines].filter((l) => /tomorrow|tonight/i.test(l)), []);
  const eveningish = CELEBRATIONS.filter((c) => /evening|feet up|rest|tonight/i.test(c));
  note("celebrations used by the mid-day nudge-done push that assume evening", eveningish);
  note("TOMORROW_LINES used only by closingLine (day-end push)", TOMORROW_LINES.length);
  check("NUDGE_LINES contain no guilt words", NUDGE_LINES.filter((l) => /should|failed|behind|lazy|only/i.test(l)), []);
}

// 6. localNow: DST in America/Denver, UTC+14, UTC-12, unknown zones.
{
  check("UTC+14 Kiritimati", localNow("Pacific/Kiritimati", new Date("2026-10-28T10:30:00Z")), { date: "2026-10-29", minutes: 30 });
  check("UTC-12", localNow("Etc/GMT+12", new Date("2026-10-28T10:30:00Z")), { date: "2026-10-27", minutes: 1350 });
  check("unknown zone -> Denver", localNow("Mars/Olympus", new Date("2026-10-28T18:00:00Z")), localNow("America/Denver", new Date("2026-10-28T18:00:00Z")));
  check("empty zone -> Denver", localNow("", new Date("2026-10-28T18:00:00Z")), localNow("America/Denver", new Date("2026-10-28T18:00:00Z")));
  note("localNow(undefined) uses the server zone, not FALLBACK_TZ (sender guards with ||)", localNow(undefined, new Date("2026-10-28T18:00:00Z")));
  // since covers local today and yesterday for every zone at every UTC hour of a day
  let gaps = [];
  for (let h = 0; h < 24; h++) {
    const at = new Date(Date.UTC(2026, 9, 28, h, 59));
    for (const tz of ["Pacific/Kiritimati", "Etc/GMT+12", "America/Denver"]) {
      const since = completionsSince(at);
      const local = localNow(tz, at).date;
      if (!(addDays(local, -1) >= since)) gaps.push([tz, h, local, since]);
    }
  }
  check("completionsSince covers local today and yesterday in +14 / -12", gaps, []);

  // DST: simulate a real minute-by-minute run across the two 2026 transition days.
  const runDst = (startUtc, user, tasks) => {
    const sent = new Map();
    const t0 = Date.parse(startUtc);
    for (let i = 0; i < 26 * 60; i++) {
      const now = localNow("America/Denver", new Date(t0 + i * 60000));
      for (const msg of dueDailyMessages({ now, user, data: { tasks, blocks: [], completionIndex: indexCompletions([]) } }))
        if (!sent.has(msg.key)) sent.set(msg.key, now);
    }
    return sent;
  };
  const u = { affirmationAt: "02:30", nudgeTimes: [60, 90, 120, 135, 180], dayEndPush: true };
  const spring = runDst("2026-03-08T07:00:00Z", u, [daily("a")]); // local midnight MST
  check("spring forward (Mar 8): 02:30 affirmation and 02:00/02:15 nudges never fire", [...spring.keys()].filter((k) => k.includes("2026-03-08")),
    ["nudge|2026-03-08|60", "nudge|2026-03-08|90", "nudge|2026-03-08|180", "dayend|2026-03-08"]);
  const fall = runDst("2026-11-01T06:00:00Z", u, [daily("a")]); // local midnight MDT
  check("fall back (Nov 1): repeated 01:00 hour sends each key once", [...fall.keys()].filter((k) => k.includes("2026-11-01")),
    ["nudge|2026-11-01|60", "nudge|2026-11-01|90", "nudge|2026-11-01|120", "nudge|2026-11-01|135", "affirmation|2026-11-01", "nudge|2026-11-01|180", "dayend|2026-11-01"]);
}

// 7. Sender completeness with constructed data: one-off completed last week.
{
  const lastWeek = addDays(D, -7);
  const tasks = [daily("h"), oneoff("o")];
  const comps = [{ id: "c1", task: "h", date: D }, { id: "c2", task: "o", date: lastWeek }];
  const user = { id: "u", nudgeTimes: [720], dayEndPush: true };
  const run = (c) => buildMessagesForSub({ now: { date: D, minutes: 720 }, user, blocks: [], tasks, completionIndex: indexCompletions(c) }).map((m) => [m.key, m.title]);
  check("one-off done last week is not open today -> celebration", run(comps), [[`nudge-done|${D}`, "All done!"]]);
  check("dropping that completion (the old sender's bug) -> 1 of 2 open", run(comps.slice(0, 1)), [[`nudge|${D}|720`, "1 of 2 done"]]);
  // Two completions of the same one-off (possible: unique index is per (task, date)); the sender sorts by created.
  const twice = [{ id: "c2", task: "o", date: lastWeek, created: "1" }, { id: "c3", task: "o", date: D, created: "2" }, { id: "c1", task: "h", date: D }];
  check("one-off completed twice: latest (by created) counts today", run(twice), [[`nudge-done|${D}`, "All done!"]]);
}

// 8. Principle 6: client vs server cleanNudgeTimes, fuzzed with the same inputs.
{
  const src = readFileSync(new URL("../pocketbase/pb_hooks/guards.js", import.meta.url), "utf8");
  const fn = src.slice(src.indexOf("function cleanNudgeTimes"), src.indexOf("function check("));
  class BadRequestError extends Error {}
  const serverClean = new Function("NUDGE_STEP", "MAX_NUDGES", "BadRequestError", `${fn}; return cleanNudgeTimes;`)(
    Number(/const NUDGE_STEP = (\d+)/.exec(src)[1]), Number(/const MAX_NUDGES = (\d+)/.exec(src)[1]), BadRequestError);
  check("sync constants: NUDGE_STEP", Number(/const NUDGE_STEP = (\d+)/.exec(src)[1]), NUDGE_STEP);
  check("sync constants: MAX_NUDGES", Number(/const MAX_NUDGES = (\d+)/.exec(src)[1]), MAX_NUDGES);
  // The server sees the stored JSON text. getString on an unset JSON field is "" and on JSON null is "null".
  const server = (v) => {
    const raw = v === undefined ? "" : JSON.stringify(v);
    try { return serverClean({ getString: () => raw }); } catch { return null; }
  };
  const atoms = [0, 15, 720, 1080, 1425, 1440, 7, -15, 1.5, 720.0, -0, NaN, Infinity, "720", "", null, true, [720], {}, 1e3, 2 ** 31];
  let seed = 42;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const gen = () => {
    const r = rnd();
    if (r < 0.05) return atoms[Math.floor(rnd() * atoms.length)];
    if (r < 0.1) return { 0: 720 };
    const n = Math.floor(rnd() * 9);
    return Array.from({ length: n }, () => (rnd() < 0.7 ? Math.floor(rnd() * 100) * 15 - 15 : atoms[Math.floor(rnd() * atoms.length)]));
  };
  const diffs = [];
  for (let i = 0; i < 20000; i++) {
    // What the server receives is the JSON the SDK sends, so compare on the wire value (NaN -> null etc.).
    const v = JSON.parse(JSON.stringify(gen()) ?? "null");
    const a = cleanNudgeTimes(v), b = server(v);
    if (JSON.stringify(a) !== JSON.stringify(b)) diffs.push({ input: v, client: a, server: b });
  }
  for (const v of [null, undefined, "", [], [1080, 720, 720], [-0], [NaN], ["720"], "[720]"]) {
    const a = cleanNudgeTimes(v), b = server(v);
    if (JSON.stringify(a) !== JSON.stringify(b)) diffs.push({ input: v === undefined ? "undefined" : v, client: a, server: b });
  }
  note("client/server disagreements (input, client, server)", diffs.slice(0, 5));
  check("client and server cleanNudgeTimes agree on 20000 fuzz + edge inputs (modulo the documented cases above)",
    diffs.filter((d) => !(d.input === "" || d.input === "[720]")).length, 0);
}

// ---------------------------------------------------------------------------------------------
// 10. Energy-aware wording (F-14 / B-5).
{
  const E = { LOW_ENERGY_LINES, HIGH_ENERGY_LINES, LOW_ENERGY_CELEBRATIONS, NUDGE_LINES, CELEBRATIONS };
  // Guilt / pressure words. "push" is allowed only on high days ("push a little further").
  const guilt = /should|must|failed|fail|behind|lazy|only \d|still haven|haven't|yet\b|disappoint|miss(ed)?|slack|excuse|no excuse|wasted|guilt|shame|hurry|catch up|fall(ing)? behind/i;
  const bad = [];
  for (const [name, list] of Object.entries(E)) for (const l of list) if (guilt.test(l)) bad.push([name, l]);
  check("energy: no line in any energy list uses guilt/pressure words", bad, []);
  // Rendered texts across 400 dates x progress x energy: no tomorrow/tonight mid-day, no guilt words, no "0 left".
  const rendered = new Set();
  for (let i = 0; i < 400; i++) {
    const date = addDays("2026-01-01", i);
    for (const energy of [null, "normal", "low", "high"]) for (let done = 0; done <= 5; done++)
      rendered.add(nudgeText({ total: 5, done, points: 0 }, done < 5 ? { task: { title: "Gym" } } : null, date, energy));
  }
  check("energy: rendered nudges never mention tomorrow/tonight or guilt words", [...rendered].filter((t) => /tomorrow|tonight/i.test(t) || guilt.test(t)), []);
  const usedLow = new Set([...rendered].filter((t) => /Easy one/.test(t)).map((t) => t.slice(t.indexOf(". ") + 2)));
  check("energy: low nudges walk every gentle line over 400 days", usedLow.size, LOW_ENERGY_LINES.length);
  const evening = LOW_ENERGY_CELEBRATIONS.filter((c) => /rest now|evening|tonight|take it easy/i.test(c));
  note("low-day celebrations that read like evening (sent at a mid-day nudge time)", evening);

  // Low day, only heavy tasks left: nothing suggested, no "Next:" and no "Easy one:". Heavy by tag and by points.
  const day = { nudgeTimes: [720] };
  const ci = (energy, date = D, extra = {}) => [{ date, energy, ...extra }];
  const run = (tasks, comps, checkins, minutes = 720, blocks = []) =>
    dueDailyMessages({ now: { date: D, minutes }, user: day, data: { tasks, blocks, completionIndex: indexCompletions(comps), checkins } })[0];
  const light = daily("l", { title: "Stretch", effort: "light" });
  const heavyTag = daily("ht", { title: "Deep work", effort: "heavy", priority: true });
  const heavyPts = daily("hp", { title: "Long run", points: 50 });
  const doneL = [{ id: "c", task: "l", date: D }];
  const lowHeavyOnly = run([light, heavyTag, heavyPts], doneL, ci("low"));
  check("low + only heavy left (tag and >=50 pts, one starred): no suggestion",
    [lowHeavyOnly.title, /Easy one|Next/.test(lowHeavyOnly.body), LOW_ENERGY_LINES.includes(lowHeavyOnly.body.slice(lowHeavyOnly.body.indexOf(". ") + 2))],
    ["1 of 3 done", false, true]);
  check("low + starred heavy and an open light: suggests the light one", /Easy one: Stretch\./.test(run([light, heavyTag], [], ci("low")).body), true);
  check("low + medium (untagged 20 pts) only: suggests it", /Easy one: Mid\./.test(run([daily("m", { title: "Mid", points: 20 })], [], ci("low")).body), true);
  // Low day, heavy one-off and a past block's light task: the block task is over, so still nothing.
  const pastBlock = { id: "b1", title: "Morning", date: "2026-01-01", start: 360, end: 420, recurrence: "daily", recurUntil: "" };
  const blockTask = { id: "bt", title: "Block light", daily: false, block: "b1", date: "", points: 1, effort: "light", created: "2026-01-01" };
  const lowPast = run([blockTask, heavyTag], [], ci("low"), 720, [pastBlock]);
  check("low + past block's light task + heavy habit: no suggestion", /Easy one|Next/.test(lowPast.body), false);
  const highPick = run([light, heavyTag, heavyPts], [], ci("high"));
  check("high: suggests a heavy task (heaviest: 50-pt untagged or tagged heavy)", /Next: (Deep work|Long run)\./.test(highPick.body), true);
  note("high pick when tagged-heavy 1pt starred vs untagged 50pt", highPick.body);

  // Check-ins from other dates are ignored; first valid one for today wins; junk energy ignored.
  const normalBody = run([light, heavyTag], [], []).body;
  for (const [label, checkins] of [
    ["yesterday low", ci("low", addDays(D, -1))],
    ["tomorrow low", ci("low", addDays(D, 1))],
    ["date with time suffix", ci("low", `${D} 00:00:00.000Z`)],
    ["energy LOW (case)", ci("LOW")],
    ["energy ''", ci("")],
    ["energy null", ci(null)],
    ["checkins null", null],
    ["checkins undefined", undefined],
  ]) check(`energy ignored: ${label}`, run([light, heavyTag], [], checkins).body, normalBody);
  check("energy: yesterday low + today high -> high wording", HIGH_ENERGY_LINES.some((l) => run([light, heavyTag], [], [...ci("low", addDays(D, -1)), ...ci("high")]).body.endsWith(l)), true);
  // energyOn has no user filter: if the sender ever passed another user's check-in, it would be used.
  check("energy: dueDailyMessages trusts data.checkins (no user check) -> per-user grouping is the sender's job",
    LOW_ENERGY_LINES.some((l) => run([light], [], ci("low", D, { user: "someone-else" })).body.endsWith(l)), true);

  // Celebration on low day: same key, sent once over a full simulated day.
  const sent = new Map();
  for (let m = 0; m < 1440; m++) {
    const c = m >= 700 ? [{ id: "c1", task: "l", date: D }] : [];
    for (const msg of dueDailyMessages({ now: { date: D, minutes: m }, user: { nudgeTimes: [600, 720, 840, 1080] }, data: { tasks: [light], blocks: [], completionIndex: indexCompletions(c), checkins: ci("low") } }))
      if (!sent.has(msg.key)) sent.set(msg.key, msg.body);
  }
  check("low day: one gentle celebration, later slots skipped", [[...sent.keys()], LOW_ENERGY_CELEBRATIONS.includes(sent.get(`nudge-done|${D}`))],
    [[`nudge|${D}|600`, `nudge-done|${D}`], true]);

  // Sender wiring: buildMessagesForSub passes checkins through; default [] when missing.
  const sub = (checkins) => buildMessagesForSub({ now: { date: D, minutes: 720 }, user: { id: "u", nudgeTimes: [720] }, blocks: [], tasks: [light, heavyTag], completionIndex: indexCompletions([]), checkins })[0].body;
  check("sender: low check-in -> Easy one", /Easy one: Stretch/.test(sub(ci("low"))), true);
  check("sender: checkins omitted -> default wording", sub(undefined), normalBody);
}

// ---------------------------------------------------------------------------------------------
// 9. Against local PocketBase: the real COMPLETIONS_FILTER, real records, and the §9 bad inputs.
const url = "http://127.0.0.1:8090";
let up = false;
try { await new PocketBase(url).health.check(); up = true; } catch { console.log("skip  PocketBase not running"); }
if (up) {
  const pb = new PocketBase(url);
  pb.autoCancellation(false);
  const email = `t4-${Date.now()}@example.com`;
  const created = await pb.collection("users").create({ email, password: "password123", passwordConfirm: "password123", name: "T4" });
  await pb.collection("users").authWithPassword(email, "password123");
  try {
    const uid = created.id;
    const today = new Date().toISOString().slice(0, 10);
    const lastWeek = addDays(today, -7);
    const h = await pb.collection("tasks").create({ user: uid, title: "Old habit", daily: true, date: addDays(today, -30), points: 1 });
    const o = await pb.collection("tasks").create({ user: uid, title: "Old one-off", points: 2 });
    const o2 = await pb.collection("tasks").create({ user: uid, title: "Open one-off", points: 1 });
    await pb.collection("completions").create({ user: uid, task: h.id, date: addDays(today, -10), points: 1 });
    await pb.collection("completions").create({ user: uid, task: o.id, date: lastWeek, points: 2 });
    const all = await pb.collection("completions").getFullList({ sort: "created" });
    const filtered = await pb.collection("completions").getFullList({ sort: "created", filter: pb.filter(COMPLETIONS_FILTER, { since: completionsSince() }) });
    check("PB: filter keeps the old one-off completion and drops the 10-day-old habit one", filtered.map((c) => c.task), [o.id]);
    note("PB: all completions vs filtered", [all.length, filtered.length]);

    const tasks = await pb.collection("tasks").getFullList();
    const now = { date: today, minutes: 720 };
    const user = { id: uid, nudgeTimes: [720], dayEndPush: false };
    const out = buildMessagesForSub({ now, user, blocks: [], tasks, completionIndex: indexCompletions(filtered) });
    check("PB: nudge counts the old one-off as done (habit + open one-off are open)", out.map((m) => m.title), ["0 of 2 done"]);

    // §9 bad inputs and normalization on the real hook.
    const tryUpdate = async (data) => {
      try { const r = await pb.collection("users").update(uid, data); return { ok: true, nudgeTimes: r.nudgeTimes, affirmationAt: r.affirmationAt }; }
      catch (e) { return { ok: false, status: e.status }; }
    };
    for (const [label, data] of [
      ["[7]", { nudgeTimes: [7] }], ["[1440]", { nudgeTimes: [1440] }], ["7 times", { nudgeTimes: [0, 15, 30, 45, 60, 75, 90] }],
      ['"720"', { nudgeTimes: "720" }], ['"7:5"', { affirmationAt: "7:5" }], ["[-0]", { nudgeTimes: [-0] }],
      ["7 dupes of 720", { nudgeTimes: [720, 720, 720, 720, 720, 720, 720] }], ["nested [[720]]", { nudgeTimes: [[720]] }],
      ["[true]", { nudgeTimes: [true] }], ["2000+ bytes", { nudgeTimes: Array(700).fill(15) }],
    ]) note(`PB: nudge/affirmation input ${label}`, await tryUpdate(data));
    note('PB: nudgeTimes "" (client says [])', await tryUpdate({ nudgeTimes: "" }));
    note('PB: nudgeTimes "[720]" (client says null)', await tryUpdate({ nudgeTimes: "[720]" }));
    note('PB: nudgeTimes "null"', await tryUpdate({ nudgeTimes: "null" }));
    note("PB: [1080,720,720]", await tryUpdate({ nudgeTimes: [1080, 720, 720] }));
    note("PB: unrelated update keeps nudgeTimes", await tryUpdate({ name: "T4b" }));
    note("PB: dayEndAt 00:00 accepted?", await tryUpdate({ dayEndAt: "00:00" }));

    // Concurrency: 30 parallel nudgeTimes writes; final state must be one of the inputs, normalized.
    const writes = Array.from({ length: 30 }, (_, i) => tryUpdate({ nudgeTimes: [((i % 6) + 1) * 15, 1080] }));
    const res = await Promise.all(writes);
    const final = (await pb.collection("users").getOne(uid)).nudgeTimes;
    check("PB: 30 parallel writes all succeed", res.filter((r) => !r.ok).length, 0);
    check("PB: final value is a valid normalized list", JSON.stringify(cleanNudgeTimes(final)) === JSON.stringify(final) && final.length === 2, true);

    // B-5: the sender's check-in query (same filter + fields), two users, grouped per user like tick().
    const pbB = new PocketBase(url);
    pbB.autoCancellation(false);
    const emailB = `t4b-${Date.now()}@example.com`;
    const userB = await pbB.collection("users").create({ email: emailB, password: "password123", passwordConfirm: "password123", name: "T4B" });
    await pbB.collection("users").authWithPassword(emailB, "password123");
    try {
      await pb.collection("checkins").create({ user: uid, date: today, energy: "low" });
      await pb.collection("checkins").create({ user: uid, date: addDays(today, -1), energy: "high" });
      await pb.collection("checkins").create({ user: uid, date: addDays(today, -5), energy: "high" });
      await pbB.collection("checkins").create({ user: userB.id, date: today, energy: "high" });
      const q = { fields: "user,date,energy", filter: pb.filter("date >= {:since}", { since: completionsSince() }) };
      const rowsA = await pb.collection("checkins").getFullList(q);
      const rowsB = await pbB.collection("checkins").getFullList(q);
      check("PB: check-in query returns only {user,date,energy}", Object.keys(rowsA[0]).sort(), ["date", "energy", "user"]);
      check("PB: check-in query drops the 5-day-old one (two-day cutoff)", rowsA.map((r) => r.date).sort(), [addDays(today, -1), today]);
      check("PB: check-in date comes back as plain YYYY-MM-DD (text field)", /^\d{4}-\d{2}-\d{2}$/.test(rowsA[0].date), true);
      const byUser = new Map();
      for (const r of [...rowsA, ...rowsB]) (byUser.get(r.user) || byUser.set(r.user, []).get(r.user)).push(r);
      const habit = { id: "x", title: "Stretch", daily: true, date: addDays(today, -1), block: "", points: 1, effort: "light", created: "2026-01-01" };
      const bodyFor = (id) => buildMessagesForSub({ now: { date: today, minutes: 720 }, user: { id, nudgeTimes: [720] }, blocks: [], tasks: [habit], completionIndex: indexCompletions([]), checkins: byUser.get(id) || [] })[0].body;
      check("PB: user A (low today, high yesterday) gets gentle wording", /Easy one/.test(bodyFor(uid)) && LOW_ENERGY_LINES.some((l) => bodyFor(uid).endsWith(l)), true);
      check("PB: user B (high today) gets upbeat wording", HIGH_ENERGY_LINES.some((l) => bodyFor(userB.id).endsWith(l)), true);
      check("PB: a user with no check-in gets default wording", NUDGE_LINES.some((l) => bodyFor("nobody").endsWith(l)), true);
      let dup;
      try { await pb.collection("checkins").create({ user: uid, date: today, energy: "high" }); dup = "accepted"; } catch (e) { dup = e.status; }
      check("PB: second check-in for the same day rejected (energyOn never sees two)", dup, 400);
    } finally {
      await pbB.collection("users").delete(userB.id);
    }
  } finally {
    await pb.collection("users").delete(created.id);
    console.log("info  throwaway user deleted");
  }
}

console.log(failures ? `\n${failures} T-4 probe(s) failed` : "\nAll T-4 probes passed");
process.exit(failures ? 1 : 0);
