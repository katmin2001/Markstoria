const SETTINGS_KEY = "bookmarkLensSettings";
const META_KEY = "bookmarkLensMeta";

const MESSAGES = {
  vi: {
    saved: "Đã lưu bookmark",
    duplicate: "Bookmark này đã tồn tại",
    unsupported: "Tab này không thể lưu",
    error: "Không thể lưu bookmark",
    shortcutHint: "Nếu không thấy phím tắt chạy, kiểm tra chrome://extensions/shortcuts.",
  },
  en: {
    saved: "Bookmark saved",
    duplicate: "This bookmark already exists",
    unsupported: "This tab cannot be saved",
    error: "Could not save bookmark",
    shortcutHint: "If the shortcut does not run, check chrome://extensions/shortcuts.",
  },
};

function callChrome(apiCall) {
  return new Promise((resolve, reject) => {
    apiCall((result) => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(result);
    });
  });
}

async function getDefaultFolderId() {
  const stored = await loadSettings();
  if (stored.lastFolderId) return stored.lastFolderId;
  const tree = await callChrome((done) => chrome.bookmarks.getTree(done));
  return tree[0]?.children?.[1]?.id || tree[0]?.children?.[0]?.id || "1";
}

function normalizeText(value = "") {
  return String(value).toLocaleLowerCase("vi").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function getDomain(value = "") {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return String(value);
  }
}

async function loadSettings() {
  const defaults = { lastFolderId: null, language: "vi", syncEnabled: false, autoOrganizeNew: false, autoRules: [] };
  const local = await callChrome((done) => chrome.storage.local.get([SETTINGS_KEY], done));
  const localSettings = { ...defaults, ...local[SETTINGS_KEY] };
  if (!chrome.storage?.sync) return localSettings;
  const synced = await callChrome((done) => chrome.storage.sync.get([SETTINGS_KEY], done)).catch(() => ({}));
  const syncSettings = synced[SETTINGS_KEY] || {};
  return localSettings.syncEnabled || syncSettings.syncEnabled
    ? { ...localSettings, ...syncSettings, syncEnabled: true }
    : localSettings;
}

function ruleMatchesBookmark(rule, bookmark) {
  if (!rule?.enabled || !rule.value) return false;
  const needle = normalizeText(rule.value);
  const haystackByField = {
    domain: bookmark.domain,
    title: bookmark.title,
    url: bookmark.url,
    folder: bookmark.folderPath || "",
    tag: (bookmark.meta?.tags || []).join(" "),
  };
  const haystack = normalizeText(haystackByField[rule.field || "domain"] || "");
  if (rule.match === "equals") return haystack === needle;
  if (rule.match === "starts") return haystack.startsWith(needle);
  if (rule.match === "ends") return haystack.endsWith(needle);
  return haystack.includes(needle);
}

async function applyRulesToBookmark(bookmark) {
  const settings = await loadSettings();
  if (!settings.autoOrganizeNew || !settings.autoRules?.length || !bookmark?.url) return;
  const stored = await callChrome((done) => chrome.storage.local.get([META_KEY], done));
  const metadata = stored[META_KEY] || {};
  const bookmarkWithMeta = { ...bookmark, domain: getDomain(bookmark.url), meta: metadata[bookmark.id] || {} };
  const matchingRules = settings.autoRules.filter((rule) => ruleMatchesBookmark(rule, bookmarkWithMeta));
  if (!matchingRules.length) return;
  const target = matchingRules.find((rule) => rule.folderId)?.folderId;
  if (target && target !== bookmark.parentId) {
    await callChrome((done) => chrome.bookmarks.move(bookmark.id, { parentId: target }, done)).catch(() => {});
  }
  const tags = new Set(bookmarkWithMeta.meta.tags || []);
  matchingRules.flatMap((rule) => rule.tags || []).forEach((tag) => tags.add(tag));
  const readStatus = [...matchingRules].reverse().find((rule) => rule.readStatus)?.readStatus;
  metadata[bookmark.id] = {
    ...bookmarkWithMeta.meta,
    tags: [...tags],
    ...(readStatus ? { readStatus } : {}),
  };
  await callChrome((done) => chrome.storage.local.set({ [META_KEY]: metadata }, done));
}

async function getActiveWindowId() {
  const [tab] = await callChrome((done) => chrome.tabs.query({ active: true, currentWindow: true }, done));
  return tab?.windowId;
}

async function openSidePanel() {
  const windowId = await getActiveWindowId();
  if (windowId && chrome.sidePanel?.open) await chrome.sidePanel.open({ windowId });
}

