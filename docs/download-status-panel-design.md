**Download Status Panel – Design**
=================================

## Goals
- Surface real-time download state directly inside SimpCity threads.
- Let users jump to related posts and manage jobs without leaving the page.
- Extend API/worker pipeline to report job transitions beyond “queued”.

## Scope

### In
- Floating status panel listing all active downloads (queue + running).
- Thread-aware highlights: jump button scrolls to matching unfurl/link on page.
- Redis pub/sub bridge so worker emits `queued|running|succeeded|failed|cancelled` events.
- API endpoint for retrieving current active jobs on page load.
- WebSocket payload updates to include richer metadata (status, timestamps, counts).

### Out
- Full download history UIL; only active + recent successes in-memory client cache.
- Provider userscript changes (can follow once SimpCity panel stabilises).
- Pause/resume throttling logic (future).

## UX Concept
- Panel anchored left (fixed, collapsible). Default width ≈ 320px; hides on narrow viewports.
- Sections:
  - **Active**: queued/running items sorted newest first.
  - **Finished**: recent (e.g. last 10) success/failure items; collapsible.
  - Filter chips: “All”, “This thread”.
- Each entry shows:
  - Title/post label.
  - Status pill (Queued, Running, Done, Failed, Cancelled).
  - Provider icon (derived from URL).
  - Primary action: jump-to-post (if anchor cached) or open provider URL.
  - Secondary: retry failed job, dismiss finished entry.
- Panel polls initial state on load, then stays synced via WebSocket events.

## Userscript Architecture Changes

### Data Structures
- `TrackedLink` map keyed by normalized URL (post-title optional) storing:
  - DOM element reference + position snapshot.
  - Thread title / display name.
  - Provider host info.
- `DownloadRecord` map keyed by `download_id` with status, timestamps, subscribed URLs.
- `PanelState` for filters and UI preferences (persisted via GM storage).

### Workflow
1. On ready: scan thread, build `TrackedLink` registry.
2. Warm cache by calling `GET /downloads/active`.
3. Merge responses into panel:
   - For each job, match URLs to tracked links; mark as “local” if any match.
   - Render initial entries.
4. Open WebSocket (still using notifications channel). Handle events:
   - `queued`: add entry (if new) or bump status.
   - `running`: update status, progress counters if present.
   - `succeeded|failed|cancelled`: update pill, push into Finished list.
5. Provide actions:
   - Jump button: call `scrollIntoView` + temporary highlight class.
   - Retry failed: `POST /downloads/{id}/retry` (API addition).
   - Cancel queued/running: `POST /downloads/{id}/cancel` (API addition).
6. Clean-up: remove finished items after TTL, but keep summary states stored (`GM_setValue`).

## Backend Enhancements

### Redis Pub/Sub Bridge
- Define channel `download-notifications`.
- Update worker:
  - After `repo.update_status(... running)` publish `{type:"running"}`.
  - On success: include `file_count`, `output_path`, `finished_at`.
  - On failure: include `failure_reason`.
  - On cancellation: publish `cancelled`.
- Use `redis.asyncio` subscriber inside FastAPI:
  - Start background task at startup.
  - Relay messages via `notification_manager.broadcast`.
  - Include `source: "worker"` flag for traceability.

### API Endpoints
- `GET /downloads/active`: return jobs with status in `{queued,running}` plus metadata (post_title, urls, provider_host, queued_at, started_at).
- `POST /downloads/{id}/cancel`: mark job as cancelling (set DB flag) and signal worker via Redis (e.g. `set cancel:{id}`).
- `POST /downloads/{id}/retry`: requeue failed job (clears failure record, enqueues).
- Extend existing `DownloadRead` model:
  - Add `status`, `queued_at`, `started_at`, `finished_at`, `failure_reason`, `file_count`.
- Add query filters to `GET /downloads` (e.g., by status, post_title).

### Database Changes
- Update `Download` schema (if not already):
  - Ensure status enum covers `queued`, `running`, `succeeded`, `failed`, `cancelled`.
  - Add `cancel_requested` boolean (default false).
  - Optionally `provider_host` computed when creating record for easier filtering.

### Worker Adjustments
- Check Redis cancel flag before/after each provider call; if set, abort gracefully and mark as cancelled.
- Report incremental progress:
  - `DownloadManager.run` returns object with total file count. Expose callback or yield events for each downloaded file; publish `{"type":"progress","completed":n,"total":m}`.
  - If gallery-dl lacks hooks, approximate by counting files saved on disk periodically.

## Event Schema
```json
{
  "type": "queued|running|progress|succeeded|failed|cancelled",
  "download_id": "UUID",
  "post_title": "string|null",
  "label": "string|null",
  "urls": ["..."],
  "provider_hosts": ["pixeldrain.com"],
  "queued_at": "2025-10-28T10:00:00Z",
  "started_at": "...",
  "finished_at": "...",
  "file_count": 12,
  "completed_files": 3,
  "failure_reason": "string|null",
  "source": "api|worker"
}
```

## Security & Performance
- Reuse existing API token for WebSocket + REST calls.
- Rate-limit `retry`/`cancel` endpoints to prevent abuse (token scoped to personal use, so light checks).
- Use async Redis listener to avoid blocking FastAPI loop.
- Panel should throttle DOM mutations (debounce progress updates).

## Implementation Plan
1. **Backend foundations**
   - Update models/migrations for new fields.
   - Add `/downloads/active`, `/downloads/{id}/cancel|retry`.
   - Implement Redis pub/sub publisher/consumer.
2. **Worker updates**
   - Publish events at status transitions.
   - Respect cancellation flag.
   - Optional: add progress callbacks.
3. **Userscript v1 panel**
   - Build tracked link registry & panel skeleton.
   - Fetch active jobs on load.
   - Handle WebSocket events for queued/running/succeeded/failed.
   - Basic jump-to-thread + dismiss done items.
4. **Enhancements**
   - Progress bars, provider icons, persistent settings.
   - Retry/cancel buttons once endpoints stable.
   - Global keyboard shortcut to toggle panel.

## Open Questions
- Do we want to persist finished jobs server-side for history endpoints?
- Should cancellation delete partial files on disk immediately?
- How aggressive should progress throttling be for long galleries?

## Testing Strategy
- Unit tests for Redis listener publishing/broadcast.
- Integration tests covering `/downloads/active` and cancel/retry flows.
- Manual testing on SimpCity threads with mix of known success/failure URLs.
