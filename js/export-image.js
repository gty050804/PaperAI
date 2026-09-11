const EXPORT_SHEET_WIDTH = 900;

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

function buildExportSheetHtml(paper, helpers, sections) {
  const {
    escapeHtml,
    getDisplayTitle,
    formatMetaPlain,
    renderNoteBlock,
    renderKnowledgePointsHtml,
    STATUS_LABELS,
    getFolderPathLabel,
  } = helpers;

  const title = getDisplayTitle(paper);
  const meta = formatMetaPlain(paper);
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
        <h1 class="paper-export-title">${escapeHtml(title)}</h1>
        ${meta ? `<p class="paper-export-meta">${escapeHtml(meta)}</p>` : ''}
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

    const canvas = await html2canvas(container.firstElementChild, {
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
