# ARCHITECTURE.md

# Our World — Technical Architecture

## 1. Architecture Goal

V1 should minimize engineering and operational complexity while preserving a clean migration path to V2 cloud editing.

The architecture is:

> **Local authoring → static build → GitHub Pages**

The application should remain cloud-ready without becoming cloud-dependent.

---

## 2. Recommended Base

Use **StarMap** as the starting technical base or source-level reference for:

- Cesium initialization,
- globe rendering,
- imagery provider configuration,
- camera navigation,
- city markers,
- geospatial utilities,
- local media workflows,
- responsive globe behavior,
- static production build.

The product architecture should be refactored around:

> **World → Place → Visit → Memory**

Do not preserve StarMap features that are unrelated to this product simply because they already exist.

---

## 3. Technology Stack

### Application

- React
- TypeScript
- Vite

### Styling

- Tailwind CSS
- shadcn/ui only where it improves speed and consistency

### 3D globe

- CesiumJS
- Resium only where React integration is useful
- Cesium APIs may be used directly for performance-critical globe code

### Local data

- JSON or generated TypeScript/JSON artifacts
- schema validation before build

### Local media

- local source media directory,
- build-time generated derivatives,
- optimized web output,
- metadata catalog.

### Deployment

- GitHub repository
- GitHub Actions
- GitHub Pages

### Testing

- Vitest for unit tests
- Playwright for critical UI flows
- lint + typecheck + production build in CI

---

## 4. High-Level Architecture

```text
                Local Authoring

             Local Editor / Files
                      │
                      ▼
              Repository Layer
                      │
         ┌────────────┴────────────┐
         │                         │
     Local Data                Local Media
      JSON/TS                   Source files
         │                         │
         └────────────┬────────────┘
                      ▼
                Build Pipeline
                      │
         ┌────────────┴────────────┐
         │                         │
   Static app bundle        Optimized media
         │                         │
         └────────────┬────────────┘
                      ▼
                GitHub Pages

                  Read-only web
```

---

## 5. Critical Design Rule: Data Access Must Be Abstracted

React components must not directly depend on JSON files.

Bad:

```ts
import places from "../data/places.json";
```

Good:

```ts
const places = await placeRepository.list();
```

Define repository interfaces from V1.

Example:

```ts
export interface PlaceRepository {
  list(): Promise<Place[]>;
  getById(id: string): Promise<Place | null>;
  create(input: CreatePlaceInput): Promise<Place>;
  update(id: string, input: UpdatePlaceInput): Promise<Place>;
  remove(id: string): Promise<void>;
}
```

V1 implementation:

```text
PlaceRepository
    ↓
LocalPlaceRepository
    ↓
Local JSON / local editor API
```

V2 implementation:

```text
PlaceRepository
    ↓
CloudPlaceRepository
    ↓
Supabase / cloud database
```

The UI should not care which implementation is active.

---

## 6. Media Must Also Be Abstracted

Do not scatter file paths through components.

Use a media service abstraction.

Example:

```ts
export interface MediaService {
  getUrl(media: Media): string;
  getThumbnailUrl(media: Media): string;
}
```

V1:

```text
LocalMediaService
→ static generated media
```

V2:

```text
CloudMediaService
→ Supabase Storage / Cloudflare R2
```

Future upload APIs can be added without changing read-only presentation components.

---

## 7. Domain Types

Use stable IDs for all entities.

Recommended:

```ts
type PlaceStatus = "wishlist" | "planned" | "visited";

interface World {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
}

interface Place {
  id: string;
  worldId: string;
  name: string;
  country: string;
  region?: string;
  latitude: number;
  longitude: number;
  status: PlaceStatus;
  summary?: string;
  coverMediaId?: string;
  createdAt: string;
  updatedAt: string;
}

interface Visit {
  id: string;
  placeId: string;
  startDate?: string;
  endDate?: string;
  title?: string;
  summary?: string;
  createdAt: string;
  updatedAt: string;
}

type MemoryType = "note" | "activity" | "photo";

interface Memory {
  id: string;
  visitId: string;
  type: MemoryType;
  title?: string;
  body?: string;
  date?: string;
  latitude?: number;
  longitude?: number;
  mediaIds: string[];
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

interface Media {
  id: string;
  type: "image" | "video";
  src: string;
  thumbnailSrc?: string;
  width?: number;
  height?: number;
  capturedAt?: string;
  latitude?: number;
  longitude?: number;
  alt?: string;
  createdAt: string;
}
```

---

## 8. Local Storage Structure

Recommended structure:

