# PaperAI — 论文阅读笔记

一个简洁美观的论文阅读记录网站，可部署到 GitHub Pages。

## 功能

- **阅读列表** — 浏览、搜索、筛选论文记录
- **添加/编辑** — 记录标题、作者、摘要、详细笔记、标签等
- **阅读状态** — 待读 / 阅读中 / 已读完
- **统计面板** — 阅读数量与标签分布
- **导入/导出** — JSON 格式备份与迁移

## 本地预览

直接用浏览器打开 `index.html`，或使用本地服务器：

```bash
# Python
python -m http.server 8080

# Node.js (需安装 npx)
npx serve .
```

然后访问 http://localhost:8080

## 部署到 GitHub Pages

### 1. 创建 GitHub 仓库

在 GitHub 上新建一个仓库（例如 `PaperAI`），将本项目推送上去：

```bash
git init
git add .
git commit -m "Initial commit: PaperAI paper reading journal"
git branch -M main
git remote add origin https://github.com/<你的用户名>/PaperAI.git
git push -u origin main
```

### 2. 启用 GitHub Pages

1. 进入仓库 **Settings → Pages**
2. **Source** 选择 `Deploy from a branch`
3. **Branch** 选择 `main`，文件夹选 `/ (root)`
4. 点击 **Save**

几分钟后，站点会发布到：

```
https://<你的用户名>.github.io/PaperAI/
```

## 项目结构

```
PaperAI/
├── index.html      # 主页面
├── css/
│   └── style.css   # 样式
├── js/
│   └── app.js      # 应用逻辑
└── README.md
```

## 数据存储说明

当前版本使用浏览器 **localStorage** 存储数据，适合个人本地使用。数据不会同步到 GitHub。

如需跨设备同步，可以：
- 使用「导出 JSON / 导入 JSON」功能手动备份
- 后续可扩展为 GitHub Issues / Gist / JSON 文件等云端存储方案

## License

MIT
