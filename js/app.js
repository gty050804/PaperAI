const DATA_URL = 'data/papers.json';
const FOLDERS_URL = 'data/folders.json';
const UNCategorized_ID = '__uncategorized__';
const ADMIN_USERNAME = 'Phier';
const USER_SESSION_KEY = 'paperai-user-session';
const GITHUB_TOKEN_KEY = 'paperai-github-token';
const SESSION_HOURS = 24;

const STATUS_LABELS = {
  'to-read': '待读',
  'reading': '阅读中',
  'finished': '已读完',
};

let papers = [];
let folders = [];
let currentFolderId = null;
let folderModalMode = 'create';
let folderEditingId = null;
let folderDraftId = null;
let lastCreatedFolderId = null;

const BOOKMARK_COLORS = [
  { bg: '#fef9c3', tab: '#fde047', border: '#facc15', text: '#713f12' },
  { bg: '#dbeafe', tab: '#93c5fd', border: '#60a5fa', text: '#1e3a8a' },
  { bg: '#dcfce7', tab: '#86efac', border: '#4ade80', text: '#14532d' },
  { bg: '#fce7f3', tab: '#f9a8d4', border: '#f472b6', text: '#831843' },
  { bg: '#ffedd5', tab: '#fdba74', border: '#fb923c', text: '#7c2d12' },
  { bg: '#ede9fe', tab: '#c4b5fd', border: '#a78bfa', text: '#4c1d95' },
];
let editingId = null;
let currentReaderId = null;
let isAdmin = false;
let isLoggedIn = false;
let currentUsername = '';
let hasUnpublishedChanges = false;
const pendingPdfs = new Map();
const pdfBlobUrls = new Map();
const pendingFolderImages = new Map();
const folderImageBlobUrls = new Map();

async function hashPassword(password) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function getConfig() {
  return window.PaperAIConfig || {};
}

function getGithubToken() {
  return localStorage.getItem(GITHUB_TOKEN_KEY) || '';
}

function saveGithubToken(token) {
  if (token) localStorage.setItem(GITHUB_TOKEN_KEY, token);
  else localStorage.removeItem(GITHUB_TOKEN_KEY);
}

function loadAdminSettingsIntoForm() {
  window.PaperAI?.loadSiliconFlowSettingsIntoForm();
  const tokenEl = document.getElementById('github-token');
  if (tokenEl) tokenEl.value = getGithubToken();
}

