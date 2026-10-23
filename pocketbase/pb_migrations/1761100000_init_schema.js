/// <reference path="../pb_data/types.d.ts" />

// Every collection is owned by a user; records are only visible to their owner.
const OWNER = "user = @request.auth.id";
const CREATE = "@request.auth.id != '' && @request.body.user = @request.auth.id";
const UPDATE = "user = @request.auth.id && (@request.body.user:isset = false || @request.body.user = @request.auth.id)";

const timestamps = [
  { name: "created", type: "autodate", onCreate: true, onUpdate: false },
  { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
];

function owned(name, usersId, fields, extra = {}) {
  return new Collection({
    type: "base",
    name,
    listRule: OWNER,
    viewRule: OWNER,
    createRule: CREATE,
    updateRule: UPDATE,
    deleteRule: OWNER,
    fields: [
      { name: "user", type: "relation", collectionId: usersId, maxSelect: 1, required: true, cascadeDelete: true },
      ...fields,
      ...timestamps,
    ],
    ...extra,
  });
}

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    users.fields.add(new JSONField({ name: "palette", maxSize: 20000 }));
    app.save(users);

    const categories = owned("categories", users.id, [
      { name: "name", type: "text", required: true, max: 60 },
      { name: "color", type: "text", max: 9 },
    ]);
    app.save(categories);

    // Calendar blocks. Times are minutes from midnight in 15-minute steps.
    const blocks = owned("blocks", users.id, [
      { name: "title", type: "text", required: true, max: 120 },
      { name: "date", type: "text", required: true, pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      { name: "start", type: "number", onlyInt: true, min: 0, max: 1440 },
      { name: "end", type: "number", onlyInt: true, min: 0, max: 1440 },
      { name: "color", type: "text", max: 9 },
      { name: "category", type: "relation", collectionId: categories.id, maxSelect: 1, cascadeDelete: false },
      { name: "recurrence", type: "select", maxSelect: 1, values: ["none", "daily", "weekdays", "weekly"] },
      { name: "recurUntil", type: "text", pattern: "^(\\d{4}-\\d{2}-\\d{2})?$" },
      { name: "notes", type: "text", max: 2000 },
    ]);
    app.save(blocks);

    // Tasks either belong to a block (happen whenever it happens), repeat daily,
    // or are one-off to-dos (optionally due on a date).
    const tasks = owned("tasks", users.id, [
      { name: "title", type: "text", required: true, max: 160 },
      { name: "category", type: "relation", collectionId: categories.id, maxSelect: 1, cascadeDelete: false },
      { name: "points", type: "number", onlyInt: true, min: 0, max: 1000 },
      { name: "block", type: "relation", collectionId: blocks.id, maxSelect: 1, cascadeDelete: true },
      { name: "date", type: "text", pattern: "^(\\d{4}-\\d{2}-\\d{2})?$" },
      { name: "daily", type: "bool" },
      { name: "priority", type: "bool" },
    ]);
    app.save(tasks);

    // One record per task per day it was completed. Points are snapshotted.
    const completions = owned(
      "completions",
      users.id,
      [
        { name: "task", type: "relation", collectionId: tasks.id, maxSelect: 1, required: true, cascadeDelete: true },
        { name: "date", type: "text", required: true, pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        { name: "points", type: "number", onlyInt: true, min: 0 },
      ],
      { indexes: ["CREATE UNIQUE INDEX idx_completions_task_date ON completions (task, date)"] }
    );
    app.save(completions);

    // Weekly rewards: earn by points (optionally within one category) or by % complete.
    const rewards = owned("rewards", users.id, [
      { name: "title", type: "text", required: true, max: 120 },
      { name: "kind", type: "select", required: true, maxSelect: 1, values: ["points", "percent"] },
      { name: "target", type: "number", required: true, min: 1 },
      { name: "category", type: "relation", collectionId: categories.id, maxSelect: 1, cascadeDelete: false },
      { name: "claimedWeeks", type: "json", maxSize: 20000 },
    ]);
    app.save(rewards);
  },
  (app) => {
    for (const name of ["rewards", "completions", "tasks", "blocks", "categories"]) {
      app.delete(app.findCollectionByNameOrId(name));
    }
    const users = app.findCollectionByNameOrId("users");
    users.fields.removeByName("palette");
    app.save(users);
  }
);
