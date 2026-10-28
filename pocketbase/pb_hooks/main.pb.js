/// <reference path="../pb_data/types.d.ts" />

const GUARDED = ["users", "blocks", "tasks", "completions", "rewards", "push_subscriptions"];

onRecordCreateRequest((e) => {
  require(`${__hooks}/guards.js`).check(e);
  e.next();
}, ...GUARDED);

onRecordUpdateRequest((e) => {
  require(`${__hooks}/guards.js`).check(e);
  e.next();
}, ...GUARDED);
