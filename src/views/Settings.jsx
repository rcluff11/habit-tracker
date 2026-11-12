import { useEffect, useRef, useState } from "react";
import ColorPicker from "../components/ColorPicker";
import { pb } from "../lib/pb";
import { useData } from "../lib/DataContext";
import { DEFAULT_COLOR, PALETTES, isHex } from "../lib/colors";
import { disablePush, enablePush, isPushEnabled, pushSupport } from "../lib/push";
import { DEFAULT_DAY_END, EARLIEST_DAY_END, dayEndMinutes, describeOffsets, nudgeTimesFor, userOffsets } from "../lib/reminders";
import { formatTime } from "../lib/time";
import OffsetPicker from "../components/OffsetPicker";
import NudgeTimesPicker from "../components/NudgeTimesPicker";

const DEFAULT_AFFIRMATION = "08:00";

// One optimistic user field with a last-write-wins queue. set() shows the value at once and saves it. An edit made
// while a save is in flight replaces any earlier queued edit and is saved when the current save settles, so nothing is
// dropped, nothing saves twice, and a failure rolls back to the last server-confirmed value only if nothing newer is queued.
// No `disabled` is used, so keyboard focus is never lost. set() resolves to true (saved) or false (failed).
const NONE = Symbol("none");
function useUserField(user, field, initial) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const latest = useRef(initial); // what the UI shows (optimistic)
  const confirmed = useRef(initial); // what the server last accepted
  const pending = useRef(NONE);
  const running = useRef(null);
  const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);

  const drain = async () => {
    let ok = true;
    while (pending.current !== NONE) {
      const next = pending.current;
      pending.current = NONE;
      if (same(next, confirmed.current)) {
        ok = true;
        continue;
      }
      try {
        await pb.collection("users").update(user.id, { [field]: next });
        confirmed.current = next;
        ok = true;
      } catch (err) {
        ok = false;
        if (pending.current === NONE) {
          latest.current = confirmed.current;
          setValue(confirmed.current);
          setError(err.response?.data?.[field]?.message || err.message || "Couldn't save. Try again.");
        }
      }
    }
    return ok;
  };

  const set = (next) => {
    if (same(next, latest.current)) return running.current ?? Promise.resolve(true);
    latest.current = next;
    pending.current = next;
    setValue(next);
    setError("");
    if (!running.current) {
      setBusy(true);
      running.current = drain().finally(() => {
        running.current = null;
        setBusy(false);
      });
    }
    return running.current;
  };
  return { value, set, error, busy, latest: () => latest.current };
}

function AffirmationField({ user }) {
  const field = useUserField(user, "affirmationAt", user.affirmationAt || "");
  const [draft, setDraft] = useState(user.affirmationAt || DEFAULT_AFFIRMATION);
  const draftRef = useRef(draft);
  const timer = useRef(null);
  const lastTime = useRef(user.affirmationAt || DEFAULT_AFFIRMATION);
  useEffect(() => () => clearTimeout(timer.current), []);
  const on = field.value !== "";
  if (field.value) lastTime.current = field.value;

  const toggle = async (checked) => {
    clearTimeout(timer.current);
    // Turning on restores the last non-empty time (else the default), never a stale draft.
    const time = lastTime.current;
    if (checked) {
      draftRef.current = time;
      setDraft(time);
    }
    await field.set(checked ? time : "");
  };
  const commit = async (next) => {
    clearTimeout(timer.current);
    if (!/^\d{2}:\d{2}$/.test(next)) {
      const back = field.latest() || DEFAULT_AFFIRMATION;
      draftRef.current = back;
      setDraft(back);
      return;
    }
    const ok = await field.set(next);
    // Only revert the draft if the user hasn't typed something newer meanwhile.
    if (!ok && draftRef.current === next && field.latest()) {
      draftRef.current = field.latest();
      setDraft(field.latest());
    }
  };
  const onChange = (e) => {
    const next = e.target.value;
    draftRef.current = next;
    setDraft(next);
    clearTimeout(timer.current);
    if (on && /^\d{2}:\d{2}$/.test(next)) timer.current = setTimeout(() => commit(next), 600);
  };

  return (
    <div className="field" aria-busy={field.busy}>
      <label className="check">
        <input type="checkbox" checked={on} onChange={(e) => toggle(e.target.checked)} />
        <span>Daily affirmation</span>
      </label>
      {on && (
        <div className="row-wrap nudge-add">
          <label htmlFor="affirmation-at" className="small">Send at</label>
          <input
            id="affirmation-at"
            className="input day-end-input"
            type="time"
            value={draft}
            onChange={onChange}
            onBlur={(e) => commit(e.target.value)}
          />
        </div>
      )}
      <p className="small muted">A short encouraging line each morning, the same one you see on Home.</p>
      {field.error && <p className="error" role="alert">{field.error}</p>}
    </div>
  );
}

