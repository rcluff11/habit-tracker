// Dates are local "YYYY-MM-DD" strings; times are minutes from midnight.

export const STEP = 15;

export function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseISODate(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function todayISO() {
  return toISODate(new Date());
}

export function addDays(iso, n) {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export function weekday(iso) {
  return parseISODate(iso).getDay();
}

// Weeks start on Monday.
export function startOfWeek(iso) {
  const day = weekday(iso);
  return addDays(iso, day === 0 ? -6 : 1 - day);
}

export function weekDates(weekStart) {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export function nowMinutes() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

export function formatTime(minutes) {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const suffix = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, "0")}${suffix}`;
}

export function formatRange(start, end) {
  return `${formatTime(start)} – ${formatTime(end)}`;
}

export function formatDate(iso, opts = { weekday: "short", month: "short", day: "numeric" }) {
  return parseISODate(iso).toLocaleDateString(undefined, opts);
}

export function snap(minutes) {
  return Math.round(minutes / STEP) * STEP;
}

// "HH:MM" <-> minutes, for <input type="time">.
export function toTimeInput(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function fromTimeInput(value) {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

export function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}
