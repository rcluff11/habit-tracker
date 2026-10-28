/// <reference path="../pb_data/types.d.ts" />

// Per-item reminders.
//   users.remindBefore   minutes before each block, e.g. [10] (null is treated as [10])
//   blocks.remindBefore  null = use the user's default, [] = no reminders, else custom minutes
//   tasks.remindAt       "HH:MM" local time for daily and one-off tasks (optional)
//   tasks.remindDate     "YYYY-MM-DD" for one-off tasks with no due date (optional)
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    users.fields.add(new JSONField({ name: "remindBefore", maxSize: 2000 }));
    app.save(users);

    const blocks = app.findCollectionByNameOrId("blocks");
    blocks.fields.add(new JSONField({ name: "remindBefore", maxSize: 2000 }));
    app.save(blocks);

    const tasks = app.findCollectionByNameOrId("tasks");
    tasks.fields.add(new TextField({ name: "remindAt", pattern: "^(([01]\\d|2[0-3]):[0-5]\\d)?$" }));
    tasks.fields.add(new TextField({ name: "remindDate", pattern: "^(\\d{4}-\\d{2}-\\d{2})?$" }));
    app.save(tasks);

    // Existing accounts start with the default of 10 minutes before each block.
    for (const user of app.findAllRecords("users")) {
      user.set("remindBefore", [10]);
      app.saveNoValidate(user);
    }
  },
  (app) => {
    const tasks = app.findCollectionByNameOrId("tasks");
    tasks.fields.removeByName("remindAt");
    tasks.fields.removeByName("remindDate");
    app.save(tasks);

    const blocks = app.findCollectionByNameOrId("blocks");
    blocks.fields.removeByName("remindBefore");
    app.save(blocks);

    const users = app.findCollectionByNameOrId("users");
    users.fields.removeByName("remindBefore");
    app.save(users);
  }
);
