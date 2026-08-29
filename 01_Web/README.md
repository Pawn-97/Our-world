# Our World Web Application

> **Note:** This app is now **Our World**, based on the StarMap codebase (MIT, by Aisland-SJL). Sections below that describe removed StarMap features (Journey page, drone media, meteor shower, release-update checker) are kept for operational reference only; those features no longer exist in this codebase. All ports, scripts, token rules, privacy boundaries, and media-pipeline instructions remain valid as written.

This directory contains the runnable React, TypeScript, Vite, and Cesium application.

## Setup

```powershell
npm ci
npm run dev -- --host 127.0.0.1 --port 5174
```

Use port 5175 when the read-only rollback project is still occupying 5174.

## One Product, Two Runtime States

StarMap is one codebase, not separate public and editor editions:

- `npm run dev -- --host 127.0.0.1 --port 5175` starts the **local editing state**. Photo curation controls appear on place galleries (order, hide/show, cover). Changes are saved directly to ignored local data, with backups and atomic writes; photo uploads enter the immutable `MediaInbox` first and then use the existing three-tier importer.
- `npm run build` creates the **public display state**. Editing controls are not rendered and the local write middleware does not exist. The output is a static website containing only the data and media deliberately included in that build.

Every person who clones the open-source project receives the same local editing capability. No DeepSeek Harness, chat-command relay, or AI service is required for deterministic edits. An Agent remains useful when a country, city, date, coordinate, media type, or privacy decision is uncertain, but the editor never guesses those values.

Local editor data is stored in `src/data/generated/editor-state.local.json`. It records photo display order, hidden photos, and cover choices per place; it is ignored by Git together with private media catalogs. World content — places, visits, memories — is edited directly in the tracked `content/*.json` files (see `content/README.md` for the ID convention); there is no in-app record editor. Hiding is non-destructive: source records and Inbox originals remain untouched.

The editor separates two similar-looking recovery actions:

- **Undo this round** returns the current unsaved ordering and hide/show draft to the state that existed when the editor was opened. It does not erase previously saved data.
- **Restore hidden items** explicitly removes saved hide flags, writes that change to the ignored local state, and reloads the page. It still does not delete or reconstruct source records.

## Verification

```powershell
npm run lint
npm run test
npm run validate
npm run build
npm run privacy:check
npm run media:check
```

## Content and Private Data

Our World has two data layers:

- `content/world.json`, `content/places.json`, `content/visits.json`, `content/memories.json`, and `content/media.json` are the **tracked** world content — the deliberate, publishable record of places, visits, and memories. `npm run validate` fails the workflow on missing or duplicate IDs, bad coordinates, dangling references, or bad enums.
- `src/data/generated/*.local.json` files are **ignored** local state: the imported media catalog and the media editor choices (order, hidden, covers). They never enter Git.

Run `npm run privacy:check` before preparing any public repository. It asserts that all five tracked content files are in the Git manifest and that private paths (Inbox originals, generated catalogs, local editor state, env files) are not. See the [open-source privacy boundary](../03_Reference/TravelAtlas_open_source_privacy_boundary.md) for the clean-history rule and deployment options.

## Import Personal Media

Users can simply ask an Agent to read the StarMap rules and explain how to import their photos. The Agent starts with the short [Media Inbox README](../02_Assets/MediaInbox/README.md), checks that every item maps to an existing place in `content/places.json` (grouped under its country), and asks before proceeding whenever required information is missing or uncertain.

After the files follow the tracked Inbox template, run:

```powershell
npm run media:check
npm run media:import
```

The first command is read-only and reports unresolved countries, places, formats, or drone metadata. After a clean preflight, the second command preserves a local original copy and generates two WebP derivatives for every still image: a `640 px` thumbnail for globe/sidebar/card surfaces and a `2400 px` preview for the photo viewer. Full-resolution photos and panoramas are requested only by explicit viewing actions. All three tiers use stable, hash-based paths inside the ignored local user library, and the ignored catalog records their dimensions. Restart the preview after importing.

Inbox source media must never be moved, renamed, overwritten, or deleted. Agents may create or update only the private mapping sidecars `country.json` and city-level `media.json`; supported still formats are optimized outside the Inbox by the importer, while unsupported formats still require a separate user-approved conversion step.

See [`../03_Reference/TravelAtlas_media_import_protocol.md`](../03_Reference/TravelAtlas_media_import_protocol.md) for the complete user and Agent contract.

## Environment and Cesium ion

