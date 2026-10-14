const KEY = "myapple_state_v1";
async function load() {
  const r = await chrome.storage.local.get(KEY);
  const s = { enabled: true, dark: true, panelOpen: false, ...(r[KEY]||{}) };
  document.getElementById("enabled").checked = s.enabled;
  document.getElementById("dark").checked = s.dark;
  document.getElementById("panelOpen").checked = s.panelOpen;
}
document.getElementById("save").onclick = async () => {
  await chrome.storage.local.set({ [KEY]: {
    enabled: document.getElementById("enabled").checked,
    dark: document.getElementById("dark").checked,
    panelOpen: document.getElementById("panelOpen").checked
  }});
  window.close();
};
document.getElementById("open-mal").onclick = () => chrome.tabs.create({ url: "https://myanimelist.net/" });
load();
