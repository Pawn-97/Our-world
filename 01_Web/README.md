# Our World Web 应用

> **说明：** 本应用是 **Our World**，基于 StarMap 代码库（MIT，作者 Aisland-SJL）演进而来。StarMap 的 Journey 页、无人机媒体工作流、流星雨特效、Release 更新检查器等功能已被移除，在本代码库中不复存在；文档不再保留这些功能的描述。

本目录是可运行的 React + TypeScript + Vite + Cesium 应用。产品模型为 **World → Place → Visit → Memory**，体验模型为 **3D 地球 → 地点 → 回忆**。

## 启动

```bash
npm ci
npm run dev
```

`npm run dev` 即 Vite 默认行为（默认端口 5173）；CLI 参数会透传给 Vite，需要固定地址时自行追加，例如 `npm run dev -- --host 127.0.0.1 --port 5174`。

## 一个产品，两种运行状态

Our World 是同一份代码，不区分公开的与可编辑的两个版本：

- `npm run dev` 启动**本地编辑态**。`scripts/local-editor-plugin.mjs` 是一个 `apply: 'serve'` 的 Vite 中间件，只在 dev server 存在，提供：
  - `POST /__travelatlas/editor/content/{places|visits|memories}`——地点 / 到访 / 记忆的 upsert 与 delete；
  - `GET /__travelatlas/editor/state|content|media`——保存后免刷新读回；
  - `PUT /__travelatlas/editor/state`——照片排序 / 隐藏 / 封面选择；
  - `POST /__travelatlas/editor/upload`、`/import`、`/media/delete`——图片先进入不可变的 `MediaInbox`，再走既有三级导入管线；
  - `GET /__travelatlas/geocode/search`——地理编码代理（搜索式添加地点）：Photon 主用、Nominatim 兜底，**只有 Photon 失败（超时/网络/5xx）才回退，空结果视为正常答案、不回退**；两端各 8 秒超时；由 dev server 服务端发起请求（受控 User-Agent、无 CORS 问题），浏览器不直连。
- 写操作有三重门禁：仅 loopback 地址（127.0.0.1 / ::1）、要求 `x-travelatlas-local-editor: 1` 请求头、Origin 白名单（`http://127.0.0.1` / `http://localhost`）。
- `scripts/content-store.mjs` 是**唯一**写 `content/*.json` 的模块：所有变更经单 promise 队列串行化，先 `.bak` 备份再 tmp+rename 原子写入，且每次落盘前用与 `npm run validate` **完全相同**的 `validateContent` 规则做全量校验（失败返回 422 及校验明细）。
- 编辑器 UI（Milestone 5）：Place / Visit / Memory 的增删改、搜索式添加地点、照片导入与排序 / 隐藏 / 封面。所有编辑入口都在 `import.meta.env.DEV` 门控之后、经动态 import 加载，**生产构建不含任何编辑器端点字符串**——`npm run dist:check` 断言 `__travelatlas` 与 `__ourWorldViewer`（DEV 调试句柄）不出现在产物中。
- `npm run build` 产出**公开只读态**：无编辑控件、无写中间件，静态站点只包含该次构建刻意纳入的数据与媒体。

本地编辑器状态存在 `src/data/generated/*.local.json`（照片排序 / 隐藏 / 封面的 `editor-state.local.json`、导入媒体目录等），与私有媒体目录一起被 Git 忽略。世界内容（地点、到访、记忆）就是纳入 Git 的 `content/*.json`——由应用内编辑器或手工修改（ID 约定见 `content/README.md`）。隐藏是非破坏性的：源记录与 Inbox 原图不受影响。

`src/repositories/localContentCache.ts` 是仓库层共享的原始内容缓存：生产环境五份 content 文件静态打包进 bundle；dev 启动时经中间件从磁盘 prime（dev server 外的手工改动无需重启即可见，中间件不可达时回退到打包快照），编辑器保存后同样经中间件 refresh，UI 免刷新反映写入。

编辑器区分两个相似的恢复动作：

- **撤销本轮**：把尚未保存的排序与隐藏草稿恢复到打开编辑器时的状态，不清除已保存数据。
- **恢复已隐藏项**：显式移除已保存的隐藏标记、写入被忽略的本地状态并就地刷新；同样不删除、不重建源记录。

## 校验

```bash
npm run lint
npx tsc --noEmit
npm run test
npm run validate
npm run privacy:check
npm run media:check
npm run build
npm run dist:check
```

## 内容与私有数据

Our World 有两层数据：

- `content/world.json`、`content/places.json`、`content/visits.json`、`content/memories.json`、`content/media.json` 是**纳入 Git** 的世界内容——刻意编写、可发布的地点 / 到访 / 记忆记录。`npm run validate` 会在 ID 缺失或重复、坐标非法、引用悬空、枚举非法时让工作流失败。
- `src/data/generated/*.local.json` 是**被忽略**的本地状态：导入媒体目录与媒体编辑选择（排序、隐藏、封面），永不进入 Git。

