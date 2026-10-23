const state = {
    version: 1,
    categories: [],
    blocks: [],
    tasks: [],
    rewards: [],
    settings: { userName:"", palette: [], notifications: {} }
};

const ui = { currentView: "home", selectedDate: "" };

function save() {
    localStorage.setItem("myApp", JSON.stringify({ state}))
};

function load() {
    const raw = localStorage.getItem("myApp");
    if (!raw) return null;
    return JSON.parse(raw);
}