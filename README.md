# G-Meter

Open-source observability for OpenAI-compatible Gonka API brokers.

G-Meter runs scheduled probe suites against configured brokers and presents a
public, read-only dashboard for availability, performance, capabilities, model
limits, trends, and pricing signals.

## Features

- Multi-broker catalog with per-provider model IDs and display aliases
- English and Russian UI
- Overview gauges, provider drill-downs, trend charts, history, and limit checks
- Probe logs with captured request/response details for debugging
- Pricing extraction from `/pricing` endpoints, completion response bodies, or billing headers when brokers expose it
- Public read-only mode for hosted dashboards

## What It Measures

- API uptime
- Latency
- Failed probe percentage
- Output speed and stream speed
- Capability pass rate: JSON mode, tool calling, multimodality, input/output probes
- Maximum context and maximum output tokens
- Estimated spend per 1M tokens when pricing data is available

## Quick Start

```bash
cp .env.example .env
# edit .env and add at least one broker API key
docker compose up --build
```

Open:

- Frontend: <http://localhost:5173>
- API health: <http://localhost:8000/api/health>

Broker entries without API keys are seeded as disabled. Add keys in `.env`, or
provide your own broker catalog via `BROKERS_CONFIG_JSON` or
`BROKERS_CONFIG_PATH`.

## Configuration

The backend includes `backend/brokers.json` as the default broker catalog. It is
safe to commit because it only references environment variables.

Useful variables:

| Variable | Description |
|---|---|
| `GONKA_API_KEY` | API key for `proxy.gonka.gg` |
| `GONKAGATE_API_KEY` | API key for `gonkagate.com` |
| `MINGLES_API_KEY` | API key for `mingles.ai` |
| `GONKA_API_ORG_API_KEY` | API key for `gonka-api.org` |
| `HYPERFUSION_API_KEY` | API key for `console.hyperfusion.io` |
| `GONKASCAN_API_KEY` | API key for `router.gonkascan.com` |
| `BROKERS_CONFIG_PATH` | JSON broker catalog path inside the backend container |
| `BROKERS_CONFIG_JSON` | Inline JSON broker catalog; takes priority over file config |
| `PROBE_INTERVAL_MINUTES` | Quick probe interval |
| `LIMITS_INTERVAL_MINUTES` | Context/output limit probe interval |
| `MIN_OUTPUT_TOKENS` | Required output threshold for max-output checks |
| `PUBLIC_READ_ONLY` | Disables public write/admin endpoints when `true` |

Example broker catalog:

```json
{
  "brokers": [
    {
      "name": "proxy.gonka.gg",
      "base_url": "https://proxy.gonka.gg/v1",
      "api_key": "${GONKA_API_KEY}",
      "models": [
        { "id": "moonshotai/Kimi-K2.6", "alias": "kimi-k2.6" },
        { "id": "Qwen/Qwen3-235B-A22B-Instruct-2507-FP8", "alias": "qwen3-235b" }
      ]
    }
  ]
}
```

`models` may also be an alias-to-model object:

```json
{
  "models": {
    "kimi-k2.6": "moonshotai/Kimi-K2.6",
    "qwen3-235b": "Qwen/Qwen3-235B-A22B-Instruct-2507-FP8"
  }
}
```

Environment references like `${GONKA_API_KEY}` and `${VAR:-fallback}` are
expanded before parsing.

## Local Development

Backend:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

## API

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Health check |
| GET | `/api/brokers` | List brokers |
| POST | `/api/brokers` | Add broker when public read-only mode is off |
| GET | `/api/metrics/dashboard/detail` | Dashboard metrics and grouped logs |
| GET | `/api/metrics/dashboard/logs` | Full probe logs for a metric |
| GET | `/api/metrics/limits` | Context/output limit results |
| GET | `/api/runs` | Probe run history |
| POST | `/api/runs/broker/{id}` | Start a run when public read-only mode is off |

## Repository Layout

```text
backend/    FastAPI, SQLite, APScheduler, probe runner
frontend/   React + Vite dashboard served by nginx
```

## Security

Do not commit real API keys. Use `.env`, deployment secrets, or
`BROKERS_CONFIG_JSON` supplied by your runtime environment.

## License

MIT
