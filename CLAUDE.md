# Spend Analyzer — Project Memory

Lightweight, single-user, LAN-only spending-analysis dashboard. Runs on a home minipc
in Docker. Ingests CSV/PDF statements, categorizes expenses, tracks trends across
accounts, and manages monthly per-category budgets.

## NON-NEGOTIABLE RULES

1. **No financial data to cloud LLMs.** All AI inference runs locally via Ollama on the
   minipc. Never send statement text/transactions to Claude API, OpenAI, Gemini, etc.
2. **Public repo, private data.** The GitHub repo (`amankundlas/spendanalyzer`) is PUBLIC.
   NEVER commit financial data, secrets, the SQLite DB, or statements. `.gitignore` blocks
   `.env` and `.env.*` (except `.env.example`), `*.sqlite3`, `data/`, `import/`, `uploads/`, `*.pdf`,
   `*.csv` (except fixtures). Verify `git status` before any commit/push.
3. **Mac = code + tests only.** Never run the live app or Docker stack on the Mac. Allowed
   on Mac: `pytest`, `npm run build`, `npm run typecheck`, `npm run test`, `docker compose config`.
   The live app runs ONLY on the minipc.
4. **Autodeploy is Claude's job.** The user never deploys manually. Deploy after each build
   phase once Mac tests pass, via `scripts/deploy.sh` (push → SSH minipc → pull → compose up).
   Confirm the FIRST public push with the user; later pushes are automatic.

## Tech stack

- Backend: FastAPI + Uvicorn, pydantic-settings, SQLite. Tests: pytest.
- Frontend: React + Vite + TypeScript + Tailwind v4, Tremor/Recharts (added in dashboard phase).
  Tests: Vitest.
- Local LLM: Ollama, model `qwen2.5:7b-instruct` (env `OLLAMA_MODEL`, swappable to 3B/smaller).
  `OLLAMA_KEEP_ALIVE=0` so the model unloads after each parse (RAM hygiene — keep minipc headroom).
- Orchestration: Docker Compose (`docker-compose.yml` + `docker-compose.minipc.yml`).

## Architecture

```
nginx  → serves React build, proxies /api/* → api
api    → FastAPI; ingestion, parsing, categorization, budgets, dashboard, auth; SQLite volume
llm    → Ollama (idle; model loads on demand only)
```
Watched-folder importer runs as a background task inside the api process (no extra container).

## Repo layout

- `backend/app/` — FastAPI (`main.py`, `config.py`, `api/`)
- `frontend/src/` — React SPA (`pages/`, `components/`, `api/`)
- `docker-compose*.yml`, `scripts/deploy.sh`
- `docs/superpowers/specs|plans/` — design + plans

## Commands

Mac (verification only):
- Backend venv MUST use Python 3.12 to match the prod Docker image (`python:3.12-slim`).
  Create with Homebrew's 3.12: `cd backend && /opt/homebrew/opt/python@3.12/bin/python3.12 -m venv .venv && . .venv/bin/activate && pip install -r requirements-dev.txt`
  (the system `python3` is 3.9, which lacks PEP 604 `X | None` and would not match prod).
- Backend tests: `cd backend && . .venv/bin/activate && pytest`
- Frontend build/types/tests: `cd frontend && npm run build && npm run typecheck && npm run test`
- Compose validate: `docker compose -f docker-compose.yml -f docker-compose.minipc.yml config`

Deploy (Claude runs this; never the user):
- `./scripts/deploy.sh`  → pushes, then on minipc pulls + `docker compose ... up -d --build`
- App URL: `http://192.168.0.100:${FRONTEND_PORT:-8090}`

minipc: SSH alias `minipc` (192.168.0.100, user `aman`), app dir `/home/aman/spendanalyzer`.

## Ports

GreekManage uses 80/443/3000/8000 on the minipc. Spend Analyzer exposes ONLY the frontend
on host `${FRONTEND_PORT:-8090}`. api/llm are internal to the compose network.

## Data model (SQLite)

account, transaction (with dedupe_hash), category, category_rule, budget, import_batch.
See `docs/superpowers/specs/2026-06-08-spend-analyzer-design.md` for full detail.
