import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { pb } from "./pb";
import { indexCompletions } from "./stats";

const DataContext = createContext(null);

const COLLECTIONS = ["categories", "blocks", "tasks", "completions", "rewards"];

const STARTER_CATEGORIES = [
  { name: "Fitness", color: "#FF8A65" },
  { name: "Career", color: "#7986CB" },
  { name: "Home", color: "#4DB6AC" },
  { name: "Relationships", color: "#F06292" },
  { name: "Learning", color: "#FFB74D" },
  { name: "Self-care", color: "#BA68C8" },
];

export function DataProvider({ user, children }) {
  const [state, setState] = useState({ categories: [], blocks: [], tasks: [], completions: [], rewards: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const seeded = useRef(false);

  const reload = useCallback(async () => {
    try {
      const lists = await Promise.all(
        COLLECTIONS.map((c) => pb.collection(c).getFullList({ sort: "created" }))
      );
      let next = Object.fromEntries(COLLECTIONS.map((c, i) => [c, lists[i]]));
      // New accounts get starter categories (guarded: StrictMode runs this effect twice).
      if (next.categories.length === 0 && !seeded.current) {
        seeded.current = true;
        next.categories = await Promise.all(
          STARTER_CATEGORIES.map((c) => pb.collection("categories").create({ ...c, user: user.id }))
        );
      }
      setState(next);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  useEffect(() => {
    reload();
  }, [reload]);

  const save = useCallback(
    async (collection, data, id) => {
      const record = id
        ? await pb.collection(collection).update(id, data)
        : await pb.collection(collection).create({ ...data, user: user.id });
      setState((s) => ({
        ...s,
        [collection]: id ? s[collection].map((r) => (r.id === id ? record : r)) : [...s[collection], record],
      }));
      return record;
    },
    [user.id]
  );

  const remove = useCallback(
    async (collection, id) => {
      await pb.collection(collection).delete(id);
      // Server-side cascades (block -> tasks -> completions) are mirrored by reloading.
      if (collection === "blocks" || collection === "tasks" || collection === "categories") return reload();
      setState((s) => ({ ...s, [collection]: s[collection].filter((r) => r.id !== id) }));
    },
    [reload]
  );

  const toggleTask = useCallback(
    async (task, date) => {
      const existing = state.completions.find(
        (c) => c.task === task.id && (c.date === date || (!task.block && !task.daily))
      );
      if (existing) return remove("completions", existing.id);
      return save("completions", { task: task.id, date, points: task.points || 0 });
    },
    [state.completions, save, remove]
  );

  const value = useMemo(() => {
    const categoriesById = Object.fromEntries(state.categories.map((c) => [c.id, c]));
    return {
      user,
      loading,
      error,
      reload,
      ...state,
      categoriesById,
      completionIndex: indexCompletions(state.completions),
      save,
      remove,
      toggleTask,
    };
  }, [user, loading, error, reload, state, save, remove, toggleTask]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  return useContext(DataContext);
}
