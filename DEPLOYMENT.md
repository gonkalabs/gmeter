# Deployment

This guide describes a generic Docker deployment for G-Meter. Keep production
secrets outside the repository.

## Prerequisites

- Docker and Docker Compose
- A `.env` file based on `.env.example`
- At least one broker API key
- Optional reverse proxy for TLS and a public domain

## Configure

```bash
cp .env.example .env
```

Edit `.env` and set the API keys and provider URLs you want to monitor.

Broker entries without API keys are disabled at startup. You can also provide a
custom catalog:

```bash
BROKERS_CONFIG_PATH=/app/data/brokers.json
# or
BROKERS_CONFIG_JSON='{"brokers":[...]}'
```

## Run

```bash
docker compose up -d --build
```

Default local ports:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8000`

Health check:

```bash
curl -fsS http://localhost:8000/api/health
```

Expected response:

```json
{"status":"ok"}
```

## Updating

Frontend-only changes:

```bash
docker compose build frontend
docker compose up -d --no-deps frontend
```

Backend-only changes:

```bash
docker compose build backend
docker compose up -d --no-deps backend
```

Full rebuild:

```bash
docker compose up -d --build
```

## Reverse Proxy

For a public deployment, put nginx, Caddy, Traefik, or another TLS proxy in
front of the compose services.

Route:

- `/api/` to the backend service
- `/` to the frontend service

Example nginx shape:

```nginx
location /api/ {
  proxy_pass http://127.0.0.1:8000;
}

location / {
  proxy_pass http://127.0.0.1:5173;
}
```

Adjust ports if you bind services differently.

## Data

SQLite data is stored in the `gmeter-data` Docker volume. Rebuilding containers
does not delete probe history.

Before risky backend/database changes, back up the database:

```bash
docker compose cp backend:/app/data/gmeter.db ./gmeter-backup.db
```

## Safety Notes

- Do not commit `.env` or real API keys.
- Keep `PUBLIC_READ_ONLY=true` for public dashboards.
- Keep provider-specific raw model IDs in broker config; use aliases only for
  display labels.
- Re-run `curl /api/health` after every deploy.
