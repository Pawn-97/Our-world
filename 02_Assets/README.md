# StarMap Assets

## Boundary

- The legacy `SourceMedia/` continuity copy was retired after the private `MediaInbox` workflow became the canonical source-media boundary.
- `MediaInbox/` is the private bulk-delivery entrance for new user photos and drone media. Source media is immutable; only Agent-authored `country.json` and city-level `media.json` control sidecars may be created or updated there. Only the template and instructions are tracked.
- Browser-ready personal media is generated under `../01_Web/public/media/user/` and remains local-only. Each supported still image is stored by content hash with `thumb.webp`, `preview.webp`, and an `original` tier so list screens never decode full-resolution files.
- `PrivateData/` is an ignored local archive for migration backups that are not part of the runtime or the eventual public repository.
- The previous workspace remains the short-term rollback source and was not changed during migration.

## Bulk Import

Users copy `_country-template/`, rename it to a StarMap country, create one folder per city, and place that city's media into its `photos/` and `drone/` branches. If any country, city, media type, coordinate, privacy status, or intended use is uncertain, the Agent asks before acting and leaves the item unimported until it has a reliable answer. From `01_Web/`, the Agent runs `npm run media:check` before `npm run media:import`.

The complete folder contract, conversion rules, metadata requirements, and no-delete behavior are documented in the [media import protocol](../03_Reference/TravelAtlas_media_import_protocol.md).

## Public Release Rule

StarMap is an open-source website shell. Personal travel media never enters the public template. Only explicitly licensed or generated sample assets may be included in a clean public repository; see the [open-source privacy boundary](../03_Reference/TravelAtlas_open_source_privacy_boundary.md).

## Share Artifacts

- `our-world-qr.png` — scannable QR for the published site (`https://pawn-97.github.io/Our-world/`), 1200×1200 px, error correction H, 4-module quiet zone. Regenerate without touching project dependencies: `npx --yes qrcode@1.5.4 <url> -o our-world-qr.png -w 1200 -e H -m 4`. Scanning lands on the access-code gate, so the visitor still needs the code from the owner.

## Documentation

- [Public guide](../README.md)
- [Web workspace](../01_Web/README.md)
- [Media Inbox](MediaInbox/README.md)
- [Import protocol](../03_Reference/TravelAtlas_media_import_protocol.md)
- [Open-source privacy boundary](../03_Reference/TravelAtlas_open_source_privacy_boundary.md)
