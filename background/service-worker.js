chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.local.set({ myapple_state_v1: { enabled: true, dark: true, panelOpen: false } });
  console.log("[myapplelist] installed");
});
