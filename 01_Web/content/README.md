# Content files

Tracked, publishable content for Our World. These files are the single source
of truth for the static build; keep them valid with `npm run validate`.

## Files

- `world.json` — one world object (`id`, `name`, `slug`, optional
  `overviewTarget { lat, lng }`, `createdAt`, `updatedAt`).
- `places.json` — array of places. Required: `id`, `worldId`, `name`,
  `country`, `latitude`, `longitude`, `status`
  (`visited` | `planned` | `wishlist`), `createdAt`, `updatedAt`.
  Optional: `nameEn`, `countryEn`, `countryCode` (ISO 3166-1 alpha-2,
  lowercase), `region`, `summary`, `wishlistReason` (shown on the detail
  page for wishlist places), `coverMediaId`.
- `visits.json` — array of visits. Required: `id`, `placeId`, timestamps.
  Optional: `status` (`completed` | `planned`; omitted means `completed`),
  `startDate`, `endDate` (`YYYY-MM-DD` or `YYYY-MM`), `title`,
  `summary`. A place may have many visits; routes on the globe are derived
  from chronologically ordered completed visits — `planned` visits are
  intentions: they never draw arcs and do not count toward visit totals or
  date ranges.
- `memories.json` — array of memories. Required: `id`, `visitId`,
  `type` (`note` | `activity` | `photo`), `mediaIds` (array, may be empty),
  timestamps. Optional: `title`, `body`, `date`, `time` (`HH:MM`, 24h),
  `locationName` (short human label), `latitude`, `longitude`, `tags`.
  `activity` memories typically carry `time`/`locationName` tags; `photo`
  memories reference media via `mediaIds`.
- `media.json` — array of media records. Required: `id`,
  `type` (`image` | `video`), `src`, `createdAt`. Optional: `placeId`,
  `thumbnailSrc`, `previewSrc`, `width`, `height`, `capturedAt`, `latitude`,
  `longitude`, `alt`. Locally imported photos are merged in from the
  generated catalog instead of this file.

## ID convention

IDs are stable, readable slugs — never array indexes, names, or file names:

- world: `world-<slug>` (e.g. `world-our-world`)
- place: `place-<slug>` (e.g. `place-tokyo`)
- visit: `visit-<place-slug>-<start>` (e.g. `visit-tokyo-2025-04`)
- memory: `mem-<place-slug>-<topic>-<type>` (e.g. `mem-tokyo-sensoji-note`)
- media: `media-<slug>` (pipeline imports append kind and content hash)

Once published, an ID never changes; edits update `updatedAt` only.
