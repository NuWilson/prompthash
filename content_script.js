const DEFAULT_SETTINGS = {
  autoExpandOnSpace: false,
  autoFocusAiInput: true,
  autoSend: false,
  storageArea: "sync"
};

const AI_SITE_CONFIGS = [
  {
    match: /chat\.openai\.com|chatgpt\.com/,
    inputSelectors: ["textarea", "div[contenteditable='true']"],
    sendSelectors: ["button[data-testid='send-button']", "button[aria-label='Send']"]
  },
  {
    match: /claude\.ai/,
    inputSelectors: ["div[contenteditable='true']", "textarea"],
    sendSelectors: ["button[aria-label='Send']", "button[type='submit']"]
  },
  {
    match: /perplexity\.ai/,
    inputSelectors: ["textarea", "div[contenteditable='true']"],
    sendSelectors: ["button[aria-label='Submit']", "button[type='submit']"]
  },
  {
    match: /gemini\.google\.com/,
    inputSelectors: ["textarea", "div[contenteditable='true']"],
    sendSelectors: ["button[aria-label='Send']", "button[type='submit']"]
  }
];

let cachedSettings = { ...DEFAULT_SETTINGS };
let settingsLoaded = false;

async function loadSettings() {
  const syncAvailable = Boolean(chrome.storage.sync);
  const [localData, syncData] = await Promise.all([
    chrome.storage.local.get("settings"),
    syncAvailable ? chrome.storage.sync.get("settings") : Promise.resolve({})
  ]);
  cachedSettings = {
    ...DEFAULT_SETTINGS,
    ...syncData.settings,
    ...localData.settings
  };
  settingsLoaded = true;
  return cachedSettings;
}

function isEditableElement(element) {
  if (!element) {
    return false;
  }
  if (element.isContentEditable) {
    return true;
  }
  const tag = element.tagName?.toLowerCase();
  if (tag === "textarea") {
    return true;
  }
  if (tag === "input") {
    const type = element.type?.toLowerCase();
    return ["text", "search", "url", "email", "tel"].includes(type);
  }
  return false;
}

function getSiteConfig() {
  return AI_SITE_CONFIGS.find((config) => config.match.test(window.location.hostname));
}

function findAiInput() {
  const config = getSiteConfig();
  if (!config) {
    return null;
  }
  for (const selector of config.inputSelectors) {
    const candidate = document.querySelector(selector);
    if (candidate) {
      return candidate;
    }
  }
  return null;
}

function findSendButton() {
  const config = getSiteConfig();
  if (!config) {
    return null;
  }
  for (const selector of config.sendSelectors) {
    const button = document.querySelector(selector);
    if (button) {
      return button;
    }
  }
  return null;
}

function getActiveEditableElement() {
  const config = getSiteConfig();
  if (config) {
    const aiInput = findAiInput();
    if (aiInput) {
      return aiInput;
    }
  }
  const active = document.activeElement;
  if (isEditableElement(active)) {
    return active;
  }
  return null;
}

function fireInputEvent(element) {
  const event = typeof InputEvent !== "undefined"
    ? new InputEvent("input", { bubbles: true })
    : new Event("input", { bubbles: true });
  element.dispatchEvent(event);
}