准备公开仓库前运行 `npm run privacy:check`：它断言五份 tracked content 文件都在 Git 清单内，且私有路径（Inbox 原图、生成的目录、本地编辑器状态、env 文件）不在。清史规则与部署选项见[开源隐私边界](../03_Reference/TravelAtlas_open_source_privacy_boundary.md)。

## 导入个人媒体

用户可以直接让 Agent 阅读规则并说明如何导入照片。Agent 从简短的 [Media Inbox README](../02_Assets/MediaInbox/README.md) 开始，核对每个条目都能映射到 `content/places.json` 中已有的地点（归入其国家），所需信息缺失或不确定时先提问再继续。

文件按 tracked 的 Inbox 模板放好后运行：

```bash
npm run media:check
npm run media:import
```

第一条命令只读，报告未解析的国家、地点、格式或无人机元数据。预检干净后，第二条命令保留本地原件副本，并为每张静态图片生成两级 WebP 衍生品：`640 px` 缩略图（地球 / 侧栏 / 卡片）与 `2400 px` 预览（照片查看器）。全分辨率照片与全景图仅由明确的查看行为请求。三级产物都在被忽略的本地用户媒体库内使用稳定的哈希路径，被忽略的目录记录其尺寸。导入后重启预览。

Inbox 源媒体永远不得移动、重命名、覆盖或删除。Agent 只能创建或更新私有映射 sidecar `country.json` 与城市级 `media.json`；受支持的静态图片格式由导入器在 Inbox 之外优化，不支持的格式仍需单独经用户批准的转换步骤。

完整用户与 Agent 契约见 [`../03_Reference/TravelAtlas_media_import_protocol.md`](../03_Reference/TravelAtlas_media_import_protocol.md)。

## 影像来源

Cesium ion 已整体移除：无 token、无 ion 影像、无 OSM Buildings；ion logo 徽章由 CSS 隐藏（「Data attribution」文字链接与 lightbox 保留，Esri 署名在其中），`npm run dist:check` 断言应用代码不含 `api.cesium.com`。

当前三个来源（`src/data/mapSources.ts`，底图 dock 的 Layers 按钮可切换，选择存 `localStorage` 键 `our-world:map-source`）：

- **Esri（默认）**：World Imagery 官方 REST 瓦片直连 `server.arcgisonline.com`，**无需 token**（`services.arcgisonline.com` 在部分网络不可达，故用 server host；2026-08-30 实测）。
- **天地图（可选）**：`VITE_TIANDITU_TOKEN` 配置后可用，WMTS `img` 影像底图 + `cia` 中文注记层。
- **本地低清（离线兜底）**：打包的 Natural Earth II，无需网络与凭据。

初始来源由 `VITE_MAP_SOURCE=auto|esri|tianditu|local` 指定；`auto` 恒为 Esri（无需凭据的在线源）。未配置凭据的来源行保持可见但禁用；控制组件不索取、不显示、不写出、不校验凭据内容。

**令牌安全规则不变**：复制 `.env.example` 为被忽略的 `.env.local` 自行填写；令牌绝不提交进 Git、不贴进聊天 / 源码 / 文档 / 日志 / 截图。Vite 客户端变量虽被 Git 排除，但构建产物对网站用户可见——生产 token 要在各自平台控制台限制权限与 Allowed URL，开发与生产分开，必要时只轮换受影响的那个。

## 架构

- `src/components/CesiumAtlasGlobe.tsx` 是主地图实现（Cesium 细节不外泄到领域 / UI 层）。
- `src/domain/` 存放 World → Place → Visit → Memory 领域类型与纯函数视图模型派生（国家分组、路线、日期范围）。
- `src/repositories/` 存放仓库接口与本地实现：加载 tracked `content/*.json` 加被忽略的生成媒体目录。UI 组件从不直接 import 内容 JSON。
- `scripts/validate-content.mjs` 在构建前校验全部 tracked 内容（`npm run validate`）。
- `scripts/content-store.mjs` 是 content 文件的唯一写入方（校验 + 队列 + 原子写，见上节）。
- `scripts/local-editor-plugin.mjs` 提供仅 loopback 的 Vite 编辑中间件（仅 `serve`）；`scripts/geocode.mjs` 是其地理编码提供方链。
- `src/data/editorState.ts` 在不改写导入源记录的前提下应用被忽略的本地照片排序、可见性与封面选择。
- 项目级上下文与交接文档在本 web 工作区的上一级目录。

## 文档

- 项目指南：[`../README.md`](../README.md)
- 项目进展与交接：[`../PROGRESS.md`](../PROGRESS.md)
- 项目 Agent 规则：[`../AGENTS.md`](../AGENTS.md)
- StarMap 上游文档（署名）：[`../03_Reference/starmap-upstream/`](../03_Reference/starmap-upstream/)
- 媒体导入协议：[`../03_Reference/TravelAtlas_media_import_protocol.md`](../03_Reference/TravelAtlas_media_import_protocol.md)
- 开源隐私边界：[`../03_Reference/TravelAtlas_open_source_privacy_boundary.md`](../03_Reference/TravelAtlas_open_source_privacy_boundary.md)
