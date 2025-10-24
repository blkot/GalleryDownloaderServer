# Gallery Downloader Service Design

## Goals
- Deliver a container-ready service that exposes an HTTP interface for queueing and tracking gallery downloads powered by `gallery-dl`.
- Provide structured metadata storage for completed downloads and their assets.
- Support configurable storage targets and authentication for downstream systems.
- Keep the codebase maintainable with clear separation of API, orchestration, and worker concerns.

## High-Level Architecture
The service follows a three-tier layout: a FastAPI application provides an HTTP API and enqueues work, a Redis-backed task queue (RQ) fans out jobs to one or more worker processes, and a storage layer archives downloaded assets while metadata is persisted in SQLite or Postgres. The entire stack is containerized and orchestrated through Docker Compose for local development and a single Docker image for deployment.

```
[Client] -> [FastAPI service] -> [Redis queue] -> [Worker(s)] -> [gallery-dl] -> [Storage + Metadata DB]
```

## Core Components

### FastAPI Application (`app/api`)
- Exposes REST endpoints to submit downloads (`POST /downloads`), query status (`GET /downloads/{id}`), list jobs, and retrieve metadata.
- Validates payloads with Pydantic models (request schema includes URL(s), output profile, optional auth cookies, and priority flags).
- Publishes jobs to Redis via RQ and returns a job identifier.
- Exposes lightweight health and readiness endpoints for deployment checks.

### Download Manager (`app/services/download_manager.py`)
- Wraps `gallery_dl.job` or CLI invocation to trigger downloads with structured configuration.
- Resolves storage backends and prepares the filesystem layout (`/data/downloads/<job-id>/...`).
- Normalizes gallery-dl outputs into structured metadata objects.

### Worker Process (`app/worker.py`)
- Runs as a separate container/process; listens for RQ jobs.
- Retrieves job context from Redis, initializes logging context, and executes the Download Manager.
- Updates job status in the metadata repository, emits events/metrics, and captures failure reasons.

### Metadata Repository (`app/repositories/downloads.py`)
- Uses SQLModel (or SQLAlchemy) for ORM mappings to a `downloads` table plus a `download_items` table for per-asset rows.
- Provides CRUD operations for status updates, progress percentages, file paths, and timestamps.
- Supports SQLite for local development; ready to swap to Postgres via environment configuration.

### Configuration (`app/config.py`)
- Centralizes environment variable parsing with Pydantic `BaseSettings` (e.g. Redis URL, storage path, default gallery-dl options, auth credentials).
- Supports `.env` files in development and 12-factor style overrides in production.

### Storage Abstraction (`app/storage`)
- Local filesystem backend implemented first (with optional volume mount inside Docker).
- Future interface for S3-compatible object stores (MinIO, AWS S3) using `aioboto3`.

### Observability (`app/telemetry`)
- Structured logging via `structlog` or `loguru` with correlation ids per job.
- Metrics export via Prometheus client (download duration, queue latency, error counts) exposed on `/metrics`.
- Optional OpenTelemetry tracing hooks.

## Request Lifecycle
1. Client submits a download request with one or more URLs and optional parameters.
2. FastAPI validates the request, writes an initial job record, enqueues a task on RQ, and returns the job id.
3. Worker picks up the task, runs Gallery-DL with a generated config, streams progress back to the job tracker, and writes outputs to storage.
4. Upon completion, the worker updates the job record with success/failure metadata and assets catalog.
5. Clients poll or subscribe to status changes via `GET` endpoints (future: WebSocket or SSE for streaming updates).

## Data Model
- `downloads`: id (UUID), status enum (`queued`, `running`, `succeeded`, `failed`), source_urls (JSON), output_path, requested_at, started_at, finished_at, failure_reason, gallery_dl_config (JSON).
- `download_items`: id, download_id, filename, file_size, checksum, content_type, relative_path, created_at.
- `audit_logs` (optional): job_id, event_type, payload, recorded_at.

## External Integrations
- `gallery-dl` Python API for executing downloads; wrap CLI fallback for edge cases.
- Redis (via `redis-py`) for queueing; can swap to local memory queue for tests.
- Optional storage integrations (S3, SMB shares) handled through pluggable backends.

## Docker & Deployment Strategy
- Base image: `python:3.13-slim` with UV bootstrapped (`curl -LsSf https://astral.sh/uv/install.sh | sh`) during build.
- Multi-stage Dockerfile: builder stage installs dependencies with `uv pip install --system --frozen`, final stage copies source, config, and entrypoints.
- Distinct entrypoints for API (`uvicorn app.main:app`) and worker (`python -m app.worker`).
- Docker Compose for local dev standing up API, worker, Redis, and a bind-mounted data volume.
- CI pipeline building and pushing image tags; integration tests executed inside Compose stack.

## Configuration & Secrets Management
- Env vars for Redis URL, DB URL, storage path, default gallery-dl options, proxy settings.
- `.env.example` documenting required values; actual secrets managed via Docker secrets or orchestration (Kubernetes, Nomad).
- Support for per-job auth artifacts (cookies, tokens) stored in Vault-like secret stores; only short-lived tokens stored in job payloads.

## Testing Strategy
- Unit tests for request validation, download manager behavior (with gallery-dl mocked), storage utils, and repositories.
- Integration tests launching a temporary Redis and using a fake storage backend to validate full job lifecycle.
- Contract tests for API schemas using `schemathesis` or `pytest` snapshots.
- Smoke tests executed in CI against Docker Compose stack to validate container entrypoints.

## Implementation Roadmap
1. **Project bootstrap**: set up FastAPI skeleton, uv configuration, base Dockerfile, and Compose stack with Redis.
2. **Job model & queue integration**: define Pydantic/SQLModel schemas, migrations (Alembic), and RQ wiring.
3. **Gallery-dl wrapper**: implement download manager with configurable options and structured results.
4. **Worker execution flow**: handle status transitions, error handling, and storage writes.
5. **API endpoints**: create submission, status, list, and health endpoints; integrate authentication if required.
6. **Observability**: add structured logging, metrics endpoint, and configurable log sinks.
7. **Storage extensions**: support S3 backend and pluggable output locations.
8. **Hardening & polish**: add rate limiting, request auth, concurrency tuning, docs, and release automation.

## Development Workflow
- Use `uv` for dependency management (`uv pip install fastapi rq redis sqlmodel gallery-dl` etc.) with lockfiles committed.
- Format and lint with `ruff` and `black`; pre-commit hooks enforced via `pre-commit`.
- Local testing with `uv run pytest`. Provide `make` or `just` commands to simplify common flows (`just dev`, `just worker`).

## Security & Compliance Considerations
- Validate and sanitize incoming URLs; enforce allowed domain list to prevent misuse.
- Support API authentication (token-based) and per-job credential isolation.
- Ensure downloaded content stored in dedicated volume with configurable retention policies.
- Provide audit logging for job submissions, status changes, and access attempts.

## Open Questions
- Should the metadata database be Postgres-only in production to support concurrency?
- Is resumable download support required for very large galleries?
- Do we need webhook callbacks or push-based notifications in addition to polling?
- What SLA or throughput targets should guide horizontal scaling decisions?
