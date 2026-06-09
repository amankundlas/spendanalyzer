# Spend Analyzer — Phase 1: Groundwork & Deployable Skeleton — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a tested, auto-deployable app skeleton (FastAPI + React/Vite + nginx + Ollama, in Docker Compose) on the minipc — proving the full build→test→deploy pipeline end-to-end before any feature code.

**Architecture:** Four small containers — nginx serves the React static build and proxies `/api/*` to FastAPI; FastAPI exposes a health endpoint backed by SQLite (volume); Ollama runs idle (`keep_alive=0`, model pulled later in Phase 3). A `scripts/deploy.sh` pushes to GitHub then SSHes the minipc to pull + `docker compose up --build`.

**Tech Stack:** Python 3.12 / FastAPI / Uvicorn / pydantic-settings / pytest; React 18 / Vite / TypeScript / Tailwind v4 / Vitest; nginx; Ollama; Docker Compose.

**Conventions for this plan:**
- The Mac runs ONLY fast verification: `pytest`, `npm run build`, `npm run typecheck`, `npm run test`, and `docker compose config`. The live app and containers run ONLY on the minipc (via deploy).
- Behavioral code uses strict TDD (test → fail → implement → pass → commit). Config/infra files use write → validate → commit.
- Commit after every task. Do NOT push until Task 7 (first public push is user-confirmed).
- Port hygiene: GreekManage uses host ports 80/443/3000/8000 on the minipc. Spend Analyzer must not clash — it exposes only the frontend on host port `${FRONTEND_PORT:-8090}`; api/llm are internal-only.

---

## File Structure

```
spendanalyzer/
  CLAUDE.md                      # project memory & rules
  README.md
  .env.example                   # config template (committed)
  .gitignore                     # already created
  .claude/
    settings.json                # committed project settings
  backend/
    app/
      __init__.py
      main.py                    # FastAPI app + router wiring
      config.py                  # pydantic-settings
      api/
        __init__.py
        health.py                # GET /api/health
    tests/
      __init__.py
      test_health.py
    requirements.txt
    requirements-dev.txt
    pytest.ini
    Dockerfile
    .dockerignore
  frontend/
    src/
      main.tsx
      App.tsx
      index.css
      api/client.ts              # typed fetch wrapper
      components/Sidebar.tsx
      pages/Overview.tsx
      App.test.tsx               # vitest smoke test
    index.html
    package.json
    tsconfig.json
    tsconfig.node.json
    vite.config.ts
    vitest.setup.ts
    Dockerfile                   # multi-stage → nginx
    nginx.conf
    .dockerignore
  docker-compose.yml             # base
  docker-compose.minipc.yml      # minipc override (ports)
  scripts/
    deploy.sh                    # push → pull → compose up
    bootstrap-minipc.sh          # one-time minipc env setup
  docs/superpowers/
    specs/2026-06-08-spend-analyzer-design.md   # (exists)
    plans/2026-06-08-phase1-groundwork.md       # (this file)
```

---

## Task 1: Project meta files (CLAUDE.md, README, .env.example, .claude/settings.json)

**Files:**
- Create: `CLAUDE.md`, `README.md`, `.env.example`, `.claude/settings.json`
- Create dirs: `backend/app/api`, `backend/tests`, `frontend/src`, `scripts`

- [ ] **Step 1: Create directory skeleton**

Run:
```bash
mkdir -p backend/app/api backend/tests frontend/src/{api,components,pages} scripts .claude
```

- [ ] **Step 2: Write `CLAUDE.md`**

```markdown
# Spend Analyzer — Project Memory

Lightweight, single-user, LAN-only spending-analysis dashboard. Runs on a home minipc
in Docker. Ingests CSV/PDF statements, categorizes expenses, tracks trends across
accounts, and manages monthly per-category budgets.

## NON-NEGOTIABLE RULES

1. **No financial data to cloud LLMs.** All AI inference runs locally via Ollama on the
   minipc. Never send statement text/transactions to Claude API, OpenAI, Gemini, etc.
2. **Public repo, private data.** The GitHub repo (`amankundlas/spendanalyzer`) is PUBLIC.
   NEVER commit financial data, secrets, the SQLite DB, or statements. `.gitignore` blocks
   `.env*` (except `.env.example`), `*.sqlite3`, `data/`, `import/`, `uploads/`, `*.pdf`,
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
- Backend tests: `cd backend && pytest`
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
```

