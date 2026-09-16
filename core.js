(function () {
  const META_KEY = "bookmarkLensMeta";
  const SETTINGS_KEY = "bookmarkLensSettings";
  const META_SYNC_PREFIX = "bookmarkLensMetaChunk";
  const META_SYNC_INDEX = "bookmarkLensMetaIndex";
  const VAULT_CONFIG_KEY = "bookmarkLensVaultConfig";
  const VAULT_DATA_KEY = "bookmarkLensVaultData";

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

  function bytesToBase64(bytes) {
    return btoa(String.fromCharCode(...new Uint8Array(bytes)));
  }

  function base64ToBytes(value) {
    return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  }

  function randomBase64(length = 16) {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return bytesToBase64(bytes);
  }

  async function deriveVaultKey(password, saltBase64, iterations = 180000) {
    const sourceKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: base64ToBytes(saltBase64), iterations, hash: "SHA-256" },
      sourceKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  }

  async function encryptVaultPayload(key, payload) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(JSON.stringify(payload));
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
    return { iv: bytesToBase64(iv), data: bytesToBase64(encrypted), updatedAt: Date.now() };
  }

  async function decryptVaultPayload(key, payload) {
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(payload.iv) }, key, base64ToBytes(payload.data));
    return JSON.parse(new TextDecoder().decode(decrypted));
  }

  async function getVaultConfig() {
    const stored = await chromeCall((done) => chrome.storage.local.get([VAULT_CONFIG_KEY], done));
    return stored[VAULT_CONFIG_KEY] || null;
  }

  async function isVaultConfigured() {
    return Boolean(await getVaultConfig());
  }

  async function createVault(password) {
    const salt = randomBase64(16);
    const iterations = 180000;
    const key = await deriveVaultKey(password, salt, iterations);
    const encrypted = await encryptVaultPayload(key, { items: [] });
    await chromeCall((done) => chrome.storage.local.set({
      [VAULT_CONFIG_KEY]: { salt, iterations, createdAt: Date.now() },
      [VAULT_DATA_KEY]: encrypted,
    }, done));
    return { key, items: [] };
  }

  async function unlockVault(password) {
    const config = await getVaultConfig();
    if (!config) throw new Error("Vault is not configured");
    const stored = await chromeCall((done) => chrome.storage.local.get([VAULT_DATA_KEY], done));
    const encrypted = stored[VAULT_DATA_KEY];
    if (!encrypted) throw new Error("Vault data is missing");
    const key = await deriveVaultKey(password, config.salt, config.iterations);
    const payload = await decryptVaultPayload(key, encrypted);
    return { key, items: payload.items || [] };
  }

  async function saveVaultItems(key, items) {
    const encrypted = await encryptVaultPayload(key, { items });
    await chromeCall((done) => chrome.storage.local.set({ [VAULT_DATA_KEY]: encrypted }, done));
  }

  function createVaultItem({ title, url, tags = [], note = "" }) {
    return {
      id: `hidden-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      title: title || getDomain(url),
      url,
      domain: getDomain(url),
      tags,
      note,
      createdAt: Date.now(),
    };
  }

  async function loadMetadata() {
    const stored = await chromeCall((done) => chrome.storage.local.get([META_KEY], done));
    const localMetadata = stored[META_KEY] || {};
    const settings = await loadSettings().catch(() => ({}));
    if (!settings.syncMetadata || !chrome.storage?.sync) return localMetadata;
    const synced = await chromeCall((done) => chrome.storage.sync.get([META_SYNC_INDEX], done)).catch(() => ({}));
    const index = synced[META_SYNC_INDEX] || [];
    if (!index.length) return localMetadata;
    const chunkKeys = index.map((item) => item.key);
    const chunks = await chromeCall((done) => chrome.storage.sync.get(chunkKeys, done)).catch(() => ({}));
    try {
      const remoteMetadata = JSON.parse(index.map((item) => chunks[item.key] || "").join(""));
      return { ...localMetadata, ...remoteMetadata };
    } catch {
      return localMetadata;
    }
  }

  async function saveMetadata(metadata) {
    await chromeCall((done) => chrome.storage.local.set({ [META_KEY]: metadata }, done));
    const settings = await loadSettings().catch(() => ({}));
    if (!settings.syncMetadata || !chrome.storage?.sync) return;
    await saveMetadataToSync(metadata);
  }

  async function saveMetadataToSync(metadata) {
    const payload = JSON.stringify(metadata);
    const maxChunkSize = 7000;
    const maxPayloadSize = 90000;
    const previous = await chromeCall((done) => chrome.storage.sync.get([META_SYNC_INDEX], done)).catch(() => ({}));
    const previousKeys = (previous[META_SYNC_INDEX] || []).map((item) => item.key);
    if (payload.length > maxPayloadSize) {
      if (previousKeys.length) await chromeCall((done) => chrome.storage.sync.remove(previousKeys.concat(META_SYNC_INDEX), done)).catch(() => {});
      return { synced: false, reason: "quota" };
    }
    const chunks = [];
    for (let offset = 0; offset < payload.length; offset += maxChunkSize) {
      chunks.push(payload.slice(offset, offset + maxChunkSize));
    }
    const keys = chunks.map((_, index) => `${META_SYNC_PREFIX}${index}`);
    const values = Object.fromEntries(keys.map((key, index) => [key, chunks[index]]));
    values[META_SYNC_INDEX] = keys.map((key, index) => ({ key, index }));
    const removeKeys = previousKeys.filter((key) => !keys.includes(key));
    if (removeKeys.length) await chromeCall((done) => chrome.storage.sync.remove(removeKeys, done)).catch(() => {});
    await chromeCall((done) => chrome.storage.sync.set(values, done)).catch(() => {});
    return { synced: true, chunks: chunks.length };
  }

  async function loadSettings() {
    const defaults = {
      theme: "system",
      defaultSort: "newest",
      language: "vi",
      searchHistory: [],
      lastFolderId: null,
      syncEnabled: false,
      syncMetadata: false,
      autoOrganizeNew: false,
      autoRules: [],
      workspaces: [],
      pageSize: 120,
      compactMode: false,
      virtualList: true,
      onboardingDone: false,
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
    const keywordCounts = new Map();
    bookmarks.forEach((bookmark) => {
      counts.set(bookmark.domain, (counts.get(bookmark.domain) || 0) + 1);
      normalizeText(bookmark.title).split(/[^a-z0-9]+/).filter((word) => word.length >= 4).forEach((word) => {
        keywordCounts.set(word, (keywordCounts.get(word) || 0) + 1);
      });
    });
    const domainRules = [...counts.entries()]
      .filter(([domain, count]) => count >= 3 && !folderNames.has(normalizeText(domain.split(".")[0] || domain)))
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "vi"))
      .slice(0, 6)
      .map(([domain, count]) => ({
        id: `suggest-${domain}`,
        name: `Gom ${domain}`,
        field: "domain",
        match: "equals",
        value: domain,
        count,
      }));
    const keywordRules = [...keywordCounts.entries()]
      .filter(([word, count]) => count >= 4 && !["https", "http", "com", "www"].includes(word))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([word, count]) => ({
        id: `suggest-keyword-${word}`,
        name: `Gắn tag ${word}`,
        field: "title",
        match: "contains",
        value: word,
        tags: [word],
        count,
      }));
    return [...domainRules, ...keywordRules].slice(0, 8);
  }

  function openSearchDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("BookmarkLensSearch", 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("bookmarks")) db.createObjectStore("bookmarks", { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function rebuildSearchIndex(bookmarks) {
    if (!globalThis.indexedDB) return { indexed: 0 };
    const db = await openSearchDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("bookmarks", "readwrite");
      const store = tx.objectStore("bookmarks");
      store.clear();
      for (const bookmark of bookmarks) {
        const tags = (bookmark.meta?.tags || []).join(" ");
        const searchable = normalizeText([bookmark.title, bookmark.url, bookmark.domain, bookmark.folderPath, tags, bookmark.meta?.note || ""].join(" "));
        store.put({ id: bookmark.id, searchable, updatedAt: Date.now() });
      }
      tx.oncomplete = () => { db.close(); resolve({ indexed: bookmarks.length }); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }

  async function searchBookmarkIndex(query, limit = 5000) {
    if (!globalThis.indexedDB || !query.trim()) return null;
    const parsed = parseQuery(query);
    const terms = [...parsed.terms, ...parsed.site, ...parsed.folder, ...parsed.tag, ...parsed.status, ...parsed.is].filter(Boolean);
    if (!terms.length) return null;
    const db = await openSearchDb();
    return new Promise((resolve, reject) => {
      const ids = [];
      const tx = db.transaction("bookmarks", "readonly");
      const request = tx.objectStore("bookmarks").openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor || ids.length >= limit) return;
        if (terms.every((term) => cursor.value.searchable.includes(term))) ids.push(cursor.key);
        cursor.continue();
      };
      tx.oncomplete = () => { db.close(); resolve(new Set(ids)); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
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
    VAULT_CONFIG_KEY,
    VAULT_DATA_KEY,
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
    isVaultConfigured,
    createVault,
    unlockVault,
    saveVaultItems,
    createVaultItem,
    loadMetadata,
    saveMetadata,
    saveMetadataToSync,
    loadSettings,
    saveSettings,
    normalizeRule,
    ruleMatchesBookmark,
    suggestRules,
    rebuildSearchIndex,
    searchBookmarkIndex,
    loadLibrary,
    applyTheme,
  };
})();
