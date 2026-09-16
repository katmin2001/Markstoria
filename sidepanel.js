const BL = window.BookmarkLens;

const state = {
  bookmarks: [],
  folders: [],
  settings: {},
  metadata: {},
  duplicateIds: new Set(),
  query: "",
  domain: "all",
  visibleLimit: 60,
  currentDomain: "",
};

const els = {
  libraryCount: document.querySelector("#libraryCount"),
  openDashboard: document.querySelector("#openDashboard"),
  saveTab: document.querySelector("#saveTab"),
  openCurrentDomain: document.querySelector("#openCurrentDomain"),
  searchInput: document.querySelector("#searchInput"),
  clearSearch: document.querySelector("#clearSearch"),
  domainChips: document.querySelector("#domainChips"),
  workspaceChips: document.querySelector("#workspaceChips"),
  folderTargets: document.querySelector("#folderTargets"),
  results: document.querySelector("#results"),
  loadMore: document.querySelector("#loadMore"),
  toast: document.querySelector("#toast"),
};

let toastTimer;

function showToast(message) {
  clearTimeout(toastTimer);
  els.toast.textContent = window.BookmarkLensI18n?.t(message) || message;
  els.toast.classList.add("is-visible");
  toastTimer = setTimeout(() => els.toast.classList.remove("is-visible"), 2200);
}

function matchesQuery(bookmark) {
  const parsed = BL.parseQuery(state.query);
  const tags = (bookmark.meta.tags || []).map(BL.normalizeText);
  const haystack = BL.normalizeText([bookmark.title, bookmark.url, bookmark.folderPath, bookmark.domain, tags.join(" "), bookmark.meta.note || ""].join(" "));
  if (parsed.site.length && !parsed.site.every((value) => BL.normalizeText(bookmark.domain).includes(value))) return false;
  if (parsed.folder.length && !parsed.folder.every((value) => BL.normalizeText(bookmark.folderPath).includes(value))) return false;
  if (parsed.tag.length && !parsed.tag.every((value) => tags.some((tag) => tag.includes(value)))) return false;
  if (parsed.status.length && !parsed.status.every((value) => value === (bookmark.meta.readStatus || "read") || value === bookmark.meta.linkStatus?.status)) return false;
  if (parsed.is.includes("pinned") && !bookmark.meta.pinned) return false;
  if (parsed.is.includes("duplicate") && !state.duplicateIds.has(bookmark.id)) return false;
  return parsed.terms.every((term) => BL.fuzzyMatch(haystack, term));
}

function filteredBookmarks() {
  return state.bookmarks
    .filter((bookmark) => (state.domain === "all" || bookmark.domain === state.domain) && matchesQuery(bookmark))
    .sort((a, b) => {
      if (state.query) return b.dateAdded - a.dateAdded;
      if (state.currentDomain && a.domain === state.currentDomain && b.domain !== state.currentDomain) return -1;
      if (state.currentDomain && b.domain === state.currentDomain && a.domain !== state.currentDomain) return 1;
      return b.dateAdded - a.dateAdded;
    });
}

function renderChips() {
  const counts = new Map();
  state.bookmarks.forEach((bookmark) => counts.set(bookmark.domain, (counts.get(bookmark.domain) || 0) + 1));
  const domains = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  els.domainChips.innerHTML = [
    `<button class="chip ${state.domain === "all" ? "is-active" : ""}" data-domain="all" type="button">Tất cả</button>`,
    ...domains.map(([domain, count]) => `<button class="chip ${state.domain === domain ? "is-active" : ""}" data-domain="${BL.escapeHtml(domain)}" type="button">${BL.escapeHtml(domain)} · ${count}</button>`),
  ].join("");

  const workspaces = state.settings.workspaces || [];
  els.workspaceChips.innerHTML = workspaces.slice(0, 8).map((workspace) => `<button class="chip" data-workspace="${BL.escapeHtml(workspace.id)}" type="button">${BL.escapeHtml(workspace.name)}</button>`).join("");

  els.folderTargets.innerHTML = [...state.folders]
    .sort((a, b) => a.path.localeCompare(b.path, "vi"))
    .slice(0, 30)
    .map((folder) => `<div class="folder-target" data-folder="${folder.id}" title="${BL.escapeHtml(folder.path)}"><span>${BL.escapeHtml(folder.path)}</span><b>${state.bookmarks.filter((item) => item.parentId === folder.id).length}</b></div>`)
    .join("");
}

