import { ensureDefaults } from "./storage.js";

chrome.runtime.onInstalled.addListener(() => {
  ensureDefaults();
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "expand-shortcode") {
    return;
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    return;
  }
  chrome.tabs.sendMessage(tab.id, { type: "expand-shortcode", trigger: "command" });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "ping") {
    return;
  }
  sendResponse({ ok: true, tabId: sender.tab?.id || null });
});
