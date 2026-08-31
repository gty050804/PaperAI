const SF_KEY_STORAGE = 'paperai-siliconflow-key';
const SF_MODEL_STORAGE = 'paperai-siliconflow-model';

function getSiliconFlowConfig() {
  const cfg = window.PaperAIConfig?.siliconflow || {};
  return {
    baseUrl: (cfg.baseUrl || 'https://api.siliconflow.cn/v1').replace(/\/$/, ''),
    model: localStorage.getItem(SF_MODEL_STORAGE) || cfg.model || 'deepseek-ai/DeepSeek-V3',
  };
}

function getSiliconFlowApiKey() {
  return localStorage.getItem(SF_KEY_STORAGE) || '';
}

function saveSiliconFlowSettings(apiKey, model) {
  if (apiKey) localStorage.setItem(SF_KEY_STORAGE, apiKey);
  else localStorage.removeItem(SF_KEY_STORAGE);

  if (model) localStorage.setItem(SF_MODEL_STORAGE, model);
  else localStorage.removeItem(SF_MODEL_STORAGE);
}

function loadSiliconFlowSettingsIntoForm() {
  const keyEl = document.getElementById('sf-api-key');
  const modelEl = document.getElementById('sf-model');
  if (!keyEl || !modelEl) return;

  keyEl.value = getSiliconFlowApiKey();
  modelEl.value = getSiliconFlowConfig().model;
}

function ensurePdfJsReady() {
  if (!window.pdfjsLib) throw new Error('PDF 解析库未加载');
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

async function extractPdfText(file, maxPages = 4, maxChars = 14000) {
  ensurePdfJsReady();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages = Math.min(pdf.numPages, maxPages);
  let text = '';

  for (let i = 1; i <= pages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(item => item.str).join(' ') + '\n\n';
  }

  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (!trimmed) throw new Error('无法从 PDF 提取文本，可能为扫描版');
  return trimmed.slice(0, maxChars);
}

function parseJsonFromLLM(content) {
  const raw = (content || '').trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : raw;

  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start !== -1 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1));
    }
    throw new Error('模型返回格式无法解析');
  }
}

async function callSiliconFlow(messages) {
  const apiKey = getSiliconFlowApiKey();
  if (!apiKey) throw new Error('请先在「统计 → AI 设置」中配置硅基流动 API Key');

  const { baseUrl, model } = getSiliconFlowConfig();

  let res;
  try {
    res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        max_tokens: 1200,
        temperature: 0.1,
        response_format: { type: 'json_object' },
      }),
    });
  } catch {
    throw new Error('无法连接硅基流动 API，请检查网络或 API 地址');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || data.error?.message || `API 错误 (${res.status})`);
  }

  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('API 未返回有效内容');
  return content;
}

async function extractPaperMetadataFromPdf(file) {
  const pdfText = await extractPdfText(file);

  const prompt = `请从以下学术论文 PDF 文本中提取信息，严格返回 JSON 对象，字段如下：
{
  "title": "论文标题",
  "authors": "作者列表，用逗号分隔",
  "year": 2024,
  "url": "论文官方链接（arxiv、doi、出版社页面等），没有则 null",
  "sourceCodeUrl": "源代码仓库链接（如 GitHub），没有则 null",
  "venue": "发表会议或期刊",
  "summary": "用中文概括论文核心贡献，2-3 句话"
}

要求：
- 只返回 JSON，不要 markdown 或其他说明
- year 为整数或 null
- 链接字段找不到时填 null

PDF 文本：
${pdfText}`;

  const content = await callSiliconFlow([
    { role: 'system', content: '你是学术论文元数据提取助手，只输出合法 JSON。' },
    { role: 'user', content: prompt },
  ]);

  const parsed = parseJsonFromLLM(content);
  return {
    title: parsed.title || '',
    authors: parsed.authors || '',
    year: parsed.year ? parseInt(parsed.year, 10) : null,
    url: parsed.url || '',
    sourceCodeUrl: parsed.sourceCodeUrl || '',
    venue: parsed.venue || '',
    summary: parsed.summary || '',
  };
}

window.PaperAI = {
  getSiliconFlowApiKey,
  saveSiliconFlowSettings,
  loadSiliconFlowSettingsIntoForm,
  extractPaperMetadataFromPdf,
};
