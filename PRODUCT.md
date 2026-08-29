# PRODUCT.md

# Our World — Product Definition

## 1. Product Summary

**Our World** is a private, map-first travel memory website for two people.

The core product model is:

> **World → Place → Visit → Memory**

The public-facing experience is centered on a Google Earth-like 3D globe.  
The authoring experience is local-only in V1.

### V1 operating model

- **Owner/editor:** one person edits locally on a Mac.
- **Viewer:** both people can browse the published website from desktop or mobile.
- **Publishing:** local content is built into a static website and deployed to GitHub Pages.
- **Online editing:** explicitly out of scope for V1.
- **V2 direction:** add cloud database, authentication, cloud media storage, and online editing without redesigning the core product model.

---

## 2. Product Vision

Create a spatial memory archive that answers:

- Where have we been together?
- Where do we want to go?
- What happened in each place?
- What did that trip feel like?
- What photos, videos, notes, and moments belong to that place?
- How has our shared world grown over time?

The product should feel closer to:

> **Google Earth × shared photo album × personal journal**

and not like:

- a travel booking product,
- a travel expense tracker,
- a social network,
- a professional trip planner,
- a generic map with pins.

---

## 3. Primary User

### Editor

One local owner manages the content.

The editor can:

- add a place,
- mark a place as wishlist, planned, or visited,
- add one or more visits to a place,
- add memories to a visit,
- attach photos,
- add notes and activities,
- reorder or curate content,
- publish the latest version.

### Viewer

The second person primarily browses the published website.

The viewer can:

- explore the 3D globe,
- zoom from Earth level into a city,
- open visited and wishlist places,
- browse visits and memories,
- view photos and notes,
- use the website comfortably on mobile and desktop.

V1 does not require viewer authentication.

---

## 4. Core Jobs To Be Done

### JTBD 1 — Explore our world

> When I open the site, I want to immediately see our shared travel world so that the map itself becomes a visual representation of our history together.

### JTBD 2 — Revisit a place

> When I select a city or location, I want to see everything connected to that place so that I can relive the trip without searching across photo apps, notes, and folders.

### JTBD 3 — Preserve memories

> After a trip, I want to add selected memories to a place so that important moments are intentionally preserved rather than buried in a camera roll.

### JTBD 4 — Remember future places

> When we discover somewhere we want to visit, I want to save it to our world so that future travel ideas live in the same spatial system as past travel.

### JTBD 5 — Publish simply

> After I update content locally, I want one simple publish flow so that the online version stays current without operating a backend.

---

## 5. Product Principles

### 5.1 Place first, not trip first

The map and place are the main organizing concepts.

Trips may exist as a secondary grouping, but the primary navigation model remains:

**Place → Visit → Memory**

### 5.2 Memories are curated, not dumped

Our World is not intended to mirror an entire camera roll.

The editor selects meaningful media and moments.

### 5.3 The globe is emotional, not decorative

The 3D globe is a primary interaction surface.

It must support:

- real navigation,
- place discovery,
- camera fly-to,
- zoom from Earth to city,
- meaningful place markers.

### 5.4 Browsing must stay simple

The published website should prioritize:

1. Globe
2. Place
3. Memory

Avoid navigation complexity that belongs to travel-management products.

### 5.5 Mobile is a first-class experience

Responsive design does not mean shrinking the desktop UI.

Desktop and mobile may use different interaction patterns while sharing the same content model.

### 5.6 V1 optimizes for quality over breadth

A polished 3D globe and a strong Place → Memory experience are more important than adding many features.

---

## 6. Information Architecture

```text
Our World
│
├── Globe
│   ├── Visited places
│   ├── Planned places
│   └── Wishlist places
│
├── Place
│   ├── Overview
│   ├── Visits
│   │   └── Memory timeline
│   ├── Gallery
│   └── Notes / highlights
│
└── Optional secondary views
    ├── All places
    └── Timeline / years
```

### V1 navigation

Keep top-level navigation minimal.

Recommended:

- **World**
- **Places**
- optional **Years**

Do not add separate top-level pages for photos, activities, wishlist, trips, statistics, settings, etc. unless real usage proves they are necessary.

---

## 7. Core Domain Model

### World

Represents the shared world.

V1 may contain only one world.

Suggested fields:

- `id`
- `name`
- `slug`
- `createdAt`
- `updatedAt`

### Place

A persistent geographic entity.

Examples:

- Tokyo
- Paris
- Kamakura
- Mount Fuji

Suggested fields:

