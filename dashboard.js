const BL = window.BookmarkLens;

const state = {
  tree: [],
  bookmarks: [],
  folders: [],
  metadata: {},
  settings: {},
  duplicateGroups: [],
  duplicateIds: new Set(),
  selected: new Set(),
  query: "",
  smart: "all",
  folderId: "all",
  domain: "all",
  sort: "newest",
  visibleLimit: 120,
  virtualStart: 0,
  virtualRowHeight: 70,
  indexedMatchIds: null,
  indexTimer: null,
  searchTimer: null,
  draggedId: null,
  undoStack: [],
  pendingRulePreview: null,
  vaultKey: null,
  hiddenItems: [],
  confirmResolver: null,
  toastTimer: null,
  lastBackup: null,
  commandIndex: 0,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const els = {
  searchInput: $("#searchInput"), clearSearch: $("#clearSearch"), searchSuggestions: $("#searchSuggestions"),
  quickAdd: $("#quickAdd"), commandButton: $("#commandButton"), openSidePanel: $("#openSidePanel"), helpButton: $("#helpButton"), themeToggle: $("#themeToggle"), smartFolders: $("#smartFolders"),
  folderTree: $("#folderTree"), newFolderButton: $("#newFolderButton"), viewTitle: $("#viewTitle"),
  resultCount: $("#resultCount"), sortSelect: $("#sortSelect"), selectAll: $("#selectAll"),
  domainSelect: $("#domainSelect"),
  bulkBar: $("#bulkBar"), selectedCount: $("#selectedCount"), clearSelection: $("#clearSelection"),
  bookmarkList: $("#bookmarkList"), loadMore: $("#loadMore"), duplicateSummary: $("#duplicateSummary"),
  duplicateGroups: $("#duplicateGroups"), cleanDuplicates: $("#cleanDuplicates"), checkLinks: $("#checkLinks"),
  linkSummary: $("#linkSummary"), linkProgress: $("#linkProgress"), linkResults: $("#linkResults"),
  statCards: $("#statCards"), domainChart: $("#domainChart"), monthChart: $("#monthChart"),
  folderStats: $("#folderStats"), exportJson: $("#exportJson"), exportHtml: $("#exportHtml"),
  importFile: $("#importFile"), defaultSort: $("#defaultSort"), themeSetting: $("#themeSetting"),
  syncSettings: $("#syncSettings"), syncMetadata: $("#syncMetadata"), autoOrganizeNew: $("#autoOrganizeNew"), compactMode: $("#compactMode"), virtualList: $("#virtualList"), pageSize: $("#pageSize"),
  autoRuleSummary: $("#autoRuleSummary"), ruleList: $("#ruleList"), ruleSuggestionList: $("#ruleSuggestionList"),
  ruleName: $("#ruleName"), ruleField: $("#ruleField"), ruleMatch: $("#ruleMatch"), ruleValue: $("#ruleValue"),
  ruleFolder: $("#ruleFolder"), ruleTags: $("#ruleTags"), ruleReadStatus: $("#ruleReadStatus"),
  addRule: $("#addRule"), applyRulesAll: $("#applyRulesAll"), applyRulesSelected: $("#applyRulesSelected"), applyRuleTemplate: $("#applyRuleTemplate"),
  workspaceName: $("#workspaceName"), saveWorkspace: $("#saveWorkspace"), workspaceList: $("#workspaceList"),
  editorDialog: $("#editorDialog"), editorForm: $("#editorForm"), editorId: $("#editorId"),
  editorTitle: $("#editorTitle"), editorUrl: $("#editorUrl"), editorFolder: $("#editorFolder"),
  editorTags: $("#editorTags"), editorNote: $("#editorNote"), editorUnread: $("#editorUnread"),
  editorPinned: $("#editorPinned"), editorTagColor: $("#editorTagColor"), previewStatus: $("#previewStatus"), previewFrame: $("#previewFrame"), loadPreview: $("#loadPreview"),
  moveDialog: $("#moveDialog"), moveForm: $("#moveForm"),
  moveFolder: $("#moveFolder"), folderDialog: $("#folderDialog"), folderForm: $("#folderForm"),
  folderName: $("#folderName"), folderParent: $("#folderParent"), addDialog: $("#addDialog"),
  addForm: $("#addForm"), addTitle: $("#addTitle"), addUrl: $("#addUrl"), addFolder: $("#addFolder"),
  addTags: $("#addTags"), addUnread: $("#addUnread"), addDuplicateHint: $("#addDuplicateHint"),
  addTagColor: $("#addTagColor"), saveWindow: $("#saveWindow"), confirmDialog: $("#confirmDialog"), confirmForm: $("#confirmForm"),
  confirmTitle: $("#confirmTitle"), confirmMessage: $("#confirmMessage"), confirmAction: $("#confirmAction"),
  rulePreviewDialog: $("#rulePreviewDialog"), rulePreviewForm: $("#rulePreviewForm"), rulePreviewSummary: $("#rulePreviewSummary"), rulePreviewList: $("#rulePreviewList"), confirmRulePreview: $("#confirmRulePreview"),
  commandDialog: $("#commandDialog"), commandInput: $("#commandInput"), commandList: $("#commandList"), helpDialog: $("#helpDialog"),
  onboardingDialog: $("#onboardingDialog"), onboardingForm: $("#onboardingForm"), finishOnboarding: $("#finishOnboarding"),
  hiddenLocked: $("#hiddenLocked"), hiddenUnlocked: $("#hiddenUnlocked"), hiddenUnlock: $("#hiddenUnlock"),
  hiddenLock: $("#hiddenLock"), hiddenSaveCurrent: $("#hiddenSaveCurrent"), hiddenSummary: $("#hiddenSummary"), hiddenList: $("#hiddenList"),
  toast: $("#toast"), toastMessage: $("#toastMessage"), undoButton: $("#undoButton"),
  lastBackupInfo: $("#lastBackupInfo"), restoreBackup: $("#restoreBackup"),
};

function folderOptions(selectedId, includeRoot = false) {
  const folders = [...state.folders].sort((a, b) => a.path.localeCompare(b.path, "vi"));
  const rootOption = includeRoot ? '<option value="1">Thanh dấu trang</option>' : "";
  return rootOption + folders.map((folder) => `<option value="${folder.id}" ${folder.id === selectedId ? "selected" : ""}>${BL.escapeHtml(folder.path)}</option>`).join("");
}

function showToast(message, undo) {
  clearTimeout(state.toastTimer);
  els.toastMessage.textContent = window.BookmarkLensI18n?.t(message) || message;
  const canUndo = undo || state.undoStack.length > 0;
  els.undoButton.classList.toggle("is-hidden", !canUndo);
  els.undoButton.innerHTML = `<svg><use href="#i-undo"></use></svg>Hoàn tác${state.undoStack.length > 1 ? ` (${state.undoStack.length})` : ""}`;
  els.toast.classList.add("is-visible");
  state.toastTimer = setTimeout(() => els.toast.classList.remove("is-visible"), undo ? 7000 : 2600);
}

function setUndo(message, callback) {
  state.undoStack = [{ message, callback }, ...state.undoStack].slice(0, 12);
  showToast(message, true);
}

async function refreshLibrary(options = {}) {
  const previousSelected = options.keepSelection ? state.selected : new Set();
  const library = await BL.loadLibrary(true);
  Object.assign(state, library);
  state.selected = new Set([...previousSelected].filter((id) => state.bookmarks.some((item) => item.id === id)));
  state.duplicateGroups = BL.findDuplicateGroups(state.bookmarks);
  state.duplicateIds = new Set(state.duplicateGroups.flat().map((item) => item.id));
  scheduleIndexRebuild();
  renderAll();
}

function scheduleIndexRebuild() {
  clearTimeout(state.indexTimer);
  state.indexTimer = setTimeout(() => {
    BL.rebuildSearchIndex?.(state.bookmarks).catch(() => {});
  }, 250);
}

function scheduleIndexedSearch() {
  clearTimeout(state.searchTimer);
  state.indexedMatchIds = null;
  const query = state.query.trim();
  if (!query) { renderLibrary(); return; }
  state.searchTimer = setTimeout(async () => {
    try {
      state.indexedMatchIds = await BL.searchBookmarkIndex?.(query, 10000);
    } catch {
      state.indexedMatchIds = null;
    }
    renderLibrary();
  }, 90);
}

function smartDefinitions() {
  const now = Date.now();
  const count = (predicate) => state.bookmarks.filter(predicate).length;
  const domainCounts = new Map();
  state.bookmarks.forEach((bookmark) => domainCounts.set(bookmark.domain, (domainCounts.get(bookmark.domain) || 0) + 1));
  const frequentDomains = new Set([...domainCounts.entries()].filter((entry) => entry[1] >= 3).map((entry) => entry[0]));
  return [
    { id: "all", label: "Tất cả bookmark", icon: "bookmark", count: state.bookmarks.length },
    { id: "recent", label: "Thêm gần đây", icon: "clock", count: count((b) => now - b.dateAdded <= 7 * 86400000) },
    { id: "uncategorized", label: "Chưa phân loại", icon: "folder", count: count((b) => b.ancestorIds.length <= 1) },
    { id: "duplicates", label: "Trùng lặp", icon: "copy", count: state.duplicateIds.size },
    { id: "broken", label: "Liên kết hỏng", icon: "link", count: count((b) => b.meta.linkStatus?.status === "broken") },
    { id: "unread", label: "Chưa đọc", icon: "book", count: count((b) => b.meta.readStatus === "unread") },
    { id: "pinned", label: "Đã ghim", icon: "pin", count: count((b) => b.meta.pinned) },
    { id: "frequent", label: "Tên miền phổ biến", icon: "chart", count: count((b) => frequentDomains.has(b.domain)) },
  ];
}

function renderSidebar() {
  els.smartFolders.innerHTML = smartDefinitions().map((item) => `
    <button class="nav-item ${state.smart === item.id && state.folderId === "all" ? "is-active" : ""}" data-smart="${item.id}" type="button">
      <svg><use href="#i-${item.icon}"></use></svg><span>${item.label}</span><span class="nav-count">${item.count}</span>
    </button>`).join("");

  els.folderTree.innerHTML = [...state.folders]
    .sort((a, b) => a.path.localeCompare(b.path, "vi"))
    .map((folder) => {
      const count = state.bookmarks.filter((bookmark) => bookmark.ancestorIds.includes(folder.id)).length;
      const depth = Math.min(folder.depth - 1, 4);
      return `<button class="folder-item ${state.folderId === folder.id ? "is-active" : ""}" data-folder="${folder.id}" type="button" style="padding-left:${9 + depth * 12}px" title="${BL.escapeHtml(folder.path)}"><svg><use href="#i-folder"></use></svg><span>${BL.escapeHtml(folder.title)}</span><span class="nav-count">${count}</span></button>`;
    }).join("");
  bindFolderDropTargets();
}

function renderDomainOptions() {
  const counts = new Map();
  state.bookmarks.forEach((bookmark) => counts.set(bookmark.domain, (counts.get(bookmark.domain) || 0) + 1));
  const domains = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "vi"));
  els.domainSelect.replaceChildren(new Option("Tất cả website", "all"));
  domains.forEach(([domain, count]) => els.domainSelect.add(new Option(`${domain} (${count})`, domain)));
  els.domainSelect.value = state.domain;
  if (!els.domainSelect.value) { state.domain = "all"; els.domainSelect.value = "all"; }
}

