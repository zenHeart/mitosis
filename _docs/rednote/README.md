# 候鸟 AI 创造局 — 小红书发布包

## 笔记文案

### 标题
候鸟AI创造局｜我用 Step 3.7 Flash 搭了一个「AI 自己写代码」的平台

### 正文

参加了候鸟AI创造局，做了一个超出预期的 demo 🧬

核心思路：**AI 构建 AI** — 用户在网页上描述需求，Agent 自动完成从编码、构建、验证到部署的全流程，全程零手动操作。

**Demo 做了什么：**
- 自然语言描述需求 → Step 3.7 Flash 生成 Vue 3 + TypeScript 代码
- GitHub Actions 自动跑 typecheck + build + 安全扫描
- 验证通过后自动创建 PR，合入 master 后自动部署到 GitHub Pages
- 从需求到上线 < 15 分钟，无任何手动部署步骤

**技术栈：**
- AI 模型：Step 3.7 Flash（StepFun）
- 前端：Vue 3 + Pinia + TypeScript + Vite
- CI/CD：GitHub Actions（claude -p --bare）
- 部署：GitHub Pages

**最核心的能力 — 自举闭环：**
平台本身也是用 Step 3.7 Flash 构建的，Mitosis 迭代 Mitosis，Mitosis 创建和迭代应用。AI 不仅能写代码，还能自主完成需求理解、代码生成、质量验证、安全门控、人工审查、自动化部署的完整闭环。

**活动信息：**
📅 6/16 – 6/28
🎯 效率向 or 创意向，任选方向
🎁 发笔记即送周边，优秀 demo 被官号收录

**三步参与：**
1️⃣ 领 token — 群内文件夹《token 领取指南》
2️⃣ 开造 — 用 Step 3.7 Flash 做能跑的 demo
3️⃣ 发笔记 — 标题「候鸟AI创造局｜」+ #候鸟AI创造局 + @阶跃星辰开放平台

代码已开源，GitHub 搜 Mitosis 即可。欢迎交流技术细节 👇

#候鸟AI创造局 #StepFun #AI编程 #自举 #Vue3 #开源 #AIAgent

---

## 配图 Prompt（供 Step Image API 使用）

### 主图 Prompt
```
Minimalist tech illustration for "Migratory Bird AI Lab" creativity contest. Central visual: a stylized bird carrying a glowing DNA helix made of code brackets { } and semicolons, flying over a branching tree structure representing a git repository. Three numbered circular badges (1, 2, 3) float beside the bird in a clean vertical step flow. Color palette: deep purple (#6B46C1), electric cyan (#00E5FF), warm coral (#FF6B6B) on a soft dark gradient background. Flat design, no photorealism, clean lines, suitable as a Xiaohongshu post cover. No text overlays.
```

### 备选 Prompt（代码/技术向）
```
Abstract generative art representing AI self-bootstrapping: concentric DNA helix spirals transforming into circuit board patterns, with floating code symbols and GitHub branch icons. Monochromatic with purple and cyan accents, dark background, minimalist tech aesthetic, clean composition for social media post.
```

---

## 发布清单

- [ ] 确认笔记文案符合小红书规范（无敏感词、无外部链接违规）
- [ ] 配图通过 Step API 生成（使用上方 prompt）
- [ ] 标题以「候鸟AI创造局｜」开头
- [ ] 话题带 #候鸟AI创造局
- [ ] 必须 @阶跃星辰开放平台
- [ ] 附上 demo 链接（mitosis.zenheart.site 或 GitHub 仓库）
