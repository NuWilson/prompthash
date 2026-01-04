export const DEFAULT_SETTINGS = {
  autoExpandOnSpace: false,
  autoFocusAiInput: true,
  autoSend: false,
  storageArea: "sync"
};

export const DEFAULT_SHORTCUTS = [
  {
    name: "#investigate",
    template: "Investigate the topic below thoroughly. Provide sources, key findings, and open questions.\n\nTopic: {selection}{cursor}",
    tags: ["research"],
    favorite: true
  },
  {
    name: "#deconstruct",
    template: "Deconstruct the following claim into assumptions, evidence, and potential flaws.\n\nClaim: {selection}{cursor}",
    tags: ["analysis"],
    favorite: false
  },
  {
    name: "#summarise",
    template: "Summarise the following in 5 bullet points. Include key takeaways.\n\nText: {selection}{cursor}",
    tags: ["summary"],
    favorite: false
  },
  {
    name: "#counter",
    template: "Provide the strongest counter-argument to the following position.\n\nPosition: {selection}{cursor}",
    tags: ["debate"],
    favorite: false
  },
  {
    name: "#execute",
    template: "Turn this into a concrete action plan with steps, owners, and timelines.\n\nGoal: {selection}{cursor}",
    tags: ["planning"],
    favorite: false
  },
  {
    name: "#premortem",
    template: "Run a premortem. Assume the project failed and list the likely causes and mitigations.\n\nProject: {selection}{cursor}",
    tags: ["risk"],
    favorite: false
  },
  {
    name: "#simplify",
    template: "Simplify the following explanation for a beginner audience.\n\nText: {selection}{cursor}",
    tags: ["rewrite"],
    favorite: false
  },
  {
    name: "#brainstorm",
    template: "Brainstorm 10 creative ideas for the following prompt.\n\nPrompt: {selection}{cursor}",
    tags: ["ideation"],
    favorite: false
  },
  {
    name: "#rewrite",
    template: "Rewrite the following text in a clearer, more concise style.\n\nText: {selection}{cursor}",
    tags: ["rewrite"],
    favorite: false
  },
  {
    name: "#critique",
    template: "Critique the following output for accuracy, clarity, and completeness.\n\nOutput: {selection}{cursor}",
    tags: ["review"],
    favorite: false
  }
];

export function getStorageAreaByName(name) {
  if (name === "local") {
    return chrome.storage.local;
  }
  return chrome.storage.sync || chrome.storage.local;
}

export async function resolvePreferredStorageArea() {
  const syncAvailable = Boolean(chrome.storage.sync);
  const [localData, syncData] = await Promise.all([
    chrome.storage.local.get("settings"),
    syncAvailable ? chrome.storage.sync.get("settings") : Promise.resolve({})
  ]);
  const preferred =
    localData.settings?.storageArea ||
    syncData.settings?.storageArea ||
    (syncAvailable ? "sync" : "local");
  return getStorageAreaByName(preferred);
}

export async function loadData() {
  const area = await resolvePreferredStorageArea();
  const result = await area.get(["shortcuts", "settings"]);
  return {
    shortcuts: result.shortcuts?.length ? result.shortcuts : DEFAULT_SHORTCUTS,
    settings: { ...DEFAULT_SETTINGS, ...result.settings }
  };
}

export async function saveShortcuts(shortcuts) {
  const area = await resolvePreferredStorageArea();
  await area.set({ shortcuts });
}

export async function saveSettings(settings) {
  const merged = { ...DEFAULT_SETTINGS, ...settings };
  await Promise.all([
    chrome.storage.local.set({ settings: merged }),
    chrome.storage.sync ? chrome.storage.sync.set({ settings: merged }) : Promise.resolve()
  ]);
}

export async function ensureDefaults() {
  const area = await resolvePreferredStorageArea();
  const result = await area.get(["shortcuts", "settings"]);
  const updates = {};
  if (!result.shortcuts || !result.shortcuts.length) {
    updates.shortcuts = DEFAULT_SHORTCUTS;
  }
  if (!result.settings) {
    updates.settings = DEFAULT_SETTINGS;
  }
  if (Object.keys(updates).length) {
    await area.set(updates);
  }
}
