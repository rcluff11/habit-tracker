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

  await a.collection("blocks").delete(block.id);
  const left = await a.collection("tasks").getFullList();
  left.length === 1 && left[0].title === "Stretch" ? pass("deleting a block removes its tasks") : fail("block cascade");
} finally {
  await a.collection("users").delete(ua);
  await b.collection("users").delete(ub);
}

console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
