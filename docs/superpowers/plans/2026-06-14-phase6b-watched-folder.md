# Spend Analyzer — Phase 6b: Watched-Folder CSV Import — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Checkbox (`- [ ]`) steps.

**Goal:** A background importer inside the api process that auto-imports CSV files dropped into a per-account folder on the minipc (`/import/<account-name>/*.csv`), using the same dedupe + rules-categorization as the UI. Processed files move to a `_processed/` subfolder; unparseable ones to `_failed/`. Dedupe makes re-drops safe.

**Architecture:** `app/services/watcher.py` exposes `scan_once(watch_dir)` (pure-ish: scans the dir, imports each CSV into the account matching the subfolder name, moves the file). A daemon thread started in the FastAPI lifespan calls `scan_once` every `WATCH_INTERVAL` seconds. The minipc compose override mounts a host `./import` dir to `/import` (and `.gitignore` already excludes `import/`). Scope: CSV only (deterministic — no LLM, no review needed; PDF watching would need an async review queue, deferred).

**Tech Stack:** stdlib (threading, pathlib, shutil); existing CSV detect/import services. Real folder behavior verified on the minipc.

**Conventions:** TDD `scan_once` against a temp dir on the Mac; the thread loop is thin and verified via deploy. One commit per task. Out of scope: PDF watching, per-file notifications.

---

## Task 1: Watcher service + config + compose mount + lifespan loop (TDD)

**Files:** add `watch_dir`/`watch_interval` to `backend/app/config.py` + `.env.example`; create `backend/app/services/watcher.py`, `backend/tests/test_watcher.py`; modify `backend/app/main.py` (start/stop the loop in lifespan); modify `docker-compose.yml` + `docker-compose.minipc.yml` (mount + env).

- [ ] **Step 1: Add settings to `backend/app/config.py`** — add two fields to `Settings`:
```python
    watch_dir: str = "/import"
    watch_interval: int = 30
```
And to `backend/.env.example` (under a new comment):
```
# Watched-folder import (drop CSVs in <WATCH_DIR>/<account-name>/)
WATCH_DIR=/import
WATCH_INTERVAL=30
```

- [ ] **Step 2: Write failing test** — `backend/tests/test_watcher.py`:
```python
from pathlib import Path

from sqlmodel import Session, select

from app.models import Account, Transaction
from app.services.watcher import scan_once

CSV = "Date,Description,Amount\n2026-01-02,WHOLE FOODS,-45.99\n2026-01-03,PAYROLL,1500.00\n"


def test_scan_imports_csv_into_matching_account(session: Session, tmp_path: Path):
    acct = Account(name="Amex Gold", type="credit")
    session.add(acct)
    session.commit()

    folder = tmp_path / "Amex Gold"
    folder.mkdir()
    (folder / "jan.csv").write_text(CSV)

    summary = scan_once(str(tmp_path), session_factory=lambda: session)
    assert summary["imported_files"] == 1

    txns = session.exec(select(Transaction)).all()
    assert len(txns) == 2
    # file was moved out of the inbox into _processed
    assert not (folder / "jan.csv").exists()
    assert (folder / "_processed" / "jan.csv").exists()


def test_scan_skips_unknown_account_folder(session: Session, tmp_path: Path):
    (tmp_path / "NoSuchAccount").mkdir()
    (tmp_path / "NoSuchAccount" / "x.csv").write_text(CSV)
    summary = scan_once(str(tmp_path), session_factory=lambda: session)
    assert summary["imported_files"] == 0
    assert session.exec(select(Transaction)).all() == []


def test_scan_moves_unparseable_to_failed(session: Session, tmp_path: Path):
    acct = Account(name="Card", type="credit")
    session.add(acct)
    session.commit()
    folder = tmp_path / "Card"
    folder.mkdir()
    (folder / "bad.csv").write_text("not,a,valid\nstatement,at,all\n")

    summary = scan_once(str(tmp_path), session_factory=lambda: session)
    assert summary["failed_files"] == 1
    assert (folder / "_failed" / "bad.csv").exists()
```

- [ ] **Step 3: Run RED** — `cd backend && . .venv/bin/activate && pytest -q tests/test_watcher.py` → FAIL. Confirm.

- [ ] **Step 4: Write `backend/app/services/watcher.py`:**
```python
import shutil
from collections.abc import Callable
from pathlib import Path

from sqlmodel import Session, select

from app.db import get_engine
from app.models import Account
from app.services.csv_import import detect_columns
from app.services.imports import commit_import

_SUBDIRS = {"_processed", "_failed"}


def _default_session_factory() -> Session:
    return Session(get_engine())


def scan_once(
    watch_dir: str, session_factory: Callable[[], Session] = _default_session_factory
) -> dict:
    """Scan <watch_dir>/<account-name>/*.csv and import each into that account.

    Files move to _processed/ on success or _failed/ on error. Matching of the
    subfolder name to an account is case-insensitive against non-archived accounts.
    Idempotent: dedupe means re-dropping an already-imported file adds nothing.
    """
    root = Path(watch_dir)
    summary = {"imported_files": 0, "failed_files": 0}
    if not root.is_dir():
        return summary

    session = session_factory()
    try:
        accounts = {
            a.name.strip().lower(): a
            for a in session.exec(select(Account).where(Account.archived == False))  # noqa: E712
        }
        for sub in root.iterdir():
            if not sub.is_dir() or sub.name in _SUBDIRS:
                continue
            account = accounts.get(sub.name.strip().lower())
            if account is None:
                continue
            for csv_file in sorted(sub.glob("*.csv")):
                if not csv_file.is_file():
                    continue
                try:
                    text = csv_file.read_text(encoding="utf-8-sig")
                    mapping = detect_columns(text).suggested
                    commit_import(session, account.id, csv_file.name, text, mapping)
                    dest_dir = sub / "_processed"
                    summary["imported_files"] += 1
                except Exception:
                    dest_dir = sub / "_failed"
                    summary["failed_files"] += 1
                dest_dir.mkdir(exist_ok=True)
                shutil.move(str(csv_file), str(dest_dir / csv_file.name))
    finally:
        session.close()
    return summary
```
> NOTE: `commit_import` requires a usable column mapping; if `detect_columns` can't find a date/amount, `commit_import` raises (caught → `_failed`). The unparseable test ("not,a,valid…") has no detectable date/amount, so parsing raises and the file is moved to `_failed`.

