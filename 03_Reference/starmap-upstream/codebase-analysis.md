# StarMap Codebase Analysis — Adoption Report for "Our World"

Source analyzed: `/tmp/starmap-base` (runnable app in `/tmp/starmap-base/01_Web`).
Nothing was modified. All paths below are relative to the repo root unless absolute.

---

## 1. `01_Web/src/App.tsx` — app structure

**No router.** Three pseudo-pages via `activePage: AtlasPage = 'map' | 'journey' | 'about'`
(type from `components/AtlasHeader.tsx`), rendered as absolutely-positioned overlay stages:

- **map** — default. Full-screen `CesiumAtlasGlobe` + overlay UI: `CountrySelector` (left),
  `InfoCard` + conditional `DroneMediaCard` + `MouseControlGuide` (right stack), bottom dock
  (`atlas-map-controls`): sidebar show/hide toggle, `MapSourceSwitcher`, `MeteorShowerButton`,
  `ReleaseUpdateButton`.
- **journey** — `atlas-journey-stage` overlay: stats cards (countries/cities/records/mapped),
  `JourneyViewToggle` (`'timeline' | 'yearCards'`), then `Timeline` or `JourneyYearCards`.
- **about** — actually the **update page**: `ReleaseUpdatePage` (GitHub release notes +
  copyable "AI update prompt"). `pageBeforeUpdate` remembers map/journey to toggle back.

Modals: `DronePanoramaModal` (React `lazy()` + Suspense), `CityPhotoGalleryModal`.

**Selection state machine:** `selectionMode: 'overview' | 'country' | 'city'` with
`selectedCountryId` / `selectedCityId`, plus drone-media selection (`activeDroneMediaCityId`,
`activeDroneMediaItemId`) and `globeDistance` (3.25 / 1.95 / 1.38 abstract scale → camera).
`changeGlobeDistance` maps zoom distance back to selection mode (zoom-to-select).

**Theme:** effectively **hardcoded night** — `const activeTheme: ThemeMode = 'night'`.
`imageryTuningDefaults` has day/night entries and `DayNightToggle` exists, but no toggle is
mounted and no theme state exists. **Language:** no language state; `useEffect` hardcodes
`document.documentElement.lang = 'zh-CN'`; `LanguageToggle` is dead (only its
`InterfaceLanguage` type is imported, by `MouseControlGuide`, which is rendered with
`language="zh"`).

**Responsiveness:** only `sidebarsOpen` synced to `matchMedia('(min-width: 1100px)')`.
No mobile-specific layout logic in App (all CSS in `index.css`).

---

## 2. `01_Web/src/components/CesiumAtlasGlobe.tsx` (1723 lines)

**Exported props (`CesiumAtlasGlobeProps`):**

```ts
hoveredCountryId?: CountryId
imageryBrightness / imageryContrast / imagerySaturation: number
mapSource: MapSourceId
selectedCountryId?: CountryId; selectedCityId?: CityId
selectionMode: SelectionMode
globeScale: number            // abstract 1.38/1.95/3.25 distance
resetVersion: number          // bump → re-fly to overview
isNight: boolean
showMapContent?: boolean      // hides imagery/globe/entities when on journey/about page
activeDroneMediaCityId?: CityId; activeDroneMediaItemId?: string
onSelectCity(cityId); onSelectDroneMediaItem(item)
```

**External data/module dependencies:** `cesium`, `resium`,
`../data/travelAtlas` (`cities, cityById, countries, countryById, journeyDays, routes, travelAtlasDisplay`),
`../data/droneMedia` (`droneMediaById, droneMediaItems`, `DroneMediaItem`),
`../data/mapSources` (`createMapSourceLayers`, `MapSourceId`),
`./CesiumConstellationSky`, `../types/travel`.

**Responsibilities:**

- **Viewer init:** resium `<Viewer>` with every Cesium widget disabled (no baseLayerPicker,
  geocoder, homeButton, timeline, animation, infoBox, selectionIndicator…), `scene3DOnly`,
  `baseLayer={false}`. `configureViewer()` caps `resolutionScale` by devicePixelRatio (max DPR
  2 → render scale ≤ 1), sets zoom distance limits (120 m … 22 000 km),
  `depthTestAgainstTerrain = true`.
- **Imagery:** `createMapSourceLayers(mapSource)` → 1 base `ImageryLayer` + optional labels
  layer (Tianditu), with brightness/contrast/saturation bound to App's imagery-tuning sliders.
