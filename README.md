# Our World

一个属于两个人的私密 3D 地球旅行记忆网站：把一起去过的地方标记在地球上，让每个地点串联起一次次到访与一段段回忆。

产品模型：**World → Place → Visit → Memory**。V1 采用「本地编辑 → 静态构建 → GitHub Pages」的工作方式——只有主人在本地编辑内容，线上站点只读，另一个人可以从手机和桌面浏览器访问。不涉及任何云端服务。

*A private 3D-globe travel-memory site for two people. World → Place → Visit → Memory. V1: local authoring, static build, GitHub Pages — no cloud anything.*

## 产品文档

- [PRODUCT.md](PRODUCT.md) — 产品定位与体验模型
- [ARCHITECTURE.md](ARCHITECTURE.md) — 架构规则
- [MVP.md](MVP.md) — V1 范围
- [AGENTS.md](AGENTS.md) — Agent 工作守则（改动代码前必读）

## 快速开始

```bash
cd 01_Web
npm install
cp .env.example .env.local
npm run dev
```

## 影像与令牌

不配任何令牌也能运行：应用内置低清 Natural Earth II 离线影像作为兜底。可选的 Cesium ion / Tianditu 令牌写入 `01_Web/.env.local`（已被 Git 忽略），**绝不提交、不粘贴到聊天或文档中**。详见 [01_Web/README.md](01_Web/README.md)。

## 项目结构

| 目录 | 内容 |
|---|---|
| `01_Web/` | React + TypeScript + Vite + Cesium 应用（所有 npm 命令在此运行） |
| `02_Assets/` | 私有媒体收件箱 `MediaInbox/` 与本地数据存档（默认不进版本库） |
| `03_Reference/` | 数据协议与 schema；`starmap-upstream/` 保存 StarMap 上游原始文档与代码分析报告 |
| `05_Test/` | 验证命令与手动冒烟测试清单 |

## 验证命令

在 `01_Web/` 下运行：

```bash
npm run lint
npm run build
npm run privacy:check
npm run media:check
```

## 发布（GitHub Pages）

仓库内置 [.github/workflows/deploy.yml](.github/workflows/deploy.yml)：push 到 `main` 后自动跑完整验证链（lint → typecheck → test → validate → privacy:check → media:check → build → dist 自检），任何一步失败都会阻断发布；全部通过后经 `upload-pages-artifact` + `deploy-pages` 发布到 Pages。

首次发布需要的手工步骤（只做一次）：

1. 在 GitHub 创建仓库并 push（`git remote add origin … && git push -u origin main`）。
2. 仓库 **Settings → Pages → Source** 选择 **GitHub Actions**。
3. 可选密钥（**Settings → Secrets and variables → Actions**）：
   - `VITE_CESIUM_ION_TOKEN` — Cesium ion 在线影像令牌；不配置则使用内置低清离线影像，站点照常工作。
   - `VITE_TIANDITU_TOKEN` — 天地图影像密钥（可选）。
   - 真实令牌只存在于 Actions secrets，绝不写入任何被跟踪的文件。
4. push 到 `main` 即触发发布；站点地址为 `https://<用户名>.github.io/<仓库名>/`（子路径由 workflow 自动注入 `BASE_PATH`，无需手工配置）。

其他说明：

- **自定义域名或根路径站点**（如 `<user>.github.io` 用户主页仓库）：编辑 workflow，删除 `BASE_PATH` 两行环境变量即可，构建默认 `/`。
- 本地验证子路径构建：`cd 01_Web && BASE_PATH=/our-world/ npm run build && BASE_PATH=/our-world/ npm run dist:check`。
- `npm run dist:check` 是构建产物冒烟检查：index.html 引用的资产都存在且带正确 base 前缀、Cesium 运行时资源齐全、内容媒体已发布、产物中没有本地编辑器端点。

## 致谢与许可

本项目基于 [StarMap](https://github.com/Aisland-SJL/StarMap)（MIT License，作者 Aisland-SJL）改造。上游原始文档保存在 `03_Reference/starmap-upstream/`，许可证见 [LICENSE](LICENSE)。
