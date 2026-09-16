(function () {
  const META_KEY = "bookmarkLensMeta";
  const SETTINGS_KEY = "bookmarkLensSettings";

  function chromeCall(apiCall) {
    return new Promise((resolve, reject) => {
      apiCall((result) => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message));
        else resolve(result);
      });
    });
  }

  function normalizeText(value = "") {
    return String(value).toLocaleLowerCase("vi").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function normalizeUrl(value = "") {
    try {
      const url = new URL(value);
      url.hash = "";
      if (url.pathname === "/") url.pathname = "";
      return url.toString().replace(/\/$/, "").toLowerCase();
    } catch {
      return String(value).trim().toLowerCase().replace(/\/$/, "");
    }
  }

  function getDomain(value) {
    try {
      return new URL(value).hostname.replace(/^www\./, "");
    } catch {
      return String(value);
    }
  }

  function flattenTree(nodes, bookmarks = [], folders = [], folderTrail = [], ancestorIds = []) {
    for (const node of nodes) {
      if (node.url) {
        bookmarks.push({
          id: node.id,
          parentId: node.parentId,
          index: node.index || 0,
          title: node.title || getDomain(node.url),
          url: node.url,
          dateAdded: node.dateAdded || 0,
          folderPath: folderTrail.filter(Boolean).join(" / ") || "Không có thư mục",
          ancestorIds,
          domain: getDomain(node.url),
        });
        continue;
      }
      const nextTrail = node.title ? [...folderTrail, node.title] : folderTrail;
      const nextAncestors = node.id === "0" ? ancestorIds : [...ancestorIds, node.id];
      if (node.id !== "0" && node.title) {
        folders.push({
          id: node.id,
          parentId: node.parentId,
          index: node.index || 0,
          title: node.title,
          path: nextTrail.join(" / "),
          depth: nextTrail.length,
          ancestorIds,
        });
      }
      if (node.children) flattenTree(node.children, bookmarks, folders, nextTrail, nextAncestors);
    }
    return { bookmarks, folders };
  }

  function findDuplicateGroups(bookmarks) {
    const groups = new Map();
    for (const bookmark of bookmarks) {
      const key = normalizeUrl(bookmark.url);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(bookmark);
    }
    return [...groups.values()].filter((group) => group.length > 1);
  }

  function parseQuery(query = "") {
    const parsed = { terms: [], site: [], folder: [], tag: [], status: [], is: [] };
    const tokens = query.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
    for (const rawToken of tokens) {
      const match = rawToken.match(/^(site|folder|tag|status|is):(?:"([^"]*)"|(.+))$/i);
      if (match) parsed[match[1].toLowerCase()].push(normalizeText(match[2] ?? match[3]));
      else parsed.terms.push(normalizeText(rawToken.replace(/^"|"$/g, "")));
    }
    return parsed;
  }

  function fuzzyMatch(haystack, needle) {
    if (!needle) return true;
    if (haystack.includes(needle)) return true;
    if (needle.length < 3) return false;
    let cursor = 0;
    for (const character of haystack) {
      if (character === needle[cursor]) cursor += 1;
      if (cursor === needle.length) return true;
    }
    return false;
  }

  function relativeDate(timestamp) {
    if (!timestamp) return "Không rõ ngày";
    const days = Math.floor(Math.max(0, Date.now() - timestamp) / 86400000);
    if (days === 0) return "Hôm nay";
    if (days === 1) return "Hôm qua";
    if (days < 30) return `${days} ngày trước`;
    if (days < 365) return `${Math.floor(days / 30)} tháng trước`;
    return `${Math.floor(days / 365)} năm trước`;
  }

  function escapeHtml(value = "") {
    const span = document.createElement("span");
    span.textContent = String(value);
    return span.innerHTML.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function faviconUrl(url, size = 32) {
    return `${chrome.runtime.getURL("/_favicon/")}?pageUrl=${encodeURIComponent(url)}&size=${size}`;
  }

  async function loadMetadata() {
    const stored = await chromeCall((done) => chrome.storage.local.get([META_KEY], done));
    return stored[META_KEY] || {};
  }

  async function saveMetadata(metadata) {
    await chromeCall((done) => chrome.storage.local.set({ [META_KEY]: metadata }, done));
  }

  async function loadSettings() {
    const defaults = {
      theme: "system",
      defaultSort: "newest",
      language: "vi",
      searchHistory: [],
      lastFolderId: null,
      syncEnabled: false,
      autoOrganizeNew: false,
      autoRules: [],
      workspaces: [],
      pageSize: 120,
      compactMode: false,
    };
    const stored = await chromeCall((done) => chrome.storage.local.get([SETTINGS_KEY], done));
    const localSettings = { ...defaults, ...stored[SETTINGS_KEY] };
    if (!chrome.storage?.sync) return localSettings;
    const synced = await chromeCall((done) => chrome.storage.sync.get([SETTINGS_KEY], done)).catch(() => ({}));
    const syncSettings = synced[SETTINGS_KEY] || {};
    if (!localSettings.syncEnabled && !syncSettings.syncEnabled) return localSettings;
    return {
      ...localSettings,
      ...syncSettings,
      syncEnabled: true,
    };
  }

  async function saveSettings(settings) {
    await chromeCall((done) => chrome.storage.local.set({ [SETTINGS_KEY]: settings }, done));
    if (!chrome.storage?.sync) return;
    if (settings.syncEnabled) {
      await chromeCall((done) => chrome.storage.sync.set({ [SETTINGS_KEY]: settings }, done)).catch(() => {});
    } else {
      await chromeCall((done) => chrome.storage.sync.remove([SETTINGS_KEY], done)).catch(() => {});
    }
  }

  function normalizeRule(rule = {}) {
    return {
      id: rule.id || `rule-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: rule.name || "Luật mới",
      field: rule.field || "domain",
      match: rule.match || "contains",
      value: rule.value || "",
      folderId: rule.folderId || "",
      tags: Array.isArray(rule.tags) ? rule.tags : String(rule.tags || "").split(",").map((tag) => tag.trim()).filter(Boolean),
      readStatus: rule.readStatus || "",
      enabled: rule.enabled !== false,
    };
  }

  function ruleMatchesBookmark(rule, bookmark) {
    const safeRule = normalizeRule(rule);
    if (!safeRule.enabled || !safeRule.value.trim()) return false;
    const needle = normalizeText(safeRule.value);
    const tags = (bookmark.meta?.tags || []).join(" ");
    const values = {
      domain: bookmark.domain,
      title: bookmark.title,
      url: bookmark.url,
      folder: bookmark.folderPath,
      tag: tags,
    };
    const haystack = normalizeText(values[safeRule.field] || "");
    if (safeRule.match === "equals") return haystack === needle;
    if (safeRule.match === "starts") return haystack.startsWith(needle);
    if (safeRule.match === "ends") return haystack.endsWith(needle);
    return haystack.includes(needle);
  }

  function suggestRules(bookmarks, folders) {
    const folderNames = new Set(folders.map((folder) => normalizeText(folder.title)));
    const counts = new Map();
    bookmarks.forEach((bookmark) => counts.set(bookmark.domain, (counts.get(bookmark.domain) || 0) + 1));
    return [...counts.entries()]
      .filter(([domain, count]) => count >= 3 && !folderNames.has(normalizeText(domain.split(".")[0] || domain)))
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "vi"))
      .slice(0, 8)
      .map(([domain, count]) => ({
        id: `suggest-${domain}`,
        name: `Gom ${domain}`,
        field: "domain",
        match: "equals",
        value: domain,
        count,
      }));
  }

  async function loadLibrary(includeHistory = false) {
    const tasks = [
      chromeCall((done) => chrome.bookmarks.getTree(done)),
      loadMetadata(),
      loadSettings(),
    ];
    if (includeHistory) {
      tasks.push(chromeCall((done) => chrome.history.search({ text: "", startTime: 0, maxResults: 10000 }, done)).catch(() => []));
    }
    const [tree, metadata, settings, historyItems = []] = await Promise.all(tasks);
    const { bookmarks, folders } = flattenTree(tree);
    const historyMap = new Map(historyItems.map((item) => [normalizeUrl(item.url), item]));
    for (const bookmark of bookmarks) {
      bookmark.meta = metadata[bookmark.id] || {};
      const history = historyMap.get(normalizeUrl(bookmark.url));
      bookmark.visitCount = history?.visitCount || 0;
      bookmark.lastVisitTime = history?.lastVisitTime || 0;
    }
    return { tree, bookmarks, folders, metadata, settings };
  }

  function applyTheme(theme) {
    const resolved = theme === "system"
      ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : theme;
    document.documentElement.dataset.theme = resolved;
  }

  window.BookmarkLens = {
    META_KEY,
    SETTINGS_KEY,
    chromeCall,
    normalizeText,
    normalizeUrl,
    getDomain,
    flattenTree,
    findDuplicateGroups,
    parseQuery,
    fuzzyMatch,
    relativeDate,
    escapeHtml,
    faviconUrl,
    loadMetadata,
    saveMetadata,
    loadSettings,
    saveSettings,
    normalizeRule,
    ruleMatchesBookmark,
    suggestRules,
    loadLibrary,
    applyTheme,
  };
})();
