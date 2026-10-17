const CHAT_SYSTEM_PROMPT = `你是 PaperAI 网站的论文阅读助手。请根据用户问题，基于下方「本站论文库」中的信息作答。

规则：
- 只能引用本站论文库中已有的论文与笔记内容，不要使用 PDF 原文，不要编造本站不存在的论文
- 推荐论文时说明标题、分类、阅读状态，并简要说明为何相关
- 提到本站某篇论文时，标题必须写成可点击链接：[论文标题](paper:论文ID)，ID 为论文库条目中第一行的 uuid
- 可以进行主题归纳、对比、阅读建议；信息不足时请如实说明
- 用清晰、友好的中文回答，适当使用列表`;

let chatHistory = [];
let chatStreaming = false;

function getChatContext() {
  return window.PaperAIChatContext || {};
}

function formatPaperBlock(paper, noteLimit) {
  const ctx = getChatContext();
  const folder = ctx.getFolderPathLabel?.(paper.folderId) || '未分类';
  const status = ctx.statusLabels?.[paper.status] || paper.status || '未知';
  const tags = (paper.tags || []).join('、') || '无';
  const notes = (paper.notes || '').slice(0, noteLimit);
  const knowledge = (paper.knowledgePoints || [])
    .map(kp => {
      const term = (kp.term || '').trim();
      if (!term) return '';
      const exp = (kp.explanation || '').trim();
      return exp ? `${term}：${exp}` : term;
    })
    .filter(Boolean)
    .join('；') || '无';

  return `[${paper.id}]
标题：${paper.title || '未命名'}
作者：${paper.authors || '未知'}
年份：${paper.year || '未知'}
发表：${paper.venue || '未知'}
分类：${folder}
阅读状态：${status}
标签：${tags}
摘要：${paper.summary || '无'}
详细笔记：${notes || '无'}
知识点：${knowledge}
链接：${paper.url || '无'}`;
}

function buildPaperCatalog() {
  const ctx = getChatContext();
  const papers = ctx.getPapers?.() || [];
  if (papers.length === 0) return '（本站暂无论文记录）';

  let noteLimit = 2500;
  const MAX_CATALOG = 90000;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const blocks = papers.map(p => formatPaperBlock(p, noteLimit));
    const catalog = blocks.join('\n\n---\n\n');
    if (catalog.length <= MAX_CATALOG || noteLimit <= 400) return catalog;
    noteLimit = Math.floor(noteLimit * 0.55);
  }

  return papers.map(p => formatPaperBlock(p, 400)).join('\n\n---\n\n');
}

function escapeChatHtml(str) {
  if (str == null) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

function renderChatMarkdown(text) {
  let html = escapeChatHtml(text);
  html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(^|[\s(])_([^_\n]+)_/g, '$1<em>$2</em>');
  html = html.replace(/\[([^\]]+)\]\((paper:[^)\s]+)\)/gi, (_match, label, href) => {
    const paperId = href.replace(/^paper:/i, '').trim();
    return `<a href="#" class="chat-paper-link" data-paper-id="${paperId}">${label}</a>`;
  });
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="chat-external-link">$1</a>');
  html = html.replace(/\n/g, '<br>');
  return html;
}

function handleChatMessageClick(event) {
  const link = event.target.closest('.chat-paper-link');
  if (!link) return;
  event.preventDefault();
  const paperId = link.dataset.paperId;
  if (!paperId) return;
  window.PaperAIChatContext?.openPaper?.(paperId);
}

function formatMessageBody(msg) {
  if (msg.role === 'assistant') {
    return renderChatMarkdown(msg.content || '');
  }
  return escapeChatHtml(msg.content || '');
}

function scrollChatToBottom() {
  const container = document.getElementById('chat-messages');
  if (container) container.scrollTop = container.scrollHeight;
}

function bindChatExampleButtons(container) {
  container.querySelectorAll('.chat-example-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.getElementById('chat-input');
      if (input) {
        input.value = btn.dataset.prompt || '';
        input.focus();
      }
    });
  });
}

function renderChatEmpty(container) {
  container.innerHTML = `
    <div class="chat-empty">
      <p>可以问我关于本站论文的问题，例如：</p>
      <ul class="chat-examples">
        <li><button type="button" class="chat-example-btn" data-prompt="接下来我想阅读一些关于教师学生蒸馏的文章，请你告诉我网站里有哪些论文和这个相关。">有哪些教师-学生蒸馏相关的论文？</button></li>
        <li><button type="button" class="chat-example-btn" data-prompt="现在世界模型究竟有哪些运用？请结合本站论文库回答。">世界模型有哪些运用？</button></li>
        <li><button type="button" class="chat-example-btn" data-prompt="请推荐几篇适合入门的 VLA 论文，并说明理由。">推荐几篇 VLA 入门论文</button></li>
      </ul>
    </div>`;
  bindChatExampleButtons(container);
}

