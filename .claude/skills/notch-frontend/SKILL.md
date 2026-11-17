---
name: notch-frontend
description: "[frontend-engineer] Notch client conventions: React 19 + Vite JSX, DataContext, styles, PWA."
user-invocable: false
---
# Notch — Frontend checklist

- **Data:** every read and write goes through `useData()` from `src/lib/DataContext.jsx` (`save`, `remove`, `toggleTask`, `schedule`). Don't call `pb.collection(...)` directly from views. Don't keep a second copy of server state.
- **Derived values** come from `src/lib/stats.js` at render time, never from stored fields. Stepped items use `activeWindow()`, never `task.date` or `block.date`.
- **Time and dates** go through `src/lib/time.js` (ISO dates, minutes ↔ "6:00 AM", 15-minute snap). Don't use raw `toLocaleDateString` maths and don't do UTC/local mix-ups.
- **Styles:** reuse the classes and CSS variables in `src/styles.css`. Add only view-specific CSS. Every new colour needs a dark-mode value.
- **Dependencies:** ask the owner before adding any.
- **PWA:** `public/sw.js` and `public/manifest.*`. When cached assets change, bump the cache version. Push click handling must open in-app routes only.
- **Errors:** a failed save shows an inline error (see the task toggle pattern) and never fails silently.
- **Check at 375px wide and in dark mode** for every view you touch: Home, Now (`#now`), Calendar, Tasks, Progress, Settings, Auth.
- Run `npm run build`. It must finish with no warnings you introduced.
