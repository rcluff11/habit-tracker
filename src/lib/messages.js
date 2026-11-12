// Wording for nudges, the end-of-day score card and the day-end push. Pure data and arithmetic: no browser,
// Vite, Date.now or Math.random, so the app and push/sender.mjs show the same text for a given date.
// Every function takes only a summarize() result (plus a date or instance), so the sender needs no completion history.
import { STRIDE, dayNumber } from "./affirmations.js";

export const CELEBRATIONS = [
  "Everything done. What a day!",
  "Clean sweep. Enjoy the rest of your day.",
  "Every box ticked, every notch earned.",
  "You did it all today. Be proud.",
  "Nothing left on the list. Beautiful work.",
  "A perfect day, and you made it happen.",
  "All done! Enjoy the free time.",
  "You showed up for everything today.",
  "Full marks. That felt good, didn't it?",
  "Every single thing, done. Well played.",
  "You finished what you started. Celebrate that.",
  "The list is empty and your day is full of wins.",
  "A complete day. Take a bow.",
  "Wrapped up and notched. Great job.",
  "You're on fire today, and it shows.",
  "Everything checked off. You earned a good rest.",
  "Today was a win from start to finish.",
  "Total follow-through. That's real momentum.",
  "All of it done. Your future self says thanks.",
  "Top to bottom, you crushed it.",
];

export const TOMORROW_LINES = [
  "You'll get it tomorrow. Rest up.",
  "Tomorrow is a fresh start. You've got this.",
  "What's left will keep. You did what you could today.",
  "Not every day is a clean sweep, and that's fine.",
  "Tomorrow, you'll pick it back up with fresh energy.",
  "Whatever you got through today still counts.",
  "Let it go for tonight. Tomorrow's a new page.",
  "A good day doesn't have to be a perfect one.",
  "You'll get there. One day at a time.",
  "Be proud of showing up for today.",
  "Tomorrow gets a clean slate and you get a good night's sleep.",
  "Some days go sideways. Tomorrow you try again.",
  "You showed up, and that matters more than the tally.",
  "The rest can wait. Sleep well.",
  "Progress, not perfection. See you tomorrow.",
  "You'll nail it tomorrow. Rest easy tonight.",
  "A lighter day is still part of the journey.",
  "Be kind to yourself tonight. Tomorrow is open.",
  "You did enough today. Tomorrow's yours too.",
  "Small steps are still steps. Back at it tomorrow.",
];

// Shown when nothing was scheduled that day.
export const QUIET_LINES = [
  "A quiet day. Rest counts too.",
  "Nothing on the plan today. Enjoy the space.",
  "An open day is a gift. Enjoy it.",
  "No tasks today, so tomorrow can start fresh.",
  "A day off the list. Recharge.",
];

// STRIDE comes from affirmations.js: it is coprime with these list lengths, so consecutive dates walk the whole list.

function pick(list, isoDate) {
  const n = list.length;
  const day = dayNumber(isoDate);
  if (Number.isNaN(day)) return list[0];
  return list[(((day % n) * STRIDE) % n + n) % n];
}

/** "3 of 5 done · 12 points", "All 5 done · 20 points", or "Nothing scheduled today". */
export function scoreHeadline(summary) {
  const total = summary?.total || 0;
  const done = summary?.done || 0;
  if (total === 0) return "Nothing scheduled today";
  const points = summary.points || 0;
  const pts = `${points} ${points === 1 ? "point" : "points"}`;
  return done >= total ? `All ${total} done · ${pts}` : `${done} of ${total} done · ${pts}`;
}

/** A celebration when the day is complete, a gentle "tomorrow" line when not, a quiet line when empty. */
export function closingLine(summary, date) {
  const total = summary?.total || 0;
  if (total === 0) return pick(QUIET_LINES, date);
  return (summary.done || 0) >= total ? pick(CELEBRATIONS, date) : pick(TOMORROW_LINES, date);
}

// Mid-day nudges while the day is still open. Encouraging, never guilt-tripping.
export const NUDGE_LINES = [
  "Small steps add up.",
  "You've got this.",
  "One at a time is plenty.",
  "Every notch counts.",
  "Keep the momentum going.",
  "You're building something good.",
  "A little progress is still progress.",
  "Pick one and enjoy the win.",
  "Steady wins the day.",
  "Future you will be glad you did.",
  "Nice and easy. One more?",
  "You're doing better than you think.",
];

// Nudges on a low-energy check-in day: gentle, permission to go easy, no push for more.
export const LOW_ENERGY_LINES = [
  "Go gently today.",
  "One easy one is enough.",
  "Low days count too.",
  "Rest is part of the plan.",
  "Small and easy still moves you forward.",
  "Be kind to yourself today.",
  "Do what you can. That's plenty.",
  "Slow progress is still progress.",
  "No rush. One small win?",
  "Showing up on a hard day matters most.",
  "Take it easy and pick something light.",
];

// Nudges on a high-energy check-in day: ride the wave toward the bigger tasks.
export const HIGH_ENERGY_LINES = [
  "You've got energy today. Use it well.",
  "Great day to get a lot done.",
  "Ride the momentum.",
  "Your energy's up. Go make it count.",
  "Perfect time to make real progress.",
  "You're firing on all cylinders.",
  "Strike while you're feeling strong.",
  "Big energy, big notches.",
  "Today's a day to push a little further.",
  "Make the most of this good day.",
  "Go knock out the next one.",
];

// Celebrations when everything got done on a low-energy day.
export const LOW_ENERGY_CELEBRATIONS = [
  "Everything done, even on a low day. That's huge.",
  "You finished it all on low energy. Be proud.",
  "A tough day and you still did it all. Be proud.",
  "All done on a low day. That's real strength.",
  "Low energy, full list. That's impressive.",
];

/**
 * Text for a nudge push. `nextInstance` is the open instance to suggest (or null).
 * `energy` is today's check-in ("high" | "normal" | "low") or null; normal and missing use the default lines.
 *  - day complete: a celebration (same pick as closingLine for that date; a gentler one on low days)
 *  - otherwise:    "2 left · Next: Gym. Small steps add up."  (low: "2 left · Easy one: Stretch. Go gently today.")
 * `date` (local ISO) keeps the pick deterministic; the line also shifts with progress so
 * two nudges on the same day usually differ.
 */
export function nudgeText(summary, nextInstance, date = "", energy = null) {
  const total = summary?.total || 0;
  const done = summary?.done || 0;
  if (total > 0 && done >= total) return pick(energy === "low" ? LOW_ENERGY_CELEBRATIONS : CELEBRATIONS, date);
  const left = Math.max(total - done, 0);
  const label = energy === "low" ? "Easy one" : "Next";
  const next = nextInstance?.task?.title ? ` · ${label}: ${nextInstance.task.title}` : "";
  const lines = energy === "low" ? LOW_ENERGY_LINES : energy === "high" ? HIGH_ENERGY_LINES : NUDGE_LINES;
  const base = lines.indexOf(pick(lines, date));
  const line = lines[(base + done) % lines.length];
  return `${left} left${next}. ${line}`;
}
