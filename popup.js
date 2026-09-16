const state = {
  bookmarks: [],
  folders: [],
  duplicateIds: new Set(),
  query: "",
  folderId: "all",
  domain: "all",
  time: "all",
  sort: "relevance",
  duplicateOnly: false,
  visibleLimit: 80,
  metadata: {},
  settings: {},
  historyMap: new Map(),
  addMode: "tab",
};

const els = {
  libraryCount: document.querySelector("#libraryCount"),
  searchInput: document.querySelector("#searchInput"),
  clearSearch: document.querySelector("#clearSearch"),
  filterToggle: document.querySelector("#filterToggle"),
  filterPanel: document.querySelector("#filterPanel"),
  activeFilterCount: document.querySelector("#activeFilterCount"),
  folderFilter: document.querySelector("#folderFilter"),
  domainFilter: document.querySelector("#domainFilter"),
  timeFilter: document.querySelector("#timeFilter"),
  sortFilter: document.querySelector("#sortFilter"),
  recentChip: document.querySelector("#recentChip"),
  duplicateChip: document.querySelector("#duplicateChip"),
  resetFilters: document.querySelector("#resetFilters"),
  resultSummary: document.querySelector("#resultSummary"),
  searchHint: document.querySelector("#searchHint"),
  results: document.querySelector("#results"),
  loadMore: document.querySelector("#loadMore"),
  openManager: document.querySelector("#openManager"),
  themeToggle: document.querySelector("#themeToggle"),
  saveCurrent: document.querySelector("#saveCurrent"),
  saveAllTabs: document.querySelector("#saveAllTabs"),
  openSidePanel: document.querySelector("#openSidePanel"),
  openDashboard: document.querySelector("#openDashboard"),
  searchSuggestions: document.querySelector("#searchSuggestions"),
  editDialog: document.querySelector("#editDialog"),
  editForm: document.querySelector("#editForm"),
  editId: document.querySelector("#editId"),
  editTitle: document.querySelector("#editTitle"),
  editUrl: document.querySelector("#editUrl"),
  closeEdit: document.querySelector("#closeEdit"),
  cancelEdit: document.querySelector("#cancelEdit"),
  deleteDialog: document.querySelector("#deleteDialog"),
  deleteForm: document.querySelector("#deleteForm"),
  deleteId: document.querySelector("#deleteId"),
  deleteName: document.querySelector("#deleteName"),
  cancelDelete: document.querySelector("#cancelDelete"),
  addDialog: document.querySelector("#addDialog"),
  addForm: document.querySelector("#addForm"),
  addTitle: document.querySelector("#addTitle"),
  addUrl: document.querySelector("#addUrl"),
  addFolder: document.querySelector("#addFolder"),
  addTags: document.querySelector("#addTags"),
  addTagColor: document.querySelector("#addTagColor"),
  addUnread: document.querySelector("#addUnread"),
  addHint: document.querySelector("#addHint"),
  closeAdd: document.querySelector("#closeAdd"),
  cancelAdd: document.querySelector("#cancelAdd"),
  toast: document.querySelector("#toast"),
};

let toastTimer;

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
  return value.toLocaleLowerCase("vi").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeUrl(value = "") {
  try {
    const url = new URL(value);
    url.hash = "";
    if (url.pathname === "/") url.pathname = "";
    return url.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return value.trim().toLowerCase().replace(/\/$/, "");
  }
}

function getDomain(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}

function flattenTree(nodes, folderTrail = [], ancestorIds = []) {
  for (const node of nodes) {
    if (node.url) {
      state.bookmarks.push({
        id: node.id,
        parentId: node.parentId,
        title: node.title || getDomain(node.url),
        url: node.url,
        dateAdded: node.dateAdded || 0,
        folderPath: folderTrail.filter(Boolean).join(" / ") || "Không có thư mục",
        ancestorIds,
        domain: getDomain(node.url),
        index: node.index || 0,
        meta: state.metadata[node.id] || {},
        visitCount: state.historyMap.get(normalizeUrl(node.url))?.visitCount || 0,
        lastVisitTime: state.historyMap.get(normalizeUrl(node.url))?.lastVisitTime || 0,
      });
      continue;
    }

    const nextTrail = node.title ? [...folderTrail, node.title] : folderTrail;
    const nextAncestors = node.id === "0" ? ancestorIds : [...ancestorIds, node.id];
    if (node.id !== "0" && node.title) {
      state.folders.push({ id: node.id, title: node.title, path: nextTrail.join(" / ") });
    }
    if (node.children) flattenTree(node.children, nextTrail, nextAncestors);
  }
}