- **Atmosphere/day-night:** `Scene` background color, `Globe` (`enableLighting`,
  `dynamicAtmosphereLighting`, `vertexShadowDarkness`), `SkyBox` + `Sun` shown only in day
  mode, `SkyAtmosphere` always on. Night-only `CesiumConstellationSky`.
- **Camera:** `cameraScaleStates` — world (22 000 km, pitch −90), country (3 100 km, −62),
  city (680 km, −48), droneGroup (20 km, −42), drone (9 km, −42). Focus chain:
  droneItem → droneGroup → city → country → overview (`travelAtlasDisplay.overviewTarget`,
  default `{lat:20,lng:0}`). Flights via `flyToBoundingSphere` (city/country/drone) or `flyTo`
  with computed orientation (world). `executeCameraCommand()` is a serialized command runner
  with a **"drone camera lock"** that blocks non-drone camera commands while drone media is
  active, and DEV-only `console.debug` instrumentation. World scale pins the camera to look at
  earth center every `preRender` (locked direction/up). `ScreenSpaceCameraController`:
  look/translate disabled at world scale, `inertiaZoom: 0.72`. Dev-only debug API on
  `window.__travelAtlasDebugCamera` (`getCameraPose`, `flyToDroneItem`) — PROD-gated.
- **Markers:** city `Entity`s — `point` (accent-colored, size by selection/country context) or
  glowing SVG `billboard` on country-hover, `label` (name, shown for selected/country cities),
  selection `ellipse` ring (42 km). Only cities with valid coordinates render.
  **Hemisphere culling:** `isPositionFacingCamera` recomputed on camera `changed`/`moveEnd` →
  `visibleCityIds` / `visibleRouteIds` sets hide back-side entities.
- **Routes:** `createRoutePositions` builds geodesic arcs with altitude hump (flight 24 km /
  ferry 8 km / other 6 km), `PolylineOutlineMaterialProperty`; routes derive from journey data
  (`routes` + country city order), active/muted styling by selection.
- **Drone markers:** SVG drone-pin billboards + labels for positioned drone media of the
  active city; click → `onSelectDroneMediaItem`.
- **Cursor FX (desktop):** `atlas-cursor-glow` div + a full-window `<canvas>` "cursor trail"
  (Catmull-Rom-smoothed ribbon, speed-reactive, additive blending, `prefers-reduced-motion`
  aware, pointer-coalesced events). Pure decoration; safe to strip.
- **Status pill:** "N mapped cities · M journey route segments".
- **Mobile:** nothing globe-internal except the DPR/resolution cap; layout is App/CSS-level.

---

## 3. Other globe components

| File | What it is | Used by App? | Dependencies |
|---|---|---|---|
| `src/components/CesiumConstellationSky.tsx` (1030 lines) | Night-sky layer inside the Cesium scene: 12 zodiac constellations (points+lines), ~4 800-star procedural field (seeded RNG), galaxy-glow polylines with custom GLSL material, 6-bank animated aurora, a moon `Primitive` with Lambert shading + earth-occlusion shader, and the **meteor system** (34 pooled slots, 24 tracks, ambient + 3 s "shower" burst driven by `consumeMeteorShower()`). | Yes — mounted by `CesiumAtlasGlobe` (night only) | `cesium`, `resium` (`useCesium`), `../data/meteorShower` |
| `src/components/CesiumGlobePrototype.tsx` (191 lines) | Standalone tech-demo page ("Cesium Lab"): viewer + Iceland/Reykjavik flyTo buttons, one marker. | **No — imported nowhere** | `cesium`, `resium` |
| `src/components/AtlasGlobe.tsx` (198 lines) | Legacy react-globe.gl globe ("Frozen for historical fallback only" header comment). Points/arcs/rings, unpkg three-globe textures. | **No — imported nowhere** | `react-globe.gl` (pulls `three`), `../data/travelAtlas` |

---

## 4. `src/data/` modules