function NudgeField({ user }) {
  const field = useUserField(user, "nudgeTimes", nudgeTimesFor(user));
  return <NudgeTimesPicker value={field.value} onChange={field.set} error={field.error} busy={field.busy} />;
}

function Reminders() {
  const { user } = useData();
  const support = pushSupport();
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [defaults, setDefaults] = useState(() => userOffsets(user));
  const [saveError, setSaveError] = useState("");

  const changeDefaults = async (next) => {
    const previous = defaults;
    setDefaults(next);
    setSaveError("");
    try {
      await pb.collection("users").update(user.id, { remindBefore: next });
    } catch (err) {
      setDefaults(previous);
      setSaveError(err.message);
    }
  };

  useEffect(() => {
    isPushEnabled().then(setEnabled).catch(() => setEnabled(false));
  }, []);

  // Browsers only show the permission prompt in response to a tap, so this runs from a button.
  const toggle = async () => {
    setBusy(true);
    setMessage("");
    try {
      if (enabled) {
        await disablePush();
        setEnabled(false);
        setMessage("Reminders are off on this device.");
      } else {
        await enablePush();
        setEnabled(true);
        setMessage("You're set! Reminders will arrive on this device.");
      }
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card form">
      <h2>Notifications</h2>
      <p className="small muted">
        Get notifications before calendar blocks, at task reminder times, and for affirmations and nudges, even when
        Notch is closed. Turn this on for each device you want notifications on.
      </p>
      {support.supported ? (
        <button className={`btn ${enabled ? "" : "btn-primary"}`} onClick={toggle} disabled={busy}>
          {busy ? "One moment…" : enabled ? "Turn off reminders" : "Turn on reminders"}
        </button>
      ) : (
        <p className="small">{support.reason}</p>
      )}
      {message && <p className="small" role="status">{message}</p>}

      <div className="field">
        <span>Default block reminders</span>
        <OffsetPicker value={defaults} onChange={changeDefaults} label="Default block reminders" />
        <p className="small muted">
          {defaults.length ? `Blocks remind you ${describeOffsets(defaults)}.` : "Blocks won't remind you unless you set it on the block."}{" "}
          You can change this for any block.
        </p>
        {saveError && <p className="error" role="alert">{saveError}</p>}
      </div>

      <AffirmationField user={user} />
      <NudgeField user={user} />
    </div>
  );
}

function DayEndPush({ user }) {
  const field = useUserField(user, "dayEndPush", user.dayEndPush === true);
  return (
    <div className="field" aria-busy={field.busy}>
      <label className="check">
        <input type="checkbox" checked={field.value} onChange={(e) => field.set(e.target.checked)} />
        <span>Send my day-end score</span>
      </label>
      <p className="small muted">A notification at the time above with your score and a closing line.</p>
      {field.error && <p className="error" role="alert">{field.error}</p>}
    </div>
  );
}

function DayEnd() {
  const { user } = useData();
  // Same last-write-wins queue as the other fields: it compares against the value being saved, not the saved one.
  const field = useUserField(user, "dayEndAt", user.dayEndAt || "");
  const [draft, setDraft] = useState(user.dayEndAt || DEFAULT_DAY_END);
  const draftRef = useRef(draft);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const showDraft = (v) => {
    draftRef.current = v;
    setDraft(v);
  };

  // Saving updates the auth store record, which App passes down as `user`, so Home sees it at once.
  const commit = async (next) => {
    clearTimeout(timer.current);
    if (!next) {
      showDraft(field.latest() || DEFAULT_DAY_END);
      return;
    }
    const ok = await field.set(next);
    // Only revert the draft if the user hasn't typed something newer meanwhile.
    if (!ok && draftRef.current === next) showDraft(field.latest() || DEFAULT_DAY_END);
  };

  const reset = async () => {
    clearTimeout(timer.current);
    showDraft(DEFAULT_DAY_END);
    const ok = await field.set("");
    if (!ok && draftRef.current === DEFAULT_DAY_END) showDraft(field.latest() || DEFAULT_DAY_END);
  };

  const onChange = (e) => {
    const next = e.target.value;
    showDraft(next);
    clearTimeout(timer.current);
    // A complete HH:MM saves after a short pause; the blur save below still covers everything else.
    if (/^\d{2}:\d{2}$/.test(next)) timer.current = setTimeout(() => commit(next), 600);
  };
  const onBlur = (e) => commit(e.target.value);

  return (
    <div className="card form">
      <h2>End of day</h2>
      <label className="field" htmlFor="day-end-at">
        <span>Day ends at</span>
      </label>
      <div className="row row-wrap">
        <input
          id="day-end-at"
          className="input day-end-input"
          type="time"
          min={EARLIEST_DAY_END}
          value={draft}
          aria-busy={field.busy}
          onChange={onChange}
          onBlur={onBlur}
          aria-describedby={field.error ? "day-end-help day-end-error" : "day-end-help"}
        />
        <button className="btn btn-sm" type="button" onClick={reset} disabled={field.value === "" && draft === DEFAULT_DAY_END}>
          Reset to default
        </button>
      </div>
      <p id="day-end-help" className="small muted">
        The end-of-day score card appears on Home after this time. Pick {formatTime(dayEndMinutes({ dayEndAt: EARLIEST_DAY_END }))} or later. Default is {formatTime(dayEndMinutes({}))}.
      </p>
      {field.error && <p id="day-end-error" className="error" role="alert">{field.error}</p>}
      <DayEndPush user={user} />
    </div>
  );
}

function CategoryRow({ category }) {
  const { save, remove } = useData();
  const [name, setName] = useState(category.name);
  const [open, setOpen] = useState(false);

  return (
    <li className="task" style={{ flexWrap: "wrap" }}>
      <button
        className="swatch"
        style={{ background: category.color }}
        onClick={() => setOpen(!open)}
        aria-label={`Change ${category.name} color`}
      />
      <input
        className="input"
        style={{ flex: 1, minWidth: 120 }}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name.trim() && name !== category.name && save("categories", { name: name.trim() }, category.id)}
        aria-label="Category name"
      />
      <button className="icon-btn" onClick={() => remove("categories", category.id)} aria-label={`Delete ${category.name}`}>
        ✕
      </button>
      {open && (
        <div style={{ width: "100%", paddingLeft: 40 }}>
          <ColorPicker value={category.color} onChange={(color) => save("categories", { color }, category.id)} />
        </div>
      )}
    </li>
  );
}

