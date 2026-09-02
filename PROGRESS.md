# PROGRESS.md

# Our World — 开发进度与交接文档

> 最后更新：2026-09-02 · 当前线上：https://pawn-97.github.io/Our-world/
> 本文档供接手开发的 Agent / 开发者快速恢复全部上下文。改动代码前**必须先读** [AGENTS.md](AGENTS.md)（最高优先级约束），然后是 [PRODUCT.md](PRODUCT.md)、[ARCHITECTURE.md](ARCHITECTURE.md)、[MVP.md](MVP.md)。

---

## 1. 当前状态一句话

V1 全部 8 个里程碑（M0–M7）已完成并上线；「真实内容填充」也已收尾 —— 13 个真实地点、15 次真实到访、78 张真实照片、51 条记忆已发布，程序化示例数据全部下线。地点详情页同期改版为浅色「手账 / 拍立得拼贴」风格（桌面双栏、移动单栏）。

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
9. **真实内容上线**：`scripts/publish-material.mjs`（`npm run media:material`）把 `素材/<城市>/` 的原片重编码为两级 WebP 写入 **tracked** 的 `public/media/content/<slug>/` + `content/media.json`，顺手按 EXIF 日期把照片挂到对应 visit 的相册记忆上，并自动挑选封面。EXIF/GPS 在重编码时被丢弃，原片目录 `素材/` 已加入 `.gitignore`。程序化示例图与 `generate-sample-media.mjs` 一并退役。
10. **详情页 scrapbook 改版**：深色全屏页 → 浅色「地图纸 + 拼贴」语言（拍立得 + 和纸胶带 + 撕纸便签卡 + 贴纸药丸 + 护照印章 + 手绘 doodles + 底部到访筛选 dock）。几何全部由内容 ID 派生（`scrapbook/scrapbookStyle.ts`，含单测），渲染稳定不抖动；桌面 ≥1024px 双栏（左栏 sticky，封面高度按 vh 封顶），移动单栏，横屏矮视口（landscape 且 ≤520px 高）封面缩到 46% 宽并裁成 3:2、筛选 dock 收到右下角。已用 headless Chrome 在 1440/1280/390×844/844×390 四个视口截图核对。地图页仍保持深色沉浸 —— 打开地点＝翻到一页纸。

## 3. 内容现状（`01_Web/content/`）

- **15 个地点**：已到访 13 —— 沈阳、重庆、南京、北京、济南、长春、杭州、苏州、广州、仙本那、吉隆坡、上海、景德镇；计划中 2 —— 京都、大阪
- **15 条 visit**：日期取自 `素材/<城市>/记录*.md` 与照片 EXIF 聚类，精确到日（如上海 2025.12.24–12.27、仙本那 2025.09.22–09.29）
- **51 条记忆**：15 篇 note（正文＝记录原文，逐字未改）+ 21 条 activity（只写记录里点名的具体事项，未编造时间）+ 15 条 photo 相册（每个 visit 一条，由发布脚本生成）
- **78 张真实照片**：`public/media/content/<place-slug>/<hash8>.webp`（长边 1600）+ `.thumb.webp`（640），合计约 13MB，全部无 EXIF/GPS
- 素材源：`素材/<城市>/`（原片 + `记录*.md`，**不进版本库**）；stable ID 规则见 `content/README.md` 与 `scripts/content-ids.mjs`

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
                           # geocode（Photon/Nominatim）、import-media、publish-material、
                           # validate-content、privacy-audit、check-dist
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

当前基线：**160 个 Vitest 全绿**。发布 = push 到 `main`，workflow 自动跑同一验证链后部署 Pages。

媒体两条管线，别混：

```bash
npm run media:material -- --apply   # 素材/<城市>/ → tracked public/media/content/ + content/media.json（可上线）
npm run media:import                # 02_Assets/MediaInbox/ → gitignored public/media/user/（仅本机预览）
```

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
6. **封面已人工定过一轮**：13 个已到访地点的 `coverMediaId` 按「能代表这个地方、优先横构图与场景而非食物/怼脸」逐个选定（上海＝城堡烟花、吉隆坡＝双子塔、重庆＝Conrad 天际线、杭州＝黑神话展、南京＝红山 360 泡泡图）。再跑 `media:material` 只会为**新增**地点自动挑封面（取最近到访里像素最多且偏横构图的一张），新地点仍需人工过一遍。
7. **重新发布依赖本地 `素材/`**：原片不进版本库，换机器需要先拷回 `素材/` 才能再跑 `media:material`。
8. **`VITE_CESIUM_ION_TOKEN` secret 已失效**：代码不再消费它（`.env.local` 与 GitHub secret 里的残留可删可不删，无影响）。

## 8. 下一步建议（按优先级）

1. **新详情页真机验收**：iPhone 竖屏 / 横屏与桌面各过一遍 MVP.md §8 的 Release Gate —— 重点看撕纸卡在长文本下的边缘、dock 与安全区、照片墙 19 张时的滚动流畅度。
2. **给计划地点补「想去理由」**：京都、大阪目前只有城市简介，`wishlistReason` 是空的——详情页会把它单独渲染成一张便签卡，值得写一句为什么想去。
3. **可选打磨**：地图页无 header 后，首次访问者没有任何产品说明——可考虑一个一次性欢迎浮层（谨慎，别破坏沉浸感）。
4. **V2 触发条件见 MVP.md §9**——在真实痛点出现前不做任何云设施

## 9. 交接检查清单（新 Agent 开工前）

- [ ] 读完 AGENTS.md / PRODUCT.md / ARCHITECTURE.md / MVP.md / 本文档
- [ ] `cd 01_Web && npm ci && npm run dev` 能起，地球渲染
- [ ] 全量验证链跑一次全绿
- [ ] 知道约束：不加 cloud/auth/第二地图引擎、组件不碰 content JSON、stable ID、Cesium 隔离、生产无编辑器
- [ ] 知道网络适配（§6）：Photon 主用、`server.arcgisonline.com`