function derivePdfUrlFromPaperUrl(url) {
  if (!url) return null;
  const trimmed = url.trim();
  if (/\.pdf(\?|#|$)/i.test(trimmed)) return trimmed;
  const arxivMatch = trimmed.match(/arxiv\.org\/abs\/([^/?#]+)/i);
  if (arxivMatch) return `https://arxiv.org/pdf/${arxivMatch[1]}.pdf`;
  return null;
}

function sanitizePaperForStorage(paper) {
  const { pdfPath, pdfName, pdfPageRange, ...rest } = paper;
  return rest;
}

function normalizePaperRecord(paper) {
  const cleaned = sanitizePaperForStorage({ ...paper });
  if (!cleaned.pdfUrl) {
    const derived = derivePdfUrlFromPaperUrl(cleaned.url);
    if (derived) cleaned.pdfUrl = derived;
  }
  return cleaned;
}

function getFolderImagesDir() {
  return getConfig().github?.folderImagesPath || 'data/folder-images';
}

function getFolderImagePath(folderId) {
  return `${getFolderImagesDir()}/${folderId}.png`;
}

function revokeFolderImageBlob(folderId) {
  if (folderImageBlobUrls.has(folderId)) {
    URL.revokeObjectURL(folderImageBlobUrls.get(folderId));
    folderImageBlobUrls.delete(folderId);
  }
}

function clearAllFolderImageBlobs() {
  folderImageBlobUrls.forEach(url => URL.revokeObjectURL(url));
  folderImageBlobUrls.clear();
}

async function resolveFolderImageUrl(folder) {
  if (!folder?.id) return null;

  if (pendingFolderImages.has(folder.id)) {
    if (!folderImageBlobUrls.has(folder.id)) {
      folderImageBlobUrls.set(folder.id, URL.createObjectURL(pendingFolderImages.get(folder.id)));
    }
    return folderImageBlobUrls.get(folder.id);
  }

  const stored = await window.FolderImageStore.getFolderImageFromStore(folder.id);
  if (stored) {
    if (!folderImageBlobUrls.has(folder.id)) {
      folderImageBlobUrls.set(folder.id, URL.createObjectURL(stored));
    }
    return folderImageBlobUrls.get(folder.id);
  }

  if (folder.imagePath) {
    const remoteUrl = window.PdfStore.resolveAssetPath(folder.imagePath);
    const ts = folder.updatedAt || folder.createdAt || '';
    const sep = remoteUrl.includes('?') ? '&' : '?';
    return `${remoteUrl}${sep}t=${encodeURIComponent(ts)}`;
  }

  return null;
}

async function storeFolderImageBlob(folderId, blob) {
  pendingFolderImages.set(folderId, blob);
  revokeFolderImageBlob(folderId);
  await window.FolderImageStore.saveFolderImageToStore(folderId, blob);
}

async function applyFolderImageToInner(inner, folder) {
  if (!inner || !folder) return;
  const url = await resolveFolderImageUrl(folder);
  let photo = inner.querySelector('.bookmark-photo');
  const tab = inner.querySelector('.bookmark-tab');
  const nameEl = inner.querySelector('.bookmark-name');
  const countEl = inner.querySelector('.bookmark-count');
  const textColor = inner.style.getPropertyValue('--bookmark-text').trim()
    || getComputedStyle(inner).getPropertyValue('--bookmark-text').trim()
    || '#713f12';

  if (!url) {
    inner.classList.remove('has-image');
    photo?.remove();
    inner.style.background = '';
    inner.style.borderColor = '';
    inner.style.minHeight = '';
    if (tab) tab.style.display = '';
    if (nameEl) nameEl.style.color = textColor;
    if (countEl) {
      countEl.style.color = textColor;
      countEl.style.opacity = '';
    }
    return;
  }

  inner.classList.add('has-image');
  inner.style.background = 'transparent';
  inner.style.borderColor = 'rgba(0, 0, 0, 0.08)';
  inner.style.minHeight = '0';
  if (tab) tab.style.display = 'none';
  if (!photo) {
    photo = document.createElement('img');
    photo.className = 'bookmark-photo';
    photo.alt = '';
    inner.insertBefore(photo, inner.firstChild);
  }
  photo.src = url;
  if (nameEl) nameEl.style.color = '#fff';
  if (countEl) {
    countEl.style.color = '#fff';
    countEl.style.opacity = '0.92';
  }
}

async function applyFolderImages(container) {
  const cards = container.querySelectorAll('.bookmark-card');
  await Promise.all([...cards].map(async (card) => {
    const folder = getFolderById(card.dataset.folderId);
    const inner = card.querySelector('.bookmark-inner');
    await applyFolderImageToInner(inner, folder);
  }));
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function revokePdfBlob(paperId) {
  const url = pdfBlobUrls.get(paperId);
  if (url) {
    URL.revokeObjectURL(url);
    pdfBlobUrls.delete(paperId);
  }
}

function clearAllPdfBlobs() {
  pdfBlobUrls.forEach(url => URL.revokeObjectURL(url));
  pdfBlobUrls.clear();
}

async function resolvePdfUrl(paper) {
  if (!paper) return null;

  if (pendingPdfs.has(paper.id)) {
    if (!pdfBlobUrls.has(paper.id)) {
      pdfBlobUrls.set(paper.id, URL.createObjectURL(pendingPdfs.get(paper.id)));
    }
    return pdfBlobUrls.get(paper.id);
  }

  const stored = await window.PdfStore.getPdfFromStore(paper.id);
  if (stored) {
    if (!pdfBlobUrls.has(paper.id)) {
      pdfBlobUrls.set(paper.id, URL.createObjectURL(stored));
    }
    return pdfBlobUrls.get(paper.id);
  }

  if (paper.pdfUrl) return paper.pdfUrl;
  return derivePdfUrlFromPaperUrl(paper.url);
}

function paperHasLink(paper) {
  return !!(paper.url || paper.pdfUrl || derivePdfUrlFromPaperUrl(paper.url));
}

function getSession() {
  try {
    const raw = sessionStorage.getItem(USER_SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (Date.now() > session.expiresAt) {
      sessionStorage.removeItem(USER_SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

function setUserSession(session) {
  if (session) {
    sessionStorage.setItem(USER_SESSION_KEY, JSON.stringify({
      ...session,
      expiresAt: Date.now() + SESSION_HOURS * 60 * 60 * 1000,
    }));
  } else {
    sessionStorage.removeItem(USER_SESSION_KEY);
  }
  applySession(getSession());
}

function applySession(session) {
  isAdmin = session?.role === 'admin';
  isLoggedIn = !!session;
  currentUsername = session?.username || '';
  updateUserUI();
}

function updateUserUI() {
  document.querySelectorAll('.admin-only').forEach(el => {
    el.classList.toggle('hidden', !isAdmin);
  });
  document.querySelectorAll('.logged-in-only').forEach(el => {
    el.classList.toggle('hidden', !isLoggedIn);
  });

  const loginBtn = document.getElementById('btn-admin-login');
  loginBtn.classList.remove('admin-active', 'guest-active');

  if (isAdmin) {
    loginBtn.textContent = '✓';
    loginBtn.title = `已登录：${currentUsername}`;
    loginBtn.classList.add('admin-active');
  } else if (isLoggedIn) {
    loginBtn.textContent = currentUsername.slice(0, 2).toUpperCase();
    loginBtn.title = `已登录：${currentUsername}`;
    loginBtn.classList.add('guest-active');
  } else {
    loginBtn.textContent = '🔒';
    loginBtn.title = '登录';
  }

  const usernameEl = document.getElementById('current-username');
  if (usernameEl) usernameEl.textContent = currentUsername;

  if (document.getElementById('view-list')?.classList.contains('active')) {
    renderFolders();
  }
}

function requireAdmin() {
  if (isAdmin) return true;
  alert('无权限执行此操作。');
  if (!isLoggedIn) openLoginModal();
  return false;
}

const PAPERS_DRAFT_KEY = 'paperai-papers-draft';
const FOLDERS_DRAFT_KEY = 'paperai-folders-draft';
const PAPERS_DRAFT_FLAG_KEY = 'paperai-papers-draft-active';
const PAPERS_REMOTE_CACHE_KEY = 'paperai-papers-remote-cache';
const FOLDERS_REMOTE_CACHE_KEY = 'paperai-folders-remote-cache';

function saveLocalDraft() {
  if (!isAdmin) return;
  localStorage.setItem(PAPERS_DRAFT_KEY, JSON.stringify(papers));
  localStorage.setItem(FOLDERS_DRAFT_KEY, JSON.stringify(folders));
  localStorage.setItem(PAPERS_DRAFT_FLAG_KEY, '1');
}

function clearLocalDraft() {
  localStorage.removeItem(PAPERS_DRAFT_KEY);
  localStorage.removeItem(FOLDERS_DRAFT_KEY);
  localStorage.removeItem(PAPERS_DRAFT_FLAG_KEY);
}

function readCachedJson(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : null;
  } catch {
    localStorage.removeItem(key);
    return null;
  }
}

function writeRemoteCache(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // ignore quota errors
  }
}

async function fetchJsonArray(url, cacheKey) {
  try {
    const res = await fetch(`${url}?t=${Date.now()}`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        writeRemoteCache(cacheKey, data);
        return { data, fromCache: false };
      }
    }
  } catch {
    console.warn(`无法加载 ${url}`);
  }

  const cached = readCachedJson(cacheKey);
  if (cached) return { data: cached, fromCache: true };
  return { data: [], fromCache: false };
}

async function loadFolders() {
  const { data: remote } = await fetchJsonArray(FOLDERS_URL, FOLDERS_REMOTE_CACHE_KEY);

  if (isAdmin && localStorage.getItem(PAPERS_DRAFT_FLAG_KEY)) {
    try {
      const draftRaw = localStorage.getItem(FOLDERS_DRAFT_KEY);
      if (draftRaw) {
        const draft = JSON.parse(draftRaw);
        if (Array.isArray(draft)) {
          folders = draft;
          return;
        }
      }
    } catch {
      localStorage.removeItem(FOLDERS_DRAFT_KEY);
    }
  }

  folders = remote;
}

async function loadData() {
  await loadFolders();
  await loadPapers();
}

function mergePaperRecord(remote, draft) {
  if (!remote) return draft;
  if (!draft) return remote;

  const remoteTime = new Date(remote.updatedAt || remote.createdAt || 0).getTime();
  const draftTime = new Date(draft.updatedAt || draft.createdAt || 0).getTime();
  const merged = draftTime >= remoteTime
    ? { ...remote, ...draft }
    : { ...draft, ...remote };

  if (!merged.folderId && remote.folderId) merged.folderId = remote.folderId;
  if (!merged.pdfUrl && remote.pdfUrl) merged.pdfUrl = remote.pdfUrl;
  if (!merged.url && remote.url) merged.url = remote.url;
  if (!merged.knowledgePoints?.length && remote.knowledgePoints?.length) {
    merged.knowledgePoints = remote.knowledgePoints;
  }
  return normalizePaperRecord(merged);
}

function mergePapersRemoteAndDraft(draft, remote) {
  const remoteById = new Map(remote.map(p => [p.id, p]));
  const draftById = new Map(draft.map(p => [p.id, p]));
  const allIds = new Set([...remoteById.keys(), ...draftById.keys()]);

  return [...allIds]
    .map(id => mergePaperRecord(remoteById.get(id), draftById.get(id)))
    .filter(Boolean)
    .sort((a, b) => {
      const tb = new Date(b.updatedAt || b.createdAt || 0).getTime();
      const ta = new Date(a.updatedAt || a.createdAt || 0).getTime();
      return tb - ta;
    });
}

function papersDraftDiffersFromRemote(draft, remote) {
  if (draft.length !== remote.length) return true;
  const remoteById = new Map(remote.map(p => [p.id, p]));
  return draft.some(p => {
    const other = remoteById.get(p.id);
    return !other || JSON.stringify(other) !== JSON.stringify(p);
  });
}

async function loadPapers() {
  const { data: remote, fromCache } = await fetchJsonArray(DATA_URL, PAPERS_REMOTE_CACHE_KEY);

  if (isAdmin && localStorage.getItem(PAPERS_DRAFT_FLAG_KEY)) {
    try {
      const draftRaw = localStorage.getItem(PAPERS_DRAFT_KEY);
      if (draftRaw) {
        const draft = JSON.parse(draftRaw);
        if (Array.isArray(draft)) {
          if (draft.length === 0 && remote.length > 0) {
            console.warn('忽略空草稿，已恢复远程论文数据');
            clearLocalDraft();
            papers = remote.map(normalizePaperRecord);
            hasUnpublishedChanges = false;
            return;
          }
          if (remote.length > 0 && draft.length > 0) {
            papers = mergePapersRemoteAndDraft(draft, remote);
            hasUnpublishedChanges = papersDraftDiffersFromRemote(papers, remote);
            if (hasUnpublishedChanges) saveLocalDraft();
            if (JSON.stringify(draft) !== JSON.stringify(papers)) {
              console.warn('本地草稿已与远程数据合并修正');
            }
            return;
          }
          if (remote.length > 0 && draft.length < remote.length) {
            papers = mergePapersRemoteAndDraft(draft, remote);
            hasUnpublishedChanges = papersDraftDiffersFromRemote(papers, remote);
            if (hasUnpublishedChanges) saveLocalDraft();
            console.warn('本地草稿不完整，已与远程数据合并');
            return;
          }
          papers = draft.map(normalizePaperRecord);
          hasUnpublishedChanges = true;
          if (fromCache && remote.length === 0 && draft.length > 0) {
            console.warn('网络异常，已恢复本地未发布草稿');
          }
          return;
        }
      }
    } catch {
      localStorage.removeItem(PAPERS_DRAFT_KEY);
      localStorage.removeItem(PAPERS_DRAFT_FLAG_KEY);
    }
  }

  papers = remote.map(normalizePaperRecord);
  hasUnpublishedChanges = false;

  if (fromCache && remote.length > 0) {
    console.warn('网络异常，已使用上次成功加载的论文数据');
  }
}

function markDirty() {
  if (isAdmin) {
    hasUnpublishedChanges = true;
    saveLocalDraft();
  }
}

function switchView(viewName) {
  if (viewName === 'add' && !requireAdmin()) return;

  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn[data-view]').forEach(b => b.classList.remove('active'));

  document.getElementById(`view-${viewName}`).classList.add('active');
  const navBtn = document.querySelector(`[data-view="${viewName}"]`);
  if (navBtn) navBtn.classList.add('active');

  document.querySelector('.main.container').classList.toggle('main-reader', viewName === 'reader');

  if (viewName === 'list') {
    updatePapersPanelVisibility();
    renderFolders();
    if (currentFolderId != null) renderList();
  }
  if (viewName === 'add') {
    updateFolderSelect();
    if (!editingId && currentFolderId && getFolderById(currentFolderId)) {
      document.getElementById('paper-folder').value = currentFolderId;
    }
  }
  if (viewName === 'stats') renderStats();
}

function getFolderById(id) {
  if (id === UNCategorized_ID) return { id: UNCategorized_ID, name: '未分类' };
  return folders.find(f => f.id === id);
}

function isUncategorizedPaper(paper) {
  if (!paper.folderId) return true;
  return !folders.some(f => f.id === paper.folderId);
}

function getFolderColors(folderId) {
  const index = folders.findIndex(f => f.id === folderId);
  return BOOKMARK_COLORS[index >= 0 ? index % BOOKMARK_COLORS.length : 0];
}

function updatePapersPanelVisibility() {
  const panel = document.getElementById('papers-panel');
  const section = document.querySelector('.bookmark-section');
  const open = currentFolderId != null;

  if (panel) panel.classList.toggle('hidden', !open);
  if (section) section.classList.toggle('hidden', open);

  const titleEl = document.getElementById('current-folder-title');
  if (!titleEl) return;

  if (!open) {
    titleEl.innerHTML = '';
    return;
  }

  renderCurrentFolderTitle();
}

function renderCurrentFolderTitle() {
  const titleEl = document.getElementById('current-folder-title');
  if (!titleEl || currentFolderId == null) return;

  const folder = getFolderById(currentFolderId);
  titleEl.textContent = folder?.name || '';
}

function openFolder(id) {
  currentFolderId = id;
  updatePapersPanelVisibility();
  renderFolders();
  renderList();
}

function closeFolderView() {
  currentFolderId = null;
  updatePapersPanelVisibility();
  renderFolders();
}

function countPapersInFolder(folderId) {
  if (folderId === UNCategorized_ID) {
    return papers.filter(isUncategorizedPaper).length;
  }
  return papers.filter(p => p.folderId === folderId).length;
}

function getUncategorizedCount() {
  return papers.filter(isUncategorizedPaper).length;
}

function renderFolders() {
  const container = document.getElementById('folder-list');
  if (!container) return;

  const items = folders.map((f, i) => ({
    id: f.id,
    label: f.name,
    count: countPapersInFolder(f.id),
    colorIndex: i % BOOKMARK_COLORS.length,
  }));

  const uncategorizedCount = getUncategorizedCount();
  if (uncategorizedCount > 0) {
    items.push({
      id: UNCategorized_ID,
      label: '未分类',
      count: uncategorizedCount,
      colorIndex: items.length % BOOKMARK_COLORS.length,
    });
  }

  if (items.length === 0) {
    container.innerHTML = '<p class="bookmark-empty">暂无分类，站主可点击「新建分类」创建论文分类</p>';
    return;
  }

  container.innerHTML = items.map((item, index) => {
    const colors = BOOKMARK_COLORS[item.colorIndex ?? index % BOOKMARK_COLORS.length];
    const isNew = item.id === lastCreatedFolderId;
    return `
      <div class="bookmark-card${currentFolderId === item.id ? ' active' : ''}${isNew ? ' is-new' : ''}"
           data-folder-id="${escapeHtml(item.id)}">
        <div class="bookmark-open" role="button" tabindex="0" aria-label="${escapeHtml(item.label)}，${item.count} 篇论文">
          <div class="bookmark-inner" style="
            --bookmark-bg: ${colors.bg};
            --bookmark-tab: ${colors.tab};
            --bookmark-border: ${colors.border};
            --bookmark-text: ${colors.text};
            background: ${colors.bg};
            border-color: ${colors.border};
            color: ${colors.text};
          ">
            <div class="bookmark-tab" style="background:${colors.tab}"></div>
            ${isAdmin && item.id !== UNCategorized_ID ? `
              <span class="bookmark-actions admin-only">
                <button type="button" class="bookmark-action" data-action="rename" data-folder-id="${escapeHtml(item.id)}" title="重命名">✎</button>
                <button type="button" class="bookmark-action danger" data-action="delete" data-folder-id="${escapeHtml(item.id)}" title="删除">×</button>
              </span>
            ` : ''}
            <div class="bookmark-content">
              <div class="bookmark-name" style="color:${colors.text}">${escapeHtml(item.label)}</div>
              <div class="bookmark-count" style="color:${colors.text}">${item.count} 篇论文</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  if (lastCreatedFolderId) {
    setTimeout(() => {
      const el = container.querySelector(`.bookmark-card[data-folder-id="${lastCreatedFolderId}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      lastCreatedFolderId = null;
    }, 100);
  }

  container.querySelectorAll('.bookmark-card').forEach(card => {
    const openEl = card.querySelector('.bookmark-open');
    if (!openEl) return;
    const folderId = card.dataset.folderId;
    const activate = () => openFolder(folderId);
    openEl.addEventListener('click', (e) => {
      if (e.target.closest('.bookmark-action')) return;
      activate();
    });
    openEl.addEventListener('keydown', (e) => {
      if (e.target.closest('.bookmark-action')) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activate();
      }
    });
  });

  container.querySelectorAll('.bookmark-action').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = btn.dataset.folderId;
      if (btn.dataset.action === 'rename') renameFolder(id);
      if (btn.dataset.action === 'delete') deleteFolder(id);
    });
  });

  void applyFolderImages(container);
}

function openFolderModal(mode, id = null) {
  folderModalMode = mode;
  folderEditingId = id;
  folderDraftId = mode === 'create' ? crypto.randomUUID() : id;

  document.getElementById('folder-modal-title').textContent = mode === 'create' ? '新建分类' : '重命名分类';
  document.getElementById('folder-name-input').value = mode === 'rename' ? (getFolderById(id)?.name || '') : '';

  const promptEl = document.getElementById('folder-image-prompt');
  const folder = mode === 'rename' ? getFolderById(id) : null;
  if (promptEl) promptEl.value = folder?.imagePrompt || '';

  void updateFolderImagePreviewInModal(folderDraftId);

  document.getElementById('folder-modal').showModal();
  setTimeout(() => document.getElementById('folder-name-input').focus(), 50);
}

async function updateFolderImagePreviewInModal(folderId) {
  const wrap = document.getElementById('folder-image-preview-wrap');
  const img = document.getElementById('folder-image-preview');
  if (!wrap || !img || !folderId) return;

  let previewUrl = null;
  if (pendingFolderImages.has(folderId)) {
    if (!folderImageBlobUrls.has(folderId)) {
      folderImageBlobUrls.set(folderId, URL.createObjectURL(pendingFolderImages.get(folderId)));
    }
    previewUrl = folderImageBlobUrls.get(folderId);
  } else {
    const folder = getFolderById(folderId);
    if (folder) previewUrl = await resolveFolderImageUrl(folder);
  }

  if (previewUrl) {
    img.src = previewUrl;
    wrap.classList.remove('hidden');
  } else {
    img.removeAttribute('src');
    wrap.classList.add('hidden');
  }
}

async function generateFolderImage() {
  if (!requireAdmin()) return;

  const userPrompt = document.getElementById('folder-image-prompt')?.value.trim() || '';
  if (!userPrompt) {
    alert('请先填写图片提示词');
    return;
  }

  const folderId = folderModalMode === 'create' ? folderDraftId : folderEditingId;
  const btn = document.getElementById('btn-generate-folder-image');

  btn.disabled = true;
  const prevText = btn.textContent;
  btn.textContent = '生成中…';

  try {
    const blob = await window.PaperAI.generateBookmarkImage(userPrompt);
    await storeFolderImageBlob(folderId, blob);

    const folder = getFolderById(folderId);
    if (folder) {
      folder.imagePath = getFolderImagePath(folderId);
      folder.imagePrompt = userPrompt || undefined;
    }
    markDirty();

    await updateFolderImagePreviewInModal(folderId);
    renderFolders();
    if (currentFolderId === folderId) updatePapersPanelVisibility();
    alert('便签图片已生成，记得点击「发布到网站」保存');
  } catch (err) {
    alert(`生成失败：${err.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = prevText;
  }
}

function createFolder() {
  if (!isAdmin) {
    alert('无权限执行此操作。');
    if (!isLoggedIn) openLoginModal();
    return;
  }
  openFolderModal('create');
}

function handleFolderFormSubmit(e) {
  e.preventDefault();
  if (!isAdmin) return;

  const name = document.getElementById('folder-name-input').value.trim();
  if (!name) return;

  const imagePrompt = document.getElementById('folder-image-prompt')?.value.trim() || '';
  const folderId = folderModalMode === 'create' ? folderDraftId : folderEditingId;

  if (folderModalMode === 'create') {
    const newFolder = {
      id: folderId,
      name,
      createdAt: new Date().toISOString(),
    };
    if (imagePrompt) newFolder.imagePrompt = imagePrompt;
    if (pendingFolderImages.has(folderId)) {
      newFolder.imagePath = getFolderImagePath(folderId);
    }
    folders.push(newFolder);
    lastCreatedFolderId = newFolder.id;
  } else if (folderEditingId) {
    const folder = getFolderById(folderEditingId);
    if (folder) {
      folder.name = name;
      if (imagePrompt) folder.imagePrompt = imagePrompt;
      else delete folder.imagePrompt;
      if (pendingFolderImages.has(folderEditingId)) {
        folder.imagePath = getFolderImagePath(folderEditingId);
      }
    }
  }

  markDirty();
  document.getElementById('folder-modal').close();
  closeFolderView();
  renderFolders();
  updateFolderSelect();
}

function renameFolder(id) {
  if (!isAdmin) return;
  openFolderModal('rename', id);
}

function deleteFolder(id) {
  if (!isAdmin) return;
  const folder = getFolderById(id);
  if (!folder) return;
  if (!confirm(`确定删除分类「${folder.name}」？其中的论文将变为未分类。`)) return;

  papers.forEach(p => {
    if (p.folderId === id) p.folderId = null;
  });
  folders = folders.filter(f => f.id !== id);
  revokeFolderImageBlob(id);
  pendingFolderImages.delete(id);
  void window.FolderImageStore.deleteFolderImageFromStore(id);
  if (currentFolderId === id) closeFolderView();
  markDirty();
  renderFolders();
  if (currentFolderId != null) renderList();
  updateFolderSelect();
}

function updateFolderSelect() {
  const select = document.getElementById('paper-folder');
  if (!select) return;
  const current = select.value;
  select.innerHTML = '<option value="">未分类</option>' +
    folders.map(f => `<option value="${escapeHtml(f.id)}">${escapeHtml(f.name)}</option>`).join('');
  if ([...select.options].some(o => o.value === current)) {
    select.value = current;
  }
}

function getFilteredPapers() {
  const search = document.getElementById('search-input').value.toLowerCase();
  const status = document.getElementById('filter-status').value;
  const tag = document.getElementById('filter-tag').value;

  return papers.filter(p => {
    if (currentFolderId === UNCategorized_ID) {
      if (!isUncategorizedPaper(p)) return false;
    } else if (currentFolderId && p.folderId !== currentFolderId) return false;
    if (status && p.status !== status) return false;
    if (tag && !(p.tags || []).includes(tag)) return false;
    if (search) {
      const haystack = [
        p.title, p.authors, p.summary, p.notes, p.url, p.pdfUrl, p.sourceCodeUrl,
        ...(p.tags || []),
        ...(p.knowledgePoints || []).flatMap(kp => [kp.term, kp.explanation, kp.link]),
      ].join(' ').toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function getFolderPapers() {
  if (currentFolderId == null) return [];
  if (currentFolderId === UNCategorized_ID) {
    return papers.filter(isUncategorizedPaper);
  }
  return papers.filter(p => p.folderId === currentFolderId);
}

function renderList() {
  if (currentFolderId == null) return;

  const list = document.getElementById('paper-list');
  const empty = document.getElementById('empty-state');
  const filtered = getFilteredPapers();

  updateTagFilter();

  if (papers.length === 0) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    empty.querySelector('h3').textContent = '还没有论文记录';
    empty.querySelector('p').textContent = '暂无论文记录';
    return;
  }

  const folderPapers = getFolderPapers();
  if (folderPapers.length === 0) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    empty.querySelector('h3').textContent = '该文件夹暂无论文';
    empty.querySelector('p').textContent = '切换文件夹或添加新论文';
    return;
  }

  if (filtered.length === 0) {
    list.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:2rem;">没有匹配的论文</p>';
    empty.classList.add('hidden');
    return;
  }

  empty.classList.add('hidden');

  list.innerHTML = filtered.map(p => `
    <article class="paper-card" data-id="${p.id}">
      <div class="paper-card-header">
        <h3 class="paper-title">${escapeHtml(getDisplayTitle(p))}</h3>
        <span class="status-badge status-${p.status}">${STATUS_LABELS[p.status]}</span>
      </div>
      <p class="paper-meta">${formatMeta(p)}</p>
      ${p.summary ? `<p class="paper-summary">${escapeHtml(p.summary)}</p>` : ''}
      <div class="paper-card-footer">
        ${paperHasLink(p) ? '<span class="pdf-badge">🔗 链接</span>' : ''}
        ${(p.tags || []).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}
      </div>
    </article>
  `).join('');

  list.querySelectorAll('.paper-card').forEach(card => {
    card.addEventListener('click', () => openReader(card.dataset.id));
  });
}

function formatMeta(p) {
  const parts = [];
  if (p.authors) parts.push(p.authors);
  if (p.year) parts.push(p.year);
  if (p.venue) parts.push(p.venue);
  if (p.readDate) parts.push(`阅读于 ${p.readDate}`);
  return escapeHtml(parts.join(' · '));
}

function formatMetaPlain(p) {
  const parts = [];
  if (p.authors) parts.push(p.authors);
  if (p.year) parts.push(String(p.year));
  if (p.venue) parts.push(p.venue);
  if (p.readDate) parts.push(`阅读于 ${p.readDate}`);
  return parts.join(' · ');
}

function updateTagFilter() {
  const select = document.getElementById('filter-tag');
  const current = select.value;
  const allTags = [...new Set(papers.flatMap(p => p.tags || []))].sort();

  select.innerHTML = '<option value="">全部标签</option>' +
    allTags.map(t => `<option value="${escapeHtml(t)}"${t === current ? ' selected' : ''}>${escapeHtml(t)}</option>`).join('');
}

function renderNoteBlock(title, content, isHtml = false) {
  if (!content) return '';
  return `
    <div class="note-block">
      <h4>${escapeHtml(title)}</h4>
      ${isHtml ? content : `<p>${escapeHtml(content)}</p>`}
    </div>
  `;
}

let currentReaderPdfUrl = null;

async function downloadPdf(paper, pdfUrl) {
  if (!paper || !pdfUrl) return;

  const safeTitle = getDisplayTitle(paper).replace(/[<>:"/\\|?*]/g, '_');
  const filename = `${safeTitle}.pdf`;

  try {
    const a = document.createElement('a');
    a.href = pdfUrl;
    a.target = '_blank';
    a.rel = 'noopener';
    a.download = filename;
    a.click();
  } catch {
    alert('下载失败，请尝试「新窗口打开」后保存');
  }
}

async function openReader(id) {
  const p = papers.find(x => x.id === id);
  if (!p) return;

  currentReaderId = id;
  document.getElementById('reader-title').textContent = getDisplayTitle(p);
  document.getElementById('reader-meta').textContent = formatMetaPlain(p);

  const frame = document.getElementById('pdf-frame');
  const unavailable = document.getElementById('pdf-unavailable');
  const openTab = document.getElementById('pdf-open-tab');
  const downloadBtn = document.getElementById('pdf-download');

  currentReaderPdfUrl = null;
  frame.classList.add('hidden');
  unavailable.classList.remove('hidden');
  unavailable.querySelector('p').textContent = '正在加载 PDF…';
  openTab.classList.add('hidden');
  downloadBtn.classList.add('hidden');
  frame.src = 'about:blank';

  switchView('reader');
  updateUserUI();

  const embedUrl = await resolvePdfUrl(p);
  const linkUrl = p.url || p.pdfUrl || embedUrl;

  if (embedUrl) {
    currentReaderPdfUrl = embedUrl;
    frame.src = embedUrl;
    frame.classList.remove('hidden');
    unavailable.classList.add('hidden');
    downloadBtn.classList.remove('hidden');
  } else {
    frame.classList.add('hidden');
    unavailable.classList.remove('hidden');
    unavailable.querySelector('p').textContent = '无法在页内预览 PDF，请点击下方链接阅读';
    downloadBtn.classList.add('hidden');
  }

  if (linkUrl) {
    openTab.href = linkUrl;
    openTab.textContent = p.url ? '打开论文链接' : '打开 PDF';
    openTab.classList.remove('hidden');
  }

  const notesEl = document.getElementById('reader-notes');
  const knowledgeEl = document.getElementById('reader-knowledge');
  const tagsHtml = (p.tags || []).length
    ? `<div class="paper-tags" style="margin-bottom:1rem">${p.tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>`
    : '';
  const urlHtml = p.url
    ? renderNoteBlock('论文链接', `<a href="${escapeHtml(p.url)}" target="_blank" rel="noopener">${escapeHtml(p.url)}</a>`, true)
    : '';
  const codeHtml = p.sourceCodeUrl
    ? renderNoteBlock('源代码', `<a href="${escapeHtml(p.sourceCodeUrl)}" target="_blank" rel="noopener">${escapeHtml(p.sourceCodeUrl)}</a>`, true)
    : '';

  notesEl.innerHTML = `
    ${tagsHtml}
    <span class="status-badge status-${p.status}">${STATUS_LABELS[p.status]}</span>
    ${urlHtml}
    ${codeHtml}
    ${renderNoteBlock('摘要 / 核心观点', p.summary)}
    ${renderNoteBlock('详细笔记', p.notes)}
    ${!p.summary && !p.notes && !p.url && !p.sourceCodeUrl ? '<p class="note-empty">暂无笔记</p>' : ''}
  `;

  if (knowledgeEl) {
    knowledgeEl.innerHTML = renderKnowledgePointsHtml(p.knowledgePoints);
  }
}

function updateAiExtractButtonState() {
  const btn = document.getElementById('btn-ai-extract');
  if (!btn) return;
  const draftId = document.getElementById('paper-id').value;
  const hasPdfInput = !!document.getElementById('pdf-file')?.files[0];
  const hasPending = (editingId && pendingPdfs.has(editingId))
    || (draftId && pendingPdfs.has(draftId));
  btn.disabled = !(hasPdfInput || hasPending);
}

function getDisplayTitle(paper) {
  if (paper.title) return paper.title;
  return '未命名论文';
}

function ensureDraftPaperId() {
  let id = document.getElementById('paper-id').value;
  if (!id) {
    id = crypto.randomUUID();
    document.getElementById('paper-id').value = id;
  }
  return id;
}

function applyMetadataToForm(meta) {
  const fields = [
    ['title', meta.title],
    ['authors', meta.authors],
    ['year', meta.year],
    ['url', meta.url],
    ['source-code-url', meta.sourceCodeUrl],
    ['venue', meta.venue],
    ['summary', meta.summary],
  ];
  fields.forEach(([id, value]) => {
    if (value != null && value !== '') {
      document.getElementById(id).value = value;
    }
  });
}

function setAiExtractStatus(message, type = '') {
  const el = document.getElementById('ai-extract-status');
  if (!el) return;
  el.textContent = message || '';
  el.className = 'file-hint' + (type ? ` ai-status-${type}` : '');
}

async function getPdfFileForExtract() {
  const id = editingId || document.getElementById('paper-id').value;
  if (id && pendingPdfs.has(id)) return pendingPdfs.get(id);

  const input = document.getElementById('pdf-file');
  if (input.files[0]) return input.files[0];
  return null;
}

async function handleAiExtract() {
  if (!requireAdmin()) return false;

  const btn = document.getElementById('btn-ai-extract');
  btn.disabled = true;
  setAiExtractStatus('正在解析 PDF…', 'loading');

  try {
    const file = await getPdfFileForExtract();
    if (!file) throw new Error('请先上传 PDF');

    if (!window.PaperAI.getSiliconFlowApiKey()) {
      setAiExtractStatus('未配置 API Key，请手动填写或前往 AI 设置', 'error');
      return false;
    }

    setAiExtractStatus('正在调用大模型识别…', 'loading');
    const meta = await window.PaperAI.extractPaperMetadataFromPdf(file);
    applyMetadataToForm(meta);
    setAiExtractStatus('识别完成，未识别的字段可手动补充', 'success');
    return true;
  } catch (err) {
    setAiExtractStatus(err.message + '，可手动填写', 'error');
    return false;
  } finally {
    updateAiExtractButtonState();
  }
}

async function handlePdfUpload(file) {
  if (!file) return;

  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    alert('请上传 PDF 格式文件');
    document.getElementById('pdf-file').value = '';
    return;
  }

  const paperId = editingId || ensureDraftPaperId();
  revokePdfBlob(paperId);
  pendingPdfs.set(paperId, file);
  await window.PdfStore.savePdfToStore(paperId, file);
  updateAiExtractButtonState();
  await handleAiExtract();
}

function saveAdminSettings() {
  if (!requireAdmin()) return;
  const apiKey = document.getElementById('sf-api-key').value.trim();
  const model = document.getElementById('sf-model').value.trim();
  const imageModel = document.getElementById('sf-image-model')?.value.trim();
  const githubToken = document.getElementById('github-token').value.trim();
  window.PaperAI.saveSiliconFlowSettings(apiKey, model || undefined, imageModel || undefined);
  saveGithubToken(githubToken);
  alert('设置已保存');
}

function setKpExplainStatus(msg, type = '') {
  const el = document.getElementById('kp-explain-status');
  if (!el) return;
  el.textContent = msg || '';
  el.className = 'file-hint' + (type ? ` ai-status-${type}` : '');
}

function createKnowledgePointRow(data = {}) {
  const row = document.createElement('div');
  row.className = 'knowledge-point-row';
  row.innerHTML = `
    <input type="text" class="kp-row-term" placeholder="名词，例如：注意力机制">
    <input type="text" class="kp-row-link" placeholder="讲解链接（可选）">
    <textarea class="kp-row-explanation" rows="3" placeholder="AI 自动生成解释，也可手动编辑"></textarea>
    <div class="knowledge-point-row-actions">
      <button type="button" class="btn btn-ghost btn-sm btn-kp-explain-one">解释此项</button>
      <button type="button" class="btn btn-ghost btn-sm btn-kp-remove">删除</button>
    </div>
  `;
  row.querySelector('.kp-row-term').value = data.term || '';
  row.querySelector('.kp-row-link').value = data.link || '';
  row.querySelector('.kp-row-explanation').value = data.explanation || '';
  row.querySelector('.btn-kp-remove').addEventListener('click', () => row.remove());
  row.querySelector('.btn-kp-explain-one').addEventListener('click', () => {
    void explainKnowledgePointRows([row]);
  });
  return row;
}

function addKnowledgePointRow(data = {}) {
  const list = document.getElementById('knowledge-points-list');
  if (!list) return;
  list.appendChild(createKnowledgePointRow(data));
}

function setKnowledgePointsToForm(points = []) {
  const list = document.getElementById('knowledge-points-list');
  if (!list) return;
  list.innerHTML = '';
  if (points.length) {
    points.forEach(kp => addKnowledgePointRow(kp));
  }
  setKpExplainStatus('');
}

function getKnowledgePointsFromForm() {
  const list = document.getElementById('knowledge-points-list');
  if (!list) return [];
  return [...list.querySelectorAll('.knowledge-point-row')]
    .map(row => ({
      term: row.querySelector('.kp-row-term')?.value.trim() || '',
      link: row.querySelector('.kp-row-link')?.value.trim() || '',
      explanation: (row.querySelector('.kp-row-explanation')?.value.trim() || '').slice(0, 200),
    }))
    .filter(kp => kp.term);
}

function getKnowledgePointFormContext() {
  return {
    title: document.getElementById('title')?.value.trim() || '',
    summary: document.getElementById('summary')?.value.trim() || '',
  };
}

async function explainKnowledgePointRows(rows) {
  if (!requireAdmin()) return;

  const payload = rows.map(row => ({
    row,
    term: row.querySelector('.kp-row-term')?.value.trim() || '',
    link: row.querySelector('.kp-row-link')?.value.trim() || '',
    explanation: row.querySelector('.kp-row-explanation')?.value.trim() || '',
  })).filter(item => item.term);

  if (!payload.length) {
    alert('请先填写名词');
    return;
  }

  setKpExplainStatus('正在生成解释…');
  const btnAll = document.getElementById('btn-explain-knowledge-points');
  if (btnAll) btnAll.disabled = true;

  try {
    const explained = await window.PaperAI.explainKnowledgeTerms(
      payload.map(({ term, link, explanation }) => ({ term, link, explanation })),
      getKnowledgePointFormContext()
    );
    explained.forEach((item, index) => {
      const row = payload[index]?.row;
      if (!row) return;
      const area = row.querySelector('.kp-row-explanation');
      if (area && item.explanation) area.value = item.explanation.slice(0, 200);
    });
    setKpExplainStatus('解释已生成', 'success');
  } catch (err) {
    setKpExplainStatus(err.message, 'error');
    alert(`生成失败：${err.message}`);
  } finally {
    if (btnAll) btnAll.disabled = false;
  }
}

async function explainAllKnowledgePointsInForm() {
  const list = document.getElementById('knowledge-points-list');
  if (!list) return;
  const rows = [...list.querySelectorAll('.knowledge-point-row')];
  await explainKnowledgePointRows(rows);
}

function renderKnowledgePointsHtml(points) {
  if (!points?.length) return '<p class="note-empty">暂无知识点</p>';
  return points.map(kp => `
    <article class="knowledge-point-card">
      <h4 class="kp-term">${escapeHtml(kp.term)}</h4>
      ${kp.explanation
    ? `<p class="kp-explanation">${escapeHtml(kp.explanation)}</p>`
    : '<p class="kp-explanation note-empty">暂无解释</p>'}
      ${kp.link
    ? `<a class="kp-read-link" href="${escapeHtml(kp.link)}" target="_blank" rel="noopener">讲解链接</a>`
    : ''}
    </article>
  `).join('');
}

function resetForm() {
  const draftId = document.getElementById('paper-id').value;
  if (draftId && !editingId) {
    revokePdfBlob(draftId);
    pendingPdfs.delete(draftId);
  }

  editingId = null;
  document.getElementById('form-title').textContent = '添加论文';
  document.getElementById('paper-form').reset();
  document.getElementById('paper-id').value = '';
  document.getElementById('pdf-file').value = '';
  setAiExtractStatus('');
  updateAiExtractButtonState();
  setKnowledgePointsToForm([]);
}

function editPaper(id) {
  if (!requireAdmin()) return;
  const p = papers.find(x => x.id === id);
  if (!p) return;

  editingId = id;
  document.getElementById('form-title').textContent = '编辑论文';
  switchView('add');

  document.getElementById('paper-id').value = p.id;
  document.getElementById('title').value = p.title;
  document.getElementById('authors').value = p.authors || '';
  document.getElementById('year').value = p.year || '';
  document.getElementById('venue').value = p.venue || '';
  document.getElementById('url').value = p.url || '';
  document.getElementById('pdf-url').value = p.pdfUrl || '';
  document.getElementById('source-code-url').value = p.sourceCodeUrl || '';
  document.getElementById('paper-folder').value = p.folderId || '';
  document.getElementById('status').value = p.status;
  document.getElementById('read-date').value = p.readDate || '';
  document.getElementById('tags').value = (p.tags || []).join(', ');
  document.getElementById('summary').value = p.summary || '';
  document.getElementById('notes').value = p.notes || '';
  setKnowledgePointsToForm(p.knowledgePoints || []);
  document.getElementById('pdf-file').value = '';
  updateAiExtractButtonState();
}

function deletePaper(id) {
  if (!requireAdmin()) return;
  if (!confirm('确定删除这篇论文记录吗？')) return;

  revokePdfBlob(id);
  pendingPdfs.delete(id);
  window.PdfStore.deletePdfFromStore(id);
  papers = papers.filter(x => x.id !== id);
  markDirty();

  if (currentReaderId === id) {
    currentReaderId = null;
    switchView('list');
  } else {
    renderList();
  }
}

function handleSubmit(e) {
  e.preventDefault();
  if (!requireAdmin()) return;
  submitPaperForm();
}

async function submitPaperForm() {
  const pdfInput = document.getElementById('pdf-file');
  const pdfFile = pdfInput.files[0];

  if (pdfFile && pdfFile.type !== 'application/pdf' && !pdfFile.name.toLowerCase().endsWith('.pdf')) {
    alert('请上传 PDF 格式文件');
    return;
  }

  const url = document.getElementById('url').value.trim();
  if (!url) {
    alert('请填写论文链接');
    return;
  }

  const title = document.getElementById('title').value.trim();
  if (!editingId && title) {
    const duplicate = papers.find(p => p.title.trim().toLowerCase() === title.toLowerCase());
    if (duplicate && !confirm(
      `已存在同名论文「${duplicate.title}」。\n\n` +
      '若要修改内容，请打开该论文后点「编辑」。\n\n仍要再添加一条记录吗？'
    )) {
      return;
    }
  }

  const pdfUrlInput = document.getElementById('pdf-url').value.trim();
  const data = {
    title,
    authors: document.getElementById('authors').value.trim(),
    year: parseInt(document.getElementById('year').value) || null,
    venue: document.getElementById('venue').value.trim(),
    url,
    pdfUrl: pdfUrlInput || derivePdfUrlFromPaperUrl(url) || null,
    sourceCodeUrl: document.getElementById('source-code-url').value.trim(),
    folderId: document.getElementById('paper-folder').value || null,
    status: document.getElementById('status').value,
    readDate: document.getElementById('read-date').value,
    tags: document.getElementById('tags').value.split(',').map(t => t.trim()).filter(Boolean),
    summary: document.getElementById('summary').value.trim(),
    notes: document.getElementById('notes').value.trim(),
    knowledgePoints: getKnowledgePointsFromForm(),
    updatedAt: new Date().toISOString(),
  };

  const draftId = document.getElementById('paper-id').value;
  let paperId = editingId;

  if (editingId) {
    const idx = papers.findIndex(p => p.id === editingId);
    if (idx === -1) return;

    const existing = papers[idx];
    paperId = existing.id;

    if (!data.folderId && existing.folderId) {
      data.folderId = existing.folderId;
    }

    papers[idx] = normalizePaperRecord({ ...existing, ...data });
  } else {
    paperId = draftId || crypto.randomUUID();
    papers.unshift(normalizePaperRecord({
      id: paperId,
      ...data,
      createdAt: new Date().toISOString(),
    }));
  }

  markDirty();
  resetForm();
  currentFolderId = data.folderId || currentFolderId;
  switchView('list');
}

function renderStats() {
  loadAdminSettingsIntoForm();

  document.getElementById('stat-total').textContent = papers.length;
  document.getElementById('stat-finished').textContent = papers.filter(p => p.status === 'finished').length;
  document.getElementById('stat-reading').textContent = papers.filter(p => p.status === 'reading').length;
  document.getElementById('stat-toread').textContent = papers.filter(p => p.status === 'to-read').length;

  const tagCounts = {};
  papers.forEach(p => (p.tags || []).forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; }));

  const cloud = document.getElementById('tag-cloud');
  const sorted = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);

  if (sorted.length === 0) {
    cloud.innerHTML = '<p style="color:var(--text-muted)">暂无标签</p>';
    return;
  }

  cloud.innerHTML = sorted.map(([tag, count]) =>
    `<span class="tag">${escapeHtml(tag)} (${count})</span>`
  ).join('');
}

function getFoldersJson() {
  return JSON.stringify(folders, null, 2) + '\n';
}

function getPapersJson() {
  return JSON.stringify(papers.map(sanitizePaperForStorage), null, 2) + '\n';
}

function downloadPapersJson() {
  const blob = new Blob([getPapersJson()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'papers.json';
  a.click();
  URL.revokeObjectURL(url);
}

function formatGithubPublishError(message) {
  const msg = message || '';
  if (/not accessible by personal access token|Resource not accessible/i.test(msg)) {
    return `${msg}\n\nToken 权限不足。请重新生成 GitHub Token：\n` +
      '· 经典 Token：勾选 repo 权限\n' +
      '· 细粒度 Token：选择仓库 gty050804/PaperAI，Contents 设为「读写」\n' +
      '生成后在「统计 → 站主设置」重新粘贴保存。';
  }
  if (/Bad credentials|401/i.test(msg)) {
    return `${msg}\n\nToken 无效或已过期，请重新生成并粘贴。`;
  }
  if (/Not Found|404/i.test(msg)) {
    return `${msg}\n\n请确认 config.js 中 owner/repo 为 gty050804/PaperAI，且 Token 对该仓库有写入权限。`;
  }
  return msg;
}

async function getGithubFileSha(owner, repo, path, branch, token) {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } }
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
  const data = await res.json();
  return data.sha;
}

async function uploadGithubFile(owner, repo, path, branch, token, base64Content, message) {
  const sha = await getGithubFileSha(owner, repo, path, branch, token);
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message,
        content: base64Content,
        branch,
        ...(sha ? { sha } : {}),
      }),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${res.status}`);
  }
}

async function deleteGithubFile(owner, repo, path, branch, token, message) {
  const sha = await getGithubFileSha(owner, repo, path, branch, token);
  if (!sha) return false;

  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message, sha, branch }),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${res.status}`);
  }
  return true;
}

async function listGithubDirectory(owner, repo, path, branch, token) {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } }
  );
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  return data.filter(item => item.type === 'file').map(item => item.path);
}

async function removeAllGithubPdfs(owner, repo, branch, token) {
  const pdfsDir = 'data/pdfs';
  const remoteFiles = await listGithubDirectory(owner, repo, pdfsDir, branch, token);
  let removed = 0;

  for (const filePath of remoteFiles) {
    const normalized = filePath.replace(/^\//, '');
    if (normalized.endsWith('.gitkeep')) continue;
    await deleteGithubFile(
      owner, repo, filePath, branch, token,
      `Remove stored PDF: ${normalized.split('/').pop()}`
    );
    removed++;
  }

  return removed;
}

async function publishToGithub() {
  if (!requireAdmin()) return;

  const config = getConfig().github || {};
  const { owner, repo, branch = 'main', dataPath = 'data/papers.json', foldersPath = 'data/folders.json' } = config;
  const token = getGithubToken();

  if (!owner || !repo || !token) {
    downloadPapersJson();
    alert(
      '已下载 papers.json。\n\n' +
      '请将 papers.json 放到 data/ 目录后 push 到 GitHub。\n\n' +
      '提示：配置 GitHub Token 后可一键发布。'
    );
    return;
  }

  const btn = document.getElementById('btn-publish');
  btn.disabled = true;
  btn.textContent = '发布中…';

  try {
    for (const folder of folders) {
      if (!folder.imagePath && !pendingFolderImages.has(folder.id)) continue;
      const blob = pendingFolderImages.has(folder.id)
        ? pendingFolderImages.get(folder.id)
        : await window.FolderImageStore.getFolderImageFromStore(folder.id);
      if (!blob) continue;
      const buffer = await blob.arrayBuffer();
      const base64 = arrayBufferToBase64(buffer);
      await uploadGithubFile(
        owner, repo, getFolderImagePath(folder.id), branch, token, base64,
        `Upload folder image: ${folder.name}`
      );
    }

    const foldersBase64 = btoa(unescape(encodeURIComponent(getFoldersJson())));
    await uploadGithubFile(
      owner, repo, foldersPath, branch, token, foldersBase64,
      'Update folders via PaperAI'
    );

    const jsonBase64 = btoa(unescape(encodeURIComponent(getPapersJson())));
    await uploadGithubFile(
      owner, repo, dataPath, branch, token, jsonBase64,
      'Update papers via PaperAI'
    );

    let removedPdfs = 0;
    try {
      removedPdfs = await removeAllGithubPdfs(owner, repo, branch, token);
    } catch (err) {
      console.warn('PDF cleanup failed:', err);
    }

    pendingPdfs.clear();
    pendingFolderImages.clear();
    clearAllFolderImageBlobs();
    clearLocalDraft();
    hasUnpublishedChanges = false;

    let msg = '发布成功！';
    if (removedPdfs > 0) msg += `\n已从仓库删除 ${removedPdfs} 个 PDF 文件。`;
    alert(msg);
  } catch (err) {
    alert(`发布失败：${formatGithubPublishError(err.message)}\n\n已改为下载 papers.json，请手动提交到仓库。`);
    downloadPapersJson();
  } finally {
    btn.disabled = false;
    btn.textContent = '发布到网站';
  }
}

function exportData() {
  if (!requireAdmin()) return;
  downloadPapersJson();
}

function importData(file) {
  if (!requireAdmin()) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const imported = JSON.parse(e.target.result);
      if (!Array.isArray(imported)) throw new Error('Invalid format');
      if (confirm(`将导入 ${imported.length} 条记录，是否覆盖现有数据？`)) {
        clearAllPdfBlobs();
        pendingPdfs.clear();
        papers = imported.map(normalizePaperRecord);
        markDirty();
        renderStats();
        renderList();
        alert('导入成功，请点击「发布到网站」。');
      }
    } catch {
      alert('导入失败：文件格式不正确');
    }
  };
  reader.readAsText(file);
}

function openLoginModal() {
  document.getElementById('login-error').classList.add('hidden');
  document.getElementById('admin-username').value = '';
  document.getElementById('admin-password').value = '';
  document.getElementById('login-modal').showModal();
}

async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('admin-username').value.trim();
  const password = document.getElementById('admin-password').value;
  const config = getConfig();
  const errorEl = document.getElementById('login-error');

  if (!username) {
    errorEl.textContent = '请输入用户名';
    errorEl.classList.remove('hidden');
    return;
  }

  if (username === ADMIN_USERNAME) {
    if (!password) {
      errorEl.textContent = '请输入密码';
      errorEl.classList.remove('hidden');
      return;
    }
    const hash = await hashPassword(password);
    if (hash !== config.adminPasswordHash) {
      errorEl.textContent = '用户名或密码错误';
      errorEl.classList.remove('hidden');
      return;
    }
    setUserSession({ username, role: 'admin' });
  } else {
    setUserSession({ username, role: 'guest' });
  }

  document.getElementById('login-modal').close();
  errorEl.classList.add('hidden');
  await loadData();
  renderFolders();
  updatePapersPanelVisibility();
  if (currentFolderId != null) renderList();
  renderStats();
}

function escapeHtml(str) {
  if (str == null) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', async () => {
  applySession(getSession());
  await loadData();

  document.getElementById('btn-new-folder').addEventListener('click', (e) => {
    e.preventDefault();
    createFolder();
  });

  document.getElementById('btn-back-folders').addEventListener('click', closeFolderView);

  document.getElementById('folder-form').addEventListener('submit', handleFolderFormSubmit);
  document.getElementById('btn-generate-folder-image')?.addEventListener('click', generateFolderImage);

  document.querySelectorAll('.nav-btn[data-view]').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  document.getElementById('btn-admin-login').addEventListener('click', () => {
    if (isLoggedIn) {
      switchView('stats');
    } else {
      openLoginModal();
    }
  });

  document.getElementById('btn-back-list').addEventListener('click', () => {
    currentReaderId = null;
    switchView('list');
  });

  document.getElementById('reader-edit').addEventListener('click', () => {
    if (currentReaderId) editPaper(currentReaderId);
  });

  document.getElementById('reader-delete').addEventListener('click', () => {
    if (currentReaderId) deletePaper(currentReaderId);
  });

  document.getElementById('pdf-download').addEventListener('click', () => {
    const p = papers.find(x => x.id === currentReaderId);
    if (p && currentReaderPdfUrl) downloadPdf(p, currentReaderPdfUrl);
  });

  document.getElementById('search-input').addEventListener('input', renderList);
  document.getElementById('filter-status').addEventListener('change', renderList);
  document.getElementById('filter-tag').addEventListener('change', renderList);

  document.getElementById('paper-form').addEventListener('submit', handleSubmit);
  document.getElementById('pdf-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handlePdfUpload(file);
    else {
      setAiExtractStatus('');
      updateAiExtractButtonState();
    }
  });
  document.getElementById('btn-ai-extract').addEventListener('click', handleAiExtract);
  document.getElementById('btn-add-knowledge-point')?.addEventListener('click', () => addKnowledgePointRow());
  document.getElementById('btn-explain-knowledge-points')?.addEventListener('click', explainAllKnowledgePointsInForm);
  document.getElementById('btn-save-sf-settings').addEventListener('click', saveAdminSettings);
  document.getElementById('btn-cancel').addEventListener('click', () => {
    resetForm();
    switchView('list');
  });

  document.getElementById('btn-publish').addEventListener('click', publishToGithub);
  document.getElementById('btn-export').addEventListener('click', exportData);
  document.getElementById('import-file').addEventListener('change', (e) => {
    if (e.target.files[0]) importData(e.target.files[0]);
    e.target.value = '';
  });
  document.getElementById('btn-clear').addEventListener('click', async () => {
    if (!requireAdmin()) return;
    if (confirm('确定清空所有论文记录？此操作不可恢复。')) {
      clearAllPdfBlobs();
      clearAllFolderImageBlobs();
      pendingPdfs.clear();
      pendingFolderImages.clear();
      await window.PdfStore.clearPdfStore();
      await window.FolderImageStore.clearFolderImageStore();
      clearLocalDraft();
      papers = [];
      folders = [];
      currentFolderId = null;
      hasUnpublishedChanges = false;
      writeRemoteCache(PAPERS_REMOTE_CACHE_KEY, []);
      writeRemoteCache(FOLDERS_REMOTE_CACHE_KEY, []);
      renderStats();
      renderFolders();
      updatePapersPanelVisibility();
    }
  });
  document.getElementById('btn-logout').addEventListener('click', () => {
    if (hasUnpublishedChanges && !confirm('有未发布的修改，确定退出登录吗？')) return;
    setUserSession(null);
    switchView('list');
  });

  document.getElementById('login-form').addEventListener('submit', handleLogin);

  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById(btn.dataset.close).close();
    });
  });

  renderFolders();
  updatePapersPanelVisibility();
});

window.switchView = switchView;
window.hashPassword = hashPassword;