```text
our-world/
├── src/
│   ├── app/
│   ├── components/
│   ├── features/
│   │   ├── globe/
│   │   ├── places/
│   │   ├── visits/
│   │   └── memories/
│   ├── domain/
│   ├── repositories/
│   ├── services/
│   └── styles/
│
├── content/
│   ├── world.local.json
│   ├── places.local.json
│   ├── visits.local.json
│   ├── memories.local.json
│   └── media.local.json
│
├── media-source/
│   ├── tokyo/
│   ├── paris/
│   └── ...
│
├── public/
│   └── generated-media/
│
├── scripts/
│   ├── validate-content.*
│   ├── import-media.*
│   └── generate-media.*
│
├── PRODUCT.md
├── ARCHITECTURE.md
├── MVP.md
└── AGENTS.md
```

Private local files may use a different structure if the StarMap base already has a safe private/public media separation.

---

## 9. Public vs Private Boundary

This project must distinguish between:

### Source/private content

May contain:

- original photos,
- original videos,
- local editor state,
- unpublished notes,
- environment variables,
- tokens.

These must not be accidentally committed.

### Published content

May contain only:

- optimized approved media,
- published place data,
- published memories,
- static application code.

A build/privacy check should fail if known private paths are tracked by Git.

---

## 10. Cesium Architecture

Keep globe-specific code isolated under one feature boundary.

Recommended:

```text
features/globe/
├── GlobeView.tsx
├── GlobeController.ts
├── camera.ts
├── imagery.ts
├── markers.ts
├── performance.ts
└── types.ts
```

Responsibilities:

### GlobeView

Owns the Cesium canvas/viewer integration.

### GlobeController

Exposes app-level actions such as:

- `flyToPlace(place)`
- `resetToWorld()`
- `focusCountry(country)`
- `setQualityMode(mode)`
- `highlightPlace(placeId)`

### Camera

Contains camera presets and animation behavior.

### Imagery

Configures image/terrain providers.

### Markers

Converts product places into Cesium entities/primitives.

### Performance

Controls desktop/mobile rendering choices.

---

## 11. Responsive Strategy

### Desktop

- full 3D globe,
- side panel for preview/details,
- high visual fidelity,
- mouse/trackpad controls.

### Mobile

- full 3D globe,
- bottom sheet for place preview,
- full-screen place detail,
- reduced visual effects by default,
- touch-safe Cesium interactions.

Responsive architecture should use shared data and business logic but may use different layout components.

---

## 12. Performance Strategy

Mobile performance is a product requirement.

V1 should:

- lazy-load heavy detail UI,
- avoid unnecessary Cesium React re-renders,
- reduce expensive visual effects on mobile,
- lazy-load large image galleries,
- use thumbnails before full-resolution media,
- avoid rendering all memory content while the globe is moving,
- prefer optimized image formats,
- test on a real phone before release.

---

## 13. Local Editor Strategy

V1 authoring is local-only.

The editor may be:

1. an in-app dev-only editor,
2. a small local-only editing route,
3. scripts/forms that update local content files.

Preferred behavior:

- visible only in local development,
- never included in production write flows,
- writes through repository/service abstractions,
- validates required data,
- previews the final published presentation.

Production remains read-only.

---

## 14. Build and Deployment

Recommended pipeline:

```text
git push
→ GitHub Actions
→ npm ci
→ lint
→ typecheck
→ unit tests
→ content validation
→ privacy check
→ production build
→ deploy GitHub Pages
```

A failed validation must block deployment.

---

## 15. Cloud Migration Strategy

V2 must be an implementation swap, not a product rewrite.

### Data

```text
LocalRepository
→ CloudRepository
```

### Media

```text
LocalMediaService
→ CloudMediaService
```

### Identity

V1:

```text
editor = local owner
```

V2:

```text
editor = authenticated user
```

### Hosting

GitHub Pages may continue serving the frontend if the cloud backend supports browser access.

---

## 16. V2 Target Architecture

```text
                 React App
                     │
       ┌─────────────┼─────────────┐
       │             │             │
    Cesium      Cloud Repos    Media Service
                     │             │
                 Supabase      R2 / Storage
                 Postgres
                     │
                    Auth
```

V1 code should not include unused cloud dependencies merely to anticipate V2.

Prepare interfaces, not infrastructure.

---

## 17. Dependency Policy

Prefer fewer dependencies.

Before adding a package:

1. confirm the platform or existing code cannot solve it,
2. confirm the package is actively maintained,
3. confirm it reduces complexity rather than moving it elsewhere,
4. avoid overlapping libraries.

Do not add a second map engine in V1.

---

## 18. Architecture Decision Summary

V1 decisions:

- CesiumJS is the single globe engine.
- React + Vite remains the application runtime.
- local-first authoring is intentional.
- GitHub Pages is the production host.
- production is read-only.
- repository abstractions are mandatory.
- media abstractions are mandatory.
- stable IDs are mandatory.
- cloud services are not part of V1 runtime.
- the architecture must stay easy for coding agents to understand and modify.
