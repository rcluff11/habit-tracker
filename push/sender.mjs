// Sends push reminders before calendar blocks and at tasks' "remind me at" times.
// Runs next to PocketBase (e.g. on the Google Cloud VM). See push/README.md.
//
//   node --env-file=push/.env push/sender.mjs          run forever, checking every minute
//   node --env-file=push/.env push/sender.mjs --test   send a test notification to every device, then exit
import webpush from "web-push";
import PocketBase from "pocketbase";
import { indexCompletions } from "../src/lib/stats.js";
import { addDays } from "../src/lib/time.js";
import { dueReminders } from "../src/lib/reminders.js";

const TICK_MS = 60_000;
const FALLBACK_TZ = "America/Denver";

const required = ["PB_URL", "PB_EMAIL", "PB_PASSWORD", "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing settings: ${missing.join(", ")}. Copy push/.env.example to push/.env and fill it in.`);
  process.exit(1);
}

webpush.setVapidDetails(process.env.VAPID_SUBJECT, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);

const pb = new PocketBase(process.env.PB_URL);
pb.autoCancellation(false);

async function ensureAuth() {
  if (!pb.authStore.isValid) {
    await pb.collection("_superusers").authWithPassword(process.env.PB_EMAIL, process.env.PB_PASSWORD);
  }
}

// "Now" in a user's own timezone, e.g. { date: "2026-10-27", minutes: 655 }
function localNow(timeZone) {
  let fmt;
  try {
    fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    });
  } catch {
    return localNow(FALLBACK_TZ);
  }
  const p = Object.fromEntries(fmt.formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

function groupBy(list, key) {
  const map = new Map();
  for (const item of list) {
    if (!map.has(item[key])) map.set(item[key], []);
    map.get(item[key]).push(item);
  }
  return map;
}

async function send(sub, { title, body, url, tag, topic, ttl }) {
  try {
    // TTL: the push service drops the reminder rather than deliver it late.
    await webpush.sendNotification(sub.subscription, JSON.stringify({ title, body, url, tag }), {
      TTL: ttl,
      urgency: "high",
      topic,
    });
    return true;
  } catch (err) {
    if (err.statusCode === 404 || err.statusCode === 410) {
      // Permission revoked or app removed: forget this device.
      await pb.collection("push_subscriptions").delete(sub.id).catch(() => {});
      console.log(`Removed expired subscription ${sub.id}`);
    } else {
      console.error(`Push to ${sub.id} failed:`, err.statusCode || "", err.body || err.message);
    }
    return false;
  }
}

// Completions needed to tell what's done: recent days (blocks, daily tasks) plus any
// completion of a one-off task that has a reminder (one-offs are done once, any day).
async function loadCompletions(tasks) {
  const since = addDays(new Date().toISOString().slice(0, 10), -2);
  const recent = await pb.collection("completions").getFullList({ filter: pb.filter("date >= {:since}", { since }) });
  const oneOffIds = tasks.filter((t) => t.remindAt && !t.block && !t.daily).map((t) => t.id);
  const older = [];
  for (let i = 0; i < oneOffIds.length; i += 50) {
    const chunk = oneOffIds.slice(i, i + 50);
    const params = Object.fromEntries(chunk.map((id, j) => [`t${j}`, id]));
    const filter = pb.filter(chunk.map((_, j) => `task = {:t${j}}`).join(" || "), params);
    older.push(...(await pb.collection("completions").getFullList({ filter })));
  }
  const byId = new Map([...recent, ...older].map((c) => [c.id, c]));
  return [...byId.values()];
}

const sent = new Map(); // "subId|item|id|day|offset" -> sent-at ms, so each reminder goes out once

async function tick() {
  await ensureAuth();
  const subs = await pb.collection("push_subscriptions").getFullList();
  if (!subs.length) return;

  const [users, blocks, tasks] = await Promise.all([
    pb.collection("users").getFullList({ fields: "id,remindBefore" }),
    pb.collection("blocks").getFullList(),
    pb.collection("tasks").getFullList(),
  ]);
  const completions = await loadCompletions(tasks);
  const usersById = new Map(users.map((u) => [u.id, u]));
  const blocksByUser = groupBy(blocks, "user");
  const tasksByUser = groupBy(tasks, "user");
  const completionsByUser = groupBy(completions, "user");

  for (const sub of subs) {
    const reminders = dueReminders({
      now: localNow(sub.timezone || FALLBACK_TZ),
      blocks: blocksByUser.get(sub.user) || [],
      tasks: tasksByUser.get(sub.user) || [],
      completionIndex: indexCompletions(completionsByUser.get(sub.user) || []),
      userDefault: usersById.get(sub.user)?.remindBefore,
    });
    for (const reminder of reminders) {
      const key = `${sub.id}|${reminder.key}`;
      if (sent.has(key)) continue;
      if (await send(sub, reminder)) sent.set(key, Date.now());
    }
  }

  // Forget anything older than two days.
  const cutoff = Date.now() - 2 * 86_400_000;
  for (const [key, at] of sent) if (at < cutoff) sent.delete(key);
}

if (process.argv.includes("--test")) {
  await ensureAuth();
  const subs = await pb.collection("push_subscriptions").getFullList();
  let ok = 0;
  for (const sub of subs) {
    const test = { title: "Notch", body: "Reminders are working. Go notch a win! ✅", url: "/", tag: "test", topic: "test", ttl: 3600 };
    if (await send(sub, test)) ok++;
  }
  console.log(`Sent test notification to ${ok} of ${subs.length} device(s).`);
  process.exit(0);
}

console.log(`Notch reminder sender running, checking every ${TICK_MS / 1000}s.`);
// Run ticks back to back (never overlapping), one per minute.
for (;;) {
  const started = Date.now();
  await tick().catch((err) => console.error("Tick failed:", err.message));
  await new Promise((r) => setTimeout(r, Math.max(1000, TICK_MS - (Date.now() - started))));
}