function findDuplicates() {
  const groups = new Map();
  for (const bookmark of state.bookmarks) {
    const key = normalizeUrl(bookmark.url);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(bookmark.id);
  }
  state.duplicateIds = new Set(
    [...groups.values()].filter((ids) => ids.length > 1).flat()
  );
}

function populateFolders() {
  const sorted = [...state.folders].sort((a, b) => a.path.localeCompare(b.path, "vi"));
  els.folderFilter.replaceChildren(new Option("Tất cả thư mục", "all"));
  for (const folder of sorted) {
    const option = new Option(folder.path, folder.id);
    option.title = folder.path;
    els.folderFilter.add(option);
  }
}

function populateDomains() {
  const counts = new Map();
  state.bookmarks.forEach((bookmark) => counts.set(bookmark.domain, (counts.get(bookmark.domain) || 0) + 1));
  const domains = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "vi"));
  els.domainFilter.replaceChildren(new Option("Tất cả website", "all"));
  domains.forEach(([domain, count]) => els.domainFilter.add(new Option(`${domain} (${count})`, domain)));
  els.domainFilter.value = state.domain;
  if (!els.domainFilter.value) { state.domain = "all"; els.domainFilter.value = "all"; }
}

function relativeDate(timestamp) {
  if (!timestamp) return "Không rõ ngày";
  const diff = Math.max(0, Date.now() - timestamp);
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Hôm nay";
  if (days === 1) return "Hôm qua";
  if (days < 30) return `${days} ngày trước`;
  if (days < 365) return `${Math.floor(days / 30)} tháng trước`;
  return `${Math.floor(days / 365)} năm trước`;
}

function matchesTime(bookmark) {
  if (state.time === "all") return true;
  const limitDays = state.time === "today" ? 1 : Number(state.time);
  return Date.now() - bookmark.dateAdded <= limitDays * 86400000;
}

function relevanceScore(bookmark, terms) {
  if (!terms.length) return 0;
  const title = normalizeText(bookmark.title);
  const domain = normalizeText(bookmark.domain);
  const path = normalizeText(bookmark.folderPath);
  return terms.reduce((score, term) => {
    if (title.startsWith(term)) return score + 12;
    if (title.includes(term)) return score + 8;
    if (domain.startsWith(term)) return score + 6;
    if (domain.includes(term)) return score + 4;
    if (path.includes(term)) return score + 2;
    return score + 1;
  }, 0);
}

function getFilteredBookmarks() {
  const parsed = BookmarkLens.parseQuery(state.query);
  const terms = parsed.terms;
  const results = state.bookmarks.filter((bookmark) => {
    const tags = (bookmark.meta.tags || []).map(normalizeText);
    const haystack = normalizeText(`${bookmark.title} ${bookmark.url} ${bookmark.folderPath} ${bookmark.domain} ${tags.join(" ")} ${bookmark.meta.note || ""}`);
    const matchesQuery = terms.every((term) => BookmarkLens.fuzzyMatch(haystack, term));
    const matchesSite = parsed.site.every((value) => normalizeText(bookmark.domain).includes(value));
    const matchesNamedFolder = parsed.folder.every((value) => normalizeText(bookmark.folderPath).includes(value));
    const matchesTag = parsed.tag.every((value) => tags.some((tag) => tag.includes(value)));
    const matchesStatus = parsed.status.every((value) => value === (bookmark.meta.readStatus || "read") || value === bookmark.meta.linkStatus?.status);
    const matchesIs = parsed.is.every((value) => (value === "pinned" && bookmark.meta.pinned) || (value === "duplicate" && state.duplicateIds.has(bookmark.id)));
    const matchesFolder = state.folderId === "all" || bookmark.ancestorIds.includes(state.folderId);
    const matchesDomain = state.domain === "all" || bookmark.domain === state.domain;
    const matchesDuplicate = !state.duplicateOnly || state.duplicateIds.has(bookmark.id);
    return matchesQuery && matchesSite && matchesNamedFolder && matchesTag && matchesStatus && matchesIs && matchesFolder && matchesDomain && matchesTime(bookmark) && matchesDuplicate;
  });

  results.sort((a, b) => {
    if (state.sort === "oldest") return a.dateAdded - b.dateAdded;
    if (state.sort === "az") return a.title.localeCompare(b.title, "vi");
    if (state.sort === "za") return b.title.localeCompare(a.title, "vi");
    if (state.sort === "domain") return a.domain.localeCompare(b.domain, "vi") || a.title.localeCompare(b.title, "vi");
    if (state.sort === "folder") return a.folderPath.localeCompare(b.folderPath, "vi") || a.index - b.index;
    if (state.sort === "mostVisited") return b.visitCount - a.visitCount || b.dateAdded - a.dateAdded;
    if (state.sort === "recentVisited") return b.lastVisitTime - a.lastVisitTime || b.dateAdded - a.dateAdded;
    if (state.sort === "relevance" && terms.length) {
      return relevanceScore(b, terms) - relevanceScore(a, terms) || b.dateAdded - a.dateAdded;
    }
    return b.dateAdded - a.dateAdded;
  });

  return results;
}

