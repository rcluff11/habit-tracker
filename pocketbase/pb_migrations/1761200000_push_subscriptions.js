/// <reference path="../pb_data/types.d.ts" />

// One record per device (browser push endpoint) that wants reminders.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const owner = "user = @request.auth.id";
    app.save(
      new Collection({
        type: "base",
        name: "push_subscriptions",
        listRule: owner,
        viewRule: owner,
        createRule: "@request.auth.id != '' && @request.body.user = @request.auth.id",
        updateRule: "user = @request.auth.id && (@request.body.user:isset = false || @request.body.user = @request.auth.id)",
        deleteRule: owner,
        fields: [
          { name: "user", type: "relation", collectionId: users.id, maxSelect: 1, required: true, cascadeDelete: true },
          { name: "subscription", type: "json", required: true, maxSize: 5000 },
          // Copied from subscription.endpoint by pb_hooks so each device is stored once.
          { name: "endpoint", type: "text", max: 1000 },
          // IANA zone, e.g. "America/Denver". Block times are local, the server runs in UTC.
          { name: "timezone", type: "text", max: 64 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: ["CREATE UNIQUE INDEX idx_push_endpoint ON push_subscriptions (endpoint)"],
      })
    );
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("push_subscriptions"));
  }
);
