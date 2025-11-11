**Frontend Tasks – Download Manager UI**
=======================================

## Immediate
- [ ] Stand up a lightweight SPA scaffold (vanilla JS or a framework) served from `/frontend`.
- [ ] Implement API client helpers for `GET /downloads`, `POST /downloads` (retry), `DELETE /downloads/{id}` (pending endpoint), and WebSocket subscription.
- [ ] Build downloads list view with status filters (All / Queued / Running / Succeeded / Failed) and search by title/label/provider.
- [ ] Add detail drawer/modal displaying file list, thumbnails (when available), failure reason, and provider URLs.
- [ ] Wire action buttons: retry failed job, delete/cancel, open provider link, copy folder path (when available).

## Near Term
- [ ] Real-time updates via WebSocket events to refresh individual rows.
- [ ] Bulk selection mode for mass retry/delete.
- [ ] Thumbnail preview grid with fallback icons when assets missing.
- [ ] Persist user preferences (filters, sort order) in localStorage.
- [ ] Add optimistic UI feedback/toasts for actions.

## Stretch
- [ ] Authentication UI (token prompt + storage) with validation.
- [ ] Responsive design enhancements (mobile layout, collapsible sidebar).
- [ ] Integration with userscript (deep link from panel to frontend entry).
- [ ] Export/download history as CSV/JSON.
- [ ] Dark/light theme toggle.