function escapeHtml(value = "") {
  const span = document.createElement("span");
  span.textContent = value;
  return span.innerHTML.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function highlightText(value, query) {
  const terms = query.trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return escapeHtml(value);
  const escapedTerms = terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const expression = new RegExp(`(${escapedTerms.join("|")})`, "gi");
  return escapeHtml(value).replace(expression, "<mark>$1</mark>");
}

function faviconUrl(url) {
  return `${chrome.runtime.getURL("/_favicon/")}?pageUrl=${encodeURIComponent(url)}&size=32`;
}

function createResultItem(bookmark) {
  const item = document.createElement("article");
  item.className = "result-item";
  item.tabIndex = 0;
  item.dataset.id = bookmark.id;
  item.title = "Mở bookmark";

  const monogram = (bookmark.domain || bookmark.title).charAt(0).toUpperCase();
  const duplicateBadge = state.duplicateIds.has(bookmark.id)
    ? '<span class="duplicate-badge">TRÙNG</span>'
    : "";

  item.innerHTML = `
    <div class="favicon-wrap" aria-hidden="true">
      <span>${escapeHtml(monogram)}</span>
      <img loading="lazy" src="${faviconUrl(bookmark.url)}" alt="" />
    </div>
    <div class="bookmark-copy">
      <div class="bookmark-title">${highlightText(bookmark.title, state.query)}</div>
      <button class="bookmark-url domain-link" type="button" title="Chỉ xem ${escapeHtml(bookmark.domain)}">${highlightText(bookmark.domain, state.query)}</button>
      <div class="bookmark-meta">
        <svg><use href="#i-folder"></use></svg>
        <span class="folder-path">${escapeHtml(bookmark.folderPath)}</span>
        <span>·</span><span>${relativeDate(bookmark.dateAdded)}</span>${bookmark.meta.readStatus === "unread" ? '<span class="duplicate-badge">CHƯA ĐỌC</span>' : ""}${duplicateBadge}
      </div>
    </div>
    <div class="item-actions">
      <button class="icon-button copy-action" type="button" aria-label="Sao chép địa chỉ" title="Sao chép địa chỉ"><svg><use href="#i-copy"></use></svg></button>
      <button class="icon-button edit-action" type="button" aria-label="Chỉnh sửa" title="Chỉnh sửa"><svg><use href="#i-edit"></use></svg></button>
      <button class="icon-button delete-action" type="button" aria-label="Xóa" title="Xóa"><svg><use href="#i-trash"></use></svg></button>
    </div>`;

  item.querySelector("img").addEventListener("error", (event) => event.currentTarget.remove());
  item.addEventListener("click", (event) => {
    if (!event.target.closest("button")) chrome.tabs.create({ url: bookmark.url });
  });
  item.addEventListener("keydown", (event) => {
    if ((event.key === "Enter" || event.key === " ") && !event.target.closest("button")) {
      event.preventDefault();
      chrome.tabs.create({ url: bookmark.url });
    }
  });
  item.querySelector(".copy-action").addEventListener("click", () => copyBookmark(bookmark));
  item.querySelector(".domain-link").addEventListener("click", () => {
    state.domain = bookmark.domain;
    els.domainFilter.value = bookmark.domain;
    state.visibleLimit = 80;
    render();
  });
  item.querySelector(".edit-action").addEventListener("click", () => openEditDialog(bookmark));
  item.querySelector(".delete-action").addEventListener("click", () => openDeleteDialog(bookmark));
  return item;
}

function render() {
  const filtered = getFilteredBookmarks();
  const visible = filtered.slice(0, state.visibleLimit);
  els.results.replaceChildren();

  if (!filtered.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = `
      <div class="empty-icon"><svg><use href="#i-search"></use></svg></div>
      <h2>Không tìm thấy bookmark</h2>
      <p>Thử từ khóa ngắn hơn hoặc đặt lại bộ lọc để xem toàn bộ thư viện.</p>`;
    els.results.append(empty);
  } else {
    const fragment = document.createDocumentFragment();
    visible.forEach((bookmark) => fragment.append(createResultItem(bookmark)));
    els.results.append(fragment);
  }

  els.resultSummary.textContent = `${filtered.length.toLocaleString("vi-VN")} kết quả`;
  els.searchHint.textContent = filtered.length > visible.length ? `Hiển thị ${visible.length}` : "";
  els.loadMore.classList.toggle("is-hidden", filtered.length <= visible.length);
  els.loadMore.textContent = `Xem thêm (${Math.min(80, filtered.length - visible.length)})`;
  updateFilterUi();
  window.BookmarkLensI18n?.apply(document.body);
}

function updateFilterUi() {
  const filterCount = [state.folderId !== "all", state.domain !== "all", state.time !== "all", state.duplicateOnly].filter(Boolean).length;
  els.activeFilterCount.textContent = filterCount;
  els.activeFilterCount.classList.toggle("is-hidden", filterCount === 0);
  els.resetFilters.classList.toggle("is-hidden", filterCount === 0 && !state.query);
  els.recentChip.setAttribute("aria-pressed", String(state.time === "7"));
  els.duplicateChip.setAttribute("aria-pressed", String(state.duplicateOnly));
  els.clearSearch.classList.toggle("is-hidden", !state.query);
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  els.toast.textContent = window.BookmarkLensI18n?.t(message) || message;
  els.toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => els.toast.classList.remove("is-visible"), 2200);
}

