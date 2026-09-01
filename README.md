# PaperAI — 论文阅读笔记

一个简洁美观的论文阅读记录网站，可部署到 GitHub Pages。

## 功能

- **链接阅读** — 通过论文链接 / PDF 直链在阅读页预览（arXiv 等自动推导 PDF）
- **AI 识别** — 可选上传本地 PDF 调用硅基流动大模型，自动识别作者、年份、链接等（不上传 GitHub）
- **添加论文** — 填写论文链接与笔记，发布到网站
- **阅读状态** — 待读 / 阅读中 / 已读完
- **统计面板** — 阅读数量与标签分布
- **知识点** — 名词解释与讲解链接

## 权限模型

| 角色 | 能做什么 |
|------|----------|
| **访客** | 阅读列表、查看详情、搜索筛选、看统计 |
| **站主** | 以上全部 + 添加/编辑/删除/导入 + 发布到网站 |

论文数据存放在仓库的 `data/papers.json`（仅 JSON 与链接，**不含 PDF 文件**）。

## 权限说明

- 未登录也可阅读论文
- **Phier + 密码** → 站主，可添加/编辑/导入/发布
- **其他用户名** → 访客，登录后仍为只读

## AI 识别（硅基流动）

1. 登录后进入 **统计 → 站主设置**，填入 API Key 和 GitHub Token（可选）
2. 添加论文时可**选**上传本地 PDF 用于 AI 识别（仅存浏览器，不会 push）
3. **论文链接**必填；可选填 **PDF 直链**，留空则尝试从 arXiv 链接推导

## 本地预览

```bash
python -m http.server 8080
```

访问 http://localhost:8080

## 部署到 GitHub Pages

```bash
git pull origin main
git push origin main
```

仓库 **Settings → Pages** → Source 选 `main` 分支、`/ (root)` 目录。

## 项目结构

```
PaperAI/
├── index.html
├── data/
│   ├── papers.json     # 论文与笔记（含 url、pdfUrl）
│   ├── folders.json    # 领域文件夹
│   └── folder-images/  # 分类封面图
├── css/style.css
├── js/
│   ├── config.js
│   └── app.js
└── README.md
```

## License

MIT