function renderChatMessages() {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  if (chatHistory.length === 0) {
    renderChatEmpty(container);
    return;
  }

  container.innerHTML = chatHistory.map((msg, index) => `
    <div class="chat-message chat-message-${msg.role}" data-chat-index="${index}">
      <div class="chat-message-label">${msg.role === 'user' ? '你' : 'AI'}</div>
      <div class="chat-message-body">${formatMessageBody(msg)}</div>
    </div>
  `).join('');

  scrollChatToBottom();
}

function updateAssistantMessage(index) {
  const container = document.getElementById('chat-messages');
  if (!container) return;
  const body = container.querySelector(`.chat-message[data-chat-index="${index}"] .chat-message-body`);
  if (!body) return;
  body.innerHTML = renderChatMarkdown(chatHistory[index].content || '');
  scrollChatToBottom();
}

function setChatStatus(message, type = '') {
  const el = document.getElementById('chat-status');
  if (!el) return;
  el.textContent = message || '';
  el.className = 'chat-status' + (type ? ` chat-status-${type}` : '');
}

function syncChatApiSetupVisibility() {
  const setup = document.getElementById('chat-api-setup');
  if (!setup) return;
  setup.classList.toggle('hidden', !!window.PaperAI?.getSiliconFlowApiKey());
}

function setChatInputEnabled(enabled) {
  const submitBtn = document.querySelector('#chat-form button[type="submit"]');
  const input = document.getElementById('chat-input');
  if (submitBtn) submitBtn.disabled = !enabled;
  if (input) input.disabled = !enabled;
}

async function sendChatMessage(text) {
  const trimmed = text.trim();
  if (!trimmed || chatStreaming) return;

  setChatInputEnabled(false);
  chatStreaming = true;

  chatHistory.push({ role: 'user', content: trimmed });
  chatHistory.push({ role: 'assistant', content: '' });
  const assistantIndex = chatHistory.length - 1;
  renderChatMessages();
  setChatStatus('生成中…');

  try {
    const catalog = buildPaperCatalog();
    const messages = [
      {
        role: 'system',
        content: `${CHAT_SYSTEM_PROMPT}\n\n【本站论文库】\n${catalog}`,
      },
      ...chatHistory.slice(0, -1).map(m => ({ role: m.role, content: m.content })),
    ];

    const reply = await window.PaperAI.streamSiliconFlowChat(messages, {
      onDelta(fullText) {
        chatHistory[assistantIndex].content = fullText;
        updateAssistantMessage(assistantIndex);
      },
    });
    chatHistory[assistantIndex].content = reply;
    updateAssistantMessage(assistantIndex);
    setChatStatus('');
  } catch (err) {
    chatHistory.splice(-2);
    renderChatMessages();
    setChatStatus(err.message || '发送失败', 'error');
  } finally {
    chatStreaming = false;
    setChatInputEnabled(true);
    document.getElementById('chat-input')?.focus();
  }
}

function clearChatHistory() {
  chatHistory = [];
  renderChatMessages();
  setChatStatus('');
}

function onChatViewOpen() {
  window.PaperAI?.loadSiliconFlowSettingsIntoForm();
  syncChatApiSetupVisibility();
  renderChatMessages();
  document.getElementById('chat-input')?.focus();
}

function initChat() {
  window.PaperAI?.loadSiliconFlowSettingsIntoForm();
  syncChatApiSetupVisibility();
  renderChatMessages();

  document.getElementById('chat-messages')?.addEventListener('click', handleChatMessageClick);

  document.getElementById('chat-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('chat-input');
    const text = input?.value || '';
    if (input) input.value = '';
    sendChatMessage(text);
  });

  document.getElementById('chat-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      document.getElementById('chat-form')?.requestSubmit();
    }
  });

  document.getElementById('btn-chat-save-key')?.addEventListener('click', () => {
    const key = document.getElementById('chat-api-key-input')?.value.trim() || '';
    if (!key) {
      setChatStatus('请输入 API Key', 'error');
      return;
    }
    window.PaperAI.saveSiliconFlowSettings(key);
    window.PaperAI.loadSiliconFlowSettingsIntoForm();
    syncChatApiSetupVisibility();
    setChatStatus('API Key 已保存', 'success');
  });

  document.getElementById('btn-chat-clear')?.addEventListener('click', () => {
    if (chatHistory.length === 0) return;
    if (confirm('确定清空当前对话？')) clearChatHistory();
  });
}

document.addEventListener('DOMContentLoaded', initChat);

window.PaperAIChat = {
  onViewOpen: onChatViewOpen,
  syncApiSetup: syncChatApiSetupVisibility,
};