- [ ] **Step 3: Write `README.md`**

```markdown
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
```

- [ ] **Step 4: Write `.env.example`**

```bash
# ---- Spend Analyzer config (copy to .env on the minipc; .env is gitignored) ----

# Frontend host port on the minipc (avoid clashing with other apps)
FRONTEND_PORT=8090

# SQLite database file (inside the api container volume)
DATABASE_PATH=/data/spendanalyzer.sqlite3

# Ollama
OLLAMA_URL=http://llm:11434
OLLAMA_MODEL=qwen2.5:7b-instruct

# Auth (added in Phase 6; leave blank in Phase 1)
SESSION_SECRET=
AUTH_PASSWORD_HASH=
```

- [ ] **Step 5: Write `.claude/settings.json`**

```json
{
  "permissions": {
    "allow": [
      "Bash(cd backend && pytest:*)",
      "Bash(cd frontend && npm run build:*)",
      "Bash(cd frontend && npm run typecheck:*)",
      "Bash(cd frontend && npm run test:*)",
      "Bash(docker compose config:*)",
      "Bash(git status:*)",
      "Bash(git add:*)",
      "Bash(git commit:*)"
    ]
  }
}
```

- [ ] **Step 6: Verify nothing sensitive is staged, then commit**

Run:
```bash
git add CLAUDE.md README.md .env.example .claude/settings.json
git status
git commit -m "chore: project meta files (CLAUDE.md, README, env template, settings)"
```
Expected: only the four files staged; no `.env`, DB, or data files.

---

## Task 2: FastAPI backend skeleton + health endpoint (TDD)

**Files:**
- Create: `backend/app/__init__.py`, `backend/app/main.py`, `backend/app/config.py`,
  `backend/app/api/__init__.py`, `backend/app/api/health.py`,
  `backend/tests/__init__.py`, `backend/tests/test_health.py`,
  `backend/requirements.txt`, `backend/requirements-dev.txt`, `backend/pytest.ini`,
  `backend/Dockerfile`, `backend/.dockerignore`

- [ ] **Step 1: Write dependency files**

`backend/requirements.txt`:
```
fastapi==0.115.6
uvicorn[standard]==0.34.0
pydantic-settings==2.7.1
```

`backend/requirements-dev.txt`:
```
-r requirements.txt
pytest==8.3.4
httpx==0.28.1
```

`backend/pytest.ini`:
```ini
[pytest]
testpaths = tests
pythonpath = .
```

- [ ] **Step 2: Create empty package markers**

Run:
```bash
: > backend/app/__init__.py
: > backend/app/api/__init__.py
: > backend/tests/__init__.py
```

- [ ] **Step 3: Write the failing test**

`backend/tests/test_health.py`:
```python
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_returns_ok():
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}
```

- [ ] **Step 4: Run test to verify it fails**

Run:
```bash
cd backend && python -m venv .venv && . .venv/bin/activate && pip install -r requirements-dev.txt && pytest -v
```
Expected: FAIL — `ModuleNotFoundError: No module named 'app.main'` (or import error).

- [ ] **Step 5: Write `config.py`**

`backend/app/config.py`:
```python
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Spend Analyzer"
    database_path: str = "/data/spendanalyzer.sqlite3"
    ollama_url: str = "http://llm:11434"
    ollama_model: str = "qwen2.5:7b-instruct"
    session_secret: str = ""
    auth_password_hash: str = ""


settings = Settings()
```

- [ ] **Step 6: Write `api/health.py`**

`backend/app/api/health.py`:
```python
from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 7: Write `main.py`**

`backend/app/main.py`:
```python
from fastapi import FastAPI

from app.api.health import router as health_router
from app.config import settings

