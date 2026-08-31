# PaperAI — 论文阅读笔记

一个简洁美观的论文阅读记录网站，可部署到 GitHub Pages。

## 功能

- **PDF 阅读** — 点击论文进入阅读页，左侧浏览 PDF，右侧阅读笔记
- **AI 识别** — 上传 PDF 后调用硅基流动大模型，自动识别作者、年份、链接、源代码等
- **添加论文** — 支持上传 PDF 文件，与笔记一并发布
- **阅读状态** — 待读 / 阅读中 / 已读完- **统计面板** — 阅读数量与标签分布

## 权限模型

| 角色 | 能做什么 |
|------|----------|
| **访客** | 阅读列表、查看详情、搜索筛选、看统计 |
| **站主** | 以上全部 + 添加/编辑/删除/导入 + 发布到网站 |

论文数据存放在仓库的 `data/papers.json`，所有访客读取同一份数据。编辑功能需要站主密码解锁（点击右上角 🔒 登录）。

> **安全说明**：GitHub Pages 是纯静态站点，密码哈希存在于前端代码中，只能防止普通访客误操作，无法阻止懂技术的用户。如需更高安全性，应仅通过 Git 直接修改 `data/papers.json`，不在网页上提供编辑入口。

## 权限说明

- 未登录也可阅读论文
- **任意用户名**均可登录；访客无需密码
- **Phier + 密码** → 站主，可添加/编辑/导入/发布
- **其他用户名** → 访客，登录后仍为只读，无法上传论文

## AI 识别（硅基流动）

1. 登录后进入 **统计 → 站主设置**，填入 [硅基流动](https://siliconflow.cn) API Key 和 GitHub Token（可选）
2. 添加论文时上传 PDF，系统自动识别并填充字段
3. 如需补充，可手动修改任意字段后保存，再点击 **发布到网站**

API Key 与 GitHub Token 保存在浏览器 localStorage，不会提交到 GitHub 仓库。

默认 API 地址：`https://api.siliconflow.cn/v1`，默认模型：`deepseek-ai/DeepSeek-V3`（可在 `js/config.js` 修改）。

## 本地预览

```bash
python -m http.server 8080
```

访问 http://localhost:8080

## 部署到 GitHub Pages

```bash
git init
git add .
git commit -m "Initial commit: PaperAI paper reading journal"
git branch -M main
git remote add origin https://github.com/<你的用户名>/PaperAI.git
git push -u origin main
```

仓库 **Settings → Pages** → Source 选 `main` 分支、`/ (root)` 目录。

站点地址：`https://<你的用户名>.github.io/PaperAI/`

## 项目结构

```
PaperAI/
├── index.html
├── data/
│   ├── papers.json     # 论文与笔记数据
│   ├── folders.json    # 领域文件夹
│   └── pdfs/           # PDF 文件目录├── css/style.css
├── js/
│   ├── config.js       # 站主密码哈希 & GitHub 配置
│   └── app.js
└── README.md
```

## License

MIT