function matchesSmart(bookmark) {
  if (state.smart === "recent") return Date.now() - bookmark.dateAdded <= 7 * 86400000;
  if (state.smart === "uncategorized") return bookmark.ancestorIds.length <= 1;
  if (state.smart === "duplicates") return state.duplicateIds.has(bookmark.id);
  if (state.smart === "broken") return bookmark.meta.linkStatus?.status === "broken";
  if (state.smart === "unread") return bookmark.meta.readStatus === "unread";
  if (state.smart === "pinned") return Boolean(bookmark.meta.pinned);
  if (state.smart === "frequent") {
    const domainCount = state.bookmarks.filter((item) => item.domain === bookmark.domain).length;
    return domainCount >= 3;
  }
  return true;
}

function matchesQuery(bookmark) {
  const parsed = BL.parseQuery(state.query);
  const tags = (bookmark.meta.tags || []).map(BL.normalizeText);
  const readStatus = bookmark.meta.readStatus || "read";
  if (parsed.site.length && !parsed.site.every((value) => BL.normalizeText(bookmark.domain).includes(value))) return false;
  if (parsed.folder.length && !parsed.folder.every((value) => BL.normalizeText(bookmark.folderPath).includes(value))) return false;
  if (parsed.tag.length && !parsed.tag.every((value) => tags.some((tag) => tag.includes(value)))) return false;
  if (parsed.status.length && !parsed.status.every((value) => value === readStatus || value === bookmark.meta.linkStatus?.status)) return false;
  if (parsed.is.includes("pinned") && !bookmark.meta.pinned) return false;
  if (parsed.is.includes("duplicate") && !state.duplicateIds.has(bookmark.id)) return false;
  const haystack = BL.normalizeText([bookmark.title, bookmark.url, bookmark.folderPath, tags.join(" "), bookmark.meta.note || ""].join(" "));
  return parsed.terms.every((term) => BL.fuzzyMatch(haystack, term));
}

function filteredBookmarks() {
  const items = state.bookmarks.filter((bookmark) => {
    if (state.indexedMatchIds && !state.indexedMatchIds.has(bookmark.id)) return false;
    const folderMatch = state.folderId === "all" || bookmark.ancestorIds.includes(state.folderId);
    const domainMatch = state.domain === "all" || bookmark.domain === state.domain;
    return folderMatch && domainMatch && matchesSmart(bookmark) && matchesQuery(bookmark);
  });
  items.sort((a, b) => {
    if (state.sort === "oldest") return a.dateAdded - b.dateAdded;
    if (state.sort === "az") return a.title.localeCompare(b.title, "vi");
    if (state.sort === "za") return b.title.localeCompare(a.title, "vi");
    if (state.sort === "domain") return a.domain.localeCompare(b.domain, "vi") || a.title.localeCompare(b.title, "vi");
    if (state.sort === "folder") return a.folderPath.localeCompare(b.folderPath, "vi") || a.index - b.index;
    if (state.sort === "mostVisited") return b.visitCount - a.visitCount || b.dateAdded - a.dateAdded;
    if (state.sort === "recentVisited") return b.lastVisitTime - a.lastVisitTime || b.dateAdded - a.dateAdded;
    if (state.sort === "manual") return a.folderPath.localeCompare(b.folderPath, "vi") || a.index - b.index;
    return b.dateAdded - a.dateAdded;
  });
  return items;
}

function currentViewTitle() {
  if (state.folderId !== "all") return state.folders.find((folder) => folder.id === state.folderId)?.title || "Thư mục";
  return smartDefinitions().find((item) => item.id === state.smart)?.label || "Tất cả bookmark";
}

function bookmarkRow(bookmark) {
  const color = ["green", "blue", "coral", "gold", "gray"].includes(bookmark.meta.tagColor) ? bookmark.meta.tagColor : "blue";
  const tags = (bookmark.meta.tags || []).slice(0, 3).map((tag) => `<span class="mini-tag color-${color}">${BL.escapeHtml(tag)}</span>`).join("");
  const unread = bookmark.meta.readStatus === "unread" ? '<span class="status-pill unread">CHƯA ĐỌC</span>' : "";
  const broken = bookmark.meta.linkStatus?.status === "broken" ? '<span class="status-pill broken">LINK HỎNG</span>' : "";
  const pinned = bookmark.meta.pinned ? '<svg title="Đã ghim"><use href="#i-pin"></use></svg>' : "";
  return `<article class="bookmark-row ${state.selected.has(bookmark.id) ? "is-selected" : ""}" data-id="${bookmark.id}" draggable="true">
    <input class="row-select" type="checkbox" ${state.selected.has(bookmark.id) ? "checked" : ""} aria-label="Chọn ${BL.escapeHtml(bookmark.title)}" />
    <div class="bookmark-main"><div class="favicon"><span>${BL.escapeHtml((bookmark.domain || "B")[0].toUpperCase())}</span><img loading="lazy" src="${BL.faviconUrl(bookmark.url)}" alt="" /></div><div class="bookmark-text"><a class="bookmark-title" href="${BL.escapeHtml(bookmark.url)}" target="_blank" rel="noreferrer" data-open="${bookmark.id}">${BL.escapeHtml(bookmark.title)}${pinned}</a><button class="bookmark-domain domain-link" data-domain-filter="${BL.escapeHtml(bookmark.domain)}" type="button" title="Chỉ xem ${BL.escapeHtml(bookmark.domain)}">${BL.escapeHtml(bookmark.domain)}</button><div class="tag-line">${unread}${broken}${tags}</div></div></div>
    <div class="folder-cell" title="${BL.escapeHtml(bookmark.folderPath)}">${BL.escapeHtml(bookmark.folderPath)}</div>
    <div class="activity-cell"><span>${BL.relativeDate(bookmark.dateAdded)}</span><span>${bookmark.visitCount ? `${bookmark.visitCount} lượt truy cập` : "Chưa có lịch sử"}</span></div>
    <div class="row-actions"><button class="icon-button" data-action="read" type="button" title="${bookmark.meta.readStatus === "unread" ? "Đánh dấu đã đọc" : "Đánh dấu chưa đọc"}" aria-label="Đổi trạng thái đọc"><svg><use href="#i-book"></use></svg></button><button class="icon-button" data-action="pin" type="button" title="Ghim" aria-label="Ghim"><svg><use href="#i-pin"></use></svg></button><button class="icon-button" data-action="edit" type="button" title="Chỉnh sửa" aria-label="Chỉnh sửa"><svg><use href="#i-edit"></use></svg></button></div>
  </article>`;
}

function renderLibrary() {
  const filtered = filteredBookmarks();
  const useVirtual = Boolean(state.settings.virtualList) && filtered.length > 600;
  const pageLimit = useVirtual ? filtered.length : state.visibleLimit;
  const pageItems = filtered.slice(0, pageLimit);
  let visible = pageItems;
  let topSpacer = 0;
  let bottomSpacer = 0;
  if (useVirtual) {
    const viewportRows = Math.ceil(innerHeight / state.virtualRowHeight) + 10;
    const maxStart = Math.max(0, pageItems.length - viewportRows);
    state.virtualStart = Math.min(state.virtualStart, maxStart);
    visible = pageItems.slice(state.virtualStart, state.virtualStart + viewportRows);
    topSpacer = state.virtualStart * state.virtualRowHeight;
    bottomSpacer = Math.max(0, (pageItems.length - state.virtualStart - visible.length) * state.virtualRowHeight);
    document.documentElement.dataset.virtual = "true";
  } else {
    state.virtualStart = 0;
    document.documentElement.dataset.virtual = "false";
  }
  els.viewTitle.textContent = currentViewTitle();
  els.resultCount.textContent = `${filtered.length.toLocaleString("vi-VN")} bookmark${state.query ? ` khớp “${state.query}”` : ""}`;
  els.bookmarkList.innerHTML = visible.length
    ? `${topSpacer ? `<div class="virtual-spacer" style="height:${topSpacer}px"></div>` : ""}${visible.map(bookmarkRow).join("")}${bottomSpacer ? `<div class="virtual-spacer" style="height:${bottomSpacer}px"></div>` : ""}`
    : `<div class="empty-state"><div class="empty-icon"><svg><use href="#i-search"></use></svg></div><h2>Không tìm thấy bookmark</h2><p>Thử từ khóa ngắn hơn, cú pháp khác hoặc chọn một thư mục khác.</p></div>`;
  els.loadMore.classList.toggle("is-hidden", useVirtual || pageLimit >= filtered.length);
  if (!useVirtual && pageLimit < filtered.length) els.loadMore.textContent = `Xem thêm ${Math.min(state.settings.pageSize || 120, filtered.length - pageLimit)} bookmark`;
  els.clearSearch.classList.toggle("is-hidden", !state.query);
  els.selectAll.checked = filtered.length > 0 && filtered.every((item) => state.selected.has(item.id));
  els.selectAll.indeterminate = state.selected.size > 0 && !els.selectAll.checked;
  renderBulkBar();
  bindRows();
  window.BookmarkLensI18n?.apply(document.body);
}

function renderBulkBar() {
  els.selectedCount.textContent = state.selected.size;
  els.bulkBar.classList.toggle("is-hidden", state.selected.size === 0);
}

function recommendedDuplicate(group) {
  return [...group].sort((a, b) => ((b.title?.length || 0) - (a.title?.length || 0)) || b.dateAdded - a.dateAdded)[0];
}

