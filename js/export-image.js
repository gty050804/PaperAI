const EXPORT_SHEET_WIDTH = 900;
const HONKAI_EMOJI_DIR = 'assets/emoji/honkai_starrail';
const EMOJI_MAX_CSS_PX = 112;

let emojiMetaCache = null;

function resolveAssetUrl(relativePath) {
  if (!relativePath || relativePath.startsWith('http') || relativePath.startsWith('blob:')) {
    return relativePath;
  }
  const base = window.location.pathname.replace(/[^/]*$/, '');
  return `${base}${relativePath.replace(/^\//, '')}`;
}

async function loadEmojiMeta() {
  if (emojiMetaCache) return emojiMetaCache;
  try {
    const res = await fetch(`${resolveAssetUrl(`${HONKAI_EMOJI_DIR}/meta.json`)}?t=${Date.now()}`);
    if (res.ok) {
      emojiMetaCache = await res.json();
      return emojiMetaCache;
    }
  } catch {
    // fall through to default
  }
  emojiMetaCache = { count: 429, ext: 'jpg' };
  return emojiMetaCache;
}

function pickRandomEmojiUrl(meta) {
  const count = Math.max(1, meta?.count || 1);
  const ext = meta?.ext || 'jpg';
  const index = Math.floor(Math.random() * count) + 1;
  const filename = `${String(index).padStart(3, '0')}.${ext}`;
  return resolveAssetUrl(`${HONKAI_EMOJI_DIR}/${filename}`);
}

function loadImageElement(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('无法加载表情包'));
    img.src = url;
  });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function pickDomEmojiPlacement(sheet) {
  const sheetRect = sheet.getBoundingClientRect();
  const emojiW = EMOJI_MAX_CSS_PX;
  const emojiH = EMOJI_MAX_CSS_PX;
  const candidates = [];

  sheet.querySelectorAll('.paper-export-empty').forEach(el => {
    const rect = el.getBoundingClientRect();
    if (rect.width >= emojiW + 32 && rect.height >= emojiH + 12) {
      candidates.push({
        x: rect.left - sheetRect.left + (rect.width - emojiW) / 2,
        y: rect.top - sheetRect.top + (rect.height - emojiH) / 2,
      });
    }
  });

  sheet.querySelectorAll('.paper-export-section').forEach(section => {
    const sectionRect = section.getBoundingClientRect();
    const inner = section.querySelector(
      '.paper-export-prose, .paper-export-illustrations, .paper-export-knowledge, .paper-export-pdf, .paper-export-empty'
    );
    if (!inner) return;

    const innerRect = inner.getBoundingClientRect();
    const spaceBelow = sectionRect.bottom - innerRect.bottom;
    if (spaceBelow >= emojiH * 0.45) {
      candidates.push({
        x: sectionRect.right - sheetRect.left - emojiW - 36,
        y: innerRect.bottom - sheetRect.top + Math.max(6, (spaceBelow - emojiH) / 2),
      });
    }

    const spaceRight = sectionRect.right - innerRect.right;
    if (spaceRight >= emojiW * 0.55 && innerRect.height >= emojiH + 16) {
      candidates.push({
        x: innerRect.right - sheetRect.left + Math.max(8, (spaceRight - emojiW) / 2),
        y: innerRect.top - sheetRect.top + Math.min(innerRect.height * 0.25, innerRect.height - emojiH - 8),
      });
    }
  });

  const header = sheet.querySelector('.paper-export-header');
  if (header) {
    const headerRect = header.getBoundingClientRect();
    candidates.push({
      x: headerRect.right - sheetRect.left - emojiW - 40,
      y: headerRect.top - sheetRect.top + Math.max(24, headerRect.height * 0.35),
    });
  }

  if (!candidates.length) return null;

  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  return {
    x: clamp(pick.x, 20, sheetRect.width - emojiW - 20),
    y: clamp(pick.y, 20, sheetRect.height - emojiH - 20),
  };
}

function getFallbackEmojiPlacement(sheet) {
  const sheetRect = sheet.getBoundingClientRect();
  const sections = [...sheet.querySelectorAll('.paper-export-section')];
  if (sections.length > 0) {
    const section = sections[Math.floor(Math.random() * sections.length)];
    const rect = section.getBoundingClientRect();
    return {
      x: clamp(rect.right - sheetRect.left - EMOJI_MAX_CSS_PX - 36, 20, sheetRect.width - EMOJI_MAX_CSS_PX - 20),
      y: clamp(rect.top - sheetRect.top + 56, 20, sheetRect.height - EMOJI_MAX_CSS_PX - 20),
    };
  }
  return { x: sheetRect.width - EMOJI_MAX_CSS_PX - 48, y: 120 };
}