export default function Settings() {
  const { user, categories, save } = useData();
  const [name, setName] = useState(user.name || "");
  const [newCat, setNewCat] = useState({ name: "", color: DEFAULT_COLOR });
  const [customHex, setCustomHex] = useState("");
  const palette = user.palette || { name: "Sunrise", colors: PALETTES.Sunrise };

  const updateUser = (data) => pb.collection("users").update(user.id, data);
  const setPalette = (next) => updateUser({ palette: next });

  const addCategory = async (e) => {
    e.preventDefault();
    if (!newCat.name.trim()) return;
    await save("categories", { name: newCat.name.trim(), color: newCat.color });
    setNewCat({ name: "", color: newCat.color });
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>Settings</h1>
      </div>

      <div className="grid-2">
        <div className="card form">
          <h2>Profile</h2>
          <label className="field">
            <span>Name (used in your greeting)</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => updateUser({ name })} />
          </label>
          <p className="small muted">Signed in as {user.email}</p>
          <button
            className="btn"
            onClick={async () => {
              // Stop this device getting the old account's reminders.
              await disablePush().catch(() => {});
              pb.authStore.clear();
            }}
          >
            Log out
          </button>
        </div>

        <Reminders />

        <DayEnd />

        <div className="card form">
          <h2>Color palette</h2>
          <p className="small muted">These colors appear as swatches whenever you pick a color. Any hex code works too.</p>
          <div className="form">
            {Object.entries(PALETTES).map(([pname, colors]) => (
              <button
                key={pname}
                className={`btn spread ${palette.name === pname ? "chip-active" : ""}`}
                style={{ borderRadius: 12 }}
                onClick={() => setPalette({ name: pname, colors })}
              >
                <span>{pname}</span>
                <span className="row" style={{ gap: 4 }}>
                  {colors.map((c) => <span key={c} className="dot" style={{ background: c, width: 14, height: 14 }} />)}
                </span>
              </button>
            ))}
          </div>
          <div className="field">
            <span>Custom palette</span>
            <div className="swatches">
              {palette.name === "Custom" &&
                palette.colors.map((c) => (
                  <button
                    key={c}
                    className="swatch"
                    style={{ background: c }}
                    title={`Remove ${c}`}
                    onClick={() => setPalette({ name: "Custom", colors: palette.colors.filter((x) => x !== c) })}
                  />
                ))}
              <input
                className="input hex-input"
                placeholder="#A1B2C3"
                value={customHex}
                onChange={(e) => setCustomHex(e.target.value)}
              />
              <button
                className="btn btn-sm"
                disabled={!isHex(customHex)}
                onClick={() => {
                  const base = palette.name === "Custom" ? palette.colors : [];
                  setPalette({ name: "Custom", colors: [...base, customHex.toUpperCase()] });
                  setCustomHex("");
                }}
              >
                Add color
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Categories</h2>
          <span className="small muted">Points are tracked separately for each category</span>
        </div>
        <ul className="task-list">
          {categories.map((c) => <CategoryRow key={c.id} category={c} />)}
        </ul>
        <form className="form" style={{ marginTop: 14 }} onSubmit={addCategory}>
          <div className="row">
            <input
              className="input"
              placeholder="New category (e.g. Faith, School)"
              value={newCat.name}
              onChange={(e) => setNewCat({ ...newCat, name: e.target.value })}
            />
            <button className="btn btn-primary">Add</button>
          </div>
          <ColorPicker value={newCat.color} onChange={(color) => setNewCat({ ...newCat, color })} />
        </form>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Quick access</h2>
          <span className="small muted">Jump straight to "Next 3 hours"</span>
        </div>
        <ul className="small quick-access">
          <li><strong>Android:</strong> long-press the Notch app icon, then tap "Next 3 hours".</li>
          <li><strong>Desktop (Chrome or Edge):</strong> right-click the Notch app icon in the taskbar, dock, or Start menu, then choose "Next 3 hours".</li>
          <li><strong>iPhone and iPad:</strong> iOS doesn't support app shortcuts. Use the "Open →" link on Home instead.</li>
        </ul>
        <p className="small muted quick-access-note">
          The shortcut appears after the app updates, or after you reinstall it.
        </p>
      </div>
    </div>
  );
}