function renderDuplicates() {
  els.duplicateSummary.textContent = state.duplicateGroups.length
    ? `${state.duplicateGroups.length} nhóm · ${state.duplicateIds.size} bookmark liên quan`
    : "Thư viện không có URL trùng lặp";
  els.cleanDuplicates.disabled = state.duplicateGroups.length === 0;
  els.duplicateGroups.innerHTML = state.duplicateGroups.length ? state.duplicateGroups.map((group, index) => {
    const recommended = recommendedDuplicate(group);
    return `<div class="duplicate-group" data-group="${index}"><h3>${BL.escapeHtml(group[0].domain)} · Giữ lại một bản</h3>${group.map((bookmark) => `<label class="duplicate-choice"><input type="radio" name="duplicate-${index}" value="${bookmark.id}" ${bookmark.id === recommended.id ? "checked" : ""} /><span title="${BL.escapeHtml(bookmark.folderPath)}">${BL.escapeHtml(bookmark.title)} · ${BL.escapeHtml(bookmark.folderPath)}</span>${bookmark.id === recommended.id ? '<b class="recommended">ĐỀ XUẤT</b>' : ""}</label>`).join("")}</div>`;
  }).join("") : `<div class="empty-state"><div class="empty-icon"><svg><use href="#i-check"></use></svg></div><h2>Thư viện gọn gàng</h2><p>Không có bookmark trùng cần xử lý.</p></div>`;
}

