# PROGRESS.md

# Our World — 开发进度与交接文档

> 最后更新：2026-08-30 · 当前线上：https://pawn-97.github.io/Our-world/
> 本文档供接手开发的 Agent / 开发者快速恢复全部上下文。改动代码前**必须先读** [AGENTS.md](AGENTS.md)（最高优先级约束），然后是 [PRODUCT.md](PRODUCT.md)、[ARCHITECTURE.md](ARCHITECTURE.md)、[MVP.md](MVP.md)。

---

## 1. 当前状态一句话

V1 全部 8 个里程碑（M0–M7）已完成，产品已上线 GitHub Pages 并完成多轮真实用户 UX 迭代；当前处于「真实内容填充」阶段——站点内容仍是占位/示例数据，等待主人替换为真实照片与真实到访日期。

## 2. 里程碑完成记录

| 里程碑 | 内容 | 状态 | 关键提交 |
|---|---|---|---|
| M0 Base cleanup | 以 StarMap（MIT, Aisland-SJL）为技术底座，清理 drone/meteor/portfolio 等无关功能 | ✅ | `ad8574c` |
| M1 Globe spike | Cesium 地球：世界视角、标记、flyTo、地点预览、移动端质量模式（mock: Tokyo/Paris/Singapore） | ✅ | `07fffcd` |
| M2 Domain model | `World/Place/Visit/Memory/Media` 领域模型、Repository 接口、本地实现、schema 校验 | ✅ | `143b17b` |
| M3 Place experience | 三态状态（visited/planned/wishlist）、地点预览、地点详情、多 visit | ✅ | `bbef2a7` |
| M4 Memory experience | note/activity/photo 记忆、时间线、画廊、记忆详情 | ✅ | `f0bfd77` |
| M5 Local editor | 本地编辑器（dev-only 中间件原子写入 `content/*.json`），增删改 Place/Visit/Memory、图片导入、校验、预览 | ✅ | `906f270` |
| M6 Publishing | GitHub Actions → Pages 全链路（验证失败阻断发布） | ✅ | `a28ce08` |
| M7 Real-content | 8 个真实地点上线；媒体管线规模化验证（114 张示例图） | ✅ | `b15498f` |

### M7 后的 UX 迭代（用户实测反馈驱动，全部已上线）

按时间顺序：

1. **Globe UX 修复包**（`9d60158`）：侧栏无操作 ~4s 自动隐藏（沉浸感）、城市级钻取、地点详情 drill-in 全屏页、添加媒体交互简化为一步。
2. **UX-1 搜索式添加地点**（`bb4bdea` + `95c8423`）：添加地点从「手填 8 个字段」改为「搜索 → 点选 → 选状态 → 可选简介」。地理编码走 dev-only 代理 `GET /__travelatlas/geocode/search?q=...`，**主用 Photon（photon.komoot.io），Nominatim 兜底**（见 §6 网络限制）。旧详细表单收进「高级 / 手动填写」折叠。
3. **UX-2 去除 Cesium ion**（`93d2ebf`）：完全移除 ion 依赖（含 OSM Buildings 3D 建筑），影像换 **Esri World Imagery 直连**（`server.arcgisonline.com`，无需 token），右下角 ion 徽章消失；Esri 署名保留在 "Data attribution" lightbox。
4. **UX-3/4 地球视觉**（`93d2ebf`、`3996dbf`、`2d22333`）：纯黑太空（Cesium 默认 skybox/sun/moon 也关了）、skyAtmosphere 细蓝大气边、克制 bloom（high 档 `contrast 104 / brightness -0.3`，reduced 档关闭）、标记改圆点+柔光环（保留三态色彩）、概览不再渲染 visit 连线、标签屏幕空间碰撞检测。
5. **UX-5 移动横屏优先**（`93d2ebf`、`2d22333`）：横屏（landscape 且 ≤520px 高）下侧栏变浮动抽屉、dock 缩到右下角、地点详情变右侧浮动卡。
6. **均匀光照**（`9db1d7f`）：关闭实时太阳位置光照（否则本地时间晚上看亚洲全黑）；viewer 生命周期防御（`isDestroyed()` 守卫）；DEV-only `window.__ourWorldViewer` 调试句柄（dist:check 断言生产不含）。
7. **移除地图页 header**（`63f758b`）：通宽标题 banner 全部视口移除，`--atlas-overlay-top` 收紧（桌面 12px / 移动 8px）。
8. **详情页去重**（`9931d71`）：移除右上角 ×，只留左上角 ← 返回。

## 3. 内容现状（`01_Web/content/`）

- **8 个地点**：已到访 — 仙本那、吉隆坡、苏州、重庆、上海、北京；计划中 — 京都、大阪
- **6 条 visit**：均为占位「首次到访（日期待补充）」，日期统一 `2025-01-01`，**待替换为真实日期**
- **18 条记忆 / 114 张媒体**：全部是程序化生成的示例图（`public/media/content/<place-slug>/`，共 4.5MB，由 `npm run media:sample` 生成），**待替换为真实照片**
- stable ID 规则见 `content/README.md` 与 `scripts/content-ids.mjs`

## 4. 架构速查