function resultItem(bookmark) {
  const unread = bookmark.meta.readStatus === "unread" ? '<span class="badge">CHƯA ĐỌC</span>' : "";
  return `<article class="result" data-id="${bookmark.id}" draggable="true">
    <div class="favicon"><span>${BL.escapeHtml((bookmark.domain || "B")[0].toUpperCase())}</span><img loading="lazy" src="${BL.faviconUrl(bookmark.url)}" alt="" /></div>
    <div>
      <a class="result-title" href="${BL.escapeHtml(bookmark.url)}" target="_blank" rel="noreferrer">${BL.escapeHtml(bookmark.title)}${unread}</a>
      <button class="result-domain" data-domain="${BL.escapeHtml(bookmark.domain)}" type="button">${BL.escapeHtml(bookmark.domain)}</button>
      <div class="result-folder">${BL.escapeHtml(bookmark.folderPath)}</div>
    </div>
    <button class="icon-button" data-open="${bookmark.id}" type="button" aria-label="Mở"><svg><use href="#i-external"></use></svg></button>
  </article>`;
}

function render() {
  const filtered = filteredBookmarks();
  const visible = filtered.slice(0, state.visibleLimit);
  els.results.innerHTML = visible.length ? visible.map(resultItem).join("") : `<div class="empty">Không tìm thấy bookmark phù hợp.</div>`;
  els.loadMore.classList.toggle("is-hidden", visible.length >= filtered.length);
  els.loadMore.textContent = `Xem thêm ${Math.min(60, filtered.length - visible.length)}`;
  els.clearSearch.classList.toggle("is-hidden", !state.query);
  renderChips();
  els.results.querySelectorAll("img").forEach((image) => image.addEventListener("error", (event) => event.currentTarget.remove()));
  bindDragDrop();
  window.BookmarkLensI18n?.apply(document.body);
}

function bindDragDrop() {
  els.results.querySelectorAll(".result").forEach((row) => {
    row.addEventListener("dragstart", (event) => {
      event.dataTransfer.setData("text/plain", row.dataset.id);
      event.dataTransfer.effectAllowed = "move";
    });
  });
  els.folderTargets.querySelectorAll(".folder-target").forEach((target) => {
    target.addEventListener("dragover", (event) => { event.preventDefault(); target.classList.add("is-drop-target"); });
    target.addEventListener("dragleave", () => target.classList.remove("is-drop-target"));
    target.addEventListener("drop", async (event) => {
      event.preventDefault();
      target.classList.remove("is-drop-target");
      const id = event.dataTransfer.getData("text/plain");
      const bookmark = state.bookmarks.find((item) => item.id === id);
      if (!bookmark || bookmark.parentId === target.dataset.folder) return;
      await BL.chromeCall((done) => chrome.bookmarks.move(id, { parentId: target.dataset.folder }, done));
      await refresh();
      showToast("Đã di chuyển bookmark");
    });
  });
}