function renderStats() {
  const broken = state.bookmarks.filter((b) => b.meta.linkStatus?.status === "broken").length;
  const unread = state.bookmarks.filter((b) => b.meta.readStatus === "unread").length;
  const stats = [["Bookmark", state.bookmarks.length], ["Thư mục", state.folders.length], ["Nhóm trùng", state.duplicateGroups.length], ["Chưa đọc", unread], ["Link hỏng", broken]];
  els.statCards.innerHTML = stats.map(([label, value]) => `<div class="stat-card"><span>${label}</span><strong>${value.toLocaleString("vi-VN")}</strong></div>`).join("");

  const domainCounts = new Map();
  state.bookmarks.forEach((b) => domainCounts.set(b.domain, (domainCounts.get(b.domain) || 0) + 1));
  const domains = [...domainCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxDomain = domains[0]?.[1] || 1;
  els.domainChart.innerHTML = domains.map(([domain, count]) => `<button class="bar-row domain-filter" data-domain="${BL.escapeHtml(domain)}" type="button"><span>${BL.escapeHtml(domain)}</span><span class="bar-track"><i style="width:${count / maxDomain * 100}%"></i></span><b>${count}</b></button>`).join("");

  const months = [];
  for (let offset = 5; offset >= 0; offset -= 1) {
    const date = new Date(); date.setDate(1); date.setMonth(date.getMonth() - offset);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    months.push({ key, label: `T${date.getMonth() + 1}`, count: 0 });
  }
  state.bookmarks.forEach((b) => {
    const date = new Date(b.dateAdded); const key = `${date.getFullYear()}-${date.getMonth()}`;
    const month = months.find((m) => m.key === key); if (month) month.count += 1;
  });
  const maxMonth = Math.max(1, ...months.map((m) => m.count));
  els.monthChart.innerHTML = months.map((m) => `<div class="month-bar" title="${m.count} bookmark"><i style="height:${Math.max(3, m.count / maxMonth * 100)}%"></i><span>${m.label}</span></div>`).join("");

  const folderCounts = state.folders.map((folder) => ({ folder, count: state.bookmarks.filter((b) => b.parentId === folder.id).length })).sort((a, b) => b.count - a.count).slice(0, 8);
  const maxFolder = folderCounts[0]?.count || 1;
  els.folderStats.innerHTML = folderCounts.map(({ folder, count }) => `<div class="bar-row"><span title="${BL.escapeHtml(folder.path)}">${BL.escapeHtml(folder.path)}</span><span class="bar-track"><i style="width:${count / maxFolder * 100}%"></i></span><b>${count}</b></div>`).join("");
}

function renderSettings() {
  els.defaultSort.value = state.settings.defaultSort || "newest";
  els.themeSetting.value = state.settings.theme || "system";
  els.syncSettings.checked = Boolean(state.settings.syncEnabled);
  els.syncMetadata.checked = Boolean(state.settings.syncMetadata);
  els.autoOrganizeNew.checked = Boolean(state.settings.autoOrganizeNew);
  els.compactMode.checked = Boolean(state.settings.compactMode);
  els.virtualList.checked = state.settings.virtualList !== false;
  els.pageSize.value = String(state.settings.pageSize || 120);
  document.documentElement.dataset.compact = String(Boolean(state.settings.compactMode));
  document.documentElement.dataset.virtual = String(state.settings.virtualList !== false);
  els.searchSuggestions.innerHTML = (state.settings.searchHistory || []).map((term) => `<option value="${BL.escapeHtml(term)}"></option>`).join("");
  const backupCount = state.lastBackup?.items?.length || 0;
  els.restoreBackup.disabled = backupCount === 0;
  els.lastBackupInfo.textContent = backupCount
    ? `${backupCount} bookmark · ${new Date(state.lastBackup.createdAt).toLocaleString("vi-VN")}`
    : "Chưa có bản phục hồi.";
}

function renderAutomation() {
  const rules = (state.settings.autoRules || []).map(BL.normalizeRule);
  const enabledCount = rules.filter((rule) => rule.enabled).length;
  els.autoRuleSummary.textContent = rules.length
    ? `${enabledCount}/${rules.length} luật đang bật`
    : "Chưa có luật nào.";
  els.ruleFolder.innerHTML = '<option value="">Không di chuyển</option>' + folderOptions(state.settings.lastFolderId);
  els.ruleList.innerHTML = rules.length ? rules.map((rule) => {
    const folder = state.folders.find((item) => item.id === rule.folderId)?.path || "Không di chuyển";
    const tags = rule.tags?.length ? ` · tag: ${BL.escapeHtml(rule.tags.join(", "))}` : "";
    return `<div class="rule-card" data-rule-id="${BL.escapeHtml(rule.id)}">
      <div><strong>${BL.escapeHtml(rule.name)}</strong><span>${rule.enabled ? "Bật" : "Tắt"} · ${rule.field} ${rule.match} "${BL.escapeHtml(rule.value)}" · ${BL.escapeHtml(folder)}${tags}</span></div>
      <div class="rule-actions"><button data-rule-action="toggle" type="button">${rule.enabled ? "Tắt" : "Bật"}</button><button data-rule-action="fill" type="button">Sửa</button><button data-rule-action="delete" type="button">Xóa</button></div>
    </div>`;
  }).join("") : `<div class="empty-state"><div class="empty-icon"><svg><use href="#i-move"></use></svg></div><h2>Chưa có luật tự động</h2><p>Tạo luật đầu tiên từ domain hoặc dùng gợi ý bên dưới.</p></div>`;

  const suggestions = BL.suggestRules(state.bookmarks, state.folders);
  els.ruleSuggestionList.innerHTML = suggestions.length ? suggestions.map((rule) => `
    <div class="suggestion-card" data-suggest="${BL.escapeHtml(rule.value)}" data-field="${BL.escapeHtml(rule.field)}" data-match="${BL.escapeHtml(rule.match)}" data-tags="${BL.escapeHtml((rule.tags || []).join(","))}">
      <div><strong>${BL.escapeHtml(rule.name)}</strong><span>${rule.count} bookmark từ ${BL.escapeHtml(rule.value)}</span></div>
      <div class="rule-actions"><button data-suggest-action="use" type="button">Dùng</button><button data-suggest-action="filter" type="button">Lọc</button></div>
    </div>`).join("") : `<p class="muted-note">Chưa có domain nào đủ nổi bật để gợi ý.</p>`;

  const workspaces = state.settings.workspaces || [];
  els.workspaceList.innerHTML = workspaces.length ? workspaces.map((workspace) => `
    <div class="workspace-card" data-workspace-id="${BL.escapeHtml(workspace.id)}">
      <div><strong>${BL.escapeHtml(workspace.name)}</strong><span>${BL.escapeHtml(workspace.query || "Không có từ khóa")} · ${BL.escapeHtml(workspace.domain === "all" ? "mọi domain" : workspace.domain)} · ${(workspace.bookmarkIds || []).length} bookmark</span></div>
      <div class="rule-actions"><button data-workspace-action="open" type="button">Mở</button><button data-workspace-action="tabs" type="button">Mở tabs</button><button data-workspace-action="delete" type="button">Xóa</button></div>
    </div>`).join("") : `<p class="muted-note">Chưa lưu workspace nào.</p>`;
}

function ruleTemplates() {
  return [
    { name: "GitHub vào Development", field: "domain", match: "contains", value: "github.com", tags: ["dev"], folderName: "Development" },
    { name: "YouTube vào Video", field: "domain", match: "contains", value: "youtube.com", tags: ["video"], folderName: "Video" },
    { name: "Docs vào Tài liệu", field: "url", match: "contains", value: "docs", tags: ["docs"], folderName: "Tài liệu" },
    { name: "Bài viết dài vào Read Later", field: "title", match: "contains", value: "guide", tags: ["read later"], readStatus: "unread", folderName: "Read Later" },
  ];
}

function ruleChangesForItems(items) {
  const rules = (state.settings.autoRules || []).map(BL.normalizeRule).filter((rule) => rule.enabled);
  const changes = [];
  for (const item of items) {
    const matching = rules.filter((rule) => BL.ruleMatchesBookmark(rule, item));
    if (!matching.length) continue;
    const beforeMeta = { ...(state.metadata[item.id] || {}) };
    const targetFolder = matching.find((rule) => rule.folderId)?.folderId || item.parentId;
    const tags = new Set(beforeMeta.tags || []);
    matching.flatMap((rule) => rule.tags || []).forEach((tag) => tags.add(tag));
    const readStatus = [...matching].reverse().find((rule) => rule.readStatus)?.readStatus || beforeMeta.readStatus || "read";
    const afterMeta = { ...beforeMeta, tags: [...tags], readStatus };
    const folderChanged = targetFolder !== item.parentId;
    const tagsChanged = JSON.stringify(beforeMeta.tags || []) !== JSON.stringify(afterMeta.tags || []);
    const statusChanged = (beforeMeta.readStatus || "read") !== afterMeta.readStatus;
    if (!folderChanged && !tagsChanged && !statusChanged) continue;
    changes.push({
      item,
      beforeMeta,
      beforeMove: { id: item.id, parentId: item.parentId, index: item.index },
      targetFolder,
      afterMeta,
      matching,
    });
  }
  return changes;
}

function showRulePreview(items, message = "Đã áp dụng luật tự động") {
  const changes = ruleChangesForItems(items);
  if (!(state.settings.autoRules || []).some((rule) => rule.enabled !== false)) { showToast("Chưa có luật đang bật"); return; }
  if (!changes.length) { showToast("Không có bookmark nào khớp luật"); return; }
  state.pendingRulePreview = { changes, message };
  els.rulePreviewSummary.textContent = `${changes.length.toLocaleString("vi-VN")} bookmark sẽ được cập nhật.`;
  els.rulePreviewList.innerHTML = changes.slice(0, 500).map((change) => {
    const target = state.folders.find((folder) => folder.id === change.targetFolder)?.path || change.item.folderPath;
    const ruleNames = change.matching.map((rule) => rule.name).join(", ");
    return `<div class="preview-row">
      <strong title="${BL.escapeHtml(change.item.url)}">${BL.escapeHtml(change.item.title)}<small>${BL.escapeHtml(change.item.domain)}</small></strong>
      <span title="${BL.escapeHtml(change.item.folderPath)}">${BL.escapeHtml(change.item.folderPath)}<small>hiện tại</small></span>
      <span title="${BL.escapeHtml(target)}"><b>${BL.escapeHtml(target)}</b><small>${BL.escapeHtml(ruleNames)}</small></span>
    </div>`;
  }).join("") + (changes.length > 500 ? `<div class="preview-row"><strong>+${changes.length - 500} bookmark khác</strong><span></span><span></span></div>` : "");
  els.rulePreviewDialog.showModal();
  window.BookmarkLensI18n?.apply(els.rulePreviewDialog);
}

function renderAll() {
  renderSidebar();
  renderDomainOptions();
  renderLibrary();
  renderDuplicates();
  renderStats();
  renderSettings();
  renderAutomation();
  renderHiddenVault();
  const options = folderOptions(state.settings.lastFolderId);
  els.editorFolder.innerHTML = options;
  els.moveFolder.innerHTML = options;
  els.addFolder.innerHTML = options;
  els.folderParent.innerHTML = folderOptions(state.folderId !== "all" ? state.folderId : state.settings.lastFolderId, true);
  window.BookmarkLensI18n?.bindSelects();
  window.BookmarkLensI18n?.apply(document.body);
}

function bindRows() {
  $$(".bookmark-row").forEach((row) => {
    const id = row.dataset.id;
    const bookmark = state.bookmarks.find((item) => item.id === id);
    row.querySelector("img")?.addEventListener("error", (event) => event.currentTarget.remove());
    row.querySelector(".row-select").addEventListener("change", (event) => {
      if (event.target.checked) state.selected.add(id); else state.selected.delete(id);
      renderLibrary();
    });
    row.querySelector("[data-open]").addEventListener("click", () => markOpened(bookmark));
    row.querySelector("[data-domain-filter]").addEventListener("click", (event) => {
      state.domain = event.currentTarget.dataset.domainFilter;
      els.domainSelect.value = state.domain;
      state.visibleLimit = state.settings.pageSize || 120;
      renderLibrary();
    });
    row.querySelector('[data-action="read"]').addEventListener("click", () => toggleRead(bookmark));
    row.querySelector('[data-action="pin"]').addEventListener("click", () => togglePin(bookmark));
    row.querySelector('[data-action="edit"]').addEventListener("click", () => openEditor(bookmark));
    row.addEventListener("dragstart", () => { state.draggedId = id; row.classList.add("is-dragging"); });
    row.addEventListener("dragend", () => { state.draggedId = null; row.classList.remove("is-dragging"); $$(".is-drop-target").forEach((el) => el.classList.remove("is-drop-target")); });
    row.addEventListener("dragover", (event) => { if (state.draggedId && state.draggedId !== id) { event.preventDefault(); row.classList.add("is-drop-target"); } });
    row.addEventListener("dragleave", () => row.classList.remove("is-drop-target"));
    row.addEventListener("drop", async (event) => {
      event.preventDefault(); row.classList.remove("is-drop-target");
      if (!state.draggedId || state.draggedId === id) return;
      const source = state.bookmarks.find((item) => item.id === state.draggedId);
      state.sort = "manual"; els.sortSelect.value = "manual";
      await moveBookmarks([source], bookmark.parentId, bookmark.index);
    });
  });
}

function bindFolderDropTargets() {
  $$(".folder-item").forEach((button) => {
    button.addEventListener("dragover", (event) => { if (state.draggedId) { event.preventDefault(); button.classList.add("is-drop-target"); } });
    button.addEventListener("dragleave", () => button.classList.remove("is-drop-target"));
    button.addEventListener("drop", async (event) => {
      event.preventDefault(); button.classList.remove("is-drop-target");
      const bookmark = state.bookmarks.find((item) => item.id === state.draggedId);
      if (bookmark) { state.sort = "manual"; els.sortSelect.value = "manual"; await moveBookmarks([bookmark], button.dataset.folder); }
    });
  });
}

async function updateMetadata(id, patch) {
  const before = { ...(state.metadata[id] || {}) };
  state.metadata[id] = { ...before, ...patch };
  await BL.saveMetadata(state.metadata);
  const bookmark = state.bookmarks.find((item) => item.id === id);
  if (bookmark) bookmark.meta = state.metadata[id];
  return before;
}

async function markOpened(bookmark) {
  if (bookmark.meta.readStatus === "unread") {
    await updateMetadata(bookmark.id, { readStatus: "read", lastRead: Date.now() });
  } else {
    await updateMetadata(bookmark.id, { lastRead: Date.now() });
  }
}

async function toggleRead(bookmark) {
  const before = await updateMetadata(bookmark.id, { readStatus: bookmark.meta.readStatus === "unread" ? "read" : "unread", lastRead: Date.now() });
  renderAll();
  setUndo("Đã đổi trạng thái đọc", async () => { state.metadata[bookmark.id] = before; await BL.saveMetadata(state.metadata); await refreshLibrary(); });
}

async function togglePin(bookmark) {
  const before = await updateMetadata(bookmark.id, { pinned: !bookmark.meta.pinned });
  renderAll();
  setUndo(bookmark.meta.pinned ? "Đã ghim bookmark" : "Đã bỏ ghim", async () => { state.metadata[bookmark.id] = before; await BL.saveMetadata(state.metadata); await refreshLibrary(); });
}

function openEditor(bookmark) {
  els.editorId.value = bookmark.id;
  els.editorTitle.value = bookmark.title;
  els.editorUrl.value = bookmark.url;
  els.editorFolder.value = bookmark.parentId;
  els.editorTags.value = (bookmark.meta.tags || []).join(", ");
  els.editorTagColor.value = bookmark.meta.tagColor || "blue";
  els.editorNote.value = bookmark.meta.note || "";
  els.editorUnread.checked = bookmark.meta.readStatus === "unread";
  els.editorPinned.checked = Boolean(bookmark.meta.pinned);
  els.previewFrame.removeAttribute("src");
  els.previewStatus.textContent = "Chưa tải";
  els.previewFrame.closest(".preview-panel").classList.remove("is-loaded");
  els.editorDialog.showModal();
}

async function moveBookmarks(bookmarks, parentId, index) {
  const before = bookmarks.map((item) => ({ id: item.id, parentId: item.parentId, index: item.index }));
  for (let offset = 0; offset < bookmarks.length; offset += 1) {
    const destination = { parentId };
    if (Number.isInteger(index)) destination.index = index + offset;
    await BL.chromeCall((done) => chrome.bookmarks.move(bookmarks[offset].id, destination, done));
  }
  state.settings.lastFolderId = parentId;
  await BL.saveSettings(state.settings);
  await refreshLibrary();
  setUndo(`Đã di chuyển ${bookmarks.length} bookmark`, async () => {
    for (const item of before.sort((a, b) => a.index - b.index)) await BL.chromeCall((done) => chrome.bookmarks.move(item.id, { parentId: item.parentId, index: item.index }, done));
    await refreshLibrary();
  });
}

async function backupItems(items) {
  state.lastBackup = { createdAt: Date.now(), items: items.map((item) => ({ ...item, meta: state.metadata[item.id] || {} })) };
  await BL.chromeCall((done) => chrome.storage.local.set({ bookmarkLensLastBackup: state.lastBackup }, done));
  renderSettings();
}

async function restoreLastBackup() {
  const items = state.lastBackup?.items || [];
  if (!items.length) return;
  if (!await askConfirm("Khôi phục bookmark?", `${items.length} bookmark từ lần xóa gần nhất sẽ được tạo lại.`, "Khôi phục")) return;
  const metadata = await BL.loadMetadata();
  const fallbackParent = state.tree[0]?.children?.[1]?.id || state.tree[0]?.children?.[0]?.id || "1";
  for (const item of [...items].sort((a, b) => a.index - b.index)) {
    const parentId = state.folders.some((folder) => folder.id === item.parentId) ? item.parentId : fallbackParent;
    const restored = await BL.chromeCall((done) => chrome.bookmarks.create({ parentId, index: item.index, title: item.title, url: item.url }, done));
    metadata[restored.id] = item.meta || {};
  }
  state.lastBackup = null;
  await Promise.all([BL.saveMetadata(metadata), BL.chromeCall((done) => chrome.storage.local.remove(["bookmarkLensLastBackup"], done))]);
  await refreshLibrary();
  showToast(`Đã khôi phục ${items.length} bookmark`);
}

async function deleteBookmarks(items, message) {
  await backupItems(items);
  for (const item of items) await BL.chromeCall((done) => chrome.bookmarks.remove(item.id, done));
  state.selected.clear();
  await refreshLibrary();
  setUndo(message || `Đã xóa ${items.length} bookmark`, async () => {
    const metadata = await BL.loadMetadata();
    for (const item of items.sort((a, b) => a.index - b.index)) {
      const restored = await BL.chromeCall((done) => chrome.bookmarks.create({ parentId: item.parentId, index: item.index, title: item.title, url: item.url }, done));
      metadata[restored.id] = item.meta || state.metadata[item.id] || {};
    }
    await BL.saveMetadata(metadata);
    state.lastBackup = null;
    await BL.chromeCall((done) => chrome.storage.local.remove(["bookmarkLensLastBackup"], done));
    await refreshLibrary();
  });
}

function askConfirm(title, message, actionLabel = "Tiếp tục") {
  els.confirmTitle.textContent = title;
  els.confirmMessage.textContent = message;
  els.confirmAction.textContent = actionLabel;
  els.confirmDialog.showModal();
  return new Promise((resolve) => { state.confirmResolver = resolve; });
}

async function handleBulk(action) {
  const items = state.bookmarks.filter((item) => state.selected.has(item.id));
  if (!items.length) return;
  if (action === "open") {
    if (items.length > 15 && !await askConfirm("Mở nhiều tab?", `Bạn sắp mở ${items.length} tab cùng lúc.`, "Mở tất cả")) return;
    items.forEach((item) => chrome.tabs.create({ url: item.url, active: false }));
  }
  if (action === "copy") {
    await navigator.clipboard.writeText(items.map((item) => item.url).join("\n"));
    showToast(`Đã sao chép ${items.length} địa chỉ`);
  }
  if (action === "move") els.moveDialog.showModal();
  if (action === "read") {
    const before = items.map((item) => [item.id, { ...(state.metadata[item.id] || {}) }]);
    items.forEach((item) => { state.metadata[item.id] = { ...(state.metadata[item.id] || {}), readStatus: "read", lastRead: Date.now() }; });
    await BL.saveMetadata(state.metadata); await refreshLibrary({ keepSelection: true });
    setUndo(`Đã đánh dấu ${items.length} bookmark là đã đọc`, async () => { before.forEach(([id, meta]) => { state.metadata[id] = meta; }); await BL.saveMetadata(state.metadata); await refreshLibrary(); });
  }
  if (action === "delete") {
    if (await askConfirm("Xóa bookmark đã chọn?", `${items.length} bookmark sẽ bị xóa. Một bản phục hồi sẽ được tạo trước khi xóa.`, "Xóa bookmark")) await deleteBookmarks(items);
  }
}

async function cleanDuplicateSuggestions() {
  const toDelete = [];
  state.duplicateGroups.forEach((group, index) => {
    const keepId = document.querySelector(`input[name="duplicate-${index}"]:checked`)?.value;
    group.filter((item) => item.id !== keepId).forEach((item) => toDelete.push(item));
  });
  if (!toDelete.length) return;
  if (await askConfirm("Dọn bookmark trùng?", `${toDelete.length} bản trùng sẽ bị xóa, các bản bạn chọn giữ lại không thay đổi.`, "Dọn bản trùng")) await deleteBookmarks(toDelete, `Đã dọn ${toDelete.length} bản trùng`);
}

async function checkOneLink(bookmark) {
  if (!/^https?:/i.test(bookmark.url)) return { status: "skipped", code: 0, checkedAt: Date.now() };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    let response = await fetch(bookmark.url, { method: "HEAD", redirect: "follow", cache: "no-store", signal: controller.signal });
    if (response.status === 405 || response.status === 403) response = await fetch(bookmark.url, { method: "GET", redirect: "follow", cache: "no-store", signal: controller.signal });
    const status = response.status >= 200 && response.status < 400 ? (response.redirected ? "redirect" : "ok") : "broken";
    return { status, code: response.status, checkedAt: Date.now(), finalUrl: response.url };
  } catch (error) {
    return { status: error.name === "AbortError" ? "timeout" : "broken", code: 0, checkedAt: Date.now() };
  } finally { clearTimeout(timeout); }
}

