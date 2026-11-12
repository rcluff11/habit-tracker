/// <reference path="../pb_data/types.d.ts" />

// End-of-day score card.
//   users.dayEndAt   "HH:MM" local time the day ends (00:00-23:59); "" = app default (21:00)
// The pattern is the only rule, so no hook is needed.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    users.fields.add(new TextField({ name: "dayEndAt", pattern: "^(([01]\\d|2[0-3]):[0-5]\\d)?$" }));
    app.save(users);
  },
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    users.fields.removeByName("dayEndAt");
    app.save(users);
  }
);
