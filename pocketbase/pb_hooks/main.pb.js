/// <reference path="../pb_data/types.d.ts" />

const GUARDED = ["blocks", "tasks", "completions", "rewards"];

onRecordCreateRequest((e) => {
  require(`${__hooks}/guards.js`).check(e);
  e.next();
}, ...GUARDED);

onRecordUpdateRequest((e) => {
  require(`${__hooks}/guards.js`).check(e);
  e.next();
}, ...GUARDED);
