# Spend Analyzer

Lightweight, LAN-only spending-analysis dashboard for a home minipc. CSV/PDF statement
ingestion, local-LLM categorization (Ollama — no cloud), multi-account trends, and monthly
per-category budgets. FastAPI + React/Vite + SQLite, deployed via Docker Compose.

## Privacy

All AI runs locally (Ollama). Financial data never leaves the host and is never committed
to git. The repo holds source code only.

## Development

Code is developed on a Mac; the live app runs only on the minipc.

- Backend tests: `cd backend && pytest`
- Frontend: `cd frontend && npm install && npm run build && npm run typecheck && npm run test`

## Deploy

`./scripts/deploy.sh` pushes to GitHub then rebuilds on the minipc. App:
`http://192.168.0.100:8090`.

## Configuration

Copy `.env.example` → `.env` on the minipc (done once by `scripts/bootstrap-minipc.sh`).
