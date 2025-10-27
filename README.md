## Gallery Downloader Server

A FastAPI-based service that queues gallery-dl jobs and tracks their status via a Redis-backed worker. Jobs are deduplicated by URL and can be organized under a user-supplied post title folder. Downloaded files are placed under `storage_root/<post_title>/<domain>/<resource-id>/…`.

### References

- [gallery-dl](https://github.com/mikf/gallery-dl) for multi-site download support.
- [Redis Queue (RQ)](https://github.com/rq/rq) powering background job processing.
- Inspired by lightweight FastAPI queue projects such as [rq-fastapi-example](https://github.com/pgjones/rq-example) and containerized downloader setups shared in the gallery-dl community.

### Local Development

1. Install [uv](https://github.com/astral-sh/uv) and ensure Python 3.13 is available.
2. Copy `.env.example` to `.env`, set `GDL_API_TOKEN`, local `GDL_STORAGE_ROOT`, Redis URL, and optionally raise `GDL_JOB_TIMEOUT_SECONDS` (set to `0` to disable the timeout). You can also provide `GDL_GALLERY_DL_EXTRA_ARGS` to tack on gallery-dl CLI switches.
3. Install dependencies:

```bash
uv sync
```

4. Start Redis (e.g. `docker run --name redis -p 6379:6379 redis:7-alpine`).
5. Run the API:

```bash
uv run uvicorn app.main:app --host 0.0.0.0 --port 8080
```

6. Run the background worker in another terminal:

```bash
uv run python -m app.worker
```

### Docker Compose

1. Bind-mount the NAS/download directory by editing `docker-compose.yml`, replacing the `gallery_data` volume with a host path (e.g.):

```yaml
volumes:
  gallery_data:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /share/downloads
```

2. Populate `.env` with your token, storage root (inside the container, typically `/data/downloads`), Redis URL, and optional gallery-dl args.
3. Build and launch:

```bash
docker compose up --build
```

The API is served at `http://localhost:8080`. Add `Authorization: Bearer <token>` to your requests. Jobs are persisted in SQLite so the API and worker can run in separate containers.

### Making Requests (Postman or curl)

- **JSON body**:

  ```http
  POST /downloads
  Authorization: Bearer <token>
  Content-Type: application/json

  {
    "urls": ["https://pixeldrain.com/u/xyz"],
    "post_title": "FunnyPost"
  }
  ```

- **Query parameters** (no body needed):

  ```
  POST http://localhost:8080/downloads?url=https://pixeldrain.com/u/xyz&post_title=FunnyPost
  Authorization: Bearer <token>
  ```

  Add multiple `url` parameters to send more than one link.

### Documentation

See `docs/project-design.md` for the detailed system design and implementation roadmap.

### Real-time Notifications

- The API exposes a WebSocket stream at `ws://<host>:<port>/ws/notifications`. Supply the bearer token either via the `Authorization: Bearer` header or a `token` query parameter (e.g. `ws://nas.local:8080/ws/notifications?token=changeme`).
- Each newly queued job emits a payload like:

  ```json
  {
    "type": "queued",
    "download_id": "8e6ef6d1-2f7a-4c2c-9579-1d9a4d869d20",
    "post_title": "FunnyPost",
    "urls": ["https://pixeldrain.com/u/xyz"],
    "label": null,
    "queued_at": "2025-10-26T12:34:56.789Z"
  }
  ```

- When running behind a reverse proxy on your NAS, ensure WebSocket upgrades are forwarded (for Nginx add `proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";`). HTTPS termination can live in the proxy; the FastAPI app itself continues to listen on HTTP.
- The bundled Tampermonkey script automatically connects to this WebSocket, shows desktop notifications for new queues, and reuses the configured API base/token.

### License

This project is released under the [MIT License](LICENSE). It builds on open-source components such as gallery-dl (MIT) and RQ (BSD).
