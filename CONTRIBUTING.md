# Contributing

Thanks for helping improve G-Meter.

## Development Setup

Use Docker for the full stack:

```bash
cp .env.example .env
docker compose up --build
```

Or run services separately:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

```bash
cd frontend
npm install
npm run dev
```

## Pull Requests

- Keep changes focused.
- Do not commit real API keys, `.env`, databases, logs, or generated build output.
- Update README or deployment docs when configuration changes.
- Prefer broker-specific raw model IDs in config and display aliases in UI.
- Run at least the relevant Docker build before opening a PR:

```bash
docker compose build backend frontend
```

## Security

Please report vulnerabilities privately. See `SECURITY.md`.