app = FastAPI(title=settings.app_name)
app.include_router(health_router, prefix="/api")
```

- [ ] **Step 8: Run test to verify it passes**

Run:
```bash
cd backend && . .venv/bin/activate && pytest -v
```
Expected: PASS — `test_health_returns_ok`.

- [ ] **Step 9: Write `Dockerfile` and `.dockerignore`**

`backend/Dockerfile`:
```dockerfile
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

`backend/.dockerignore`:
```
.venv/
__pycache__/
tests/
*.pyc
.pytest_cache/
requirements-dev.txt
```

- [ ] **Step 10: Commit**

Run:
```bash
git add backend/
git status   # confirm no .venv/ staged (it's gitignored)
git commit -m "feat(api): FastAPI skeleton with /api/health endpoint (TDD)"
```

---

## Task 3: React/Vite/TS/Tailwind frontend skeleton (sidebar + Overview health check)

**Files:**
- Create: `frontend/package.json`, `frontend/tsconfig.json`, `frontend/tsconfig.node.json`,
  `frontend/vite.config.ts`, `frontend/vitest.setup.ts`, `frontend/index.html`,
  `frontend/src/main.tsx`, `frontend/src/App.tsx`, `frontend/src/index.css`,
  `frontend/src/api/client.ts`, `frontend/src/components/Sidebar.tsx`,
  `frontend/src/pages/Overview.tsx`, `frontend/src/App.test.tsx`,
  `frontend/Dockerfile`, `frontend/nginx.conf`, `frontend/.dockerignore`

- [ ] **Step 1: Write `package.json`**

`frontend/package.json`:
```json
{
  "name": "spendanalyzer-frontend",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.0.0",
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.1.0",
    "@types/react": "^18.3.18",
    "@types/react-dom": "^18.3.5",
    "@vitejs/plugin-react": "^4.3.4",
    "jsdom": "^25.0.1",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.7.2",
    "vite": "^6.0.7",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Write TS + Vite config**

`frontend/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

`frontend/tsconfig.node.json`:
```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "noEmit": true
  },
  "include": ["vite.config.ts"]
}
```

`frontend/vite.config.ts`:
```typescript
/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
  },
});
```

`frontend/vitest.setup.ts`:
```typescript
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 3: Write `index.html` and entry/style files**

`frontend/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Spend Analyzer</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`frontend/src/index.css`:
```css
@import "tailwindcss";
```

`frontend/src/main.tsx`:
```typescript
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 4: Write the typed API client**

`frontend/src/api/client.ts`:
```typescript
export interface HealthResponse {
  status: string;
}

export async function getHealth(): Promise<HealthResponse> {
  const res = await fetch("/api/health");
  if (!res.ok) {
    throw new Error(`Health check failed: ${res.status}`);
  }
  return (await res.json()) as HealthResponse;
}
```

- [ ] **Step 5: Write the Sidebar shell**

`frontend/src/components/Sidebar.tsx`:
```typescript
const NAV_ITEMS = [
  "Overview",
  "Categories",
  "Trends",
  "Budgets",
  "Transactions",
  "Accounts",
  "Import",
  "Settings",
];

export default function Sidebar() {
  return (
    <aside className="w-56 shrink-0 bg-slate-900 text-slate-100 min-h-screen p-4">
      <h1 className="text-lg font-bold mb-6">Spend Analyzer</h1>
      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => (
          <a
            key={item}
            href="#"
            className="rounded px-3 py-2 text-sm hover:bg-slate-700"
          >
            {item}
          </a>
        ))}
      </nav>
    </aside>
  );
}
```

- [ ] **Step 6: Write the Overview page (health check)**

`frontend/src/pages/Overview.tsx`:
```typescript
import { useEffect, useState } from "react";
import { getHealth } from "../api/client";

export default function Overview() {
  const [status, setStatus] = useState<string>("checking…");

  useEffect(() => {
    getHealth()
      .then((res) => setStatus(res.status))
      .catch(() => setStatus("unreachable"));
  }, []);

  return (
    <main className="flex-1 p-8">
      <h2 className="text-2xl font-semibold mb-4">Overview</h2>
      <div className="rounded-lg border border-slate-200 p-6">
        <p className="text-sm text-slate-500">API status</p>
        <p className="text-xl font-medium" data-testid="api-status">
          {status}
        </p>
      </div>
    </main>
  );
}
```

- [ ] **Step 7: Write `App.tsx`**

`frontend/src/App.tsx`:
```typescript
import Sidebar from "./components/Sidebar";
import Overview from "./pages/Overview";

