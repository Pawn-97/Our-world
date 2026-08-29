# Our World Verification

## Required Commands

Run from `../01_Web/`:

```bash
npm run lint
npm run build
npm run privacy:check
npm run media:check
```

## Manual Smoke Test

- The globe opens and renders with the bundled Natural Earth II fallback imagery even with no tokens configured.
- Country selection flies the camera and updates the InfoCard content.
- City selection (from the country list or a globe marker) flies closer and shows the selection ring.
- The city photos entry in the InfoCard opens the photo gallery modal; the modal closes cleanly.
- The bottom dock sidebar toggle hides/shows both side panels; the Layers switcher changes the imagery source.
- Globe Scale slider zooms between City / Country / World and updates the selection mode accordingly; the reset button restores the overview (`3.25`).
- A clean Media Inbox passes `npm run media:check`; imported city photos appear in the city InfoCard after a preview restart.
- With `VITE_TRAVEL_ATLAS_DATA_MODE=sample`, the application runs independently on the neutral North Atlantic sample.
- `npm run privacy:check` confirms no private Inbox, local data, generated media, local catalog, or real environment file is tracked.

## Documentation

- Project guide: [`../README.md`](../README.md)
- Web workspace: [`../01_Web/README.md`](../01_Web/README.md)
- Media import protocol: [`../03_Reference/TravelAtlas_media_import_protocol.md`](../03_Reference/TravelAtlas_media_import_protocol.md)
- Open-source privacy boundary: [`../03_Reference/TravelAtlas_open_source_privacy_boundary.md`](../03_Reference/TravelAtlas_open_source_privacy_boundary.md)
