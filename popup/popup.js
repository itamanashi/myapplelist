// Popup MyAppleList — écriture instantanée, le content-script suit via onChanged.
// État partagé myapple_state_v1 : { enabled, dark, panelOpen, listView, density }.
const KEY = "myapple_state_v1";
const DEFAULTS = { enabled: true, dark: false, panelOpen: false, listView: "grid", density: "normal" };
const cleanView = (v) => (v === "table" ? "table" : "grid");
const cleanDensity = (d) => (d === "compact" ? "compact" : "normal");

const toggles = {
  enabled: document.getElementById("enabled"),
  dark: document.getElementById("dark"),
  panelOpen: document.getElementById("panelOpen"),
};
const segments = {
  listView: { grid: document.getElementById("view-grid"), table: document.getElementById("view-table") },
  density: { normal: document.getElementById("density-normal"), compact: document.getElementById("density-compact") },
};
const syncNote = document.getElementById("sync-note");

function applyTheme(dark) {
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

function paintSegments(s) {
  const view = cleanView(s.listView);
  segments.listView.grid.setAttribute("aria-pressed", String(view === "grid"));
  segments.listView.table.setAttribute("aria-pressed", String(view === "table"));
  const density = cleanDensity(s.density);
  segments.density.normal.setAttribute("aria-pressed", String(density === "normal"));
  segments.density.compact.setAttribute("aria-pressed", String(density === "compact"));
}

let syncTimer = null;
function flashSync() {
  syncNote.textContent = "✔ Appliqué";
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => { syncNote.textContent = ""; }, 1600);
}

async function save(patch) {
  const r = await chrome.storage.local.get(KEY);
  const next = { ...DEFAULTS, ...(r[KEY] || {}), ...patch };
  next.listView = cleanView(next.listView);
  next.density = cleanDensity(next.density);
  await chrome.storage.local.set({ [KEY]: next });
  flashSync();
  return next;
}

async function load() {
  const r = await chrome.storage.local.get(KEY);
  const s = { ...DEFAULTS, ...(r[KEY] || {}) };
  toggles.enabled.checked = !!s.enabled;
  toggles.dark.checked = !!s.dark;
  toggles.panelOpen.checked = !!s.panelOpen;
  paintSegments(s);
  applyTheme(s.dark);
}

for (const [name, input] of Object.entries(toggles)) {
  input.addEventListener("change", async () => {
    const s = await save({ [name]: input.checked });
    if (name === "dark") applyTheme(s.dark);
  });
}
for (const [key, buttons] of Object.entries(segments)) {
  for (const [value, btn] of Object.entries(buttons)) {
    btn.addEventListener("click", () => save({ [key]: value }).then(paintSegments));
  }
}

document.getElementById("open-mal").onclick = () => chrome.tabs.create({ url: "https://myanimelist.net/" });
load();