async function copyBookmark(bookmark) {
  try {
    await navigator.clipboard.writeText(bookmark.url);
    showToast("Đã sao chép địa chỉ");
  } catch {
    showToast("Không thể sao chép địa chỉ");
  }
}

function openEditDialog(bookmark) {
  els.editId.value = bookmark.id;
  els.editTitle.value = bookmark.title;
  els.editUrl.value = bookmark.url;
  els.editDialog.showModal();
  els.editTitle.focus();
}

function openDeleteDialog(bookmark) {
  els.deleteId.value = bookmark.id;
  els.deleteName.textContent = `“${bookmark.title}” sẽ bị xóa khỏi Chrome.`;
  els.deleteDialog.showModal();
}

async function refreshBookmarks() {
  state.bookmarks = [];
  state.folders = [];
  const [tree, stored, history] = await Promise.all([
    chromeCall((done) => chrome.bookmarks.getTree(done)),
    chromeCall((done) => chrome.storage.local.get(["bookmarkLensMeta", "bookmarkLensSettings"], done)),
    chromeCall((done) => chrome.history.search({ text: "", startTime: 0, maxResults: 10000 }, done)).catch(() => []),
  ]);
  state.metadata = stored.bookmarkLensMeta || {};
  state.settings = { defaultSort: "newest", searchHistory: [], ...stored.bookmarkLensSettings };
  state.historyMap = new Map(history.map((item) => [normalizeUrl(item.url), item]));
  flattenTree(tree);
  findDuplicates();
  populateFolders();
  populateDomains();
  els.folderFilter.value = state.folderId;
  els.addFolder.innerHTML = [...state.folders].sort((a, b) => a.path.localeCompare(b.path, "vi")).map((folder) => `<option value="${folder.id}">${escapeHtml(folder.path)}</option>`).join("");
  els.addFolder.value = state.settings.lastFolderId || state.folders[0]?.id;
  if (!els.addFolder.value && els.addFolder.options.length) els.addFolder.selectedIndex = 0;
  els.searchSuggestions.innerHTML = (state.settings.searchHistory || []).map((term) => `<option value="${escapeHtml(term)}"></option>`).join("");
  els.libraryCount.textContent = `${state.bookmarks.length.toLocaleString("vi-VN")} bookmark · ${state.folders.length.toLocaleString("vi-VN")} thư mục`;
  render();
}

