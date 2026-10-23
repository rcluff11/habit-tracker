export const PALETTES = {
  Sunrise: ["#FF8A65", "#FFB74D", "#FFD54F", "#F06292", "#BA68C8", "#4DB6AC"],
  Ocean: ["#4FC3F7", "#4DD0E1", "#4DB6AC", "#7986CB", "#9575CD", "#81C784"],
  Pastel: ["#F8BBD0", "#E1BEE7", "#C5CAE9", "#B3E5FC", "#C8E6C9", "#FFF9C4"],
  Earth: ["#A1887F", "#8D6E63", "#AED581", "#DCE775", "#FFB74D", "#90A4AE"],
  Bold: ["#E53935", "#FB8C00", "#FDD835", "#43A047", "#1E88E5", "#8E24AA"],
};

export const DEFAULT_COLOR = "#7986CB";

export function isHex(value) {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value);
}

// Pick black or white text for a background color.
export function textOn(hex) {
  if (!isHex(hex)) return "#1d1d1f";
  let h = hex.slice(1);
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? "#1d1d1f" : "#ffffff";
}
