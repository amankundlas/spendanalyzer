# Spend Analyzer — Design Spec

**Date:** 2026-06-08
**Status:** Approved design — pending implementation plan
**Repo:** `amankundlas/spendanalyzer` (public GitHub)
**Deploy target:** Home minipc, Docker Compose (mirrors GreekManage deploy pattern)

---

## 1. Purpose

A lightweight, single-user, **LAN-only** spending-analysis dashboard for the home minipc.
It ingests credit/checking statement data (CSV and PDF), categorizes expenses, tracks
spending trends across multiple accounts, and manages per-category monthly budgets with
visual over/under indicators.

**Non-goals:** public access, mobile app, multi-user accounts, real-time bank sync,
email/push alerts.

## 2. Hard constraints (drove the design)

- **Privacy:** financial data must NEVER be sent to a publicly-hosted/cloud LLM. All
  AI runs locally via Ollama on the minipc.
- **Public repo, private data:** the GitHub repo is public. No financial data, secrets,
  database, or statements may ever be committed. Code + config templates only.
- **Memory-conscious:** the minipc has limited RAM that must stay available for other
  apps. The stack must idle near-zero and only briefly spike during PDF parsing.
- **Deploy on minipc only:** the live app and Docker stack run on the minipc. The Mac
  is used for code + fast automated tests (pytest, lint, frontend build/typecheck) only —
  never for running the live app or containers.

## 3. Tech stack

| Layer | Choice | Rationale |
|---|---|---|
| Backend API | **FastAPI** + Uvicorn | Lightweight, async, Pydantic data modeling |
| Frontend | **React + Vite SPA**, Tremor/Recharts | Vibrant, data-driven dashboard; static build → tiny runtime RAM |
| Database | **SQLite** (single file, Docker volume) | Perfect for single-user; no DB server process |
| Local LLM | **Ollama**, default `qwen2.5:7b-instruct` | Offline extraction + categorization; model name is a swappable env var |
| Reverse proxy / static | **nginx** | Serves SPA build, proxies `/api/*` to FastAPI |
| Orchestration | **Docker Compose** (`base` + `minipc` override) | Same pattern as GreekManage |

The LLM model is changeable later via env var + `ollama pull` with no code changes
(7B now for accuracy; drop to 3B/smaller if it runs hot).

## 4. Architecture — 4 small containers

```
minipc (Docker Compose stack)

  nginx ──► serves React static build + reverse-proxies /api → backend
    │
    ▼
  FastAPI (api) ──► SQLite file (volume)
    │
    └──► Ollama (llm) ──► loads model only on demand (keep_alive=0)

  watched-folder importer = background task inside the api process
```

- **nginx** — serves built SPA, proxies API. Minimal footprint.
- **api** — FastAPI: ingestion, parsing, categorization, budgets, dashboard data, auth.
  The watched-folder importer runs as a background task in this process (no extra container).
- **llm** — Ollama with `keep_alive=0`: the model loads (~5–6 GB for 7B) only during a
  parse and unloads immediately after. Idle steady-state ≈ tens of MB.
- **SQLite** — one file on a Docker volume.

**Memory profile:** at rest a few hundred MB total; a brief ~5–6 GB spike for the few
seconds of active PDF parsing, then released. Leaves the bulk of the 11.4 GB free for
other apps.

## 5. Data model (SQLite)

- **account** — id, name, type (credit/checking/savings), institution, currency, archived
- **transaction** — id, account_id, date, description (raw), merchant (normalized),
  amount, direction (debit/credit), category_id, source (csv/pdf/manual),
  import_batch_id, **dedupe_hash**
- **category** — id, name, parent_id (group), color, icon
- **category_rule** — id, match_type (merchant_contains/regex), pattern, category_id, priority
- **budget** — id, category_id, month (YYYY-MM or "recurring"), limit_amount
- **import_batch** — id, account_id, source, filename, imported_at, counts (added/duplicate/failed)

**Dedupe:** `dedupe_hash = hash(account_id, date, amount, normalized_description)`.
Overlapping statements never double-count; the import summary reports skipped duplicates.

## 6. Ingestion & parsing

**CSV (primary — free, exact):** upload or drop a CSV → auto-detect date/amount/description
columns with a confirm-mapping UI → rows inserted, deduped.

**PDF (local LLM):** `pdfplumber` extracts text → chunk → Ollama returns structured JSON
(Pydantic-validated) → **user reviews parsed rows before save** (LLM extraction isn't 100%;
nothing is committed blindly).

**Two entry points:**
- **Web upload** — drag PDF/CSV in the UI, pick the account, review, confirm.
- **Watched folder** — one folder per account on the minipc (`/import/<account>/`). Dropped
  files auto-parse; PDFs land in a "pending review" queue so the user still confirms.