function resetFilters() {
  state.query = "";
  state.folderId = "all";
  state.domain = "all";
  state.time = "all";
  state.duplicateOnly = false;
  state.visibleLimit = 80;
  els.searchInput.value = "";
  els.folderFilter.value = "all";
  els.domainFilter.value = "all";
  els.timeFilter.value = "all";
  render();
}

async function openAddDialog(mode = "tab") {
  state.addMode = mode;
  const [tab] = await chromeCall((done) => chrome.tabs.query({ active: true, currentWindow: true }, done));
  els.addTitle.value = mode === "window" ? `Phiên làm việc ${new Date().toLocaleString("vi-VN")}` : (tab?.title || "");
  els.addUrl.value = tab?.url || "";
  els.addUrl.closest("label").classList.toggle("is-hidden", mode === "window");
  els.addTags.value = "";
  els.addUnread.checked = false;
  els.addFolder.value = state.settings.lastFolderId || state.folders[0]?.id;
  if (mode === "window") {
    const tabs = await chromeCall((done) => chrome.tabs.query({ currentWindow: true }, done));
    els.addHint.textContent = `${tabs.filter((item) => /^https?:/i.test(item.url)).length} tab web sẽ được lưu vào một thư mục mới.`;
  } else {
    const existing = state.bookmarks.filter((item) => normalizeUrl(item.url) === normalizeUrl(tab?.url));
    els.addHint.textContent = existing.length ? `Địa chỉ này đã tồn tại ${existing.length} lần.` : "Chọn thư mục và tag trước khi lưu.";
  }
  els.addDialog.showModal();
}

async function saveQuickAdd(event) {
  event.preventDefault();
  const tags = els.addTags.value.split(",").map((tag) => tag.trim()).filter(Boolean);
  if (state.addMode === "window") {
    const tabs = await chromeCall((done) => chrome.tabs.query({ currentWindow: true }, done));
    const validTabs = tabs.filter((tab) => /^https?:/i.test(tab.url));
    const folder = await chromeCall((done) => chrome.bookmarks.create({ parentId: els.addFolder.value, title: els.addTitle.value.trim() }, done));
    for (const tab of validTabs) {
      const created = await chromeCall((done) => chrome.bookmarks.create({ parentId: folder.id, title: tab.title || tab.url, url: tab.url }, done));
      state.metadata[created.id] = { tags, tagColor: els.addTagColor.value, readStatus: els.addUnread.checked ? "unread" : "read" };
    }
    showToast(`Đã lưu ${validTabs.length} tab`);
  } else {
    const created = await chromeCall((done) => chrome.bookmarks.create({ parentId: els.addFolder.value, title: els.addTitle.value.trim(), url: els.addUrl.value.trim() }, done));
    state.metadata[created.id] = { tags, tagColor: els.addTagColor.value, readStatus: els.addUnread.checked ? "unread" : "read" };
    showToast("Đã lưu tab hiện tại");
  }
  state.settings.lastFolderId = els.addFolder.value;
  await Promise.all([
    chromeCall((done) => chrome.storage.local.set({ bookmarkLensMeta: state.metadata }, done)),
    chromeCall((done) => chrome.storage.local.set({ bookmarkLensSettings: state.settings }, done)),
  ]);
  els.addDialog.close();
  await refreshBookmarks();
}

async function rememberSearch() {
  const query = state.query.trim();
  if (!query) return;
  state.settings.searchHistory = [query, ...(state.settings.searchHistory || []).filter((item) => item !== query)].slice(0, 10);
  await chromeCall((done) => chrome.storage.local.set({ bookmarkLensSettings: state.settings }, done));
  els.searchSuggestions.innerHTML = state.settings.searchHistory.map((term) => `<option value="${escapeHtml(term)}"></option>`).join("");
}