StarMap remains runnable without Cesium ion: when `VITE_CESIUM_ION_TOKEN` is empty, the app uses the bundled low-resolution Natural Earth II map. To enable online global imagery, the person who develops or deploys this copy of StarMap must use an app-specific token from their own Cesium ion account. Website visitors do not configure tokens, and a clean open-source clone never inherits the project author's token.

For local development, copy `.env.example` to the ignored `.env.local` and enter the value there yourself. Create your own token at [Cesium ion Access Tokens](https://ion.cesium.com/tokens). An Agent may guide the setup, but it must never ask you to paste the complete token into chat or read it back. For production, configure `VITE_CESIUM_ION_TOKEN` in the hosting platform. Never commit or paste a real token into chat, source code, documentation, logs, screenshots, or examples.

A Vite client variable is excluded from Git but is still observable by users of the built website. Use separate development and production tokens, keep only the public `assets:read` permission and required assets, restrict the production token to the final Allowed URLs, monitor per-token usage, and rotate only the affected token when necessary. Both tokens consume the same ion account quota; separation provides control and diagnostics, not additional quota.

## Multiple Imagery Sources

StarMap uses Cesium as its 3D engine and can draw imagery from Cesium ion, Tianditu, or the bundled Natural Earth II fallback. Configure both online credentials in `.env.local` when needed, then choose the initial source with `VITE_MAP_SOURCE=auto|cesium|tianditu|local`. `auto` keeps the existing priority of Cesium, then Tianditu, then local fallback.

Tianditu is integrated through Cesium's WMTS imagery provider as an imagery base layer plus a Chinese annotation layer. The bottom map dock always shows a Layers button and all three source rows. Cesium and Tianditu use a steady green status light when their environment value is present and a red light when it is absent; the bundled local fallback is always green. Unconfigured online rows remain visible but disabled. The control stores the user's available selection in browser local storage and never asks for, displays, writes, or validates credential contents. Production deployments must define the selected variables before the static build.

## Public Interface Defaults

The public template uses the neutral `StarMap` identity. Its enlarged primary navigation contains only Map and Journey. The document language defaults to `zh-CN`; no Chinese/English selector is rendered. The center-bottom dock contains icon buttons for hide/show sidebars, map-source selection, summon a meteor shower, and version updates. The meteor button is a single-click action rather than a toggle: it directly reuses the previously approved implementation to summon a dense three-second shower with its original trajectories, luminous heads, fading tails, timing, and density.

The public interface deliberately uses neutral copy that a new user can replace with their own identity.

## GitHub Release Updates

The official build checks `Aisland-SJL/StarMap` by default. A fork can override the source with:

```text
VITE_GITHUB_REPOSITORY=your-name/your-fork
```

The app compares its `package.json` version with the latest GitHub Release at most once every 12 hours. An unseen newer Release gives the bottom update button a breathing-light signal. Its full update page contains the update guide, Release announcement, version notes, and a guarded AI-update prompt the user can copy. It never downloads code or overwrites local files automatically.

The update button is a reversible page control: its first click opens the update page, and its next click returns to the exact Map or Journey page that was active before.

For each public update, bump the package version, create a matching semantic-version Release such as `v0.2.0`, and describe any migration steps in the Release notes. AI-assisted updates must merge around ignored environment files, private overlays, personal media, and uncommitted work, then run the project's required checks.

## Architecture

- `src/components/CesiumAtlasGlobe.tsx` is the primary map implementation.
- `src/domain/` holds the World → Place → Visit → Memory domain types and pure view-model derivations (country groups, routes, date ranges).
- `src/repositories/` holds the repository interfaces and the local implementations that load the tracked `content/*.json` files plus the ignored generated media catalog. UI components never import content JSON directly.
- `scripts/validate-content.mjs` validates all tracked content before builds (`npm run validate`).
- `scripts/local-editor-plugin.mjs` provides the loopback-only Vite editing middleware during `serve`; it is excluded from the production runtime.
- `src/data/editorState.ts` applies ignored local photo ordering, visibility, and cover choices without rewriting imported source records.
- Project-level context and handoff live one directory above this web workspace.

## Documentation

- Project guide: [`../README.md`](../README.md)
- Project Agent rules: [`../AGENTS.md`](../AGENTS.md)
- StarMap upstream docs (attribution): [`../03_Reference/starmap-upstream/`](../03_Reference/starmap-upstream/)
- Media import protocol: [`../03_Reference/TravelAtlas_media_import_protocol.md`](../03_Reference/TravelAtlas_media_import_protocol.md)
- Open-source privacy boundary: [`../03_Reference/TravelAtlas_open_source_privacy_boundary.md`](../03_Reference/TravelAtlas_open_source_privacy_boundary.md)