| File | Purpose / shape | Consumers |
|---|---|---|
| `travelAtlas.ts` (388 lines) | **Data core.** Loads `generated/travel-map.local.json` via `import.meta.glob` (eager) when present, else `travel-map.sample.json`; `VITE_TRAVEL_ATLAS_DATA_MODE=sample` or `?data=sample` forces sample. Classifies records (`destination/transit/origin/return/dayTrip/region/attraction`), applies `display` rules (aliases, hidden countries/cities, journey rules), merges `editorState` (hidden ids, added countries, saved order), derives `countries`, `cities`, `journeyDays`, `routes` (per-journey date-ordered city links; cross-country ⇒ `flight`), `travelAtlasMeta`, `countryById/cityById`, `getCitiesForCountry`, `shouldHideCityFromNavigation`. IDs are slugs (`country`, `country__city`). | App, CesiumAtlasGlobe, AtlasGlobe (legacy), CountrySelector, InfoCard, Timeline, JourneyYearCards, DroneMediaCard |
| `geoCoordinates.ts` (26 lines) | Name-normalizer + **intentionally empty** `countryCoordinates`/`cityCoordinates` fallback lookup (privacy: private builds embed coords in records instead). | `travelAtlas.ts` |
| `mapSources.ts` (129 lines) | Imagery source registry: `MapSourceId = 'cesium' \| 'tianditu' \| 'local'`; env tokens (`VITE_CESIUM_ION_TOKEN`, `VITE_TIANDITU_TOKEN`), `VITE_MAP_SOURCE` default, localStorage persistence (`starmap:map-source`), `createMapSourceLayers()` → Cesium ion world imagery (fallback: local), Tianditu WMTS img+cia, or bundled NaturalEarthII TMS. | App, CesiumAtlasGlobe, MapSourceSwitcher |
| `mediaCatalog.ts` (107 lines) | Loads `generated/user-media.local.json` (schemaVersion 1|2) via glob; `ImportedMediaCatalogItem` (kind `photo\|panorama360\|aerialPhoto\|video`, variants thumb/preview/original, position, altitude, cover, status); filters hidden (editorState), `getCityPhotos`, `getCityCoverPhoto`, `importedDroneMediaCatalogItems` (city-grouped, ordered, `ready` only), `getMediaSource(item, variant)`. | InfoCard, CityPhotoGalleryModal, DroneMediaCard, droneMedia.ts |
| `editorState.ts` (113 lines) | Loads `generated/editor-state.local.json` via glob; `TravelAtlasEditorState` (schemaVersion 1): addedCountries, countryOrder, hiddenCountryIds, cityOrderByCountry, hiddenCityIds, mediaOrderByCity, hiddenMediaIds, coverMediaByCity, **droneOrderByCity, hiddenDroneMediaIds**, updatedAt. Exports `orderBySavedIds`, `localEditorAvailable = import.meta.env.DEV`. | travelAtlas, mediaCatalog, App, CountrySelector, InfoCard, DroneMediaCard |
| `localEditorApi.ts` (170 lines) | Browser client for the dev-server editor middleware: `searchLocalCountries/Cities`, `addLocalCountry`, `readLocalEditorState`/`updateLocalEditorState`, `uploadLocalMedia` (photo/panorama360/aerialPhoto + GPS/altitude params), `importLocalMedia`, `deleteHiddenLocalMedia`, `addLocalTravelRecord`, `reloadAfterLocalSave`. All hit `/__travelatlas/editor/*` with `x-travelatlas-local-editor: 1`. | CountrySelector, InfoCard, DroneMediaCard |
| `droneMedia.ts` (83 lines) | Adapts `importedDroneMediaCatalogItems` → `DroneMediaItem` (id, cityId, type `panorama360\|aerialPhoto`, titles, src/preview/thumb, date, resolution, captureType, position…). `droneMediaItems`, `droneMediaByCity`, `getDroneMediaForCity`, `hasDroneMedia`, `droneMediaById`. No built-in items. | App, CesiumAtlasGlobe, DroneMediaCard, DronePanoramaModal, **privacy-audit.mjs (reads the file source!)** |
| `droneMetadata.ts` (78 lines) | `exifr`-based EXIF/XMP reader for uploaded drone files → date, lat/lng, absolute/relative altitude, camera. | DroneMediaCard only |
| `meteorShower.ts` (17 lines) | Module-level boolean signal: `requestMeteorShower()` / `consumeMeteorShower()` — decouples button from sky. | MeteorShowerButton, CesiumConstellationSky |
| `releaseUpdates.ts` (161 lines) | `useReleaseUpdates()` hook: compares `package.json` version to latest GitHub Release (`VITE_GITHUB_REPOSITORY`, default `Aisland-SJL/StarMap`), 12 h localStorage cache, unseen-dot state, copyable Chinese "AI update prompt". | App, UpdateChecker |
| `travel-map.sample.json` (123 lines) | Neutral demo: 5 records, Iceland/Faroe North Atlantic trip, `privacy_level: "public-sample"`, `display` block (overviewTarget, countryCodes, alias/rule arrays). | travelAtlas.ts (fallback), local-editor-plugin.mjs (bootstrap), privacy-audit.mjs |