function bindEvents() {
  els.searchInput.addEventListener("input", () => {
    state.query = els.searchInput.value;
    state.visibleLimit = 80;
    render();
  });
  els.searchInput.addEventListener("keydown", (event) => { if (event.key === "Enter") rememberSearch(); });
  els.clearSearch.addEventListener("click", () => {
    state.query = "";
    els.searchInput.value = "";
    els.searchInput.focus();
    render();
  });
  els.filterToggle.addEventListener("click", () => {
    const expanded = els.filterToggle.getAttribute("aria-expanded") === "true";
    els.filterToggle.setAttribute("aria-expanded", String(!expanded));
    els.filterPanel.classList.toggle("is-collapsed", expanded);
  });
  els.folderFilter.addEventListener("change", () => {
    state.folderId = els.folderFilter.value;
    state.visibleLimit = 80;
    render();
  });
  els.domainFilter.addEventListener("change", () => {
    state.domain = els.domainFilter.value;
    state.visibleLimit = 80;
    render();
  });
  els.timeFilter.addEventListener("change", () => {
    state.time = els.timeFilter.value;
    state.visibleLimit = 80;
    render();
  });
  els.sortFilter.addEventListener("change", () => {
    state.sort = els.sortFilter.value;
    render();
  });
  els.recentChip.addEventListener("click", () => {
    state.time = state.time === "7" ? "all" : "7";
    els.timeFilter.value = state.time;
    render();
  });
  els.duplicateChip.addEventListener("click", () => {
    state.duplicateOnly = !state.duplicateOnly;
    render();
  });
  els.resetFilters.addEventListener("click", resetFilters);
  els.loadMore.addEventListener("click", () => {
    state.visibleLimit += 80;
    render();
  });
  els.openManager.addEventListener("click", () => chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") }));
  els.openDashboard.addEventListener("click", () => chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") }));
  els.openSidePanel.addEventListener("click", async () => {
    if (!chrome.sidePanel?.open) { showToast("Chrome bản này chưa hỗ trợ side panel"); return; }
    const [tab] = await chromeCall((done) => chrome.tabs.query({ active: true, currentWindow: true }, done));
    await chrome.sidePanel.open({ windowId: tab.windowId });
  });
  els.saveCurrent.addEventListener("click", () => openAddDialog("tab"));
  els.saveAllTabs.addEventListener("click", () => openAddDialog("window"));
  els.addForm.addEventListener("submit", saveQuickAdd);
  els.closeAdd.addEventListener("click", () => els.addDialog.close());
  els.cancelAdd.addEventListener("click", () => els.addDialog.close());
  els.themeToggle.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    state.settings.theme = next;
    chrome.storage.local.set({ bookmarkLensSettings: state.settings });
  });
  els.closeEdit.addEventListener("click", () => els.editDialog.close());
  els.cancelEdit.addEventListener("click", () => els.editDialog.close());
  els.cancelDelete.addEventListener("click", () => els.deleteDialog.close());

  els.editForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await chromeCall((done) => chrome.bookmarks.update(els.editId.value, {
        title: els.editTitle.value.trim(),
        url: els.editUrl.value.trim(),
      }, done));
      els.editDialog.close();
      await refreshBookmarks();
      showToast("Đã cập nhật bookmark");
    } catch (error) {
      showToast(error.message || "Không thể cập nhật bookmark");
    }
  });

  els.deleteForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await chromeCall((done) => chrome.bookmarks.remove(els.deleteId.value, done));
      els.deleteDialog.close();
      await refreshBookmarks();
      showToast("Đã xóa bookmark");
    } catch (error) {
      showToast(error.message || "Không thể xóa bookmark");
    }
  });

  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      els.searchInput.focus();
    }
  });
}

async function init() {
  bindEvents();
  try {
    await refreshBookmarks();
    state.sort = state.settings.defaultSort || "newest";
    els.sortFilter.value = state.sort;
    BookmarkLens.applyTheme(state.settings.theme || "system");
    await window.BookmarkLensI18n?.setLanguage(state.settings.language || "vi");
    window.BookmarkLensI18n?.bindSelects();
    render();
  } catch (error) {
    els.libraryCount.textContent = "Không thể đọc bookmark";
    els.results.innerHTML = `<div class="empty-state"><h2>Có lỗi xảy ra</h2><p>${escapeHtml(error.message)}</p></div>`;
  }
}

init();
