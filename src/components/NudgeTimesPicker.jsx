import { useState } from "react";
import { MAX_NUDGES, NUDGE_PRESETS, NUDGE_STEP, cleanNudgeTimes } from "../lib/reminders";
import { formatTime, fromTimeInput, snap, toTimeInput } from "../lib/time";

const PRESET_LABELS = { light: "Light", regular: "Regular", frequent: "Frequent" };
const sameTimes = (a, b) => a.length === b.length && a.every((m, i) => m === b[i]);

/**
 * Controlled editor for progress-nudge times.
 * value: sorted array of minutes since midnight ([] = nudges off).
 * onChange(next): called with a cleaned array; returns a promise of true (saved) or false (failed and rolled back).
 * error: inline message from the parent's save, shown with role="alert".
 */
export default function NudgeTimesPicker({ value, onChange, error = "", busy = false }) {
  const [draft, setDraft] = useState("18:00");
  const [draftError, setDraftError] = useState("");
  const on = value.length > 0;
  const full = value.length >= MAX_NUDGES;

  // Removing the focused chip would drop focus to <body>, so move it to the neighbouring chip's ✕ (next, else
  // previous), or to the time input when none remain. Runs after render so the target exists.
  const remove = (m) => {
    const i = value.indexOf(m);
    const neighbour = value[i + 1] ?? value[i - 1];
    onChange(value.filter((x) => x !== m));
    setTimeout(() => {
      const el =
        neighbour !== undefined
          ? document.querySelector(`[data-nudge-remove="${neighbour}"]`)
          : document.getElementById("nudge-add-time");
      // Removing the last time turns nudges off and hides the input, so fall back to the checkbox.
      (el || document.getElementById("nudge-toggle"))?.focus();
    }, 0);
  };

  const add = async () => {
    setDraftError("");
    if (!/^\d{2}:\d{2}$/.test(draft)) {
      setDraftError("Pick a time to add.");
      return;
    }
    const minutes = Math.min(snap(fromTimeInput(draft)), 1440 - NUDGE_STEP);
    if (value.includes(minutes)) {
      setDraftError(`${formatTime(minutes)} is already in the list.`);
      return;
    }
    const next = cleanNudgeTimes([...value, minutes]);
    if (!next) {
      setDraftError("That time can't be added.");
      return;
    }
    const ok = await onChange(next);
    if (ok) setDraft(toTimeInput(minutes));
  };

  return (
    <div className="nudges" aria-busy={busy}>
      <label className="check">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => onChange(e.target.checked ? NUDGE_PRESETS.regular : [])}
          id="nudge-toggle"
          aria-describedby="nudge-help"
        />
        <span>Progress nudges</span>
      </label>
      <p id="nudge-help" className="small muted">
        A short check-in on how your day is going, at the times you choose.
      </p>

      {on && (
        <>
          <div className="row-wrap" role="group" aria-label="Nudge presets">
            {Object.entries(NUDGE_PRESETS).map(([key, times]) => (
              <button
                key={key}
                type="button"
                className={`btn btn-sm ${sameTimes(value, times) ? "chip-active" : ""}`}
                aria-pressed={sameTimes(value, times)}
                onClick={() => onChange([...times])}
              >
                {PRESET_LABELS[key]}
              </button>
            ))}
          </div>

          <ul className="nudge-list" aria-label="Nudge times">
            {value.map((m) => (
              <li key={m} className="chip">
                <span>{formatTime(m)}</span>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Remove ${formatTime(m)}`}
                  data-nudge-remove={m}
                  onClick={() => remove(m)}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>

          <div className="row-wrap nudge-add">
            <label htmlFor="nudge-add-time" className="small">Add time</label>
            <input
              id="nudge-add-time"
              className="input day-end-input"
              type="time"
              step={NUDGE_STEP * 60}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-describedby={full ? "nudge-limit" : undefined}
            />
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => !full && add()}
              aria-disabled={full}
              aria-describedby={full ? "nudge-limit" : undefined}
              style={full ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
            >
              Add
            </button>
          </div>
          {full && (
            <p id="nudge-limit" className="small muted">
              You can have up to {MAX_NUDGES} nudge times. Remove one to add another.
            </p>
          )}
          {draftError && <p className="error" role="alert">{draftError}</p>}
        </>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
