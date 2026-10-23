import { Fragment, useEffect, useState } from "react";
import { pb } from "./lib/pb";
import { DataProvider, useData } from "./lib/DataContext";
import Auth from "./views/Auth";
import Home from "./views/Home";
import Calendar from "./views/Calendar";
import Tasks from "./views/Tasks";
import Progress from "./views/Progress";
import Settings from "./views/Settings";

const VIEWS = [
  { id: "home", label: "Home", icon: "☀", component: Home },
  { id: "calendar", label: "Calendar", icon: "▦", component: Calendar },
  { id: "tasks", label: "To-do", icon: "✓", component: Tasks },
  { id: "progress", label: "Progress", icon: "↗", component: Progress },
  { id: "settings", label: "Settings", icon: "⚙", component: Settings },
];

function useHashView() {
  const read = () => {
    const id = window.location.hash.slice(1);
    return VIEWS.some((v) => v.id === id) ? id : "home";
  };
  const [view, setView] = useState(read);
  useEffect(() => {
    const onHash = () => setView(read());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return [view, (id) => (window.location.hash = id)];
}

function Shell() {
  const { loading, error } = useData();
  const [view, go] = useHashView();
  const Current = VIEWS.find((v) => v.id === view).component;

  return (
    <div className="app">
      <nav className="nav">
        <div className="nav-brand">Dayline</div>
        {VIEWS.map((v, i) => (
          <Fragment key={v.id}>
            {i === VIEWS.length - 1 && <div className="nav-spacer" />}
            <button
              className={`nav-item ${view === v.id ? "active" : ""}`}
              onClick={() => go(v.id)}
              aria-current={view === v.id ? "page" : undefined}
            >
              <span className="nav-icon" aria-hidden="true">{v.icon}</span>
              {v.label}
            </button>
          </Fragment>
        ))}
      </nav>
      <main className="main">
        {error && <p className="error">Couldn't reach the server: {error}</p>}
        {loading ? <p className="muted">Loading…</p> : <Current go={go} />}
      </main>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(pb.authStore.record);

  useEffect(() => pb.authStore.onChange((_, record) => setUser(record)), []);

  if (!user) return <Auth />;
  return (
    <DataProvider user={user} key={user.id}>
      <Shell />
    </DataProvider>
  );
}
