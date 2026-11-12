/// <reference path="../pb_data/types.d.ts" />

// Notification preferences (affirmation, progress nudges, day-end push).
//   users.affirmationAt  "HH:MM" local time of the daily affirmation push; "" = off
//   users.nudgeTimes     json array of minutes since midnight (15-min steps, max 6); [] = off
//   users.dayEndPush     bool, send the day-end score push
// The pattern is enforced here; nudgeTimes is validated and normalized in pb_hooks/guards.js.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    users.fields.add(new TextField({ name: "affirmationAt", pattern: "^(([01]\\d|2[0-3]):[0-5]\\d)?$" }));
    users.fields.add(new JSONField({ name: "nudgeTimes", maxSize: 2000 }));
    users.fields.add(new BoolField({ name: "dayEndPush" }));
    app.save(users);
  },
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    users.fields.removeByName("affirmationAt");
    users.fields.removeByName("nudgeTimes");
    users.fields.removeByName("dayEndPush");
    app.save(users);
  }
);