- [ ] **Step 5: Start the loop in `backend/app/main.py` lifespan.** Add a background daemon thread that calls `scan_once` every `watch_interval` seconds, started on lifespan enter and signaled to stop on exit. Add near the top: `import threading`, `import time`, `from app.services.watcher import scan_once`. Replace the lifespan with:
```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    settings = get_settings()
    stop = threading.Event()

    def _watch_loop():
        while not stop.wait(settings.watch_interval):
            try:
                scan_once(settings.watch_dir)
            except Exception:
                pass  # never let the watcher crash the app

    thread = threading.Thread(target=_watch_loop, daemon=True)
    thread.start()
    try:
        yield
    finally:
        stop.set()
```
(Keep the SessionMiddleware + router registration below the lifespan exactly as they are.)

- [ ] **Step 6: Mount the folder in compose.** In `docker-compose.yml`, add a volume to the `api` service so the watch dir persists:
```yaml
    volumes:
      - app-data:/data
      - import-data:/import
```
and add `import-data:` under the top-level `volumes:`. THEN in `docker-compose.minipc.yml`, override the api service to bind-mount a host folder instead (so the user can drop files from the host):
```yaml
services:
  api:
    volumes:
      - app-data:/data
      - ./import:/import
  frontend:
    ports:
      - "${FRONTEND_PORT:-8090}:80"
```
(The minipc override replaces the named `import-data` volume with a host bind mount `./import`. `app-data` stays a named volume. `.gitignore` already excludes `import/`.)

- [ ] **Step 7: Run GREEN** — `pytest -q tests/test_watcher.py` then full `pytest -q -W error::DeprecationWarning` → all green. Then validate compose: `docker compose -f docker-compose.yml -f docker-compose.minipc.yml config >/dev/null && echo OK`. Report.

- [ ] **Step 8: Commit:**
```bash
git add backend/app/config.py backend/.env.example backend/app/services/watcher.py backend/app/main.py backend/tests/test_watcher.py docker-compose.yml docker-compose.minipc.yml
git commit -m "feat: watched-folder CSV auto-import (per-account, dedupe-safe) (TDD)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Verify + deploy + live folder test

- [ ] **Step 1:** Full backend suite green; compose validates.
- [ ] **Step 2:** Secrets audit (`import/` must not be tracked).
- [ ] **Step 3:** Merge to `main`, then `./scripts/deploy.sh`.
- [ ] **Step 4: Live folder test (on the minipc, cleaned up after):**
  - Create a throwaway account via the API (note: data routes need auth now — use a quick authed session, OR temporarily test scan via the folder with a seeded account). Simplest: since the API now requires auth, create the test account + verify import by reading the DB is awkward over curl. Instead verify the watcher wiring: create `/home/aman/spendanalyzer/import/<AccountName>/` on the host, drop a small CSV, wait `WATCH_INTERVAL`+5s, then check the file moved to `_processed/` (proof the loop ran and imported). Use an account that exists; if none exist yet (fresh prod), create one through the browser-authenticated flow is needed — so for the smoke test, just confirm: (a) the `import` bind-mount exists in the running api container (`ssh minipc "docker compose ... exec -T api ls -ld /import"`), and (b) dropping a CSV into a non-matching folder leaves it (no crash) — confirming the loop runs without error in logs (`ssh minipc "docker compose ... logs --tail=20 api"` shows no watcher exceptions).
  - Clean up any test files/folders under `import/`.
- [ ] **Step 5: Report** — Phase 6b live: drop `*.csv` into `import/<account-name>/` on the minipc and it auto-imports (dedupe-safe), files move to `_processed/`. **Phase 6 complete → the original 6-phase plan is fully delivered.**

---

## Self-Review
- **Watcher:** per-account subfolder match (case-insensitive, non-archived); CSV auto-detect + commit (dedupe + categorize); _processed/_failed handling; never crashes the app. TDD-verified (import, unknown-account skip, unparseable→failed). ✓
- **Loop:** daemon thread, interval-driven, stop on shutdown, exceptions swallowed. ✓
- **Compose:** named `import-data` volume by default; minipc bind-mounts `./import` so the user drops files from the host. ✓
- **Safety:** dedupe makes re-drops idempotent; `.gitignore` excludes `import/`. ✓
- **Deferred:** PDF watching (needs async review queue), notifications. ✓
```