- `id`
- `name`
- `country`
- `region`
- `latitude`
- `longitude`
- `status`
- `summary`
- `coverMediaId`
- `createdAt`
- `updatedAt`

Allowed `status` values:

- `wishlist`
- `planned`
- `visited`

### Visit

Represents one specific visit to a place.

A place may contain multiple visits.

Suggested fields:

- `id`
- `placeId`
- `startDate`
- `endDate`
- `title`
- `summary`
- `createdAt`
- `updatedAt`

### Memory

Represents one meaningful moment within a visit.

Suggested fields:

- `id`
- `visitId`
- `type`
- `title`
- `body`
- `date`
- `latitude`
- `longitude`
- `mediaIds`
- `tags`
- `createdAt`
- `updatedAt`

Initial memory types:

- `note`
- `activity`
- `photo`

Video can be introduced after the photo workflow is stable.

### Media

Represents media metadata separately from the file itself.

Suggested fields:

- `id`
- `type`
- `src`
- `thumbnailSrc`
- `width`
- `height`
- `capturedAt`
- `latitude`
- `longitude`
- `alt`
- `createdAt`

---

## 8. Primary Product Flows

### 8.1 Browse the world

```text
Open site
→ See full 3D Earth
→ Rotate / zoom
→ See place markers
→ Select marker
→ See place preview
→ Open place
→ Browse memories
```

### 8.2 Fly to a place

```text
Search or select place
→ Camera smoothly flies to place
→ Globe reaches city-level context
→ Place preview appears
```

### 8.3 Browse a place

```text
Place
→ Cover / key information
→ Visits
→ Select visit
→ Memory timeline
→ Gallery / details
```

### 8.4 Add content locally

```text
Run local editor
→ Add or edit Place
→ Add Visit
→ Add Memory
→ Add photo
→ Preview
→ Save locally
```

### 8.5 Publish

```text
Local changes
→ Run validation
→ Build static site
→ Push to GitHub
→ GitHub Actions deploy
→ Updated GitHub Pages site
```

---

## 9. Desktop UX

Recommended pattern:

- full-screen 3D globe,
- lightweight floating navigation,
- place preview as side panel,
- place detail may open as a dedicated page or large panel,
- keyboard/mouse/trackpad interaction supported.

Desktop layout should preserve maximum map visibility.

---

## 10. Mobile UX

Recommended pattern:

- full-screen globe,
- minimal floating controls,
- place preview in a bottom sheet,
- full place detail opens as a dedicated full-screen view,
- large touch targets,
- mobile-appropriate Cesium quality settings.

Do not simply shrink the desktop side panel.

---

## 11. Visual Direction

The product should feel:

- cinematic,
- personal,
- quiet,
- spatial,
- premium,
- memory-focused.

Avoid:

- dashboard-heavy enterprise UI,
- travel booking UI,
- excessive cards,
- dense tables,
- gamified travel statistics dominating the experience.

The map should remain visually dominant.

---

## 12. V1 vs V2

### V1 — Local authoring, static publishing

- one local editor,
- public or unlisted static website,
- no online write operations,
- no database,
- no login,
- no realtime collaboration,
- local JSON / generated data,
- local media processing,
- GitHub Pages publishing.

### V2 — Cloud editing

Potential additions:

- Supabase or equivalent cloud backend,
- authentication,
- owner/editor permissions,
- online editing,
- cloud photo/video storage,
- realtime sync,
- direct mobile upload.

V2 must preserve:

- `World → Place → Visit → Memory`,
- stable IDs,
- repository/data abstraction,
- media abstraction.

---

## 13. Explicit Non-Goals for V1

Do not build:

- flights,
- hotels,
- booking management,
- budget tracking,
- packing lists,
- AI itinerary generation,
- public social profiles,
- likes,
- comments,
- followers,
- complex route planning,
- collaborative online editing,
- cloud authentication,
- cloud database,
- cloud media upload,
- native iOS or Android apps,
- heavy statistics dashboards.

---

## 14. Success Criteria

V1 is successful when:

1. The site creates a strong Google Earth-like first impression.
2. Earth → city navigation feels smooth and intentional.
3. At least 5–10 real places can be documented comfortably.
4. At least 100 real photos can be organized without the product feeling messy.
5. A viewer can understand the Place → Memory model without explanation.
6. Desktop and mobile browsing both feel designed rather than merely functional.
7. Publishing requires no manual backend work.
8. The data model can later migrate to cloud storage without redesigning the UI architecture.