async function saveCurrentTab() {
  const [tab] = await BL.chromeCall((done) => chrome.tabs.query({ active: true, currentWindow: true }, done));
  if (!tab?.url || !/^https?:/i.test(tab.url)) { showToast("Tab này không thể lưu"); return; }
  const existing = state.bookmarks.find((bookmark) => BL.normalizeUrl(bookmark.url) === BL.normalizeUrl(tab.url));
  if (existing) { showToast("URL này đã có trong bookmark"); return; }
  const parentId = state.settings.lastFolderId || state.folders[0]?.id || "1";
  const created = await BL.chromeCall((done) => chrome.bookmarks.create({ parentId, title: tab.title || tab.url, url: tab.url }, done));
  if (state.settings.autoOrganizeNew && state.settings.autoRules?.length) {
    const temp = { ...created, domain: BL.getDomain(created.url), folderPath: "", meta: {} };
    const matching = state.settings.autoRules.map(BL.normalizeRule).filter((rule) => BL.ruleMatchesBookmark(rule, temp));
    const target = matching.find((rule) => rule.folderId)?.folderId;
    if (target) await BL.chromeCall((done) => chrome.bookmarks.move(created.id, { parentId: target }, done)).catch(() => {});
  }
  await refresh();
  showToast("Đã lưu tab hiện tại");
}

function openWorkspace(id) {
  const workspace = (state.settings.workspaces || []).find((item) => item.id === id);
  if (!workspace) return;
  state.query = workspace.query || "";
  state.domain = workspace.domain || "all";
  state.visibleLimit = 60;
  els.searchInput.value = state.query;
  render();
}

async function refresh() {
  const library = await BL.loadLibrary(true);
  Object.assign(state, library);
  state.visibleLimit = 60;
  state.duplicateIds = new Set(BL.findDuplicateGroups(state.bookmarks).flat().map((item) => item.id));
  const [tab] = await BL.chromeCall((done) => chrome.tabs.query({ active: true, currentWindow: true }, done)).catch(() => []);
  state.currentDomain = tab?.url ? BL.getDomain(tab.url) : "";
  els.openCurrentDomain.disabled = !state.currentDomain;
  els.openCurrentDomain.textContent = state.currentDomain ? state.currentDomain : "Domain này";
  els.libraryCount.textContent = `${state.bookmarks.length.toLocaleString("vi-VN")} bookmark`;
  BL.applyTheme(state.settings.theme);
  await window.BookmarkLensI18n?.setLanguage(state.settings.language || "vi");
  window.BookmarkLensI18n?.bindSelects();
  render();
}

function bindEvents() {
  els.openDashboard.addEventListener("click", () => chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") }));
  els.saveTab.addEventListener("click", saveCurrentTab);
  els.openCurrentDomain.addEventListener("click", () => {
    if (!state.currentDomain) return;
    state.domain = state.domain === state.currentDomain ? "all" : state.currentDomain;
    state.visibleLimit = 60;
    render();
  });
  els.searchInput.addEventListener("input", () => { state.query = els.searchInput.value; state.visibleLimit = 60; render(); });
  els.clearSearch.addEventListener("click", () => { state.query = ""; els.searchInput.value = ""; render(); els.searchInput.focus(); });
  els.loadMore.addEventListener("click", () => { state.visibleLimit += 60; render(); });
  els.domainChips.addEventListener("click", (event) => {
    const button = event.target.closest("[data-domain]");
    if (!button) return;
    state.domain = button.dataset.domain;
    state.visibleLimit = 60;
    render();
  });
  els.workspaceChips.addEventListener("click", (event) => {
    const button = event.target.closest("[data-workspace]");
    if (button) openWorkspace(button.dataset.workspace);
  });
  els.results.addEventListener("click", (event) => {
    const domain = event.target.closest("[data-domain]")?.dataset.domain;
    if (domain) { state.domain = domain; state.visibleLimit = 60; render(); return; }
    const id = event.target.closest("[data-open]")?.dataset.open;
    const bookmark = state.bookmarks.find((item) => item.id === id);
    if (bookmark) chrome.tabs.create({ url: bookmark.url });
  });
  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      els.searchInput.focus();
    }
  });
}

bindEvents();
refresh().catch((error) => {
  els.libraryCount.textContent = "Không thể tải";
  els.results.innerHTML = `<div class="empty">${BL.escapeHtml(error.message)}</div>`;
});
