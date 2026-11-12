// Sends push reminders before calendar blocks and at tasks' "remind me at" times, plus the
// opt-in daily messages (affirmation, progress nudges, day-end score). Runs next to PocketBase
// (e.g. on the Google Cloud VM). See push/README.md.
//
//   node --env-file=push/.env push/sender.mjs          run forever, checking every minute
//   node --env-file=push/.env push/sender.mjs --test   send a test notification to every device, then exit
//
// Importing this file (e.g. from scripts/reminders-test.mjs) only loads the pure helpers below;
// nothing reads env, connects or sends unless the file is run directly.
import webpush from "web-push";
import PocketBase from "pocketbase";
import { dirname, resolve } from "node:path";
import { readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { indexCompletions, scheduleIndex } from "../src/lib/stats.js";
import { addDays } from "../src/lib/time.js";
import { dueReminders, dueDailyMessages } from "../src/lib/reminders.js";

const TICK_MS = 60_000;
export const FALLBACK_TZ = "America/Denver";

// ---------------------------------------------------------------------------------------------
// Pure helpers (no network, no env). Exported for tests.

/** "Now" in a timezone, e.g. { date: "2026-10-27", minutes: 655 }. Unknown zones use FALLBACK_TZ. */
export function localNow(timeZone = FALLBACK_TZ, at = new Date()) {
  let fmt;
  try {
    fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    });
  } catch {
    return localNow(FALLBACK_TZ, at);
  }
  const p = Object.fromEntries(fmt.formatToParts(at).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

/**
 * Completions needed to tell what's done, as one filter:
 *  - every completion on or after `since` (block and daily tasks are per day; two days before the
 *    server's UTC date covers "today" and "yesterday" in every timezone), and
 *  - every completion of a one-off task (not daily, no block), whatever its date. A one-off is done
 *    once, and instancesForDate needs that completion to keep an old, finished one-off off today.
 */
export const COMPLETIONS_FILTER = "date >= {:since} || (task.daily = false && task.block = '')";
export const completionsSince = (at = new Date()) => addDays(at.toISOString().slice(0, 10), -2);

/**
 * Everything due right now for one device. Pure.
 * now:  localNow(sub.timezone): the device's local date and minutes, never server UTC
 * user: the users record (remindBefore, affirmationAt, nudgeTimes, dayEndAt, dayEndPush)
 * blocks, tasks: that user's records; completionIndex: indexCompletions() of their completions
 * checkins: that user's recent check-ins (nudge wording follows today's energy; none means default wording)
 * schedule: scheduleIndex() of that user's courses and course_steps. Stepped blocks and habits are only
 *           reminded, and only counted in nudges and the day-end push, inside their course window.
 *           Missing means "no courses".
 * Returns [{ key, title, body, url, tag, topic, ttl }]; the caller dedupes on `subId|key`.
 */
export function buildMessagesForSub({ now, user, blocks, tasks, completionIndex, checkins = [], schedule }) {
  const reminders = dueReminders({ now, blocks, tasks, completionIndex, userDefault: user?.remindBefore, schedule });
  const daily = user ? dueDailyMessages({ now, user, data: { tasks, blocks, completionIndex, checkins, schedule } }) : [];
  return [...reminders, ...daily];
}

function groupBy(list, key) {
  const map = new Map();
  for (const item of list) {
    if (!map.has(item[key])) map.set(item[key], []);
    map.get(item[key]).push(item);
  }
  return map;
}

// ---------------------------------------------------------------------------------------------
// Runtime (only when run directly).

let pb;

async function ensureAuth() {
  if (!pb.authStore.isValid) {
    await pb.collection("_superusers").authWithPassword(process.env.PB_EMAIL, process.env.PB_PASSWORD);
  }
}

async function send(sub, { title, body, url, tag, topic, ttl }) {
  try {
    // TTL: the push service drops the message rather than deliver it late.
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

// "subId|msg.key" -> sent-at ms, so each message goes out once per device. Saved to SENT_LOG after
// each tick that sends something, so a restart inside a message's grace window doesn't send it again.
const SENT_KEEP_MS = 2 * 86_400_000;
const SENT_LOG = process.env.SENT_LOG || resolve(dirname(fileURLToPath(import.meta.url)), ".sent.json");
let sent = new Map();

/** Parse a saved sent log, dropping entries older than two days (or anything malformed). Pure. */
export function parseSentLog(text, now = Date.now()) {
  const map = new Map();
  let entries;
  try {
    entries = Object.entries(JSON.parse(text));
  } catch {
    return map;
  }
  for (const [key, at] of entries) if (typeof at === "number" && now - at < SENT_KEEP_MS) map.set(key, at);
  return map;
}

function loadSentLog() {
  try {
    sent = parseSentLog(readFileSync(SENT_LOG, "utf8"));
  } catch (err) {
    if (err.code !== "ENOENT") console.warn(`Couldn't read ${SENT_LOG}:`, err.message);
  }
}

function saveSentLog() {
  try {
    // Write then rename, so a crash mid-write can't leave a half-written log.
    writeFileSync(`${SENT_LOG}.tmp`, JSON.stringify(Object.fromEntries(sent)));
    renameSync(`${SENT_LOG}.tmp`, SENT_LOG);
  } catch (err) {
    console.warn(`Couldn't save ${SENT_LOG}:`, err.message);
  }
}

const missingWarned = new Set(); // collection names already warned about

// A phase 2 collection that may not exist yet (migrations not deployed): a 404 means "empty", so
// block and task reminders keep going. Any other error still fails the tick.
async function optionalList(name, options) {
  try {
    return await pb.collection(name).getFullList(options);
  } catch (err) {
    if (err?.status !== 404) throw err;
    if (!missingWarned.has(name)) {
      missingWarned.add(name);
      console.warn(`Collection "${name}" not found; treating it as empty. Deploy pb_migrations and restart PocketBase, then restart the sender.`);
    }
    return [];
  }
}

// Queries per tick: subscriptions, then users + blocks + tasks + completions + check-ins + courses +
// course steps in parallel. Eight in total (each may page inside getFullList); none per subscription or per task.
async function tick() {
  await ensureAuth();
  const subs = await pb.collection("push_subscriptions").getFullList();
  if (!subs.length) return;

  const since = completionsSince();
  const [users, blocks, tasks, completions, checkins, courses, steps] = await Promise.all([
    pb.collection("users").getFullList({ fields: "id,remindBefore,dayEndAt,affirmationAt,nudgeTimes,dayEndPush" }),
    pb.collection("blocks").getFullList(),
    pb.collection("tasks").getFullList(),
    pb.collection("completions").getFullList({ sort: "created", filter: pb.filter(COMPLETIONS_FILTER, { since }) }),
    // Same two-day cutoff: covers "today" in every timezone. One check-in per user per day.
    optionalList("checkins", { fields: "user,date,energy", filter: pb.filter("date >= {:since}", { since }) }),
    // All of them, unfiltered: a course's end comes from its highest step week.
    optionalList("courses", { fields: "id,user,startDate,onEnd" }),
    optionalList("course_steps", { fields: "id,user,course,week" }),
  ]);
  const usersById = new Map(users.map((u) => [u.id, u]));
  const blocksByUser = groupBy(blocks, "user");
  const tasksByUser = groupBy(tasks, "user");
  const completionsByUser = groupBy(completions, "user");
  const checkinsByUser = groupBy(checkins, "user");
  const coursesByUser = groupBy(courses, "user");
  const stepsByUser = groupBy(steps, "user");
  let changed = false; // whether the sent log needs saving
  const indexByUser = new Map(); // built once per user, shared by all their devices
  const scheduleByUser = new Map(); // likewise

  for (const sub of subs) {
    if (!indexByUser.has(sub.user)) indexByUser.set(sub.user, indexCompletions(completionsByUser.get(sub.user) || []));
    if (!scheduleByUser.has(sub.user)) {
      scheduleByUser.set(sub.user, scheduleIndex(coursesByUser.get(sub.user) || [], stepsByUser.get(sub.user) || []));
    }
    const messages = buildMessagesForSub({
      now: localNow(sub.timezone || FALLBACK_TZ),
      user: usersById.get(sub.user),
      blocks: blocksByUser.get(sub.user) || [],
      tasks: tasksByUser.get(sub.user) || [],
      completionIndex: indexByUser.get(sub.user),
      checkins: checkinsByUser.get(sub.user) || [],
      schedule: scheduleByUser.get(sub.user),
    });
    for (const msg of messages) {
      const key = `${sub.id}|${msg.key}`;
      if (sent.has(key)) continue;
      if (await send(sub, msg)) {
        sent.set(key, Date.now());
        changed = true;
      }
    }
  }

  // Forget anything older than two days.
  const cutoff = Date.now() - SENT_KEEP_MS;
  for (const [key, at] of sent) {
    if (at < cutoff) {
      sent.delete(key);
      changed = true;
    }
  }
  if (changed) saveSentLog();
}

async function main() {
  const required = ["PB_URL", "PB_EMAIL", "PB_PASSWORD", "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`Missing settings: ${missing.join(", ")}. Copy push/.env.example to push/.env and fill it in.`);
    process.exit(1);
  }

  webpush.setVapidDetails(process.env.VAPID_SUBJECT, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  pb = new PocketBase(process.env.PB_URL);
  pb.autoCancellation(false);

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

  loadSentLog();
  console.log(`Notch reminder sender running, checking every ${TICK_MS / 1000}s (${sent.size} recent sends loaded).`);
  // Run ticks back to back (never overlapping), one per minute.
  for (;;) {
    const started = Date.now();
    await tick().catch((err) => console.error("Tick failed:", err.message));
    await new Promise((r) => setTimeout(r, Math.max(1000, TICK_MS - (Date.now() - started))));
  }
}

// Run only as the entry script, never when imported by a test.
// realpath on both sides so symlinks and drive-letter case can't stop the service from starting.
const realUrl = (p) => pathToFileURL(realpathSync(p)).href.toLowerCase();
function isEntry() {
  try {
    return !!process.argv[1] && realUrl(resolve(process.argv[1])) === realUrl(fileURLToPath(import.meta.url));
  } catch {
    return false; // argv[1] isn't a real file (e.g. imported from -e): not the entry
  }
}
if (isEntry()) await main();