Generated (gitignored) catalog locations consumed via glob: `src/data/generated/travel-map.local.json`,
`editor-state.local.json`, `user-media.local.json` (+ `media-source-index.local.json` used by editor plugin only).

---

## 5. `src/types/travel.ts` — full inventory

`CountryId`, `CityId` (string aliases); `TravelRecordCategory` (`destination|transit|origin|return|dayTrip|region|attraction`);
`TravelMapRecord` (raw record: country/city zh+en, country_code, region, start/end_date, year, trip_title, type, status, lat/lng nullable, notes, source, travelCategory, hiddenFromHome, journeyId);
`Country` (id, names, centerLat/Lng, visitedDateRange, summary, memory, keywords, cityIds, accent, flag/flagCode, missingCoordinates, records);
`City` (id, names zh/en, countryId, lat/lng, visitedDateRange, summary, memory, keywords + legacy/optional fields name/localName/country/visited/accent/themes, missingCoordinates, records);
`JourneyDay` (id, date, countryId, cityId, secondaryCityId, title, summary, journeyId, dayLabel, description, contentAngle, isHighlight);
`Route` (id, fromCityId, toCityId, journeyId, type `main|dayTrip|flight|ferry|drive`);
`GlobeViewMode` (`overview|focusCountry|focusCity` — used only by legacy AtlasGlobe);
`SelectionMode` (`overview|country|city`); `RouteLink` (unused legacy shape).

---

## 6. Components inventory (`src/components/`)

| File | Purpose | Product concept |
|---|---|---|
| `CesiumAtlasGlobe.tsx` | Primary Cesium globe (see §2) | globe-core (+drone markers embedded) |
| `CesiumConstellationSky.tsx` | Night sky: constellations/stars/galaxy/aurora/moon + meteors | globe-core visuals (+meteor gimmick embedded) |
| `AtlasGlobe.tsx` | Frozen legacy react-globe.gl globe | legacy globe — DELETE (unused) |
| `CesiumGlobePrototype.tsx` | Standalone Cesium tech demo page | dev prototype — DELETE (unused) |
| `AtlasHeader.tsx` | Top glass header: brand + Map/Journey nav (`AtlasPage`) | UI chrome |
| `CountrySelector.tsx` (626) | Left panel: country/city lists, zoom slider, imagery sliders, drone toggle; local-editor add-country + reorder/hide | UI chrome + editor + drone hook |
| `InfoCard.tsx` (656) | Right panel: country/city detail, cover photo, stats; local-editor add city/record/upload, city photos entry | UI chrome + gallery + editor |
| `CityPhotoGalleryModal.tsx` | Photo grid/viewer modal from mediaCatalog | gallery (memory browsing) |
| `Timeline.tsx` | Journey page: reverse-chronological day rail | journey |
| `JourneyYearCards.tsx` | Journey page: year→country card grid | journey |
| `JourneyViewToggle.tsx` | timeline/yearCards switcher | journey |
| `DroneMediaCard.tsx` (500) | Per-city drone media list + editor upload/hide/delete | drone + editor |
| `DronePanoramaModal.tsx` | 360° viewer modal (@photo-sphere-viewer) | drone |
| `MeteorShowerButton.tsx` | Dock button triggering 3 s meteor burst | meteor gimmick |
| `UpdateChecker.tsx` | `ReleaseUpdateButton` + `ReleaseUpdatePage` (about page) | update-checker |
| `MapSourceSwitcher.tsx` | Dock layers menu (cesium/tianditu/local) | globe-core |
| `MouseControlGuide.tsx` | Right-panel mouse-control legend (zh copy) | UI chrome |
| `DayNightToggle.tsx` | Day/night pill toggle — **not mounted**; only `ThemeMode` type used | dead-ish UI chrome |
| `LanguageToggle.tsx` | zh/en pill toggle — **not mounted**; only `InterfaceLanguage` type used | dead-ish UI chrome |
| `PanelGhostToggle.tsx` | Panel hide button — **imported nowhere** | dead UI chrome — DELETE |
| `LocationSearchField.tsx` | Debounced/async search input (editor country/city search) | editor |
| `LocalEditorToolbar.tsx` | Edit/reset/save/add mini toolbar | editor |
| `useFlipLayout.ts` | FLIP animation hook for reorderable lists | editor (used by CountrySelector/InfoCard/DroneMediaCard) |