async function checkLinks() {
  const granted = await BL.chromeCall((done) => chrome.permissions.request({ origins: ["http://*/*", "https://*/*"] }, done));
  if (!granted) { showToast("Cần quyền truy cập website để kiểm tra liên kết"); return; }
  const items = state.bookmarks.filter((item) => /^https?:/i.test(item.url));
  let cursor = 0; let completed = 0;
  els.checkLinks.disabled = true;
  els.linkResults.innerHTML = "";
  const results = [];
  const worker = async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      const result = await checkOneLink(item);
      state.metadata[item.id] = { ...(state.metadata[item.id] || {}), linkStatus: result };
      results.push({ item, result }); completed += 1;
      els.linkProgress.style.width = `${completed / items.length * 100}%`;
      els.linkSummary.textContent = `Đang kiểm tra ${completed}/${items.length}`;
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, items.length) }, worker));
  await BL.saveMetadata(state.metadata);
  const priority = { broken: 0, timeout: 1, redirect: 2, ok: 3, skipped: 4 };
  results.sort((a, b) => priority[a.result.status] - priority[b.result.status]);
  const counts = results.reduce((acc, entry) => { acc[entry.result.status] = (acc[entry.result.status] || 0) + 1; return acc; }, {});
  els.linkSummary.textContent = `${counts.ok || 0} hoạt động · ${counts.redirect || 0} chuyển hướng · ${(counts.broken || 0) + (counts.timeout || 0)} cần xem`;
  els.linkResults.innerHTML = results.slice(0, 300).map(({ item, result }) => `<div class="link-row"><span title="${BL.escapeHtml(item.url)}">${BL.escapeHtml(item.title)}</span><span class="status-pill ${result.status === "broken" ? "broken" : ""}">${result.status.toUpperCase()}</span><span>${result.code || "-"}</span></div>`).join("");
  els.checkLinks.disabled = false;
  await refreshLibrary();
}

function downloadBlob(content, type, filename) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportJson() {
  const payload = { format: "bookmark-lens", version: 2, exportedAt: new Date().toISOString(), tree: state.tree, metadata: state.metadata };
  downloadBlob(JSON.stringify(payload, null, 2), "application/json", `bookmark-lens-${new Date().toISOString().slice(0, 10)}.json`);
  showToast("Đã tạo bản sao lưu JSON");
}

function exportHtmlNode(node, depth = 1) {
  const indent = "    ".repeat(depth);
  if (node.url) return `${indent}<DT><A HREF="${BL.escapeHtml(node.url)}" ADD_DATE="${Math.floor((node.dateAdded || Date.now()) / 1000)}">${BL.escapeHtml(node.title)}</A>`;
  const children = (node.children || []).map((child) => exportHtmlNode(child, depth + 1)).join("\n");
  return `${indent}<DT><H3>${BL.escapeHtml(node.title || "Bookmark Lens")}</H3>\n${indent}<DL><p>\n${children}\n${indent}</DL><p>`;
}

