# Media Management Module Sketch

## Overview

Add an integrated "media review" experience so completed downloads can be browsed in the web UI. Core ideas:

- Extend the existing download records with per-file metadata (images/videos) and mark jobs once media assets have been indexed.
- Expose APIs to fetch media lists, stream originals, and trigger re-indexing.
- Build a frontend route that renders thumbnails, previews, and playback controls for each download.

## Backend Components

### Data Model

- `Download.media_indexed` (bool) to indicate whether a job’s files have been processed.
- Extend `DownloadItem` or introduce a `MediaAsset` table with:
  - `media_type` (image/video/other)
  - `mime_type`
  - `duration_seconds`
  - `thumbnail_path`
  - `preview_path`
  - `processed_at`
- Existing rows remain valid; a migration adds the new columns/flag without wiping the DB.

### Media Indexer

- New worker module (`MediaIndexer`) that runs after a download succeeds (or via a manual command).
- Responsibilities:
  - Images: generate thumbnails (e.g., 256px JPG via Pillow/ImageMagick).
  - Videos: run ffmpeg to produce a poster frame plus a streaming-friendly MP4 (faststart) or HLS rendition; capture duration metadata.
- Marks each item as processed and flips `Download.media_indexed=true`.

### APIs

- `GET /downloads/{id}` (or `GET /downloads/{id}/media`) returns job details plus media items (id, name, type, thumbnail/preview/original URLs).
- `POST /downloads/{id}/media/reindex` enqueues media indexing for that job (`force=true` to rerun).
- `GET /media/{item_id}` and `/media/{item_id}?variant=thumb|preview` stream files with auth + Range support.

### Reindex Commands

- CLI: `python -m app.media reindex --all` (or per download) to process historical jobs.
- Reindex endpoint/button resets `media_indexed=false` and schedules the indexer, preventing accidental duplicates.

## Frontend Additions

1. **Downloads list:** Add “View media” button linking to `/ui/downloads/:id`.
2. **Media page:** Fetch media list, show a thumbnail grid, open images in a lightbox, stream videos via `<video controls>` using the new endpoints. Include metadata (size, duration, relative path) and “Download original” links.
3. **Actions:** Provide “Rebuild media” button that hits the reindex endpoint, plus optional per-file delete/open controls.

## Optional Enhancements

- Filter media (images vs videos) within a download.
- Keyboard navigation or lightbox viewer for rapid review.
- Background progress indicator for indexing jobs so the UI can show when thumbnails/transcodes are ready.

## Summary

This design builds on the current schema (no data reset) by adding media metadata and a lightweight indexing pipeline. The UI gains a dedicated gallery view while the backend exposes streaming-friendly endpoints and tools to reprocess existing downloads.