## 7. Categorization (hybrid)

1. **Rules first** — editable merchant/keyword rules (e.g. `WHOLEFDS → Groceries`).
   Deterministic, free, instant.
2. **LLM for unknowns** — unmatched transactions go to Ollama for a category suggestion.
3. **Learn** — accepting/correcting a category can save a new rule, reducing future LLM use.

Ships with an editable default category set: Groceries, Dining, Transport, Utilities,
Housing, Shopping, Health, Entertainment, Subscriptions, Income, Transfers, etc.

## 8. Budgets

- Set a **monthly limit per category** (default recurring limit; optional per-month override).
- Dashboard shows **actual vs budget** per category: progress bars green→amber→red, an
  "over by $X / under by $Y" badge, and month total vs total budget.
- Visual only — no email/push alerts (lightweight; easy to add later).

## 9. Dashboard & views (sidebar navigation)

Left **sidebar** switches between **All accounts** and each individual account, plus sections:

- **Overview** — total spend, top categories, month-over-month trend, budget health
- **Categories** — spend by category (donut/bar), drill into transactions
- **Trends** — monthly trend lines, category trends over time
- **Budgets** — set limits, actual vs budget
- **Transactions** — searchable/filterable table, inline re-categorize
- **Accounts** — manage accounts
- **Import** — upload + pending-review queue
- **Settings** — categories, rules, password

Vibrant but data-driven: Tremor/Recharts, color-coded palette, KPI cards, desktop-first responsive.

## 10. Security

- Single password → signed HTTP-only session cookie. One env var holds a password hash.
- Bound to the LAN; not publicly exposed. Optional later: self-signed HTTPS (as GreekManage minipc).

## 11. Public-repo safety

The repo is public; data is not. A strict `.gitignore` (committed before the first commit)
excludes: `.env*` (except `.env.example`), `*.sqlite3` / `data/`, `import/`, uploaded files,
and any model files. Verified before any push.

## 12. Deployment — automated (Claude-driven, mirrors GreekManage)

The user never deploys manually. Claude runs the deploy during sessions.

- **Mechanism:** `scripts/deploy.sh` mirrors GreekManage's `deploy-dev.sh`:
  1. commit + `git push origin main` (public repo — code only, never data/secrets)
  2. `ssh minipc` → `cd /home/aman/spendanalyzer` → `git fetch && reset --hard && pull`
  3. copy `.env.minipc` → `.env`
  4. `docker compose -f docker-compose.yml -f docker-compose.minipc.yml up -d --build`
  5. apply DB schema/migrations automatically (SQLite, on container start or a deploy step)
- **SSH:** existing key-based alias `minipc` (192.168.0.100, user `aman`), already configured.
- **First-time bootstrap (automatic, once):** clone repo to `/home/aman/spendanalyzer`,
  generate `.env.minipc` (password hash + session secret), `ollama pull qwen2.5:7b-instruct`.
- **Cadence:** auto-deploy **after each build phase once Mac tests pass** — a working minipc
  build at every milestone, gated by tests so broken work isn't deployed.
- **First public push** is confirmed with the user; subsequent pushes/deploys are automatic.
- Mac is code + fast tests only; the live app + containers run solely on the minipc.

## 13. Git setup

- `git init` (`main` branch), strict `.gitignore` in place **before** first commit (done).
- Remote `origin` → `https://github.com/amankundlas/spendanalyzer.git`.
- First push to the public repo confirmed with the user; thereafter automatic via deploy.

## 14. Groundwork deliverables (before app build)

- **`CLAUDE.md`** — project overview, architecture, the privacy + public-repo rules,
  tech stack, dev workflow (tests on Mac, run only on minipc), the autodeploy workflow
  (deploy after each phase once tests pass), Docker/deploy commands, coding conventions,
  data-model summary.
- **`scripts/deploy.sh`** — automated push→pull→compose-up deploy (mirrors GreekManage).
- **`.claude/settings.json`** (+ gitignored `settings.local.json`) — lightweight project settings.
- **`docs/superpowers/specs/`** — this spec.
- Directory scaffold: `backend/`, `frontend/`, `docker-compose*.yml`, `.env.example`,
  `.gitignore`, `README.md`.

## 15. Build phases

1. **Groundwork** — repo, CLAUDE.md, scaffold, Docker skeleton, git + remote.
2. **Core data + CSV import + accounts** — model, SQLite, CSV ingestion, transactions table.
3. **Categorization** (rules + Ollama) + **PDF import** with review queue.
4. **Dashboard** — overview, categories, trends.
5. **Budgets.**
6. **Watched folder + auth + polish**, deploy to minipc.