async function injectEmojiOverlay(sheet, emojiUrl) {
  await loadImageElement(emojiUrl);
  const pos = pickDomEmojiPlacement(sheet) || getFallbackEmojiPlacement(sheet);

  const img = document.createElement('img');
  img.className = 'paper-export-emoji-overlay';
  img.src = emojiUrl;
  img.alt = '';
  img.crossOrigin = 'anonymous';
  img.style.cssText = [
    'position:absolute',
    `left:${Math.round(pos.x)}px`,
    `top:${Math.round(pos.y)}px`,
    `width:${EMOJI_MAX_CSS_PX}px`,
    `height:${EMOJI_MAX_CSS_PX}px`,
    'object-fit:contain',
    'pointer-events:none',
    'z-index:5',
  ].join(';');

  sheet.appendChild(img);
  return img;
}

function ensurePdfJsReady() {
  if (!window.pdfjsLib) throw new Error('PDF 解析库未加载');
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

async function fetchPdfArrayBuffer(pdfUrl) {
  const res = await fetch(pdfUrl);
  if (!res.ok) throw new Error(`无法下载 PDF（${res.status}）`);
  return res.arrayBuffer();
}

async function loadPdfDocument(pdfUrl) {
  ensurePdfJsReady();
  try {
    return await pdfjsLib.getDocument({ url: pdfUrl, withCredentials: false }).promise;
  } catch {
    const buffer = await fetchPdfArrayBuffer(pdfUrl);
    return pdfjsLib.getDocument({ data: buffer }).promise;
  }
}

async function renderPdfFirstPageDataUrl(pdfUrl, displayWidth = EXPORT_SHEET_WIDTH) {
  const pdf = await loadPdfDocument(pdfUrl);
  const page = await pdf.getPage(1);
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = (displayWidth / baseViewport.width) * 2;
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({
    canvasContext: canvas.getContext('2d'),
    viewport,
  }).promise;
  return canvas.toDataURL('image/png');
}

async function waitForImages(container) {
  const imgs = [...container.querySelectorAll('img')];
  await Promise.all(imgs.map(img => {
    if (img.complete) return Promise.resolve();
    return new Promise(resolve => {
      img.onload = resolve;
      img.onerror = resolve;
    });
  }));
}

function formatExportHeaderMeta(paper) {
  const authors = (paper.authors || '').trim();
  const parts = [];
  if (paper.year) parts.push(String(paper.year));
  if (paper.venue) parts.push(paper.venue);
  if (paper.readDate) parts.push(`阅读于 ${paper.readDate}`);
  return { authors, details: parts.join(' · ') };
}

function prepareExportTextLayout(sheet) {
  sheet.querySelectorAll(
    '.paper-export-title, .paper-export-authors, .paper-export-meta, .paper-export-section-title, .paper-export-prose .note-block p, .kp-explanation'
  ).forEach(el => {
    el.style.display = 'block';
    el.style.overflow = 'visible';
    const height = el.scrollHeight;
    el.style.minHeight = `${height}px`;
    el.style.height = `${height}px`;
  });
}

function buildExportSheetHtml(paper, helpers, sections) {
  const {
    escapeHtml,
    getDisplayTitle,
    renderNoteBlock,
    renderKnowledgePointsHtml,
    STATUS_LABELS,
    getFolderPathLabel,
  } = helpers;

  const title = getDisplayTitle(paper);
  const { authors, details } = formatExportHeaderMeta(paper);
  const folderLabel = getFolderPathLabel(paper.folderId);
  const tagsHtml = (paper.tags || []).length
    ? `<div class="paper-export-tags">${paper.tags.map(t => `<span class="paper-export-tag">${escapeHtml(t)}</span>`).join('')}</div>`
    : '';

  const urlHtml = paper.url
    ? renderNoteBlock('论文链接', `<a href="${escapeHtml(paper.url)}">${escapeHtml(paper.url)}</a>`, true)
    : '';
  const codeHtml = paper.sourceCodeUrl
    ? renderNoteBlock('源代码', `<a href="${escapeHtml(paper.sourceCodeUrl)}">${escapeHtml(paper.sourceCodeUrl)}</a>`, true)
    : '';

  const pdfSection = sections.pdfDataUrl
    ? `<section class="paper-export-section">
        <h2 class="paper-export-section-title">论文首页</h2>
        <img class="paper-export-pdf" src="${sections.pdfDataUrl}" alt="PDF 第一页">
      </section>`
    : `<section class="paper-export-section paper-export-section-muted">
        <h2 class="paper-export-section-title">论文首页</h2>
        <p class="paper-export-empty">${escapeHtml(sections.pdfError || '暂无 PDF 预览')}</p>
      </section>`;

  const illustrationsHtml = sections.illustrationsHtml
    || '<p class="paper-export-empty">暂无图解</p>';

  return `
    <div class="paper-export-sheet">
      <header class="paper-export-header">
        <div class="paper-export-brand">PaperAI · 论文阅读笔记</div>
        <div class="paper-export-title-block">
          <div class="paper-export-title">${escapeHtml(title)}</div>
        </div>
        ${authors ? `<p class="paper-export-authors">${escapeHtml(authors)}</p>` : ''}
        ${details ? `<p class="paper-export-meta">${escapeHtml(details)}</p>` : ''}
        <div class="paper-export-badges">
          <span class="paper-export-badge">${escapeHtml(STATUS_LABELS[paper.status] || paper.status || '')}</span>
          ${folderLabel ? `<span class="paper-export-badge paper-export-badge-muted">${escapeHtml(folderLabel)}</span>` : ''}
        </div>
        ${tagsHtml}
      </header>

      ${pdfSection}

      <section class="paper-export-section">
        <h2 class="paper-export-section-title">笔记</h2>
        <div class="paper-export-prose">
          ${urlHtml}
          ${codeHtml}
          ${renderNoteBlock('摘要 / 核心观点', paper.summary)}
          ${renderNoteBlock('详细笔记', paper.notes)}
          ${!paper.summary && !paper.notes && !paper.url && !paper.sourceCodeUrl
    ? '<p class="paper-export-empty">暂无笔记</p>'
    : ''}
        </div>
      </section>

      <section class="paper-export-section">
        <h2 class="paper-export-section-title">图解</h2>
        <div class="paper-export-illustrations">${illustrationsHtml}</div>
      </section>

      <section class="paper-export-section">
        <h2 class="paper-export-section-title">知识点</h2>
        <div class="paper-export-knowledge">${renderKnowledgePointsHtml(paper.knowledgePoints)}</div>
      </section>

      <footer class="paper-export-footer">
        导出时间：${escapeHtml(new Date().toLocaleString('zh-CN'))}
      </footer>
    </div>
  `;
}

async function buildIllustrationsHtml(paper, resolveIllustrationUrl, escapeHtml) {
  const items = paper.illustrations || [];
  if (!items.length) return '';

  const figures = await Promise.all(items.map(async (item) => {
    const url = await resolveIllustrationUrl(paper.id, item);
    if (!url) return '';
    const caption = item.title
      ? `<figcaption class="paper-export-illustration-caption">${escapeHtml(item.title)}</figcaption>`
      : '';
    return `
      <figure class="paper-export-illustration">
        <img src="${url}" alt="${escapeHtml(item.title || '图解')}" crossorigin="anonymous">
        ${caption}
      </figure>
    `;
  }));

  const html = figures.filter(Boolean).join('');
  return html ? `<div class="paper-export-illustration-gallery">${html}</div>` : '';
}

function downloadCanvas(canvas, filename) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) {
        reject(new Error('无法生成图片'));
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      resolve();
    }, 'image/png');
  });
}

