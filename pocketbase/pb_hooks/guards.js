// Shared validation for user-owned records. Loaded with require() from main.pb.js
// (JSVM handlers can't see outer-scope functions).

const RELATIONS = {
  blocks: { category: "categories" },
  tasks: { category: "categories", block: "blocks" },
  completions: { task: "tasks" },
  rewards: { category: "categories" },
};

function ownedBy(collection, id, userId) {
  let rec;
  try {
    rec = $app.findRecordById(collection, id);
  } catch (_) {
    return null;
  }
  return rec.get("user") === userId ? rec : null;
}

// Keep in sync with REMINDER_OPTIONS in src/lib/reminders.js.
const REMINDER_OPTIONS = [0, 5, 10, 15, 30, 60];

// Validates a remindBefore JSON field. Returns a clean array, or null when unset.
function cleanRemindBefore(record) {
  const raw = record.getString("remindBefore");
  if (raw === "" || raw === "null") return null;
  let value;
  try {
    value = JSON.parse(raw);
  } catch (_) {
    value = undefined;
  }
  if (!Array.isArray(value) || value.some((m) => REMINDER_OPTIONS.indexOf(m) === -1)) {
    throw new BadRequestError("Reminders must be a list of: " + REMINDER_OPTIONS.join(", ") + " minutes.");
  }
  const unique = [];
  for (const m of value) if (unique.indexOf(m) === -1) unique.push(m);
  return unique.sort((a, b) => b - a);
}

function check(e) {
  if (e.hasSuperuserAuth()) return;
  const userId = e.auth ? e.auth.id : "";
  const record = e.record;
  const name = record.collection().name;

  // Related records must belong to the same user.
  const relations = RELATIONS[name] || {};
  for (const field in relations) {
    const id = record.getString(field);
    if (id && !ownedBy(relations[field], id, userId)) {
      throw new BadRequestError("Invalid " + field + ".");
    }
  }

  if (name === "blocks" && record.getInt("end") <= record.getInt("start")) {
    throw new BadRequestError("A block must end after it starts.");
  }

  // Reminder offsets: blocks keep null (= use the user's default); users default to 10 minutes.
  if (name === "blocks" || name === "users") {
    const offsets = cleanRemindBefore(record);
    record.set("remindBefore", offsets === null && name === "users" ? [10] : offsets);
  }

  // Block tasks are reminded with their block; only one-offs without a due date use remindDate.
  if (name === "tasks") {
    if (record.getString("block")) {
      record.set("remindAt", "");
      record.set("remindDate", "");
    } else if (record.getBool("daily") || record.getString("date")) {
      record.set("remindDate", "");
    }
  }

  // Points earned always come from the task, never from the client.
  if (name === "completions") {
    const task = ownedBy("tasks", record.getString("task"), userId);
    record.set("points", task ? task.getInt("points") : 0);
  }

  // The endpoint (one per device) always comes from the subscription itself.
  if (name === "push_subscriptions") {
    let sub;
    try {
      sub = JSON.parse(record.getString("subscription"));
    } catch (_) {
      sub = null;
    }
    const endpoint = sub && typeof sub.endpoint === "string" ? sub.endpoint : "";
    if (!endpoint.startsWith("https://") || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) {
      throw new BadRequestError("Invalid push subscription.");
    }
    record.set("endpoint", endpoint);
  }
}

module.exports = { check };
