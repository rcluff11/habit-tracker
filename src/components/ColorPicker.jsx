import { useState } from "react";
import { PALETTES, isHex } from "../lib/colors";
import { useData } from "../lib/DataContext";

// Swatches from the user's chosen palette, plus any hex code.
export default function ColorPicker({ value, onChange }) {
  const { user } = useData();
  const [hex, setHex] = useState(value || "");
  const palette = user.palette?.colors?.length ? user.palette.colors : PALETTES.Sunrise;

  const pick = (c) => {
    setHex(c);
    onChange(c);
  };

  return (
    <div className="swatches">
      {palette.map((c) => (
        <button
          key={c}
          type="button"
          className={`swatch ${value?.toLowerCase() === c.toLowerCase() ? "selected" : ""}`}
          style={{ background: c }}
          onClick={() => pick(c)}
          aria-label={`Color ${c}`}
        />
      ))}
      <input
        className="input hex-input"
        value={hex}
        placeholder="#hex"
        maxLength={7}
        onChange={(e) => {
          const v = e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`;
          setHex(v);
          if (isHex(v)) onChange(v);
        }}
      />
      <input
        type="color"
        aria-label="Custom color"
        value={isHex(value) && value.length === 7 ? value : "#7986cb"}
        onChange={(e) => pick(e.target.value)}
        style={{ width: 32, height: 32, border: 0, background: "none", padding: 0, cursor: "pointer" }}
      />
    </div>
  );
}