---

## 7. `scripts/`

### `local-editor-plugin.mjs` (861 lines) — dev-only write API
Vite plugin `{ apply: 'serve' }` → only exists in `vite dev`, never in builds. Middleware handles:

- `GET/HEAD /media/user/*` — serves generated media, loopback-only, path-traversal-guarded.
- `GET /__travelatlas/editor/state` — read editor state (loopback).
- `GET /__travelatlas/editor/catalog/countries` — offline country search from bundled
  `world-countries` package (zh/en/code/alt-spellings).
- `GET /__travelatlas/editor/catalog/cities` — online Nominatim search, rate-limited (≥1.05 s
  serialized queue), in-memory cache, via `undici` EnvHttpProxyAgent.
- Writes require loopback + `x-travelatlas-local-editor: 1` header + localhost origin:
  - `PUT …/state` — validated, **atomic write** (tmp+rename, `.bak` backup) to
    `src/data/generated/editor-state.local.json`.
  - `POST …/records` — append validated travel record to `generated/travel-map.local.json`
    (bootstrapped from sample if missing; duplicate-city rejection; `source: 'local-editor'`).
  - `POST …/countries` — add country to editor state (rejects existing).
  - `POST …/upload` — streams file (≤250 MiB) to `02_Assets/MediaInbox/<country>/<city>/photos|drone/`;
    sharp-validates image; enforces 2:1 equirect check for panoramas; writes drone metadata
    sidecar `<city>/media.json`.
  - `POST …/import` — runs `import-media.mjs` preflight (blocks on unresolved-data patterns)
    then `--apply`; un-hides imported ids in editor state.
  - `POST …/media/delete` — the only delete path: removes **hidden drone media** originals from
    the Inbox, generated dirs, sidecar entries, catalog records; reruns importer.

### `import-media.mjs` (639 lines) — media pipeline
- **Input:** `02_Assets/MediaInbox/<country>/<city>/{photos,drone}/` (aliases supported:
  照片/无人机…), optional `country.json` + `media.json` sidecars, `_country-template/` and
  `_`-prefixed dirs skipped; folder names matched against travel data (local overlay preferred).
- **Kinds:** photo / panorama360 / aerialPhoto / video; drone kind from extension, `media.json`,
  or filename (`360|pano|panorama`); 2:1 ratio enforced for panorama360.
- **Modes:** default = read-only preflight (`npm run media:check`), `--apply` =
  `media:import`.
- **Output (apply):** copies original + generates `thumb.webp` (640 px q76) and `preview.webp`
  (2400 px q84) via sharp into `01_Web/public/media/user/<countryId>/<city>/<kind>/<sha256:16>/`;
  writes catalog `src/data/generated/user-media.local.json` (schemaVersion 2,
  `privacyLevel: 'local-only'`) and `generated/media-source-index.local.json` (id → inbox
  sources). Cover heuristic: filename starting `cover`. Errors block apply; warnings don't.

### `privacy-audit.mjs` (63 lines)
Runs from `npm run privacy:check` (fed `git ls-files` via stdin). Fails if any private path is
tracked: `02_Assets/PrivateData/`, `01_Web/public/media/user/`, `01_Web/src/data/generated/`,
any `*.local.*`, `01_Web/src/data/travel_map_export.json`, MediaInbox (except README/template),
`01_Web/.env*` (except `.env.example`). Also asserts sample file has
`privacy_level === 'public-sample'` + ≥1 record, and **reads `src/data/droneMedia.ts` source**
to assert no built-in media / no hardcoded `/media/` srcs.

---

## 8. `vite.config.ts` (18 lines)

