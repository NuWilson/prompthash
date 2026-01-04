import { loadData, saveSettings, saveShortcuts } from "./storage.js";

const autoExpand = document.getElementById("auto-expand");
const autoFocus = document.getElementById("auto-focus");
const autoSend = document.getElementById("auto-send");
const storageArea = document.getElementById("storage-area");
const saveButton = document.getElementById("save-button");
const status = document.getElementById("status");

async function init() {
  const data = await loadData();
  autoExpand.checked = Boolean(data.settings.autoExpandOnSpace);
  autoFocus.checked = Boolean(data.settings.autoFocusAiInput);
  autoSend.checked = Boolean(data.settings.autoSend);
  storageArea.value = data.settings.storageArea || "sync";
}

async function save() {
  status.textContent = "";
  const current = await loadData();
  const settings = {
    autoExpandOnSpace: autoExpand.checked,
    autoFocusAiInput: autoFocus.checked,
    autoSend: autoSend.checked,
    storageArea: storageArea.value
  };
  await saveSettings(settings);
  if ((current.settings.storageArea || "sync") !== settings.storageArea) {
    await saveShortcuts(current.shortcuts);
  }
  status.textContent = "Settings saved.";
  setTimeout(() => {
    status.textContent = "";
  }, 2000);
}

saveButton.addEventListener("click", save);
init();
