---
name: notch-ux
description: "[ux-designer] Notch usability and accessibility checklist (phone-first PWA, dark mode, user-chosen colours)."
user-invocable: false
---
# Notch — UX checklist

**Who it's for:** one person running their day from their phone, often with one hand and in a hurry. The tagline is "Notch every win". The tone is encouraging, never guilt-tripping, and that includes nudge and day-end push copy (`src/lib/messages.js`).

- [ ] Tap targets ≥ 44×44px, especially the calendar grid, task checkboxes and the modal close button.
- [ ] Modals (`components/Modal`) trap focus, close on Esc, return focus to the trigger, and have `role="dialog"` with a label.
- [ ] Every icon-only button has an `aria-label`. Toggling a task is announced (checked state).
- [ ] Contrast: text on **user-chosen** category colours (`ColorPicker`, `colors.js`) stays readable in light and dark mode. Pick the text colour by luminance.
- [ ] Every screen has loading, empty, error and success states. The empty states say what to do next.
- [ ] Destructive or history-changing actions warn first (principle 3 exceptions). Deletes say exactly what goes with them (cascades).
- [ ] Time inputs use 15-minute steps, and the user's time format is respected.
- [ ] Drag-to-create on the calendar has a non-drag alternative (tap then edit).
- [ ] `prefers-reduced-motion` is respected.
- [ ] Check every touched view at 375px and in dark mode. Report findings with the view name and the step that reproduces them.
