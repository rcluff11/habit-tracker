import { useEffect, useState } from "react";
import ColorPicker from "../components/ColorPicker";
import { pb } from "../lib/pb";
import { useData } from "../lib/DataContext";
import { DEFAULT_COLOR, PALETTES, isHex } from "../lib/colors";
import { disablePush, enablePush, isPushEnabled, pushSupport } from "../lib/push";
import { describeOffsets, userOffsets } from "../lib/reminders";
import OffsetPicker from "../components/OffsetPicker";

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
      <h2>Reminders</h2>
      <p className="small muted">
        Get notifications before calendar blocks and at task reminder times, even when Notch is closed. Turn this on
        for each device you want reminders on.
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
        {saveError && <p className="error">{saveError}</p>}
      </div>
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
    </div>
  );
}
