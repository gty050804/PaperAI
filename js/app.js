const STORAGE_KEY = 'paperai-papers';

const STATUS_LABELS = {
  'to-read': '待读',
  'reading': '阅读中',
  'finished': '已读完',
};

let papers = [];
let editingId = null;

function loadPapers() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      papers = JSON.parse(stored);
      return;
    }
  } catch {
    papers = [];
  }
  loadSampleData();
}

function loadSampleData() {
  papers = [
    {
      id: crypto.randomUUID(),
      title: 'Attention Is All You Need',
      authors: 'Vaswani et al.',
      year: 2017,
      venue: 'NeurIPS',
      url: 'https://arxiv.org/abs/1706.03762',
      status: 'finished',
      readDate: '2026-01-15',
      tags: ['Transformer', 'NLP', '深度学习'],
      summary: '提出 Transformer 架构，完全基于自注意力机制，摒弃 RNN 和 CNN，在机器翻译任务上取得 SOTA 效果。',
      notes: '核心创新：\n1. Multi-Head Self-Attention\n2. Positional Encoding\n3. 并行化训练\n\n对后续大模型发展影响深远。',
      createdAt: '2026-01-15T10:00:00Z',
    },
    {
      id: crypto.randomUUID(),
      title: 'BERT: Pre-training of Deep Bidirectional Transformers',
      authors: 'Devlin et al.',
      year: 2019,
      venue: 'NAACL',
      url: 'https://arxiv.org/abs/1810.04805',
      status: 'reading',
      readDate: '2026-02-01',
      tags: ['BERT', '预训练', 'NLP'],
      summary: '通过 Masked LM 和 Next Sentence Prediction 进行双向预训练，在多项 NLP 任务上刷新记录。',
      notes: '待深入阅读 Section 3 的预训练细节。',
      createdAt: '2026-02-01T08:00:00Z',
    },
    {
      id: crypto.randomUUID(),
      title: 'Deep Residual Learning for Image Recognition',
      authors: 'He et al.',
      year: 2016,
      venue: 'CVPR',
      url: 'https://arxiv.org/abs/1512.03385',
      status: 'to-read',
      readDate: '',
      tags: ['ResNet', 'CV', '深度学习'],
      summary: '提出残差连接解决深层网络退化问题，使训练极深网络成为可能。',
      notes: '',
      createdAt: '2026-02-10T12:00:00Z',
    },
  ];
  savePapers();
}

function savePapers() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(papers));
}

function switchView(viewName) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  document.getElementById(`view-${viewName}`).classList.add('active');
  document.querySelector(`[data-view="${viewName}"]`).classList.add('active');

  if (viewName === 'list') renderList();
  if (viewName === 'stats') renderStats();
}

