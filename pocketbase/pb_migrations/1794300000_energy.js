/// <reference path="../pb_data/types.d.ts" />

// Energy check-in and effort tags.
//   checkins       one record per user per day: energy high | normal | low
//   tasks.effort   optional light | medium | heavy ("" = untagged)
// Keep the select values in sync with ENERGY_LEVELS and EFFORT_LEVELS in src/lib/stats.js.
// The selects, the date pattern and the unique index are the only rules, so no hook logic is needed.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const owner = "user = @request.auth.id";
    app.save(
      new Collection({
        type: "base",
        name: "checkins",
        listRule: owner,
        viewRule: owner,
        createRule: "@request.auth.id != '' && @request.body.user = @request.auth.id",
        updateRule: "user = @request.auth.id && (@request.body.user:isset = false || @request.body.user = @request.auth.id)",
        deleteRule: owner,
        fields: [
          { name: "user", type: "relation", collectionId: users.id, maxSelect: 1, required: true, cascadeDelete: true },
          { name: "date", type: "text", required: true, pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
          { name: "energy", type: "select", required: true, maxSelect: 1, values: ["high", "normal", "low"] },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: ["CREATE UNIQUE INDEX idx_checkins_user_date ON checkins (user, date)"],
      })
    );

    const tasks = app.findCollectionByNameOrId("tasks");
    tasks.fields.add(new SelectField({ name: "effort", maxSelect: 1, values: ["light", "medium", "heavy"] }));
    app.save(tasks);
  },
  (app) => {
    const tasks = app.findCollectionByNameOrId("tasks");
    tasks.fields.removeByName("effort");
    app.save(tasks);

    app.delete(app.findCollectionByNameOrId("checkins"));
  }
);
