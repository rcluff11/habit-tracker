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