function getFilteredPapers() {
  const search = document.getElementById('search-input').value.toLowerCase();
  const status = document.getElementById('filter-status').value;
  const tag = document.getElementById('filter-tag').value;

  return papers.filter(p => {
    if (status && p.status !== status) return false;
    if (tag && !(p.tags || []).includes(tag)) return false;
    if (search) {
      const haystack = [
        p.title, p.authors, p.summary, p.notes,
        ...(p.tags || []),
      ].join(' ').toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function renderList() {
  const list = document.getElementById('paper-list');
  const empty = document.getElementById('empty-state');
  const filtered = getFilteredPapers();

  updateTagFilter();

  if (papers.length === 0) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');

  if (filtered.length === 0) {
    list.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:2rem;">没有匹配的论文</p>';
    return;
  }

  list.innerHTML = filtered.map(p => `
    <article class="paper-card" data-id="${p.id}">
      <div class="paper-card-header">
        <h3 class="paper-title">${escapeHtml(p.title)}</h3>
        <span class="status-badge status-${p.status}">${STATUS_LABELS[p.status]}</span>
      </div>
      <p class="paper-meta">${formatMeta(p)}</p>
      ${p.summary ? `<p class="paper-summary">${escapeHtml(p.summary)}</p>` : ''}
      ${(p.tags || []).length ? `
        <div class="paper-tags">
          ${p.tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}
        </div>
      ` : ''}
    </article>
  `).join('');

  list.querySelectorAll('.paper-card').forEach(card => {
    card.addEventListener('click', () => openDetail(card.dataset.id));
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

function updateTagFilter() {
  const select = document.getElementById('filter-tag');
  const current = select.value;
  const allTags = [...new Set(papers.flatMap(p => p.tags || []))].sort();

  select.innerHTML = '<option value="">全部标签</option>' +
    allTags.map(t => `<option value="${escapeHtml(t)}"${t === current ? ' selected' : ''}>${escapeHtml(t)}</option>`).join('');
}

function openDetail(id) {
  const p = papers.find(x => x.id === id);
  if (!p) return;

  const modal = document.getElementById('detail-modal');
  const body = document.getElementById('modal-body');

  body.innerHTML = `
    <h2 class="modal-title">${escapeHtml(p.title)}</h2>
    <p class="modal-meta">${formatMeta(p)}</p>
    <span class="status-badge status-${p.status}">${STATUS_LABELS[p.status]}</span>
    ${(p.tags || []).length ? `
      <div class="paper-tags" style="margin-top:0.75rem">
        ${p.tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}
      </div>
    ` : ''}
    ${p.url ? `
      <div class="modal-section">
        <h4>链接</h4>
        <a class="modal-link" href="${escapeHtml(p.url)}" target="_blank" rel="noopener">${escapeHtml(p.url)}</a>
      </div>
    ` : ''}
    ${p.summary ? `
      <div class="modal-section">
        <h4>摘要 / 核心观点</h4>
        <p>${escapeHtml(p.summary)}</p>
      </div>
    ` : ''}
    ${p.notes ? `
      <div class="modal-section">
        <h4>详细笔记</h4>
        <p>${escapeHtml(p.notes)}</p>
      </div>
    ` : ''}
    <div class="modal-actions">
      <button class="btn btn-secondary" id="modal-edit">编辑</button>
      <button class="btn btn-danger" id="modal-delete">删除</button>
    </div>
  `;

  body.querySelector('#modal-edit').addEventListener('click', () => {
    modal.close();
    editPaper(id);
  });

  body.querySelector('#modal-delete').addEventListener('click', () => {
    if (confirm('确定删除这篇论文记录吗？')) {
      papers = papers.filter(x => x.id !== id);
      savePapers();
      modal.close();
      renderList();
    }
  });

  modal.showModal();
}

function resetForm() {
  editingId = null;
  document.getElementById('form-title').textContent = '添加论文';
  document.getElementById('paper-form').reset();
  document.getElementById('paper-id').value = '';
}

function editPaper(id) {
  const p = papers.find(x => x.id === id);
  if (!p) return;

  editingId = id;
  document.getElementById('form-title').textContent = '编辑论文';
  document.getElementById('paper-id').value = p.id;
  document.getElementById('title').value = p.title;
  document.getElementById('authors').value = p.authors || '';
  document.getElementById('year').value = p.year || '';
  document.getElementById('venue').value = p.venue || '';
  document.getElementById('url').value = p.url || '';
  document.getElementById('status').value = p.status;
  document.getElementById('read-date').value = p.readDate || '';
  document.getElementById('tags').value = (p.tags || []).join(', ');
  document.getElementById('summary').value = p.summary || '';
  document.getElementById('notes').value = p.notes || '';

  switchView('add');
}

function handleSubmit(e) {
  e.preventDefault();

  const data = {
    title: document.getElementById('title').value.trim(),
    authors: document.getElementById('authors').value.trim(),
    year: parseInt(document.getElementById('year').value) || null,
    venue: document.getElementById('venue').value.trim(),
    url: document.getElementById('url').value.trim(),
    status: document.getElementById('status').value,
    readDate: document.getElementById('read-date').value,
    tags: document.getElementById('tags').value.split(',').map(t => t.trim()).filter(Boolean),
    summary: document.getElementById('summary').value.trim(),
    notes: document.getElementById('notes').value.trim(),
  };

  if (editingId) {
    const idx = papers.findIndex(p => p.id === editingId);
    if (idx !== -1) {
      papers[idx] = { ...papers[idx], ...data };
    }
  } else {
    papers.unshift({
      id: crypto.randomUUID(),
      ...data,
      createdAt: new Date().toISOString(),
    });
  }

  savePapers();
  resetForm();
  switchView('list');
}

function renderStats() {
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

function exportData() {
  const blob = new Blob([JSON.stringify(papers, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `paperai-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const imported = JSON.parse(e.target.result);
      if (!Array.isArray(imported)) throw new Error('Invalid format');
      if (confirm(`将导入 ${imported.length} 条记录，是否覆盖现有数据？`)) {
        papers = imported;
        savePapers();
        renderStats();
        alert('导入成功');
      }
    } catch {
      alert('导入失败：文件格式不正确');
    }
  };
  reader.readAsText(file);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', () => {
  loadPapers();

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  document.getElementById('search-input').addEventListener('input', renderList);
  document.getElementById('filter-status').addEventListener('change', renderList);
  document.getElementById('filter-tag').addEventListener('change', renderList);

  document.getElementById('paper-form').addEventListener('submit', handleSubmit);
  document.getElementById('btn-cancel').addEventListener('click', () => {
    resetForm();
    switchView('list');
  });

  document.getElementById('btn-export').addEventListener('click', exportData);
  document.getElementById('import-file').addEventListener('change', (e) => {
    if (e.target.files[0]) importData(e.target.files[0]);
    e.target.value = '';
  });
  document.getElementById('btn-clear').addEventListener('click', () => {
    if (confirm('确定清空所有论文记录？此操作不可恢复。')) {
      papers = [];
      savePapers();
      renderStats();
    }
  });

  document.querySelector('.modal-close').addEventListener('click', () => {
    document.getElementById('detail-modal').close();
  });

  renderList();
});

window.switchView = switchView;