Plugins: `travelAtlasLocalEditor()` (local editor middleware), `@vitejs/plugin-react`,
`@tailwindcss/vite` (Tailwind v4), `vite-plugin-cesium`. Server `watch.ignored:
['**/public/media/user/**']` (media import doesn't trigger reload loops). **No `base` config**
(defaults to `/`), no build options, no path aliases. Editor plugin is imported with a
`@ts-expect-error` (Node-only).

---

## 9. `public/` and `.gitignore` — private/public separation

- Tracked `public/`: only `favicon.svg`, `icons.svg`. `public/media/user/` is generated +
  gitignored.
- Only **root `.gitignore`** exists (none in `01_Web/`). Ignores: `node_modules`, `dist`,
  `*.local`, `02_Assets/MediaInbox/*` (except `README.md` + `_country-template/`),
  `01_Web/public/media/user/`, `01_Web/src/data/generated/*.local.*`, `02_Assets/PrivateData/`,
  `.env*` (except `.env.example`), plus broad `*token*`/`*secret*`/credential patterns.
- Generated catalogs: `01_Web/src/data/generated/*.local.json` (gitignored, glob-imported at
  build time — i.e. private data is **baked into the static bundle at build time**, public
  clones get the sample instead).
- `02_Assets/MediaInbox/` = private immutable source drop zone (only README + `_country-template`
  tracked). `02_Assets/PrivateData/` = ignored migration archive. `03_Reference/` = tracked
  protocol docs + JSON schemas (`travel-map.schema.json`, `media-catalog.schema.json`).
- `privacy:check` script enforces this boundary against the git manifest.

---

## 10. README / AGENTS facts not obvious from code

(`01_Web/README.md`, `01_Web/AGENTS.md`, root `AGENTS.md`, `02_Assets/README.md`, `MediaInbox/README.md`)

- Dev convention: `npm run dev -- --host 127.0.0.1 --port 5174` (5175 fallback); never
  `--host 0.0.0.0`; all npm commands from `01_Web/`.
- "One product, two runtime states": dev = local editing state (editor controls + write
  middleware), `npm run build` = public display state (no editor UI, no write API).
- `VITE_TRAVEL_ATLAS_DATA_MODE=sample` env or `?data=sample` query forces the public demo even
  with private data present.
- Editor state file records only order/hide/cover choices — source records never rewritten;
  hiding is non-destructive. "Undo this round" (draft) vs "Restore hidden items" (saved)
  are deliberately separate.
- Nominatim usage policy compliance is a documented constraint (explicit user-triggered search,
  serialized, cached) — relevant if Our World keeps city search.
- Update checker: compares versions ≤ every 12 h; `VITE_GITHUB_REPOSITORY` override for forks;
  update page ships a copyable AI-merge-update prompt; never auto-downloads.
- Tokens: `VITE_CESIUM_ION_TOKEN` / `VITE_TIANDITU_TOKEN` are public-client credentials —
  visible in built JS; docs mandate app-specific dev/prod tokens with provider-side
  restrictions. `VITE_MAP_SOURCE=auto|cesium|tianditu|local`.
- Media rules: Inbox originals immutable; only `country.json` / `media.json` sidecars are
  Agent-writable; HEIC/TIFF/RAW/MOV are NOT auto-converted (blocked with guidance); drone item
  without coordinates may exist but must not create a map marker/camera target.
- Privacy boundary doc (`03_Reference/TravelAtlas_open_source_privacy_boundary.md`) mandates a
  **fresh git history** for any public release (no publishing of the current history).
- Root `AGENTS.md`: "Preserve the existing Map / Journey / About structure and shared theme
  state unless the user asks for a structural change" — adoption is exactly that change.

---

## 11. Dependency graph highlights (removable-feature attribution)

| npm dep | Used by | If feature removed |
|---|---|---|
| `react-globe.gl` + `three` | **only** `AtlasGlobe.tsx` (unused legacy) | Both droppable (no other `three` import anywhere) |
| `@photo-sphere-viewer/core` | **only** `DronePanoramaModal.tsx` | Droppable with drone feature |
| `exifr` | **only** `data/droneMetadata.ts` (→ DroneMediaCard upload) | Droppable with drone upload (or keep if Our World reuses EXIF import for memory photos) |
| `undici` | **only** `scripts/local-editor-plugin.mjs` (proxy-aware Nominatim fetch) | Editor-only; wrongly in `dependencies` (should be devDependency) |
| `world-countries` | **only** `scripts/local-editor-plugin.mjs` (country catalog) | Editor-only; same misplacement |
| `sharp` (devDep) | `scripts/import-media.mjs` + editor plugin upload validation | Core of media pipeline — KEEP |
| `cesium`, `resium`, `vite-plugin-cesium` | CesiumAtlasGlobe, CesiumConstellationSky, prototype | KEEP |
| `tailwindcss`, `@tailwindcss/vite` | global styling | KEEP |
| `lucide-react` | all UI components | KEEP |
| `react`, `react-dom`, `@vitejs/plugin-react` | core | KEEP |

---

## 12. Breakage analysis — deleting drone / meteor / journey / update files

**Meteor:**
- `data/meteorShower.ts` ← imported by `MeteorShowerButton.tsx` (deleted together) AND
  **`CesiumConstellationSky.tsx`** (`consumeMeteorShower`, ~200 lines of meteor slots/tracks/
  spawn/update logic). Deleting the module requires editing CesiumConstellationSky (strip
  meteor collections + `updateMeteor`) — or keep the 17-line module as a harmless stub.

**Drone:**
- `data/droneMedia.ts` consumers: `App.tsx` (state, panel gating, handlers), `CesiumAtlasGlobe.tsx`
  (props `activeDroneMediaCityId/ItemId`, `onSelectDroneMediaItem`, drone billboard entities,
  `droneItem`/`droneGroup` camera scales + camera lock, dev debug API `flyToDroneItem` —
  roughly 300–400 lines), `DroneMediaCard.tsx`, `DronePanoramaModal.tsx`.
- **`scripts/privacy-audit.mjs` does `readFileSync('src/data/droneMedia.ts')`** — deleting the
  file crashes `npm run privacy:check`; must also remove that check from the audit.
- Editor coupling: `editorState.ts` fields `droneOrderByCity` / `hiddenDroneMediaIds` are read
  by `mediaCatalog.ts` and `local-editor-plugin.mjs` (upload kinds, delete-hidden-drone-media
  endpoint, drone sidecar `media.json`). `localEditorApi.ts` has drone kinds in
  `LocalMediaUpload`. Clean removal needs edits in all four; or keep them as inert fields.

**Journey:**
- Components `Timeline.tsx`, `JourneyYearCards.tsx`, `JourneyViewToggle.tsx` ← only App.tsx. Safe.
- BUT journey *data* is load-bearing for the globe: `CesiumAtlasGlobe` uses `journeyDays`
  (visit counts) and `routes` (all route polylines), both derived in `travelAtlas.ts` from
  `journeyId`. Deleting journeyDays/routes generation would remove globe route arcs. Our World
  should keep the `journeyId`/route derivation (it maps naturally to Visit grouping) even if
  the Journey page UI is dropped.

**Update checker:**
- `data/releaseUpdates.ts` + `components/UpdateChecker.tsx` ← only App.tsx. Safe to delete
  together (removes the entire 'about' page; `AtlasPage` type and header nav need a small edit
  if 'about' is dropped).

**Zero-risk deletes (unreferenced):** `components/AtlasGlobe.tsx`,
`components/CesiumGlobePrototype.tsx`, `components/PanelGhostToggle.tsx`, `src/App.css`
(not imported; `main.tsx` loads only `index.css`).

**Small-edit deletes:** `DayNightToggle.tsx` (only `ThemeMode` type imported by App.tsx),
`LanguageToggle.tsx` (only `InterfaceLanguage` type imported by MouseControlGuide.tsx).

**KEEP for Our World (map to requirements):** Cesium viewer setup + camera system
(CesiumAtlasGlobe minus drone/cursor-trail), `mapSources.ts` (3-source imagery incl. offline
NaturalEarthII fallback), `travelAtlas.ts` data pipeline (record → country/city/journey/routes;
rename toward World→Place→Visit), `mediaCatalog.ts` + `import-media.mjs` three-tier media
pipeline, `local-editor-plugin.mjs` + `localEditorApi.ts` + `editorState.ts` local editor
mechanics, `privacy-audit.mjs`, `vite.config.ts` plugin stack, `MapSourceSwitcher`,
`CityPhotoGalleryModal` (memory browsing), `InfoCard`/`CountrySelector` (place panels).

**ISOLATE candidates:** constellation/aurora/moon sky visuals (keep, strip meteor);
cursor-trail canvas FX (delete or isolate); DayNightToggle/LanguageToggle types (theme/language
scaffolding for later).
