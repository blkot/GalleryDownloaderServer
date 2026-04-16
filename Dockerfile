# syntax=docker/dockerfile:1.7


FROM python:3.13-slim AS builder

ENV UV_SYSTEM_PYTHON=1
RUN apt-get update && apt-get install -y --no-install-recommends curl build-essential \
    && rm -rf /var/lib/apt/lists/*

RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:${PATH}"

WORKDIR /app
COPY pyproject.toml .
RUN uv pip install --system --no-cache .

COPY . .
RUN uv pip install --system --no-cache -e .

FROM python:3.13-slim AS runtime
ARG GALLERY_DL_VERSION=1.31.10
ENV UV_SYSTEM_PYTHON=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

RUN groupadd -r app && useradd -r -g app app

COPY --from=builder /usr/local /usr/local
COPY --from=builder /etc/ssl/certs/ /etc/ssl/certs/

WORKDIR /app
COPY --from=builder /app /app

RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
    && curl -L --fail --output /usr/local/bin/gallery-dl \
        "https://github.com/mikf/gallery-dl/releases/download/v${GALLERY_DL_VERSION}/gallery-dl.bin" \
    && chmod 0755 /usr/local/bin/gallery-dl \
    && apt-get purge -y --auto-remove curl \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /data/downloads && chown -R app:app /data

USER app

EXPOSE 8080

ENTRYPOINT ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