function message(settings, key) {
  return (MESSAGES[settings?.language || "vi"] || MESSAGES.vi)[key] || MESSAGES.vi[key] || key;
}

async function flashBadge(text, color = "#087f5b") {
  if (!chrome.action?.setBadgeText) return;
  await callChrome((done) => chrome.action.setBadgeBackgroundColor({ color }, done)).catch(() => {});
  await callChrome((done) => chrome.action.setBadgeText({ text }, done)).catch(() => {});
  setTimeout(() => {
    chrome.action.setBadgeText({ text: "" }, () => void chrome.runtime.lastError);
  }, 1800);
}

async function notifySaveResult(result) {
  const settings = await loadSettings();
  const status = result?.status || "error";
  const badgeText = status === "saved" ? "OK" : status === "duplicate" ? "DUP" : "!";
  const badgeColor = status === "saved" ? "#087f5b" : status === "duplicate" ? "#9a6a00" : "#c83e4d";
  await flashBadge(badgeText, badgeColor);
  if (!chrome.notifications?.create) return;
  const title = message(settings, status);
  const detail = result?.title || result?.url || message(settings, "shortcutHint");
  chrome.notifications.create(`bookmark-lens-${Date.now()}`, {
    type: "basic",
    iconUrl: "icons/icon-128.png",
    title,
    message: detail,
  }, () => void chrome.runtime.lastError);
}

async function saveTab(tab) {
  if (!tab?.url || /^(chrome|edge|about|chrome-extension):/i.test(tab.url)) {
    return { status: "unsupported", title: tab?.title || "", url: tab?.url || "" };
  }
  const existing = await callChrome((done) => chrome.bookmarks.search({ url: tab.url }, done));
  if (existing.length) return { status: "duplicate", title: existing[0].title || tab.title || tab.url, url: tab.url };
  const parentId = await getDefaultFolderId();
  const created = await callChrome((done) => chrome.bookmarks.create({ parentId, title: tab.title || tab.url, url: tab.url }, done));
  await applyRulesToBookmark(created);
  return { status: "saved", title: created.title || tab.title || tab.url, url: created.url };
}

function createMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: "bookmark-lens-save", title: "Lưu vào Bookmark Lens", contexts: ["page", "link"] });
    chrome.contextMenus.create({ id: "bookmark-lens-related", title: "Tìm bookmark cùng tên miền", contexts: ["page", "link"] });
    chrome.contextMenus.create({ id: "bookmark-lens-panel", title: "Mở Bookmark Lens Side Panel", contexts: ["page"] });
    void chrome.runtime.lastError;
  });
}

chrome.runtime.onInstalled.addListener(() => {
  createMenus();
  const panelSetup = chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: false });
  panelSetup?.catch?.(() => {});
});
chrome.runtime.onStartup.addListener(createMenus);

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const url = info.linkUrl || info.pageUrl || tab?.url;
  if (info.menuItemId === "bookmark-lens-save") {
    const result = await saveTab({ url, title: info.linkUrl ? info.selectionText || url : tab?.title });
    await notifySaveResult(result);
  }
  if (info.menuItemId === "bookmark-lens-related" && url) {
    let domain = "";
    try { domain = new URL(url).hostname.replace(/^www\./, ""); } catch { domain = url; }
    chrome.tabs.create({ url: chrome.runtime.getURL(`dashboard.html?q=${encodeURIComponent(`site:${domain}`)}`) });
  }
  if (info.menuItemId === "bookmark-lens-panel") await openSidePanel();
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "save-current-page") {
    try {
      const [tab] = await callChrome((done) => chrome.tabs.query({ active: true, currentWindow: true }, done));
      const result = await saveTab(tab);
      await notifySaveResult(result);
    } catch (error) {
      await notifySaveResult({ status: "error", title: error.message });
    }
  }
  if (command === "open-dashboard") {
    chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
  }
});

let metadataCleanup = Promise.resolve();
chrome.bookmarks.onRemoved.addListener((id) => {
  metadataCleanup = metadataCleanup.then(async () => {
    const stored = await callChrome((done) => chrome.storage.local.get(["bookmarkLensMeta"], done));
    const metadata = stored.bookmarkLensMeta || {};
    if (!metadata[id]) return;
    delete metadata[id];
    await callChrome((done) => chrome.storage.local.set({ bookmarkLensMeta: metadata }, done));
  }).catch(() => {});
});

let autoRuleQueue = Promise.resolve();
chrome.bookmarks.onCreated.addListener((id, bookmark) => {
  autoRuleQueue = autoRuleQueue.then(() => applyRulesToBookmark({ id, ...bookmark })).catch(() => {});
});