function exportHtml() {
  const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>Bookmark Lens</TITLE>\n<H1>Bookmark Lens</H1>\n<DL><p>\n${(state.tree[0]?.children || []).map((node) => exportHtmlNode(node)).join("\n")}\n</DL><p>`;
  downloadBlob(html, "text/html", `bookmarks-${new Date().toISOString().slice(0, 10)}.html`);
  showToast("Đã tạo file bookmark HTML");
}

async function importTreeNodes(nodes, parentId, oldMetadata = {}, newMetadata = {}) {
  for (const node of nodes || []) {
    if (node.url) {
      const created = await BL.chromeCall((done) => chrome.bookmarks.create({ parentId, title: node.title || node.url, url: node.url }, done));
      if (oldMetadata[node.id]) newMetadata[created.id] = oldMetadata[node.id];
    } else {
      const folder = await BL.chromeCall((done) => chrome.bookmarks.create({ parentId, title: node.title || "Thư mục nhập" }, done));
      await importTreeNodes(node.children, folder.id, oldMetadata, newMetadata);
    }
  }
  return newMetadata;
}

async function importHtmlList(list, parentId) {
  for (const child of [...list.children]) {
    if (child.tagName !== "DT") continue;
    const direct = [...child.children];
    const heading = direct.find((node) => node.tagName === "H3");
    const link = direct.find((node) => node.tagName === "A");
    if (heading) {
      const folder = await BL.chromeCall((done) => chrome.bookmarks.create({ parentId, title: heading.textContent.trim() || "Thư mục nhập" }, done));
      const nested = direct.find((node) => node.tagName === "DL");
      if (nested) await importHtmlList(nested, folder.id);
    } else if (link?.href) {
      await BL.chromeCall((done) => chrome.bookmarks.create({ parentId, title: link.textContent.trim() || link.href, url: link.href }, done));
    }
  }
}

async function importFile(file) {
  const text = await file.text();
  const baseParent = state.tree[0]?.children?.[1]?.id || state.tree[0]?.children?.[0]?.id || "1";
  const root = await BL.chromeCall((done) => chrome.bookmarks.create({ parentId: baseParent, title: `Bookmark Lens Import ${new Date().toLocaleDateString("vi-VN")}` }, done));
  if (file.name.toLowerCase().endsWith(".json")) {
    const data = JSON.parse(text);
    if (data.format !== "bookmark-lens" || !data.tree) throw new Error("File JSON không đúng định dạng Bookmark Lens");
    const newMetadata = await importTreeNodes(data.tree[0]?.children || [], root.id, data.metadata || {}, {});
    await BL.saveMetadata({ ...state.metadata, ...newMetadata });
  } else {
    const documentNode = new DOMParser().parseFromString(text, "text/html");
    const list = documentNode.querySelector("dl");
    if (!list) throw new Error("Không tìm thấy dữ liệu bookmark trong file HTML");
    await importHtmlList(list, root.id);
  }
  await refreshLibrary(); showToast("Đã nhập bookmark vào thư mục mới");
}

async function openQuickAdd() {
  const [tab] = await BL.chromeCall((done) => chrome.tabs.query({ active: true, currentWindow: true }, done));
  els.addTitle.value = tab?.title || ""; els.addUrl.value = tab?.url || ""; els.addTags.value = ""; els.addUnread.checked = false;
  els.addFolder.value = state.settings.lastFolderId || state.folders[0]?.id;
  if (!els.addFolder.value && els.addFolder.options.length) els.addFolder.selectedIndex = 0;
  const matches = state.bookmarks.filter((item) => BL.normalizeUrl(item.url) === BL.normalizeUrl(tab?.url));
  els.addDuplicateHint.textContent = matches.length ? `Địa chỉ này đã có trong ${matches.length} thư mục.` : "Lưu tab hiện tại hoặc cả cửa sổ.";
  els.addDuplicateHint.classList.toggle("danger-text", matches.length > 0);
  els.addDialog.showModal();
}

async function saveCurrentTab(event) {
  event.preventDefault();
  const created = await BL.chromeCall((done) => chrome.bookmarks.create({ parentId: els.addFolder.value, title: els.addTitle.value.trim(), url: els.addUrl.value.trim() }, done));
  state.metadata[created.id] = { tags: els.addTags.value.split(",").map((tag) => tag.trim()).filter(Boolean), tagColor: els.addTagColor.value, readStatus: els.addUnread.checked ? "unread" : "read" };
  state.settings.lastFolderId = els.addFolder.value;
  await Promise.all([BL.saveMetadata(state.metadata), BL.saveSettings(state.settings)]);
  els.addDialog.close(); await refreshLibrary(); showToast("Đã lưu tab hiện tại");
}

async function saveAllTabs() {
  const tabs = await BL.chromeCall((done) => chrome.tabs.query({ currentWindow: true }, done));
  const validTabs = tabs.filter((tab) => /^https?:/i.test(tab.url));
  const folder = await BL.chromeCall((done) => chrome.bookmarks.create({ parentId: els.addFolder.value, title: `Phiên làm việc ${new Date().toLocaleString("vi-VN")}` }, done));
  const tags = els.addTags.value.split(",").map((tag) => tag.trim()).filter(Boolean);
  for (const tab of validTabs) {
    const created = await BL.chromeCall((done) => chrome.bookmarks.create({ parentId: folder.id, title: tab.title || tab.url, url: tab.url }, done));
    state.metadata[created.id] = { tags, tagColor: els.addTagColor.value, readStatus: els.addUnread.checked ? "unread" : "read" };
  }
  await BL.saveMetadata(state.metadata); els.addDialog.close(); await refreshLibrary(); showToast(`Đã lưu ${validTabs.length} tab`);
}

function switchView(view) {
  $$(".tab-button").forEach((button) => button.classList.toggle("is-active", button.dataset.view === view));
  $$(".view").forEach((section) => section.classList.toggle("is-active", section.id === `${view}View`));
}

async function saveSearchHistory() {
  const query = state.query.trim(); if (!query) return;
  state.settings.searchHistory = [query, ...(state.settings.searchHistory || []).filter((item) => item !== query)].slice(0, 10);
  await BL.saveSettings(state.settings); renderSettings();
}

function readRuleForm() {
  return BL.normalizeRule({
    id: els.ruleName.dataset.ruleId || undefined,
    name: els.ruleName.value.trim() || `Luật ${new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}`,
    field: els.ruleField.value,
    match: els.ruleMatch.value,
    value: els.ruleValue.value.trim(),
    folderId: els.ruleFolder.value,
    tags: els.ruleTags.value.split(",").map((tag) => tag.trim()).filter(Boolean),
    readStatus: els.ruleReadStatus.value,
    enabled: true,
  });
}

function fillRuleForm(rule) {
  const safeRule = BL.normalizeRule(rule);
  els.ruleName.dataset.ruleId = safeRule.id;
  els.ruleName.value = safeRule.name;
  els.ruleField.value = safeRule.field;
  els.ruleMatch.value = safeRule.match;
  els.ruleValue.value = safeRule.value;
  els.ruleFolder.value = safeRule.folderId || "";
  els.ruleTags.value = safeRule.tags.join(", ");
  els.ruleReadStatus.value = safeRule.readStatus || "";
  switchView("automation");
  els.ruleValue.focus();
}

function clearRuleForm() {
  delete els.ruleName.dataset.ruleId;
  els.ruleName.value = "";
  els.ruleField.value = "domain";
  els.ruleMatch.value = "contains";
  els.ruleValue.value = "";
  els.ruleFolder.value = "";
  els.ruleTags.value = "";
  els.ruleReadStatus.value = "";
}

async function saveRuleFromForm() {
  const rule = readRuleForm();
  if (!rule.value) { showToast("Nhập giá trị để luật có thể khớp bookmark"); return; }
  const before = [...(state.settings.autoRules || [])];
  const exists = before.some((item) => item.id === rule.id);
  state.settings.autoRules = exists ? before.map((item) => item.id === rule.id ? rule : item) : [rule, ...before];
  await BL.saveSettings(state.settings);
  clearRuleForm();
  renderAutomation();
  setUndo(exists ? "Đã cập nhật luật" : "Đã thêm luật tự động", async () => {
    state.settings.autoRules = before;
    await BL.saveSettings(state.settings);
    renderAutomation();
  });
}

async function applyRuleChanges(changes, message = "Đã áp dụng luật tự động") {
  if (!changes.length) { showToast("Không có bookmark nào khớp luật"); return; }
  for (const change of changes) {
    state.metadata[change.item.id] = change.afterMeta;
    if (change.targetFolder && change.targetFolder !== change.item.parentId) {
      await BL.chromeCall((done) => chrome.bookmarks.move(change.item.id, { parentId: change.targetFolder }, done));
    }
  }
  await BL.saveMetadata(state.metadata);
  await refreshLibrary({ keepSelection: true });
  setUndo(`${message}: ${changes.length} bookmark`, async () => {
    const metadata = await BL.loadMetadata();
    for (const change of changes.sort((a, b) => a.beforeMove.index - b.beforeMove.index)) {
      metadata[change.item.id] = change.beforeMeta;
      await BL.chromeCall((done) => chrome.bookmarks.move(change.beforeMove.id, { parentId: change.beforeMove.parentId, index: change.beforeMove.index }, done)).catch(() => {});
    }
    await BL.saveMetadata(metadata);
    await refreshLibrary();
  });
}

function saveWorkspace() {
  const name = els.workspaceName.value.trim() || currentViewTitle();
  const bookmarkIds = filteredBookmarks().slice(0, 80).map((item) => item.id);
  const workspace = {
    id: `workspace-${Date.now()}`,
    name,
    query: state.query,
    smart: state.smart,
    folderId: state.folderId,
    domain: state.domain,
    sort: state.sort,
    bookmarkIds,
  };
  state.settings.workspaces = [workspace, ...(state.settings.workspaces || [])].slice(0, 12);
  els.workspaceName.value = "";
  BL.saveSettings(state.settings).then(() => { renderAutomation(); showToast("Đã lưu workspace"); });
}

function openWorkspace(workspace) {
  state.query = workspace.query || "";
  state.smart = workspace.smart || "all";
  state.folderId = workspace.folderId || "all";
  state.domain = workspace.domain || "all";
  state.sort = workspace.sort || state.sort;
  state.visibleLimit = state.settings.pageSize || 120;
  els.searchInput.value = state.query;
  els.sortSelect.value = state.sort;
  els.domainSelect.value = state.domain;
  switchView("library");
  renderAll();
}

async function openWorkspaceTabs(workspace) {
  const ids = new Set(workspace.bookmarkIds || []);
  const items = ids.size ? state.bookmarks.filter((item) => ids.has(item.id)) : filteredBookmarks();
  if (!items.length) { showToast("Workspace chưa có bookmark để mở"); return; }
  if (items.length > 20 && !await askConfirm("Mở nhiều tab?", `Bạn sắp mở ${items.length} tab từ workspace.`, "Mở tất cả")) return;
  items.slice(0, 80).forEach((item) => chrome.tabs.create({ url: item.url, active: false }));
  showToast(`Đã mở ${Math.min(items.length, 80)} tab từ workspace`);
}

function commandDefinitions() {
  return [
    { id: "search", title: "Tập trung ô tìm kiếm", hint: "Ctrl/⌘ K", run: () => els.searchInput.focus() },
    { id: "add", title: "Lưu nhanh tab hiện tại", hint: "Alt Shift B", run: openQuickAdd },
    { id: "rules", title: "Mở tự động sắp xếp", hint: "Tab", run: () => switchView("automation") },
    { id: "apply-rules", title: "Xem trước luật cho toàn bộ thư viện", hint: "Auto", run: () => showRulePreview(state.bookmarks) },
    { id: "cleanup", title: "Mở dọn dẹp", hint: "Tab", run: () => switchView("cleanup") },
    { id: "insights", title: "Mở thống kê", hint: "Tab", run: () => switchView("insights") },
    { id: "export", title: "Xuất JSON đầy đủ", hint: "Backup", run: exportJson },
    { id: "sidepanel", title: "Mở side panel", hint: "Panel", run: openSidePanel },
    { id: "help", title: "Trợ giúp nhanh", hint: "Help", run: () => els.helpDialog.showModal() },
  ];
}

function renderCommandPalette() {
  const query = BL.normalizeText(els.commandInput.value);
  const commands = commandDefinitions().filter((command) => BL.normalizeText(`${command.title} ${command.hint}`).includes(query));
  state.commandIndex = Math.min(state.commandIndex, Math.max(0, commands.length - 1));
  els.commandList.innerHTML = commands.map((command, index) => `
    <button class="command-item ${index === state.commandIndex ? "is-active" : ""}" data-command="${command.id}" type="button">
      <span><strong>${BL.escapeHtml(command.title)}</strong><span>${BL.escapeHtml(command.id)}</span></span><kbd>${BL.escapeHtml(command.hint)}</kbd>
    </button>`).join("");
}

function openCommandPalette() {
  state.commandIndex = 0;
  els.commandInput.value = "";
  renderCommandPalette();
  els.commandDialog.showModal();
  requestAnimationFrame(() => els.commandInput.focus());
}

function runCommand(id) {
  const command = commandDefinitions().find((item) => item.id === id);
  if (!command) return;
  els.commandDialog.close();
  command.run();
}

async function openSidePanel() {
  if (!chrome.sidePanel?.open) { showToast("Chrome bản này chưa hỗ trợ side panel"); return; }
  const [tab] = await BL.chromeCall((done) => chrome.tabs.query({ active: true, currentWindow: true }, done));
  await chrome.sidePanel.open({ windowId: tab.windowId });
}

function renderHiddenVault() {
  const unlocked = Boolean(state.vaultKey);
  els.hiddenLocked.classList.toggle("is-hidden", unlocked);
  els.hiddenUnlocked.classList.toggle("is-hidden", !unlocked);
  els.hiddenLock.disabled = !unlocked;
  els.hiddenSummary.textContent = `${state.hiddenItems.length.toLocaleString("vi-VN")} trang`;
  els.hiddenList.innerHTML = state.hiddenItems.length ? state.hiddenItems.map((item) => `
    <article class="hidden-row" data-hidden-id="${BL.escapeHtml(item.id)}">
      <div class="favicon"><span>${BL.escapeHtml((item.domain || "H")[0].toUpperCase())}</span><img loading="lazy" src="${BL.faviconUrl(item.url)}" alt="" /></div>
      <div><strong title="${BL.escapeHtml(item.url)}">${BL.escapeHtml(item.title)}</strong><span>${BL.escapeHtml(item.domain)} · ${BL.relativeDate(item.createdAt)}</span></div>
      <div class="hidden-actions"><button data-hidden-action="open" type="button">Mở</button><button data-hidden-action="copy" type="button">Sao chép</button><button data-hidden-action="delete" type="button">Xóa</button></div>
    </article>`).join("") : `<div class="empty-state"><div class="empty-icon"><svg><use href="#i-lock"></use></svg></div><h2>Kho ẩn đang trống</h2><p>Lưu tab hiện tại vào Kho ẩn để trang không xuất hiện trong Chrome bookmarks.</p></div>`;
  els.hiddenList.querySelectorAll("img").forEach((image) => image.addEventListener("error", (event) => event.currentTarget.remove()));
  window.BookmarkLensI18n?.apply(els.hiddenUnlocked);
}

async function unlockHiddenVault() {
  const configured = await BL.isVaultConfigured();
  if (!configured) {
    const password = prompt("Tạo mật khẩu cho Kho ẩn");
    if (!password) return;
    if (password.length < 6) { showToast("Mật khẩu nên có ít nhất 6 ký tự"); return; }
    const confirmPassword = prompt("Nhập lại mật khẩu Kho ẩn");
    if (password !== confirmPassword) { showToast("Mật khẩu nhập lại không khớp"); return; }
    const vault = await BL.createVault(password);
    state.vaultKey = vault.key;
    state.hiddenItems = vault.items;
    renderHiddenVault();
    showToast("Đã tạo và mở khóa Kho ẩn");
    return;
  }
  const password = prompt("Nhập mật khẩu Kho ẩn");
  if (!password) return;
  try {
    const vault = await BL.unlockVault(password);
    state.vaultKey = vault.key;
    state.hiddenItems = vault.items;
    renderHiddenVault();
    showToast("Đã mở khóa Kho ẩn");
  } catch {
    showToast("Sai mật khẩu Kho ẩn");
  }
}

function lockHiddenVault() {
  state.vaultKey = null;
  state.hiddenItems = [];
  renderHiddenVault();
  showToast("Đã khóa Kho ẩn");
}

async function saveCurrentTabToHiddenVault() {
  if (!state.vaultKey) await unlockHiddenVault();
  if (!state.vaultKey) return;
  const [tab] = await BL.chromeCall((done) => chrome.tabs.query({ active: true, currentWindow: true }, done));
  if (!tab?.url || !/^https?:/i.test(tab.url)) { showToast("Tab này không thể lưu ẩn"); return; }
  if (state.hiddenItems.some((item) => BL.normalizeUrl(item.url) === BL.normalizeUrl(tab.url))) { showToast("Trang này đã có trong Kho ẩn"); return; }
  const item = BL.createVaultItem({ title: tab.title || tab.url, url: tab.url });
  state.hiddenItems = [item, ...state.hiddenItems];
  await BL.saveVaultItems(state.vaultKey, state.hiddenItems);
  renderHiddenVault();
  showToast("Đã lưu trang vào Kho ẩn");
}

async function deleteHiddenItem(item) {
  if (!state.vaultKey) return;
  state.hiddenItems = state.hiddenItems.filter((entry) => entry.id !== item.id);
  await BL.saveVaultItems(state.vaultKey, state.hiddenItems);
  renderHiddenVault();
  showToast("Đã xóa khỏi Kho ẩn");
}

async function loadWebsitePreview(url) {
  els.previewStatus.textContent = "Đang tải...";
  els.previewFrame.src = url;
  els.previewFrame.closest(".preview-panel").classList.add("is-loaded");
  try {
    const granted = await BL.chromeCall((done) => chrome.permissions.request({ origins: ["http://*/*", "https://*/*"] }, done));
    if (!granted) { els.previewStatus.textContent = "Đã tải iframe"; return; }
    const response = await fetch(url, { method: "GET", cache: "no-store" });
    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const title = doc.querySelector("meta[property='og:title']")?.content || doc.querySelector("title")?.textContent || "";
    const description = doc.querySelector("meta[property='og:description']")?.content || doc.querySelector("meta[name='description']")?.content || "";
    const image = doc.querySelector("meta[property='og:image']")?.content || "";
    if (title && !els.editorTitle.value.trim()) els.editorTitle.value = title.trim();
    els.previewStatus.textContent = [title ? "title" : "", description ? "description" : "", image ? "image" : ""].filter(Boolean).join(" · ") || "Đã tải iframe";
  } catch {
    els.previewStatus.textContent = "Đã tải iframe";
  }
}

function bindEvents() {
  $$(".tab-button").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
  els.searchInput.addEventListener("input", () => { state.query = els.searchInput.value; state.visibleLimit = state.settings.pageSize || 120; state.virtualStart = 0; switchView("library"); scheduleIndexedSearch(); });
  els.searchInput.addEventListener("keydown", (event) => { if (event.key === "Enter") saveSearchHistory(); });
  els.searchInput.addEventListener("change", saveSearchHistory);
  els.clearSearch.addEventListener("click", () => { state.query = ""; state.indexedMatchIds = null; state.virtualStart = 0; els.searchInput.value = ""; renderLibrary(); els.searchInput.focus(); });
  els.smartFolders.addEventListener("click", (event) => { const button = event.target.closest("[data-smart]"); if (!button) return; state.smart = button.dataset.smart; state.folderId = "all"; state.visibleLimit = state.settings.pageSize || 120; state.virtualStart = 0; renderSidebar(); renderLibrary(); });
  els.folderTree.addEventListener("click", (event) => { const button = event.target.closest("[data-folder]"); if (!button) return; state.folderId = button.dataset.folder; state.smart = "all"; state.visibleLimit = state.settings.pageSize || 120; state.virtualStart = 0; renderSidebar(); renderLibrary(); });
  els.sortSelect.addEventListener("change", () => { state.sort = els.sortSelect.value; state.virtualStart = 0; renderLibrary(); });
  els.domainSelect.addEventListener("change", () => { state.domain = els.domainSelect.value; state.visibleLimit = state.settings.pageSize || 120; state.virtualStart = 0; renderLibrary(); });
  els.selectAll.addEventListener("change", () => { filteredBookmarks().forEach((item) => els.selectAll.checked ? state.selected.add(item.id) : state.selected.delete(item.id)); renderLibrary(); });
  els.clearSelection.addEventListener("click", () => { state.selected.clear(); renderLibrary(); });
  els.bulkBar.addEventListener("click", (event) => { const action = event.target.closest("[data-bulk]")?.dataset.bulk; if (action) handleBulk(action); });
  els.loadMore.addEventListener("click", () => { state.visibleLimit += state.settings.pageSize || 120; renderLibrary(); });
  els.cleanDuplicates.addEventListener("click", cleanDuplicateSuggestions);
  els.checkLinks.addEventListener("click", checkLinks);
  els.quickAdd.addEventListener("click", openQuickAdd);
  els.addForm.addEventListener("submit", saveCurrentTab);
  els.saveWindow.addEventListener("click", saveAllTabs);
  els.newFolderButton.addEventListener("click", () => { els.folderName.value = ""; els.folderDialog.showModal(); });
  els.folderForm.addEventListener("submit", async (event) => { event.preventDefault(); await BL.chromeCall((done) => chrome.bookmarks.create({ parentId: els.folderParent.value, title: els.folderName.value.trim() }, done)); els.folderDialog.close(); await refreshLibrary(); showToast("Đã tạo thư mục"); });
  els.moveForm.addEventListener("submit", async (event) => { event.preventDefault(); const items = state.bookmarks.filter((item) => state.selected.has(item.id)); els.moveDialog.close(); await moveBookmarks(items, els.moveFolder.value); });
  els.editorForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const bookmark = state.bookmarks.find((item) => item.id === els.editorId.value); if (!bookmark) return;
    const before = { ...bookmark, meta: { ...(state.metadata[bookmark.id] || {}) } };
    await BL.chromeCall((done) => chrome.bookmarks.update(bookmark.id, { title: els.editorTitle.value.trim(), url: els.editorUrl.value.trim() }, done));
    if (els.editorFolder.value !== bookmark.parentId) await BL.chromeCall((done) => chrome.bookmarks.move(bookmark.id, { parentId: els.editorFolder.value }, done));
    state.metadata[bookmark.id] = { ...(state.metadata[bookmark.id] || {}), tags: els.editorTags.value.split(",").map((tag) => tag.trim()).filter(Boolean), tagColor: els.editorTagColor.value, note: els.editorNote.value.trim(), readStatus: els.editorUnread.checked ? "unread" : "read", pinned: els.editorPinned.checked };
    await BL.saveMetadata(state.metadata); els.editorDialog.close(); await refreshLibrary();
    setUndo("Đã cập nhật bookmark", async () => { await BL.chromeCall((done) => chrome.bookmarks.update(before.id, { title: before.title, url: before.url }, done)); await BL.chromeCall((done) => chrome.bookmarks.move(before.id, { parentId: before.parentId, index: before.index }, done)); state.metadata[before.id] = before.meta; await BL.saveMetadata(state.metadata); await refreshLibrary(); });
  });
  els.exportJson.addEventListener("click", exportJson); els.exportHtml.addEventListener("click", exportHtml);
  els.restoreBackup.addEventListener("click", restoreLastBackup);
  els.importFile.addEventListener("change", async () => { const file = els.importFile.files[0]; if (!file) return; try { await importFile(file); } catch (error) { showToast(error.message); } finally { els.importFile.value = ""; } });
  els.defaultSort.addEventListener("change", async () => { state.settings.defaultSort = els.defaultSort.value; state.sort = els.defaultSort.value; els.sortSelect.value = state.sort; await BL.saveSettings(state.settings); renderLibrary(); showToast("Đã lưu kiểu sắp xếp mặc định"); });
  els.themeSetting.addEventListener("change", async () => { state.settings.theme = els.themeSetting.value; BL.applyTheme(state.settings.theme); await BL.saveSettings(state.settings); });
  els.themeToggle.addEventListener("click", async () => { state.settings.theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark"; BL.applyTheme(state.settings.theme); await BL.saveSettings(state.settings); renderSettings(); });
  els.syncSettings.addEventListener("change", async () => { state.settings.syncEnabled = els.syncSettings.checked; await BL.saveSettings(state.settings); showToast(state.settings.syncEnabled ? "Đã bật đồng bộ cài đặt" : "Đã tắt đồng bộ cài đặt"); });
  els.syncMetadata.addEventListener("change", async () => {
    state.settings.syncMetadata = els.syncMetadata.checked;
    await BL.saveSettings(state.settings);
    if (state.settings.syncMetadata) {
      const result = await BL.saveMetadataToSync?.(state.metadata);
      showToast(result?.synced === false ? "Metadata vượt giới hạn Chrome Sync, vẫn lưu cục bộ" : "Đã bật đồng bộ metadata");
    } else {
      showToast("Đã tắt đồng bộ metadata");
    }
  });
  els.autoOrganizeNew.addEventListener("change", async () => { state.settings.autoOrganizeNew = els.autoOrganizeNew.checked; await BL.saveSettings(state.settings); showToast(state.settings.autoOrganizeNew ? "Bookmark mới sẽ tự áp luật" : "Đã tắt tự áp luật khi lưu mới"); });
  els.compactMode.addEventListener("change", async () => { state.settings.compactMode = els.compactMode.checked; await BL.saveSettings(state.settings); renderSettings(); renderLibrary(); });
  els.virtualList.addEventListener("change", async () => { state.settings.virtualList = els.virtualList.checked; await BL.saveSettings(state.settings); renderSettings(); renderLibrary(); });
  els.pageSize.addEventListener("change", async () => { state.settings.pageSize = Number(els.pageSize.value) || 120; state.visibleLimit = state.settings.pageSize; await BL.saveSettings(state.settings); renderLibrary(); showToast("Đã lưu số dòng mỗi lần tải"); });
  els.addRule.addEventListener("click", saveRuleFromForm);
  els.applyRulesAll.addEventListener("click", () => showRulePreview(state.bookmarks));
  els.applyRulesSelected.addEventListener("click", () => {
    const items = state.bookmarks.filter((item) => state.selected.has(item.id));
    showRulePreview(items, "Đã áp dụng luật cho mục đã chọn");
  });
  els.rulePreviewForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const preview = state.pendingRulePreview;
    state.pendingRulePreview = null;
    els.rulePreviewDialog.close();
    if (preview) await applyRuleChanges(preview.changes, preview.message);
  });
  els.applyRuleTemplate.addEventListener("click", async () => {
    const before = [...(state.settings.autoRules || [])];
    const rules = ruleTemplates().map((template) => {
      const folder = state.folders.find((item) => BL.normalizeText(item.title) === BL.normalizeText(template.folderName) || BL.normalizeText(item.path).includes(BL.normalizeText(template.folderName)));
      return BL.normalizeRule({ ...template, folderId: folder?.id || "", enabled: true });
    });
    state.settings.autoRules = [...rules, ...before];
    await BL.saveSettings(state.settings);
    renderAutomation();
    setUndo("Đã thêm mẫu luật", async () => { state.settings.autoRules = before; await BL.saveSettings(state.settings); renderAutomation(); });
  });
  els.ruleList.addEventListener("click", async (event) => {
    const card = event.target.closest("[data-rule-id]");
    const action = event.target.closest("[data-rule-action]")?.dataset.ruleAction;
    if (!card || !action) return;
    const before = [...(state.settings.autoRules || [])];
    const rule = before.find((item) => item.id === card.dataset.ruleId);
    if (!rule) return;
    if (action === "fill") { fillRuleForm(rule); return; }
    if (action === "toggle") state.settings.autoRules = before.map((item) => item.id === rule.id ? { ...item, enabled: item.enabled === false } : item);
    if (action === "delete") state.settings.autoRules = before.filter((item) => item.id !== rule.id);
    await BL.saveSettings(state.settings);
    renderAutomation();
    setUndo(action === "delete" ? "Đã xóa luật" : "Đã đổi trạng thái luật", async () => { state.settings.autoRules = before; await BL.saveSettings(state.settings); renderAutomation(); });
  });
  els.ruleSuggestionList.addEventListener("click", (event) => {
    const card = event.target.closest("[data-suggest]");
    const action = event.target.closest("[data-suggest-action]")?.dataset.suggestAction;
    if (!card || !action) return;
    const domain = card.dataset.suggest;
    if (action === "filter") {
      state.domain = domain; els.domainSelect.value = domain; switchView("library"); renderLibrary(); return;
    }
    fillRuleForm({ name: `Gom ${domain}`, field: card.dataset.field || "domain", match: card.dataset.match || "equals", value: domain, tags: card.dataset.tags ? card.dataset.tags.split(",").filter(Boolean) : [domain.split(".")[0]].filter(Boolean), enabled: true });
  });
  els.saveWorkspace.addEventListener("click", saveWorkspace);
  els.workspaceList.addEventListener("click", async (event) => {
    const card = event.target.closest("[data-workspace-id]");
    const action = event.target.closest("[data-workspace-action]")?.dataset.workspaceAction;
    if (!card || !action) return;
    const before = [...(state.settings.workspaces || [])];
    const workspace = before.find((item) => item.id === card.dataset.workspaceId);
    if (!workspace) return;
    if (action === "open") openWorkspace(workspace);
    if (action === "tabs") await openWorkspaceTabs(workspace);
    if (action === "delete") {
      state.settings.workspaces = before.filter((item) => item.id !== workspace.id);
      await BL.saveSettings(state.settings);
      renderAutomation();
      setUndo("Đã xóa workspace", async () => { state.settings.workspaces = before; await BL.saveSettings(state.settings); renderAutomation(); });
    }
  });
  els.commandButton.addEventListener("click", openCommandPalette);
  els.openSidePanel.addEventListener("click", openSidePanel);
  els.helpButton.addEventListener("click", () => els.helpDialog.showModal());
  els.hiddenUnlock.addEventListener("click", unlockHiddenVault);
  els.hiddenLock.addEventListener("click", lockHiddenVault);
  els.hiddenSaveCurrent.addEventListener("click", saveCurrentTabToHiddenVault);
  els.hiddenList.addEventListener("click", async (event) => {
    const row = event.target.closest("[data-hidden-id]");
    const action = event.target.closest("[data-hidden-action]")?.dataset.hiddenAction;
    if (!row || !action || !state.vaultKey) return;
    const item = state.hiddenItems.find((entry) => entry.id === row.dataset.hiddenId);
    if (!item) return;
    if (action === "open") chrome.tabs.create({ url: item.url });
    if (action === "copy") { await navigator.clipboard.writeText(item.url); showToast("Đã sao chép địa chỉ"); }
    if (action === "delete") await deleteHiddenItem(item);
  });
  els.commandInput.addEventListener("input", () => { state.commandIndex = 0; renderCommandPalette(); });
  els.commandInput.addEventListener("keydown", (event) => {
    const items = $$(".command-item");
    if (event.key === "ArrowDown") { event.preventDefault(); state.commandIndex = Math.min(items.length - 1, state.commandIndex + 1); renderCommandPalette(); }
    if (event.key === "ArrowUp") { event.preventDefault(); state.commandIndex = Math.max(0, state.commandIndex - 1); renderCommandPalette(); }
    if (event.key === "Enter") { event.preventDefault(); items[state.commandIndex]?.click(); }
  });
  els.commandList.addEventListener("click", (event) => { const button = event.target.closest("[data-command]"); if (button) runCommand(button.dataset.command); });
  els.loadPreview.addEventListener("click", () => {
    loadWebsitePreview(els.editorUrl.value);
  });
  els.previewFrame.addEventListener("load", () => { els.previewStatus.textContent = "Đã tải"; });
  els.confirmForm.addEventListener("submit", (event) => { event.preventDefault(); const resolver = state.confirmResolver; state.confirmResolver = null; els.confirmDialog.close(); resolver?.(true); });
  els.confirmDialog.addEventListener("close", () => { if (state.confirmResolver) { const resolver = state.confirmResolver; state.confirmResolver = null; resolver(false); } });
  els.onboardingForm.addEventListener("submit", async (event) => { event.preventDefault(); state.settings.onboardingDone = true; await BL.saveSettings(state.settings); els.onboardingDialog.close(); });
  els.onboardingDialog.addEventListener("close", async () => { if (!state.settings.onboardingDone) { state.settings.onboardingDone = true; await BL.saveSettings(state.settings); } });
  $$(".close-dialog").forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));
  els.undoButton.addEventListener("click", async () => { const entry = state.undoStack.shift(); els.toast.classList.remove("is-visible"); if (entry) { await entry.callback(); showToast("Đã hoàn tác thay đổi", state.undoStack.length > 0); } });
  els.domainChart.addEventListener("click", (event) => { const button = event.target.closest("[data-domain]"); if (!button) return; state.domain = button.dataset.domain; els.domainSelect.value = state.domain; switchView("library"); renderLibrary(); });
  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "k") { event.preventDefault(); openCommandPalette(); return; }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); els.searchInput.focus(); }
  });
  addEventListener("scroll", () => {
    if (state.settings.virtualList === false) return;
    const filteredLength = filteredBookmarks().length;
    if (filteredLength <= 600) return;
    const top = Math.max(0, scrollY - 170);
    const nextStart = Math.max(0, Math.floor(top / state.virtualRowHeight) - 4);
    if (Math.abs(nextStart - state.virtualStart) > 3) {
      state.virtualStart = nextStart;
      renderLibrary();
    }
  }, { passive: true });
}

async function init() {
  bindEvents();
  const [library, storedBackup] = await Promise.all([
    BL.loadLibrary(true),
    BL.chromeCall((done) => chrome.storage.local.get(["bookmarkLensLastBackup"], done)),
  ]);
  Object.assign(state, library);
  state.lastBackup = storedBackup.bookmarkLensLastBackup || null;
  state.sort = state.settings.defaultSort || "newest";
  state.visibleLimit = state.settings.pageSize || 120;
  els.sortSelect.value = state.sort;
  BL.applyTheme(state.settings.theme);
  await window.BookmarkLensI18n?.setLanguage(state.settings.language || "vi");
  window.BookmarkLensI18n?.bindSelects();
  const query = new URLSearchParams(location.search).get("q") || "";
  state.query = query; els.searchInput.value = query;
  state.duplicateGroups = BL.findDuplicateGroups(state.bookmarks);
  state.duplicateIds = new Set(state.duplicateGroups.flat().map((item) => item.id));
  scheduleIndexRebuild();
  renderAll();
  if (!state.settings.onboardingDone) {
    requestAnimationFrame(() => els.onboardingDialog.showModal());
  }
}

init().catch((error) => {
  els.bookmarkList.innerHTML = `<div class="empty-state"><h2>Không thể tải thư viện</h2><p>${BL.escapeHtml(error.message)}</p></div>`;
});