```text
01_Web/
├── src/
│   ├── domain/            # 领域类型（权威定义）
│   ├── repositories/      # Repository 接口 + 本地实现（UI 只允许走这里读数据）
│   ├── data/              # 图源配置、搜索、地理编码客户端等
│   ├── components/        # CesiumAtlasGlobe（Cesium 隔离层）、面板、编辑器 sheets
│   └── ...
├── content/               # places/visits/memories JSON —— 构建时打进 bundle（生产无运行时 fetch）
├── public/media/          # 已发布媒体（优化产物 + 缩略图）
└── scripts/               # local-editor-plugin（dev 中间件）、content-store（原子写+校验）、
                           # geocode（Photon/Nominatim）、import-media、validate-content、
                           # privacy-audit、check-dist
```

关键架构事实：

- **组件不直接 import content JSON**；唯一构建期 import 在 `repositories/localContentCache.ts`（仓库层内部）
- **Cesium 对象不泄漏到 domain/UI 层**；应用层只见 `Place` 等产品类型
- **编辑器只在 dev 存在**：中间件挂在 Vite dev server（loopback 限定），生产 dist 由 `check-dist.mjs` 断言不含 `__travelatlas`、不含 nominatim、不含 `__ourWorldViewer`、app bundle 不含 `api.cesium.com`
- 媒体管线：`02_Assets/MediaInbox/`（不进版本库）→ `npm run media:import` → 优化产物+缩略图进 `public/media/`

## 5. 验证与发布

全量检查（`01_Web/` 下，全部必须绿）：

```bash
npm run lint && npx tsc --noEmit && npm test && npm run validate \
  && npm run privacy:check && npm run media:check && npm run build && npm run dist:check
```

当前基线：**148 个 Vitest 全绿**。发布 = push 到 `main`，workflow 自动跑同一验证链后部署 Pages。

本地开发预览：`cd 01_Web && npm run dev`（编辑模式入口在页面 dock；编辑器只对 localhost 开放）。

## 6. 环境限制（主人网络实测，2026-08-30）

接手者注意，以下域名在主人网络**不可达**，代码已做相应适配，不要"修回去"：

| 域名 | 状态 | 适配 |
|---|---|---|
| `nominatim.openstreetmap.org` | ❌ 超时 | 地理编码主用 Photon；Nominatim 仅作兜底 |
| `services.arcgisonline.com` | ❌ 超时 | Esri 瓦片用 `server.arcgisonline.com`（同一官方服务） |
| `tile.openstreetmap.org` | ❌ | 未使用 |
| `photon.komoot.io` / `server.arcgisonline.com` / GitHub | ✅ 正常 | — |
| `github.io`（线上站点） | ✅ 但慢 | 首屏 Cesium 库几 MB，实测 1–2 分钟，非 bug |

## 7. 已知问题与技术债

1. **无 3D 建筑**：OSM Buildings 随 ion 一起移除（那是 ion 付费资产，且会带徽章）。城市级细节靠 Esri 高清影像（maxZoom 19）。
2. **Esri 影像无中文注记**：如需注记可切换天地图图源（需 `VITE_TIANDITU_TOKEN`，代码已保留通路）。
3. **Photon 无英文名字段**：搜索新建的地点 `nameEn` 常为空 → stable ID 回退时间戳 slug（如 `place-mtfelb4l`），功能无碍；介意可在「高级 / 手动填写」补 nameEn（ID 不变）。
4. **中文小地名搜索覆盖差**：如「仙本那」在 OSM 无中文标签 → 空结果，UI 有兜底文案引导换关键词/手动填写。
5. **夜间主题调暗影像**（brightness 0.68）：是设计特性，dock/侧栏 MAP TUNING 滑杆可调；如果主人觉得晚上太暗，下一迭代可考虑提高夜间默认值。
6. **占位 visit 日期**：6 条 visit 全是 2025-01-01 占位，等真实日期。
7. **`VITE_CESIUM_ION_TOKEN` secret 已失效**：代码不再消费它（`.env.local` 与 GitHub secret 里的残留可删可不删，无影响）。

## 8. 下一步建议（按优先级）

1. **真实内容填充**（M7 收尾，也是 V1 Release Gate 的最后缺口）：
   - 用编辑器把 114 张示例图替换为真实照片（`npm run media:import` 管线已就绪，原始照片先放 `02_Assets/MediaInbox/`）
   - 补真实 visit 日期与标题
   - 不需要的示例地点记忆可删
2. **真机验收**：iPhone 横屏 + 桌面各过一遍 MVP.md §8 的 Release Gate 清单
3. **可选打磨**：地图页无 header 后，首次访问者没有任何产品说明——可考虑一个一次性欢迎浮层（谨慎，别破坏沉浸感）
4. **V2 触发条件见 MVP.md §9**——在真实痛点出现前不做任何云设施

## 9. 交接检查清单（新 Agent 开工前）

- [ ] 读完 AGENTS.md / PRODUCT.md / ARCHITECTURE.md / MVP.md / 本文档
- [ ] `cd 01_Web && npm ci && npm run dev` 能起，地球渲染
- [ ] 全量验证链跑一次全绿
- [ ] 知道约束：不加 cloud/auth/第二地图引擎、组件不碰 content JSON、stable ID、Cesium 隔离、生产无编辑器
- [ ] 知道网络适配（§6）：Photon 主用、`server.arcgisonline.com`
