## Gallery Downloader Server

A FastAPI-based service that queues gallery-dl jobs and tracks their status via a Redis-backed worker. Jobs are deduplicated by URL and can be organized under a user-supplied post title folder. Downloaded files are placed under `storage_root/<post_title>/<domain>/<resource-id>/…`.

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