function getTokenAtCursor(text, cursor, allowTrailingWhitespace = false) {
  let adjustedCursor = cursor;
  let trailingWhitespaceLength = 0;
  if (allowTrailingWhitespace) {
    const trailingWhitespace = text.slice(0, cursor).match(/\s+$/);
    trailingWhitespaceLength = trailingWhitespace ? trailingWhitespace[0].length : 0;
    adjustedCursor = cursor - trailingWhitespaceLength;
  }
  const textBefore = text.slice(0, adjustedCursor);
  const match = textBefore.match(/#[\w-]+$/);
  if (!match) {
    return null;
  }
  const token = match[0];
  return {
    token,
    start: adjustedCursor - token.length,
    end: adjustedCursor,
    trailingWhitespaceLength
  };
}

function getTextNodes(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  const nodes = [];
  while (walker.nextNode()) {
    nodes.push(walker.currentNode);
  }
  return nodes;
}

function getNodeForOffset(root, offset) {
  const nodes = getTextNodes(root);
  let remaining = offset;
  for (const node of nodes) {
    const length = node.nodeValue?.length || 0;
    if (remaining <= length) {
      return { node, offset: remaining };
    }
    remaining -= length;
  }
  return null;
}

async function resolveTemplateVariables(template) {
  let clipboardText = "";
  try {
    if (navigator.clipboard?.readText) {
      clipboardText = await navigator.clipboard.readText();
    }
  } catch (error) {
    clipboardText = "";
  }
  const selectionText = window.getSelection()?.toString() || "";
  const url = window.location.href;
  const title = document.title || "";
  return template
    .replaceAll("{clipboard}", clipboardText)
    .replaceAll("{selection}", selectionText)
    .replaceAll("{url}", url)
    .replaceAll("{title}", title);
}

async function resolvePreferredStorageArea() {
  const syncAvailable = Boolean(chrome.storage.sync);
  const [localData, syncData] = await Promise.all([
    chrome.storage.local.get("settings"),
    syncAvailable ? chrome.storage.sync.get("settings") : Promise.resolve({})
  ]);
  const preferred =
    localData.settings?.storageArea ||
    syncData.settings?.storageArea ||
    (syncAvailable ? "sync" : "local");
  return preferred === "local" ? chrome.storage.local : chrome.storage.sync || chrome.storage.local;
}

function applyCursorPlaceholder(resolvedTemplate) {
  const cursorIndex = resolvedTemplate.indexOf("{cursor}");
  const text = resolvedTemplate.replaceAll("{cursor}", "");
  const cursorOffset = cursorIndex === -1 ? text.length : cursorIndex;
  return { text, cursorOffset };
}

async function insertTemplateIntoElement(element, template, allowTrailingWhitespace = false) {
  const resolvedTemplate = await resolveTemplateVariables(template);
  const { text, cursorOffset } = applyCursorPlaceholder(resolvedTemplate);

  if (element.isContentEditable) {
    const selection = window.getSelection();
    if (!selection) {
      return { ok: false, error: "No selection in editable element." };
    }
    if (selection.rangeCount === 0 || !element.contains(selection.anchorNode)) {
      const range = document.createRange();
      range.selectNodeContents(element);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    const range = selection.getRangeAt(0);
    const editableRoot = element;
    const preRange = range.cloneRange();
    preRange.collapse(true);
    preRange.setStart(editableRoot, 0);
    const preText = preRange.toString();
    const tokenInfo = getTokenAtCursor(preText, preText.length, allowTrailingWhitespace);
    if (!tokenInfo) {
      return { ok: false, error: "No shortcode found near cursor." };
    }
    const startInfo = getNodeForOffset(editableRoot, tokenInfo.start);
    const endInfo = getNodeForOffset(editableRoot, tokenInfo.end);
    if (!startInfo || !endInfo) {
      return { ok: false, error: "Unable to resolve caret position." };
    }
    const replaceRange = document.createRange();
    replaceRange.setStart(startInfo.node, startInfo.offset);
    replaceRange.setEnd(endInfo.node, endInfo.offset);
    replaceRange.deleteContents();

    const textNode = document.createTextNode(text);
    replaceRange.insertNode(textNode);

    const newRange = document.createRange();
    newRange.setStart(textNode, Math.min(cursorOffset, text.length));
    newRange.setEnd(textNode, Math.min(cursorOffset, text.length));
    selection.removeAllRanges();
    selection.addRange(newRange);

    fireInputEvent(element);
    return { ok: true };
  }

  if (typeof element.selectionStart !== "number") {
    return { ok: false, error: "Editable element does not support cursor selection." };
  }
  const value = element.value;
  const cursor = element.selectionStart;
  const tokenInfo = getTokenAtCursor(value, cursor, allowTrailingWhitespace);
  if (!tokenInfo) {
    return { ok: false, error: "No shortcode found near cursor." };
  }
  const nextValue = `${value.slice(0, tokenInfo.start)}${text}${value.slice(tokenInfo.end)}`;
  element.value = nextValue;
  const newCursor = tokenInfo.start + cursorOffset;
  element.setSelectionRange(newCursor, newCursor);
  fireInputEvent(element);
  return { ok: true };
}

async function insertTemplateAtCursor(element, template) {
  const resolvedTemplate = await resolveTemplateVariables(template);
  const { text, cursorOffset } = applyCursorPlaceholder(resolvedTemplate);

  if (element.isContentEditable) {
    const selection = window.getSelection();
    if (!selection) {
      return { ok: false, error: "No selection in editable element." };
    }
    if (selection.rangeCount === 0 || !element.contains(selection.anchorNode)) {
      const range = document.createRange();
      range.selectNodeContents(element);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    const range = selection.getRangeAt(0);
    range.deleteContents();
    const textNode = document.createTextNode(text);
    range.insertNode(textNode);
    const newRange = document.createRange();
    newRange.setStart(textNode, Math.min(cursorOffset, text.length));
    newRange.setEnd(textNode, Math.min(cursorOffset, text.length));
    selection.removeAllRanges();
    selection.addRange(newRange);
    fireInputEvent(element);
    return { ok: true };
  }

  if (typeof element.selectionStart !== "number") {
    return { ok: false, error: "Editable element does not support cursor selection." };
  }
  const value = element.value || "";
  const start = element.selectionStart;
  const end = element.selectionEnd ?? start;
  element.value = `${value.slice(0, start)}${text}${value.slice(end)}`;
  const newCursor = start + cursorOffset;
  element.setSelectionRange(newCursor, newCursor);
  fireInputEvent(element);
  return { ok: true };
}

async function loadShortcuts() {
  const storageArea = await resolvePreferredStorageArea();
  const data = await storageArea.get("shortcuts");
  return data.shortcuts || [];
}

function findShortcutByName(shortcuts, name) {
  return shortcuts.find((shortcut) => shortcut.name === name) || null;
}

function showToast(message) {
  let toast = document.getElementById("prompt-hash-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "prompt-hash-toast";
    toast.style.position = "fixed";
    toast.style.bottom = "20px";
    toast.style.right = "20px";
    toast.style.zIndex = "999999";
    toast.style.background = "#1f2933";
    toast.style.color = "#fff";
    toast.style.padding = "10px 14px";
    toast.style.borderRadius = "8px";
    toast.style.fontSize = "12px";
    toast.style.boxShadow = "0 4px 10px rgba(0, 0, 0, 0.2)";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.style.opacity = "1";
  setTimeout(() => {
    if (toast) {
      toast.style.opacity = "0";
    }
  }, 2200);
}

async function expandShortcut({ name, allowTrailingWhitespace = false } = {}) {
  if (!settingsLoaded) {
    await loadSettings();
  }
  const element = getActiveEditableElement();
  if (!element) {
    return { ok: false, error: "Click into a text field first." };
  }
  if (cachedSettings.autoFocusAiInput && element !== document.activeElement) {
    element.focus();
  }
  const shortcuts = await loadShortcuts();
  let shortcut = null;
  if (name) {
    shortcut = findShortcutByName(shortcuts, name);
  } else {
    let tokenInfo = null;
    if (element.isContentEditable) {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0).cloneRange();
        range.collapse(true);
        range.setStart(element, 0);
        const preText = range.toString();
        tokenInfo = getTokenAtCursor(preText, preText.length, allowTrailingWhitespace);
      }
    } else {
      const value = element.value || "";
      const cursor = element.selectionStart || 0;
      tokenInfo = getTokenAtCursor(value, cursor, allowTrailingWhitespace);
    }
    if (!tokenInfo) {
      return { ok: false, error: "No shortcode found near cursor." };
    }
    shortcut = findShortcutByName(shortcuts, tokenInfo.token);
  }
  if (!shortcut) {
    return { ok: false, error: name ? `No shortcut found for ${name}.` : "No shortcut found." };
  }
  const result = name
    ? await insertTemplateAtCursor(element, shortcut.template)
    : await insertTemplateIntoElement(element, shortcut.template, allowTrailingWhitespace);
  if (!result.ok) {
    return result;
  }
  if (cachedSettings.autoSend) {
    const sendButton = findSendButton();
    if (sendButton) {
      sendButton.click();
    }
  }
  return { ok: true };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message) {
    return;
  }
  if (message.type === "expand-shortcode") {
    expandShortcut({ allowTrailingWhitespace: false }).then(sendResponse);
    return true;
  }
  if (message.type === "insert-shortcut") {
    expandShortcut({ name: message.name, allowTrailingWhitespace: false }).then(sendResponse);
    return true;
  }
  if (message.type === "auto-expand") {
    expandShortcut({ allowTrailingWhitespace: true }).then(sendResponse);
    return true;
  }
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.settings) {
    cachedSettings = { ...DEFAULT_SETTINGS, ...changes.settings.newValue };
  }
});

function shouldAutoExpand(event) {
  if (!cachedSettings.autoExpandOnSpace) {
    return false;
  }
  return event.key === " " || event.key === "Enter";
}

document.addEventListener("keyup", (event) => {
  if (!settingsLoaded) {
    loadSettings();
  }
  if (!shouldAutoExpand(event)) {
    return;
  }
  const element = getActiveEditableElement();
  if (!element || element !== document.activeElement) {
    return;
  }
  expandShortcut({ allowTrailingWhitespace: true }).then((result) => {
    if (!result.ok && result.error && result.error !== "No shortcode found near cursor.") {
      showToast(result.error);
    }
  });
});
