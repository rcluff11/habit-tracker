/// <reference path="../pb_data/types.d.ts" />

// Monthly plans, targets, courses and weekly course steps.
//   plans         one per user per month ("YYYY-MM"): intention + notes
//   plan_targets  measurable targets for a plan: points | percent | completions
//   courses       title, startDate, onEnd keep | stop. NO end-date field: the end is derived
//                 from the highest step week (D-14).
//   course_steps  numbered weekly steps of a course (week 1..52, unique per course)
//   tasks.step    optional link to a course step (cascadeDelete false: habits survive, D-8)
//   tasks.recurUntil  optional last day of a daily habit
//   blocks.step   optional link to a course step (cascadeDelete false)
// Cross-record rules (same owner, target kind fields, stepped task/block rules, onEnd default,
// date-stamping on delete) live in pb_hooks (B-7), not here.
// Owner rules are copied from the other collections because migrations can't import each other.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const tasksCol = app.findCollectionByNameOrId("tasks");
    const categories = app.findCollectionByNameOrId("categories");

    const owner = "user = @request.auth.id";
    const rules = {
      listRule: owner,
      viewRule: owner,
      createRule: "@request.auth.id != '' && @request.body.user = @request.auth.id",
      updateRule: "user = @request.auth.id && (@request.body.user:isset = false || @request.body.user = @request.auth.id)",
      deleteRule: owner,
    };
    const stamps = [
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ];
    const userField = { name: "user", type: "relation", collectionId: users.id, maxSelect: 1, required: true, cascadeDelete: true };
    const isoDate = "^\\d{4}-\\d{2}-\\d{2}$";

    app.save(
      new Collection({
        type: "base",
        name: "plans",
        ...rules,
        fields: [
          { ...userField },
          { name: "month", type: "text", required: true, pattern: "^\\d{4}-(0[1-9]|1[0-2])$" },
          { name: "intention", type: "text", max: 200 },
          { name: "notes", type: "text", max: 4000 },
          ...stamps,
        ],
        indexes: ["CREATE UNIQUE INDEX idx_plans_user_month ON plans (user, month)"],
      })
    );

    const courses = new Collection({
      type: "base",
      name: "courses",
      ...rules,
      fields: [
        { ...userField },
        { name: "title", type: "text", required: true, max: 120 },
        { name: "startDate", type: "text", required: true, pattern: isoDate },
        { name: "onEnd", type: "select", maxSelect: 1, values: ["keep", "stop"] },
        { name: "notes", type: "text", max: 2000 },
        ...stamps,
      ],
    });
    app.save(courses);
    const courseRec = app.findCollectionByNameOrId("courses");

    app.save(
      new Collection({
        type: "base",
        name: "course_steps",
        ...rules,
        fields: [
          { ...userField },
          { name: "course", type: "relation", collectionId: courseRec.id, maxSelect: 1, required: true, cascadeDelete: true },
          { name: "week", type: "number", required: true, onlyInt: true, min: 1, max: 52 },
          { name: "title", type: "text", required: true, max: 120 },
          { name: "notes", type: "text", max: 1000 },
          ...stamps,
        ],
        indexes: ["CREATE UNIQUE INDEX idx_course_steps_course_week ON course_steps (course, week)"],
      })
    );
    const stepRec = app.findCollectionByNameOrId("course_steps");
    const planRec = app.findCollectionByNameOrId("plans");

    app.save(
      new Collection({
        type: "base",
        name: "plan_targets",
        ...rules,
        fields: [
          { ...userField },
          { name: "plan", type: "relation", collectionId: planRec.id, maxSelect: 1, required: true, cascadeDelete: true },
          { name: "title", type: "text", required: true, max: 120 },
          { name: "kind", type: "select", required: true, maxSelect: 1, values: ["points", "percent", "completions"] },
          { name: "target", type: "number", required: true, onlyInt: true, min: 1 },
          { name: "category", type: "relation", collectionId: categories.id, maxSelect: 1, cascadeDelete: false },
          { name: "task", type: "relation", collectionId: tasksCol.id, maxSelect: 1, cascadeDelete: true },
          ...stamps,
        ],
      })
    );

    const tasks = app.findCollectionByNameOrId("tasks");
    tasks.fields.add(new RelationField({ name: "step", collectionId: stepRec.id, maxSelect: 1, cascadeDelete: false }));
    tasks.fields.add(new TextField({ name: "recurUntil", pattern: "^(\\d{4}-\\d{2}-\\d{2})?$" }));
    app.save(tasks);

    const blocks = app.findCollectionByNameOrId("blocks");
    blocks.fields.add(new RelationField({ name: "step", collectionId: stepRec.id, maxSelect: 1, cascadeDelete: false }));
    app.save(blocks);
  },
  (app) => {
    const blocks = app.findCollectionByNameOrId("blocks");
    blocks.fields.removeByName("step");
    app.save(blocks);

    const tasks = app.findCollectionByNameOrId("tasks");
    tasks.fields.removeByName("recurUntil");
    tasks.fields.removeByName("step");
    app.save(tasks);

    app.delete(app.findCollectionByNameOrId("course_steps"));
    app.delete(app.findCollectionByNameOrId("courses"));
    app.delete(app.findCollectionByNameOrId("plan_targets"));
    app.delete(app.findCollectionByNameOrId("plans"));
  }
);
