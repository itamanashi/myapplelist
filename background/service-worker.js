const STATE_KEY = "myapple_state_v1";
const DEFAULTS = { enabled: true, dark: false, panelOpen: false, listView: "grid", density: "normal" };

chrome.runtime.onInstalled.addListener(async () => {
  // N'écrase jamais les réglages existants (install comme update).
  const stored = await chrome.storage.local.get(STATE_KEY);
  if (!stored[STATE_KEY]) {
    await chrome.storage.local.set({ [STATE_KEY]: DEFAULTS });
  }
  console.log("[myapplelist] installed");
});
