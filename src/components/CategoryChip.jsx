import { useData } from "../lib/DataContext";

export default function CategoryChip({ id }) {
  const { categoriesById } = useData();
  const cat = categoriesById[id];
  if (!cat) return null;
  return (
    <span className="chip">
      <span className="dot" style={{ background: cat.color }} />
      {cat.name}
    </span>
  );
}