async function exportPaperLongImage(paper, helpers) {
  if (!window.html2canvas) throw new Error('html2canvas 未加载');

  let pdfDataUrl = null;
  let pdfError = null;
  try {
    const pdfUrl = await helpers.resolvePdfUrl(paper);
    if (pdfUrl) {
      pdfDataUrl = await renderPdfFirstPageDataUrl(pdfUrl);
    } else {
      pdfError = '未找到 PDF 链接';
    }
  } catch (err) {
    pdfError = err.message || 'PDF 首页渲染失败';
  }

  const illustrationsHtml = await buildIllustrationsHtml(
    paper,
    helpers.resolveIllustrationUrl,
    helpers.escapeHtml,
  );

  const emojiMeta = await loadEmojiMeta();
  const emojiUrl = pickRandomEmojiUrl(emojiMeta);

  const container = document.createElement('div');
  container.className = 'paper-export-root';
  container.innerHTML = buildExportSheetHtml(paper, helpers, {
    pdfDataUrl,
    pdfError,
    illustrationsHtml,
  });
  document.body.appendChild(container);

  try {
    await document.fonts.ready;
    await waitForImages(container);

    const sheet = container.firstElementChild;
    prepareExportTextLayout(sheet);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    try {
      await injectEmojiOverlay(sheet, emojiUrl);
      await waitForImages(sheet);
    } catch (err) {
      console.warn('表情包加载失败:', err);
    }

    const canvas = await html2canvas(sheet, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      width: EXPORT_SHEET_WIDTH,
      windowWidth: EXPORT_SHEET_WIDTH,
    });

    const safeTitle = helpers.getDisplayTitle(paper).replace(/[<>:"/\\|?*]/g, '_').slice(0, 80);
    await downloadCanvas(canvas, `${safeTitle || 'paper'}-long.png`);
  } finally {
    container.remove();
  }
}

window.PaperAIExport = {
  exportPaperLongImage,
};
