/// <reference path="../pb_data/types.d.ts" />

const GUARDED = [
  "users", "blocks", "tasks", "completions", "rewards", "push_subscriptions", "checkins",
  "plans", "plan_targets", "courses", "course_steps",
];

onRecordCreateRequest((e) => {
  require(`${__hooks}/guards.js`).check(e);
  e.next();
}, ...GUARDED);

onRecordUpdateRequest((e) => {
  require(`${__hooks}/guards.js`).check(e);
  e.next();
}, ...GUARDED);

// Deleting a course or a step keeps its habits and blocks (D-8, FR-20). Their derived dates
// are written onto them BEFORE e.next(), while every step still exists. The writes and the
// delete share one transaction, so a failed delete leaves nothing half-done.
// These are model hooks (not request hooks), so they also run for cascaded deletes.
onRecordDelete((e) => {
  e.app.runInTransaction((txApp) => {
    const app = e.app;
    e.app = txApp;
    try {
      require(`${__hooks}/guards.js`).stampCourseDelete(txApp, e.record);
      e.next();
    } finally {
      e.app = app;
    }
  });
}, "courses");

onRecordDelete((e) => {
  e.app.runInTransaction((txApp) => {
    const app = e.app;
    e.app = txApp;
    try {
      require(`${__hooks}/guards.js`).stampStepDelete(txApp, e.record);
      e.next();
    } finally {
      e.app = app;
    }
  });
}, "course_steps");
