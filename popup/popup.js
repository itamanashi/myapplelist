const KEY = "myapple_state_v1";
const DEFAULTS = { enabled: true, dark: false, panelOpen: false };

const els = {
  enabled: document.getElementById("enabled"),
  dark: document.getElementById("dark"),
  panelOpen: document.getElementById("panelOpen"),
};

function applyTheme(dark) {
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

async function load() {
  const r = await chrome.storage.local.get(KEY);
  const s = { ...DEFAULTS, ...(r[KEY] || {}) };
  els.enabled.checked = s.enabled;
  els.dark.checked = s.dark;
  els.panelOpen.checked = s.panelOpen;
  applyTheme(s.dark);
}

// Application immédiate : pas de bouton valider, le content-script suit via onChanged.
for (const [name, el] of Object.entries(els)) {
  el.addEventListener("change", async () => {
    const r = await chrome.storage.local.get(KEY);
    const next = { ...DEFAULTS, ...(r[KEY] || {}), [name]: el.checked };
    await chrome.storage.local.set({ [KEY]: next });
    if (name === "dark") applyTheme(el.checked);
  });
}

document.getElementById("open-mal").onclick = () => chrome.tabs.create({ url: "https://myanimelist.net/" });
load();
