// Sends a push reminder shortly before each calendar block starts.
// Runs next to PocketBase (e.g. on the Google Cloud VM). See push/README.md.
//
//   node --env-file=push/.env push/sender.mjs          run forever, checking every minute
//   node --env-file=push/.env push/sender.mjs --test   send a test notification to every device, then exit
import webpush from "web-push";
import PocketBase from "pocketbase";
import { blockOccursOn } from "../src/lib/stats.js";
import { addDays } from "../src/lib/time.js";

const LEAD_MINUTES = 10;
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

// Upcoming starts within the lead window, including just after midnight.
function upcoming(blocks, { date, minutes }) {
  const out = [];
  for (const [day, offset] of [[date, 0], [addDays(date, 1), 1440]]) {
    for (const block of blocks) {
      const startsIn = block.start + offset - minutes;
      if (startsIn >= 0 && startsIn <= LEAD_MINUTES && blockOccursOn(block, day)) out.push({ block, day, startsIn });
    }
  }
  return out;
}

async function send(sub, payload, topic) {
  try {
    // TTL: a reminder is useless once the block has started, so don't deliver it late.
    await webpush.sendNotification(sub.subscription, JSON.stringify(payload), {
      TTL: LEAD_MINUTES * 60,
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

const sent = new Map(); // "subId|blockId|day" -> sent-at ms, so each start is reminded once

async function tick() {
  await ensureAuth();
  const [subs, blocks] = await Promise.all([
    pb.collection("push_subscriptions").getFullList(),
    pb.collection("blocks").getFullList(),
  ]);
  const blocksByUser = new Map();
  for (const b of blocks) {
    if (!blocksByUser.has(b.user)) blocksByUser.set(b.user, []);
    blocksByUser.get(b.user).push(b);
  }

  for (const sub of subs) {
    const now = localNow(sub.timezone || FALLBACK_TZ);
    for (const { block, day, startsIn } of upcoming(blocksByUser.get(sub.user) || [], now)) {
      const key = `${sub.id}|${block.id}|${day}`;
      if (sent.has(key)) continue;
      const ok = await send(
        sub,
        {
          title: block.title,
          body: startsIn === 0 ? "Starting now" : `Starts in ${startsIn} min`,
          url: "/#calendar",
          tag: `block-${block.id}`,
        },
        block.id
      );
      if (ok) sent.set(key, Date.now());
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
    if (await send(sub, { title: "Notch", body: "Reminders are working. Go notch a win! ✅", url: "/" }, "test")) ok++;
  }
  console.log(`Sent test notification to ${ok} of ${subs.length} device(s).`);
  process.exit(0);
}

console.log(`Notch reminder sender running: ${LEAD_MINUTES} min lead, checking every ${TICK_MS / 1000}s.`);
// Run ticks back to back (never overlapping), one per minute.
for (;;) {
  const started = Date.now();
  await tick().catch((err) => console.error("Tick failed:", err.message));
  await new Promise((r) => setTimeout(r, Math.max(1000, TICK_MS - (Date.now() - started))));
}
