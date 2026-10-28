import { REMINDER_OPTIONS, offsetLabel } from "../lib/reminders";

// Multi-select of reminder times (minutes before a block starts).
export default function OffsetPicker({ value, onChange, label = "Remind me" }) {
  const toggle = (m) => onChange(value.includes(m) ? value.filter((x) => x !== m) : [...value, m].sort((a, b) => b - a));
  return (
    <div className="row-wrap" role="group" aria-label={label}>
      {REMINDER_OPTIONS.map((m) => (
        <button
          type="button"
          key={m}
          className={`chip ${value.includes(m) ? "chip-active" : ""}`}
          aria-pressed={value.includes(m)}
          onClick={() => toggle(m)}
        >
          {offsetLabel(m)}
        </button>
      ))}
    </div>
  );
}
