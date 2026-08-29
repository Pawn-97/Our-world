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

## 致谢与许可

本项目基于 [StarMap](https://github.com/Aisland-SJL/StarMap)（MIT License，作者 Aisland-SJL）改造。上游原始文档保存在 `03_Reference/starmap-upstream/`，许可证见 [LICENSE](LICENSE)。