export default function App() {
  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      <Sidebar />
      <Overview />
    </div>
  );
}
```

- [ ] **Step 8: Write the failing smoke test**

`frontend/src/App.test.tsx`:
```typescript
import { render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import App from "./App";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ status: "ok" }),
      }),
    ),
  );
});

test("renders sidebar and shows API status", async () => {
  render(<App />);
  expect(screen.getByText("Spend Analyzer")).toBeInTheDocument();
  expect(screen.getByText("Overview")).toBeInTheDocument();
  expect(await screen.findByText("ok")).toBeInTheDocument();
});
```

- [ ] **Step 9: Install deps and run the test (verify pass)**

Run:
```bash
cd frontend && npm install && npm run test
```
Expected: PASS — "renders sidebar and shows API status".

- [ ] **Step 10: Verify typecheck and production build**

Run:
```bash
cd frontend && npm run typecheck && npm run build
```
Expected: typecheck clean; build writes `dist/`.

- [ ] **Step 11: Write `Dockerfile`, `nginx.conf`, `.dockerignore`**

`frontend/Dockerfile`:
```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
```

`frontend/nginx.conf`:
```nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    location /api/ {
        proxy_pass http://api:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

`frontend/.dockerignore`:
```
node_modules/
dist/
.vite/
```

- [ ] **Step 12: Commit**

Run:
```bash
git add frontend/
git status   # confirm no node_modules/ or dist/ staged (gitignored)
git commit -m "feat(web): React/Vite/Tailwind skeleton with sidebar + Overview health check"
```

---

## Task 4: Docker Compose (base + minipc override)

**Files:**
- Create: `docker-compose.yml`, `docker-compose.minipc.yml`

- [ ] **Step 1: Write `docker-compose.yml`**

`docker-compose.yml`:
```yaml
services:
  api:
    build: ./backend
    env_file: .env
    volumes:
      - app-data:/data
    depends_on:
      - llm
    restart: unless-stopped

  llm:
    image: ollama/ollama:latest
    environment:
      - OLLAMA_KEEP_ALIVE=0
    volumes:
      - ollama-models:/root/.ollama
    restart: unless-stopped

  frontend:
    build: ./frontend
    depends_on:
      - api
    restart: unless-stopped

volumes:
  app-data:
  ollama-models:
```

- [ ] **Step 2: Write `docker-compose.minipc.yml`**

`docker-compose.minipc.yml`:
```yaml
# Override for minipc deployment — exposes only the frontend on the LAN.
# Usage: docker compose -f docker-compose.yml -f docker-compose.minipc.yml up -d --build
services:
  frontend:
    ports:
      - "${FRONTEND_PORT:-8090}:80"
```

- [ ] **Step 3: Validate compose config (Mac — no containers started)**

Run:
```bash
FRONTEND_PORT=8090 DATABASE_PATH=/data/x.sqlite3 OLLAMA_URL=http://llm:11434 \
OLLAMA_MODEL=qwen2.5:7b-instruct SESSION_SECRET= AUTH_PASSWORD_HASH= \
docker compose -f docker-compose.yml -f docker-compose.minipc.yml config
```
Expected: prints the merged config with no errors; frontend maps `8090:80`.

> Note: if `.env` is absent on the Mac, supply the vars inline as above. This is validation
> only — do NOT run `up` on the Mac.

- [ ] **Step 4: Commit**

Run:
```bash
git add docker-compose.yml docker-compose.minipc.yml
git commit -m "feat(deploy): Docker Compose base + minipc override"
```

---

## Task 5: Deploy + bootstrap scripts

**Files:**
- Create: `scripts/deploy.sh`, `scripts/bootstrap-minipc.sh`

- [ ] **Step 1: Write `scripts/bootstrap-minipc.sh`**

`scripts/bootstrap-minipc.sh`:
```bash
#!/bin/bash
# One-time minipc setup: clone repo and create .env. Safe to re-run (idempotent).
# Run from the Mac: ./scripts/bootstrap-minipc.sh
set -e

REMOTE="minipc"
APP_DIR="/home/aman/spendanalyzer"
REPO="https://github.com/amankundlas/spendanalyzer.git"

ssh "$REMOTE" "set -e
  if [ ! -d '$APP_DIR/.git' ]; then
    git clone '$REPO' '$APP_DIR'
  fi
  cd '$APP_DIR'
  if [ ! -f .env ]; then
    cp .env.example .env
    echo 'Created .env from .env.example on the minipc.'
  else
    echo '.env already exists on the minipc — left unchanged.'
  fi
"
echo 'Bootstrap complete.'
```

- [ ] **Step 2: Write `scripts/deploy.sh`**

`scripts/deploy.sh`:
```bash
#!/bin/bash
# Deploy to the minipc: push to GitHub, then pull + rebuild on the minipc.
# Usage: ./scripts/deploy.sh [branch]   (default: main)
set -e

REMOTE="minipc"
APP_DIR="/home/aman/spendanalyzer"
BRANCH="${1:-main}"

echo "Pushing to origin/$BRANCH..."
git push origin "$BRANCH"

echo "Deploying on the minipc..."
ssh "$REMOTE" "set -e
  cd '$APP_DIR'
  git fetch origin && git reset --hard \"origin/$BRANCH\"
  if [ ! -f .env ]; then
    echo 'ERROR: .env missing on minipc. Run ./scripts/bootstrap-minipc.sh first.' >&2
    exit 1
  fi
  docker compose -f docker-compose.yml -f docker-compose.minipc.yml up -d --build
"

PORT="$(ssh "$REMOTE" "cd '$APP_DIR' && . ./.env 2>/dev/null; echo \${FRONTEND_PORT:-8090}")"
echo "Deployed: http://192.168.0.100:${PORT}"
```

- [ ] **Step 3: Make scripts executable**

Run:
```bash
chmod +x scripts/deploy.sh scripts/bootstrap-minipc.sh
```

- [ ] **Step 4: Commit**

Run:
```bash
git add scripts/
git commit -m "feat(deploy): automated deploy + minipc bootstrap scripts"
```

---

## Task 6: Final pre-deploy verification (Mac)

**Files:** none (verification only)

- [ ] **Step 1: Backend tests**

Run:
```bash
cd backend && . .venv/bin/activate && pytest -v
```
Expected: all pass.

- [ ] **Step 2: Frontend tests, typecheck, build**

Run:
```bash
cd frontend && npm run test && npm run typecheck && npm run build
```
Expected: tests pass, typecheck clean, build succeeds.

- [ ] **Step 3: Compose config validation**

Run:
```bash
FRONTEND_PORT=8090 DATABASE_PATH=/data/x.sqlite3 OLLAMA_URL=http://llm:11434 \
OLLAMA_MODEL=qwen2.5:7b-instruct SESSION_SECRET= AUTH_PASSWORD_HASH= \
docker compose -f docker-compose.yml -f docker-compose.minipc.yml config >/dev/null && echo OK
```
Expected: `OK`.

- [ ] **Step 4: Final secrets audit before pushing**

Run:
```bash
git ls-files | grep -E '\.env$|\.sqlite3$|\.pdf$|\.csv$' || echo "CLEAN: no data/secret files tracked"
```
Expected: `CLEAN: no data/secret files tracked`.

---

## Task 7: First public push + first deploy (USER-CONFIRMED)

**Files:** none (git + deploy)

- [ ] **Step 1: Add the remote**

Run:
```bash
git remote add origin https://github.com/amankundlas/spendanalyzer.git
git remote -v
```

- [ ] **Step 2: CONFIRM with the user before pushing**

This is the FIRST push to the PUBLIC repo. Stop and ask the user to confirm. Show them the
output of `git ls-files` (code only) and `git log --oneline`. Only proceed on explicit yes.

- [ ] **Step 3: Push**

Run:
```bash
git push -u origin main
```

- [ ] **Step 4: Bootstrap the minipc (one-time)**

Run:
```bash
./scripts/bootstrap-minipc.sh
```
Expected: clones the repo to `/home/aman/spendanalyzer` and creates `.env`.

- [ ] **Step 5: Deploy**

Run:
```bash
./scripts/deploy.sh
```
Expected: pushes (no-op if up to date), rebuilds on minipc, prints the app URL.

- [ ] **Step 6: Verify the live skeleton on the minipc**

Run:
```bash
ssh minipc "curl -fs http://localhost:8090/api/health"
```
Expected: `{"status":"ok"}`.

Then open `http://192.168.0.100:8090` in a browser: the sidebar renders and the Overview
card shows API status **ok**.

- [ ] **Step 7: Report completion**

Tell the user Phase 1 is live, share the URL, and confirm the auto-deploy pipeline works
end-to-end. Phase 1 done.

---

## Self-Review (against the spec)

- **Spec §3 tech stack** → Tasks 2–4 establish FastAPI, React/Vite/TS/Tailwind, SQLite volume, Ollama. ✓
- **Spec §4 architecture (4 containers)** → Task 4 compose defines api, llm, frontend; nginx proxy in Task 3. ✓ (SQLite is a volume, not a container — matches spec.)
- **Spec §10 security / §2 privacy / §11 repo safety** → CLAUDE.md rules (Task 1), strict `.gitignore` (done), secrets audit (Tasks 6–7). Auth itself is Phase 6 per the roadmap. ✓
- **Spec §12 automated deploy** → Tasks 5 & 7: `deploy.sh` (push→pull→compose up), bootstrap, first-push confirmation, port deconfliction (8090). ✓
- **Spec §13 git** → remote wired in Task 7, first push confirmed. ✓
- **Spec §14 groundwork deliverables** → CLAUDE.md, `.claude/settings.json`, scaffold, Docker skeleton, deploy.sh all covered. ✓
- **Placeholder scan** → no TBD/TODO; every code/config step has full content. ✓
- **Type consistency** → `HealthResponse.status` (client.ts) matches `{"status": "ok"}` (health.py) and the test assertion; `FRONTEND_PORT` consistent across `.env.example`, compose override, deploy.sh. ✓
- **Out of Phase-1 scope (deferred):** data model tables, ingestion, categorization, budgets, dashboard charts, watched folder, auth — all in Phases 2–6 below. ✓

---

## Roadmap — Phases 2–6 (detailed plans written when we reach each)

Each phase ends with Mac tests passing + an automatic deploy to the minipc.

- **Phase 2 — Core data + accounts + CSV import.** SQLite schema & migrations (account,
  transaction w/ dedupe_hash, category, category_rule, budget, import_batch); accounts CRUD;
  CSV upload with column auto-detect + confirm-mapping; dedupe; transactions list API + table UI.
- **Phase 3 — Categorization + PDF import.** Rules engine (merchant/regex → category) applied
  first; Ollama client (pull `qwen2.5:7b-instruct`, `keep_alive=0`) for unknowns and for
  `pdfplumber`-extracted PDF text → structured JSON (Pydantic-validated); PDF review-before-save
  queue; "learn as rule" on accept/correct.
  - **Deploy hardening carried over from Phase-1 review (do here when LLM is wired):**
    pin `ollama/ollama:latest` to a verified version tag (verify it exists on the minipc first);
    add `proxy_read_timeout`/`proxy_send_timeout` (and `X-Forwarded-Proto`) to `nginx.conf` so
    multi-second LLM parses don't hit the default 60s proxy timeout; optionally add
    `env_file: [{path: .env, required: false}]` to the `llm` service for tunable symmetry.
- **Phase 4 — Dashboard.** Overview (totals, top categories, MoM trend, budget health),
  Categories (donut/bar + drill-in), Trends (Tremor/Recharts), per-account vs all-accounts via sidebar.
- **Phase 5 — Budgets.** Monthly per-category limits (recurring + per-month override);
  actual-vs-budget bars (green→amber→red) + over/under badges.
- **Phase 6 — Watched folder + auth + polish.** Background folder importer (per-account
  subfolders → pending-review queue); single-password auth (hash in `.env`, signed HTTP-only
  session cookie); settings UI (categories, rules, password); final polish + deploy.
```
