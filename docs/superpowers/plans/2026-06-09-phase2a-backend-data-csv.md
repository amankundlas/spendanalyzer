# Spend Analyzer — Phase 2a: Backend (Data Model + Accounts + CSV Import) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the SQLite data layer and JSON API for accounts, CSV statement import (auto-detect → preview → commit, with dedupe and delete-by-batch undo), and a filterable transactions list — all TDD, all runnable/testable on the Mac via pytest.

**Architecture:** FastAPI + SQLModel over SQLite (file at `settings.database_path`, on the `app-data` volume in prod). Pure functions handle CSV column detection and row parsing; a thin service layer handles dedupe + batch persistence; routers expose the API under `/api`. Money is stored as integer **cents** for exact arithmetic. The frontend (Phase 2b) consumes this API.

**Tech Stack:** SQLModel (SQLAlchemy + Pydantic), python-dateutil (date parsing), python-multipart (file upload), pytest. Python 3.12.

**Conventions:**
- TDD: write failing test → run (red) → implement → run (green) → commit. Run tests on the Mac: `cd backend && . .venv/bin/activate && pytest -q`.
- Money is **integer cents** everywhere internally. The API exposes `amount` as a JSON number in dollars (cents/100) for display only; never sum dollars — sum cents.
- Each task is one commit. Do NOT push (deploy is the final task, after user-gated review already happened for Phase 1; Phase 2a deploy is automatic-after-tests per the standing rule, but still ends the plan).
- Do NOT add Phase 3+ concerns: no categories, category_id, rules, budgets, PDF, or LLM. Transactions have NO category column yet (added by a Phase 3 migration).

---

## File Structure

```
backend/
  app/
    db.py                      # engine, get_session, init_db
    models.py                  # Account, Transaction, ImportBatch (SQLModel tables)
    money.py                   # parse_amount_to_cents, cents_to_dollars
    dedupe.py                  # normalize_description, dedupe_hash
    schemas.py                 # API request/response Pydantic models (non-table)
    services/
      __init__.py
      csv_import.py            # detect_columns, parse_rows (pure functions)
      imports.py               # preview_import, commit_import, delete_batch
    api/
      accounts.py             # /api/accounts CRUD
      imports.py              # /api/imports analyze/commit/list/delete
      transactions.py         # /api/transactions list
    main.py                    # + lifespan init_db, include new routers
    config.py                  # (exists)
  tests/
    conftest.py                # test client + in-memory DB fixture
    test_accounts.py
    test_money.py
    test_dedupe.py
    test_csv_detect.py
    test_csv_parse.py
    test_imports.py
    test_transactions.py
  requirements.txt             # + sqlmodel, python-dateutil, python-multipart
```

---

## Task 1: Dependencies, DB engine/session, app startup, test harness

**Files:** Create `backend/app/db.py`, `backend/tests/conftest.py`; modify `backend/requirements.txt`, `backend/app/main.py`.

- [ ] **Step 1: Add dependencies** — append to `backend/requirements.txt`:
```
sqlmodel==0.0.22
python-dateutil==2.9.0.post0
python-multipart==0.0.20
```

- [ ] **Step 2: Install** — `cd backend && . .venv/bin/activate && pip install -r requirements-dev.txt`

- [ ] **Step 3: Write `backend/app/db.py`**:
```python
from collections.abc import Iterator

from sqlmodel import Session, SQLModel, create_engine

from app.config import get_settings

# check_same_thread=False is safe here: FastAPI uses a per-request Session.
_engine = create_engine(
    f"sqlite:///{get_settings().database_path}",
    connect_args={"check_same_thread": False},
)


def get_engine():
    return _engine


def init_db() -> None:
    # Import models so they are registered on SQLModel.metadata before create_all.
    from app import models  # noqa: F401

    SQLModel.metadata.create_all(_engine)


def get_session() -> Iterator[Session]:
    with Session(_engine) as session:
        yield session
```

- [ ] **Step 4: Add lifespan startup to `backend/app/main.py`** — replace the file with:
```python
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.accounts import router as accounts_router
from app.api.health import router as health_router
from app.api.imports import router as imports_router
from app.api.transactions import router as transactions_router
from app.config import get_settings
from app.db import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title=get_settings().app_name, lifespan=lifespan)
app.include_router(health_router, prefix="/api")
app.include_router(accounts_router, prefix="/api")
app.include_router(imports_router, prefix="/api")
app.include_router(transactions_router, prefix="/api")
```
> NOTE: `accounts`, `imports`, `transactions` routers are created in later tasks. Until then `main.py` will not import. To keep tasks runnable in isolation, create the three router modules as empty `APIRouter()` stubs now:
> - `backend/app/api/accounts.py`, `backend/app/api/imports.py`, `backend/app/api/transactions.py`, each containing exactly:
> ```python
> from fastapi import APIRouter
>
> router = APIRouter()
> ```
> Later tasks replace each stub with the real implementation.

- [ ] **Step 5: Write `backend/tests/conftest.py`** (in-memory DB, dependency override):
```python
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

from app.db import get_session
from app.main import app


@pytest.fixture(name="session")
def session_fixture() -> Iterator[Session]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


@pytest.fixture(name="client")
def client_fixture(session: Session) -> Iterator[TestClient]:
    def get_session_override() -> Iterator[Session]:
        yield session

    app.dependency_overrides[get_session] = get_session_override
    # Do not run the real lifespan init_db (uses the file DB); the fixture owns schema.
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()
```
> NOTE: `TestClient(app)` triggers the lifespan, which calls the real `init_db()` against the configured file DB path. To avoid touching a real file during tests, set `DATABASE_PATH` to a temp path in tests. Add a `backend/tests/conftest.py` top-level autouse fixture:
> ```python
> import os
> import tempfile
>
> @pytest.fixture(autouse=True, scope="session")
> def _temp_db_path():
>     fd, path = tempfile.mkstemp(suffix=".sqlite3")
>     os.close(fd)
>     os.environ["DATABASE_PATH"] = path
>     from app.config import get_settings
>     get_settings.cache_clear()
>     yield
>     os.unlink(path)
> ```
> Place this fixture ABOVE the others in `conftest.py` (and add the `import os, tempfile` imports at top). This makes the lifespan `init_db()` write to a throwaway temp file while each test still uses the in-memory `session` override for its actual queries.

- [ ] **Step 6: Smoke test** — `cd backend && . .venv/bin/activate && pytest -q tests/test_health.py`
Expected: still PASS (health unaffected). This verifies the new lifespan + stub routers import cleanly.

- [ ] **Step 7: Commit**:
```bash
git add backend/
git commit -m "feat(api): SQLModel DB engine, lifespan init, and pytest DB harness

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Money + dedupe helpers (TDD)

**Files:** Create `backend/app/money.py`, `backend/app/dedupe.py`, `backend/tests/test_money.py`, `backend/tests/test_dedupe.py`.

- [ ] **Step 1: Write failing tests** — `backend/tests/test_money.py`:
```python
import pytest

from app.money import cents_to_dollars, parse_amount_to_cents


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("12.34", 1234),
        ("$1,234.56", 123456),
        ("(45.00)", -4500),     # accounting negative
        ("-7.5", -750),
        ("  89 ", 8900),
        ("0", 0),
    ],
)
def test_parse_amount_to_cents(raw, expected):
    assert parse_amount_to_cents(raw) == expected


def test_parse_amount_rejects_garbage():
    with pytest.raises(ValueError):
        parse_amount_to_cents("not-a-number")


def test_cents_to_dollars():
    assert cents_to_dollars(123456) == 1234.56
    assert cents_to_dollars(-4500) == -45.0
```
`backend/tests/test_dedupe.py`:
```python
from datetime import date

from app.dedupe import dedupe_hash, normalize_description


def test_normalize_description_collapses_and_uppercases():
    assert normalize_description("  Whole   Foods  #123 ") == "WHOLE FOODS #123"


def test_dedupe_hash_is_stable_and_field_sensitive():
    h1 = dedupe_hash(1, date(2026, 1, 2), -1234, "WHOLE FOODS")
    h2 = dedupe_hash(1, date(2026, 1, 2), -1234, "WHOLE FOODS")
    h3 = dedupe_hash(1, date(2026, 1, 2), -1235, "WHOLE FOODS")
    assert h1 == h2
    assert h1 != h3
    assert len(h1) == 64  # sha256 hex
```

- [ ] **Step 2: Run (red)** — `pytest -q tests/test_money.py tests/test_dedupe.py` → FAIL (modules missing).

- [ ] **Step 3: Write `backend/app/money.py`**:
```python
import re
from decimal import Decimal, InvalidOperation

_CLEAN = re.compile(r"[,$\s]")


def parse_amount_to_cents(raw: str) -> int:
    """Parse a currency string into signed integer cents.

    Handles thousands separators, currency symbols, leading/trailing spaces,
    and accounting-style negatives like "(45.00)".
    """
    s = raw.strip()
    if not s:
        raise ValueError("empty amount")
    negative = False
    if s.startswith("(") and s.endswith(")"):
        negative = True
        s = s[1:-1]
    s = _CLEAN.sub("", s)
    if s.startswith("-"):
        negative = True
        s = s[1:]
    try:
        value = Decimal(s)
    except InvalidOperation as exc:
        raise ValueError(f"invalid amount: {raw!r}") from exc
    cents = int((value * 100).to_integral_value())
    return -cents if negative else cents


def cents_to_dollars(cents: int) -> float:
    return cents / 100
```

- [ ] **Step 4: Write `backend/app/dedupe.py`**:
```python
import hashlib
import re
from datetime import date

_WS = re.compile(r"\s+")


def normalize_description(description: str) -> str:
    return _WS.sub(" ", description).strip().upper()


def dedupe_hash(
    account_id: int, txn_date: date, amount_cents: int, normalized_description: str
) -> str:
    key = f"{account_id}|{txn_date.isoformat()}|{amount_cents}|{normalized_description}"
    return hashlib.sha256(key.encode("utf-8")).hexdigest()
```

- [ ] **Step 5: Run (green)** — `pytest -q tests/test_money.py tests/test_dedupe.py` → PASS.

- [ ] **Step 6: Commit**:
```bash
git add backend/app/money.py backend/app/dedupe.py backend/tests/test_money.py backend/tests/test_dedupe.py
git commit -m "feat(api): money (integer cents) and dedupe-hash helpers (TDD)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Models (Account, Transaction, ImportBatch)

**Files:** Create `backend/app/models.py`. (Tested indirectly via Tasks 2/5/6/7; this task adds a focused model test.)

- [ ] **Step 1: Write `backend/app/models.py`**:
```python
from datetime import date, datetime

from sqlmodel import Field, SQLModel


class Account(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str
    type: str  # "credit" | "checking" | "savings"
    institution: str | None = None
    currency: str = "USD"
    archived: bool = False


class ImportBatch(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    account_id: int = Field(foreign_key="account.id", index=True)
    source: str  # "csv" | "manual"
    filename: str
    imported_at: datetime = Field(default_factory=datetime.utcnow)
    added_count: int = 0
    duplicate_count: int = 0


class Transaction(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    account_id: int = Field(foreign_key="account.id", index=True)
    date: date
    description: str
    merchant: str | None = None
    amount_cents: int
    direction: str  # "debit" | "credit"
    source: str = "csv"
    import_batch_id: int | None = Field(
        default=None, foreign_key="importbatch.id", index=True
    )
    dedupe_hash: str = Field(index=True)
```

- [ ] **Step 2: Write `backend/tests/test_models.py`** (round-trip persistence):
```python
from datetime import date

from sqlmodel import Session, select

from app.models import Account, Transaction


def test_account_and_transaction_persist(session: Session):
    acct = Account(name="Amex Gold", type="credit", institution="Amex")
    session.add(acct)
    session.commit()
    session.refresh(acct)

    txn = Transaction(
        account_id=acct.id,
        date=date(2026, 1, 5),
        description="WHOLE FOODS",
        amount_cents=-4599,
        direction="debit",
        dedupe_hash="abc",
    )
    session.add(txn)
    session.commit()

    rows = session.exec(select(Transaction).where(Transaction.account_id == acct.id)).all()
    assert len(rows) == 1
    assert rows[0].amount_cents == -4599
    assert rows[0].direction == "debit"
```

- [ ] **Step 3: Run** — `pytest -q tests/test_models.py` → PASS.

- [ ] **Step 4: Commit**:
```bash
git add backend/app/models.py backend/tests/test_models.py
git commit -m "feat(api): Account, Transaction, ImportBatch SQLModel tables

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: CSV column detection + row parsing (TDD, pure functions)

**Files:** Create `backend/app/services/__init__.py` (empty), `backend/app/services/csv_import.py`, `backend/app/schemas.py`, `backend/tests/test_csv_detect.py`, `backend/tests/test_csv_parse.py`.

- [ ] **Step 1: Write `backend/app/schemas.py`** (request/response models used across the API):
```python
from datetime import date

from pydantic import BaseModel


class ColumnMapping(BaseModel):
    date: str
    description: str
    amount: str | None = None        # single signed-amount column
    debit: str | None = None         # OR a debit column ...
    credit: str | None = None        # ... and a credit column
    date_format: str | None = None   # optional explicit strptime format
    debit_positive: bool = True      # debit column holds positive magnitudes


class DetectedColumns(BaseModel):
    headers: list[str]
    sample_rows: list[dict[str, str]]
    suggested: ColumnMapping


class ParsedRow(BaseModel):
    date: date
    description: str
    amount_cents: int
    direction: str  # "debit" | "credit"
```

- [ ] **Step 2: Write failing detection test** — `backend/tests/test_csv_detect.py`:
```python
from app.services.csv_import import detect_columns

SIGNED = "Date,Description,Amount\n2026-01-02,WHOLE FOODS,-45.99\n2026-01-03,PAYROLL,1500.00\n"
SPLIT = "Posted,Payee,Debit,Credit\n01/02/2026,WHOLE FOODS,45.99,\n01/03/2026,PAYROLL,,1500.00\n"


def test_detects_signed_amount_layout():
    d = detect_columns(SIGNED)
    assert d.headers == ["Date", "Description", "Amount"]
    assert d.suggested.date == "Date"
    assert d.suggested.description == "Description"
    assert d.suggested.amount == "Amount"
    assert d.suggested.debit is None and d.suggested.credit is None
    assert len(d.sample_rows) == 2


def test_detects_split_debit_credit_layout():
    d = detect_columns(SPLIT)
    assert d.suggested.date == "Posted"
    assert d.suggested.description == "Payee"
    assert d.suggested.debit == "Debit"
    assert d.suggested.credit == "Credit"
    assert d.suggested.amount is None
```

- [ ] **Step 3: Write failing parse test** — `backend/tests/test_csv_parse.py`:
```python
import pytest

from app.schemas import ColumnMapping
from app.services.csv_import import parse_rows

SIGNED = "Date,Description,Amount\n2026-01-02,WHOLE FOODS,-45.99\n2026-01-03,PAYROLL,1500.00\n"
SPLIT = "Posted,Payee,Debit,Credit\n01/02/2026,WHOLE FOODS,45.99,\n01/03/2026,PAYROLL,,1500.00\n"


def test_parse_signed_amount():
    mapping = ColumnMapping(date="Date", description="Description", amount="Amount")
    rows = parse_rows(SIGNED, mapping)
    assert len(rows) == 2
    assert rows[0].amount_cents == -4599
    assert rows[0].direction == "debit"
    assert rows[1].amount_cents == 150000
    assert rows[1].direction == "credit"


def test_parse_split_debit_credit():
    mapping = ColumnMapping(date="Posted", description="Payee", debit="Debit", credit="Credit")
    rows = parse_rows(SPLIT, mapping)
    assert rows[0].amount_cents == -4599   # debit -> negative
    assert rows[0].direction == "debit"
    assert rows[1].amount_cents == 150000  # credit -> positive
    assert rows[1].direction == "credit"


def test_parse_skips_blank_lines_and_raises_on_bad_date():
    bad = "Date,Description,Amount\n2026-01-02,OK,-1.00\n\nNOTADATE,BAD,-2.00\n"
    mapping = ColumnMapping(date="Date", description="Description", amount="Amount")
    with pytest.raises(ValueError):
        parse_rows(bad, mapping)
```

- [ ] **Step 4: Run (red)** — `pytest -q tests/test_csv_detect.py tests/test_csv_parse.py` → FAIL.

- [ ] **Step 5: Write `backend/app/services/csv_import.py`**:
```python
import csv
import io

from dateutil import parser as dateparser

from app.money import parse_amount_to_cents
from app.schemas import ColumnMapping, DetectedColumns, ParsedRow

_DATE_HINTS = ("date", "posted", "transaction date", "trans date")
_DESC_HINTS = ("description", "payee", "name", "memo", "details", "merchant")
_AMOUNT_HINTS = ("amount", "value")
_DEBIT_HINTS = ("debit", "withdrawal", "withdrawals", "charge")
_CREDIT_HINTS = ("credit", "deposit", "deposits", "payment")


def _read(text: str) -> tuple[list[str], list[dict[str, str]]]:
    reader = csv.DictReader(io.StringIO(text))
    headers = reader.fieldnames or []
    rows = [r for r in reader if any((v or "").strip() for v in r.values())]
    return headers, rows


def _match(headers: list[str], hints: tuple[str, ...]) -> str | None:
    for h in headers:
        if h and h.strip().lower() in hints:
            return h
    for h in headers:
        low = (h or "").strip().lower()
        if any(hint in low for hint in hints):
            return h
    return None


def detect_columns(text: str) -> DetectedColumns:
    headers, rows = _read(text)
    debit = _match(headers, _DEBIT_HINTS)
    credit = _match(headers, _CREDIT_HINTS)
    amount = None if (debit and credit) else _match(headers, _AMOUNT_HINTS)
    suggested = ColumnMapping(
        date=_match(headers, _DATE_HINTS) or (headers[0] if headers else ""),
        description=_match(headers, _DESC_HINTS) or (headers[1] if len(headers) > 1 else ""),
        amount=amount,
        debit=debit if (debit and credit) else None,
        credit=credit if (debit and credit) else None,
    )
    return DetectedColumns(headers=headers, sample_rows=rows[:5], suggested=suggested)


def _parse_date(value: str, fmt: str | None):
    value = value.strip()
    if fmt:
        from datetime import datetime

        return datetime.strptime(value, fmt).date()
    return dateparser.parse(value).date()


def parse_rows(text: str, mapping: ColumnMapping) -> list[ParsedRow]:
    _, rows = _read(text)
    out: list[ParsedRow] = []
    for r in rows:
        txn_date = _parse_date(r[mapping.date], mapping.date_format)
        description = (r.get(mapping.description) or "").strip()
        if mapping.amount:
            cents = parse_amount_to_cents(r[mapping.amount])
            direction = "debit" if cents < 0 else "credit"
        else:
            debit_raw = (r.get(mapping.debit) or "").strip() if mapping.debit else ""
            credit_raw = (r.get(mapping.credit) or "").strip() if mapping.credit else ""
            if debit_raw:
                mag = abs(parse_amount_to_cents(debit_raw))
                cents = -mag
                direction = "debit"
            elif credit_raw:
                cents = abs(parse_amount_to_cents(credit_raw))
                direction = "credit"
            else:
                continue  # neither column populated -> skip row
        out.append(
            ParsedRow(
                date=txn_date,
                description=description,
                amount_cents=cents,
                direction=direction,
            )
        )
    return out
```

- [ ] **Step 6: Run (green)** — `pytest -q tests/test_csv_detect.py tests/test_csv_parse.py` → PASS.

- [ ] **Step 7: Commit**:
```bash
git add backend/app/services/ backend/app/schemas.py backend/tests/test_csv_detect.py backend/tests/test_csv_parse.py
git commit -m "feat(api): CSV column detection + row parsing (signed & split layouts) (TDD)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Import service — preview + commit with dedupe + delete batch (TDD)

**Files:** Create `backend/app/services/imports.py`, `backend/tests/test_imports.py`. (Adds preview/commit/delete-batch business logic operating on a Session.)

- [ ] **Step 1: Add result schemas to `backend/app/schemas.py`** (append):
```python
class ImportPreview(BaseModel):
    rows: list[ParsedRow]
    added_count: int
    duplicate_count: int


class ImportResult(BaseModel):
    batch_id: int
    added_count: int
    duplicate_count: int
```

- [ ] **Step 2: Write failing test** — `backend/tests/test_imports.py`:
```python
from sqlmodel import Session, select

from app.models import Account, ImportBatch, Transaction
from app.schemas import ColumnMapping
from app.services.imports import commit_import, delete_batch, preview_import

CSV = "Date,Description,Amount\n2026-01-02,WHOLE FOODS,-45.99\n2026-01-03,PAYROLL,1500.00\n"
MAPPING = ColumnMapping(date="Date", description="Description", amount="Amount")


def _account(session: Session) -> Account:
    a = Account(name="Card", type="credit")
    session.add(a)
    session.commit()
    session.refresh(a)
    return a


def test_preview_counts_new_and_duplicates(session: Session):
    acct = _account(session)
    preview = preview_import(session, acct.id, CSV, MAPPING)
    assert preview.added_count == 2
    assert preview.duplicate_count == 0
    assert len(preview.rows) == 2


def test_commit_persists_and_dedupes_on_reimport(session: Session):
    acct = _account(session)
    first = commit_import(session, acct.id, "jan.csv", CSV, MAPPING)
    assert first.added_count == 2
    assert first.duplicate_count == 0
    assert session.exec(select(Transaction)).all().__len__() == 2

    second = commit_import(session, acct.id, "jan-again.csv", CSV, MAPPING)
    assert second.added_count == 0
    assert second.duplicate_count == 2
    assert session.exec(select(Transaction)).all().__len__() == 2  # no new rows

    batches = session.exec(select(ImportBatch)).all()
    assert len(batches) == 2
    assert batches[0].added_count == 2


def test_delete_batch_removes_only_its_transactions(session: Session):
    acct = _account(session)
    result = commit_import(session, acct.id, "jan.csv", CSV, MAPPING)
    delete_batch(session, result.batch_id)
    assert session.exec(select(Transaction)).all() == []
    assert session.exec(select(ImportBatch)).all() == []
```

- [ ] **Step 3: Run (red)** — `pytest -q tests/test_imports.py` → FAIL.

- [ ] **Step 4: Write `backend/app/services/imports.py`**:
```python
from sqlmodel import Session, select

from app.dedupe import dedupe_hash, normalize_description
from app.models import ImportBatch, Transaction
from app.schemas import ColumnMapping, ImportPreview, ImportResult
from app.services.csv_import import parse_rows


def _existing_hashes(session: Session, account_id: int) -> set[str]:
    rows = session.exec(
        select(Transaction.dedupe_hash).where(Transaction.account_id == account_id)
    ).all()
    return set(rows)


def preview_import(
    session: Session, account_id: int, text: str, mapping: ColumnMapping
) -> ImportPreview:
    parsed = parse_rows(text, mapping)
    existing = _existing_hashes(session, account_id)
    seen: set[str] = set()
    added = 0
    duplicate = 0
    for row in parsed:
        h = dedupe_hash(
            account_id, row.date, row.amount_cents, normalize_description(row.description)
        )
        if h in existing or h in seen:
            duplicate += 1
        else:
            seen.add(h)
            added += 1
    return ImportPreview(rows=parsed, added_count=added, duplicate_count=duplicate)


def commit_import(
    session: Session, account_id: int, filename: str, text: str, mapping: ColumnMapping
) -> ImportResult:
    parsed = parse_rows(text, mapping)
    existing = _existing_hashes(session, account_id)

    batch = ImportBatch(account_id=account_id, source="csv", filename=filename)
    session.add(batch)
    session.commit()
    session.refresh(batch)

    added = 0
    duplicate = 0
    seen: set[str] = set()
    for row in parsed:
        normalized = normalize_description(row.description)
        h = dedupe_hash(account_id, row.date, row.amount_cents, normalized)
        if h in existing or h in seen:
            duplicate += 1
            continue
        seen.add(h)
        session.add(
            Transaction(
                account_id=account_id,
                date=row.date,
                description=row.description,
                merchant=normalized,
                amount_cents=row.amount_cents,
                direction=row.direction,
                source="csv",
                import_batch_id=batch.id,
                dedupe_hash=h,
            )
        )
        added += 1

    batch.added_count = added
    batch.duplicate_count = duplicate
    session.add(batch)
    session.commit()
    return ImportResult(batch_id=batch.id, added_count=added, duplicate_count=duplicate)


def delete_batch(session: Session, batch_id: int) -> None:
    txns = session.exec(
        select(Transaction).where(Transaction.import_batch_id == batch_id)
    ).all()
    for txn in txns:
        session.delete(txn)
    batch = session.get(ImportBatch, batch_id)
    if batch is not None:
        session.delete(batch)
    session.commit()
```

- [ ] **Step 5: Run (green)** — `pytest -q tests/test_imports.py` → PASS.

- [ ] **Step 6: Commit**:
```bash
git add backend/app/services/imports.py backend/app/schemas.py backend/tests/test_imports.py
git commit -m "feat(api): import service — preview, commit w/ dedupe, delete-batch (TDD)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Accounts API (TDD)

**Files:** Replace stub `backend/app/api/accounts.py`; create `backend/tests/test_accounts.py`.

- [ ] **Step 1: Write failing test** — `backend/tests/test_accounts.py`:
```python
from fastapi.testclient import TestClient


def test_create_list_update_archive_account(client: TestClient):
    # create
    resp = client.post("/api/accounts", json={"name": "Amex Gold", "type": "credit", "institution": "Amex"})
    assert resp.status_code == 201
    acct = resp.json()
    assert acct["id"] > 0
    assert acct["name"] == "Amex Gold"
    assert acct["currency"] == "USD"
    assert acct["archived"] is False

    # list (excludes archived by default)
    resp = client.get("/api/accounts")
    assert resp.status_code == 200
    assert len(resp.json()) == 1

    # update
    resp = client.patch(f"/api/accounts/{acct['id']}", json={"name": "Amex Platinum"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "Amex Platinum"

    # archive (soft delete)
    resp = client.delete(f"/api/accounts/{acct['id']}")
    assert resp.status_code == 204
    assert client.get("/api/accounts").json() == []
    # still listable with include_archived
    assert len(client.get("/api/accounts?include_archived=true").json()) == 1


def test_create_account_validation(client: TestClient):
    resp = client.post("/api/accounts", json={"name": "", "type": "credit"})
    assert resp.status_code == 422
```

- [ ] **Step 2: Run (red)** — `pytest -q tests/test_accounts.py` → FAIL.

- [ ] **Step 3: Write `backend/app/api/accounts.py`**:
```python
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.db import get_session
from app.models import Account

router = APIRouter()


class AccountCreate(BaseModel):
    name: str = Field(min_length=1)
    type: str = Field(pattern="^(credit|checking|savings)$")
    institution: str | None = None
    currency: str = "USD"


class AccountUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    type: str | None = Field(default=None, pattern="^(credit|checking|savings)$")
    institution: str | None = None
    currency: str | None = None


@router.post("/accounts", response_model=Account, status_code=status.HTTP_201_CREATED)
def create_account(body: AccountCreate, session: Session = Depends(get_session)) -> Account:
    account = Account(**body.model_dump())
    session.add(account)
    session.commit()
    session.refresh(account)
    return account


@router.get("/accounts", response_model=list[Account])
def list_accounts(
    include_archived: bool = False, session: Session = Depends(get_session)
) -> list[Account]:
    query = select(Account)
    if not include_archived:
        query = query.where(Account.archived == False)  # noqa: E712
    return list(session.exec(query))


@router.patch("/accounts/{account_id}", response_model=Account)
def update_account(
    account_id: int, body: AccountUpdate, session: Session = Depends(get_session)
) -> Account:
    account = session.get(Account, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="account not found")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(account, key, value)
    session.add(account)
    session.commit()
    session.refresh(account)
    return account


@router.delete("/accounts/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
def archive_account(account_id: int, session: Session = Depends(get_session)) -> None:
    account = session.get(Account, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="account not found")
    account.archived = True
    session.add(account)
    session.commit()
```

- [ ] **Step 4: Run (green)** — `pytest -q tests/test_accounts.py` → PASS.

- [ ] **Step 5: Commit**:
```bash
git add backend/app/api/accounts.py backend/tests/test_accounts.py
git commit -m "feat(api): accounts CRUD with soft-archive (TDD)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Imports API + Transactions API (TDD)

**Files:** Replace stubs `backend/app/api/imports.py`, `backend/app/api/transactions.py`; create `backend/tests/test_imports_api.py`, `backend/tests/test_transactions.py`.

- [ ] **Step 1: Write failing tests** — `backend/tests/test_imports_api.py`:
```python
import io

from fastapi.testclient import TestClient

CSV = "Date,Description,Amount\n2026-01-02,WHOLE FOODS,-45.99\n2026-01-03,PAYROLL,1500.00\n"


def _account(client: TestClient) -> int:
    return client.post("/api/accounts", json={"name": "Card", "type": "credit"}).json()["id"]


def _upload(content: str):
    return {"file": ("stmt.csv", io.BytesIO(content.encode()), "text/csv")}


def test_analyze_returns_suggested_mapping(client: TestClient):
    resp = client.post("/api/imports/analyze", files=_upload(CSV))
    assert resp.status_code == 200
    body = resp.json()
    assert body["headers"] == ["Date", "Description", "Amount"]
    assert body["suggested"]["amount"] == "Amount"


def test_commit_dry_run_then_save_then_list_then_delete(client: TestClient):
    acct = _account(client)
    mapping = {"date": "Date", "description": "Description", "amount": "Amount"}
    form = {"account_id": str(acct), "mapping": __import__("json").dumps(mapping)}

    # dry run (preview)
    resp = client.post("/api/imports/commit?dry_run=true", data=form, files=_upload(CSV))
    assert resp.status_code == 200
    assert resp.json()["added_count"] == 2

    # real commit
    resp = client.post("/api/imports/commit", data=form, files=_upload(CSV))
    assert resp.status_code == 201
    batch_id = resp.json()["batch_id"]

    # list batches
    resp = client.get(f"/api/imports?account_id={acct}")
    assert resp.status_code == 200
    assert len(resp.json()) == 1

    # delete batch
    assert client.delete(f"/api/imports/{batch_id}").status_code == 204
    assert client.get(f"/api/imports?account_id={acct}").json() == []
    assert client.get(f"/api/transactions?account_id={acct}").json()["items"] == []
```
`backend/tests/test_transactions.py`:
```python
import io
import json

from fastapi.testclient import TestClient

CSV = (
    "Date,Description,Amount\n"
    "2026-01-02,WHOLE FOODS,-45.99\n"
    "2026-01-10,SHELL GAS,-30.00\n"
    "2026-01-15,PAYROLL,1500.00\n"
)


def _seed(client: TestClient) -> int:
    acct = client.post("/api/accounts", json={"name": "Card", "type": "credit"}).json()["id"]
    mapping = {"date": "Date", "description": "Description", "amount": "Amount"}
    client.post(
        "/api/imports/commit",
        data={"account_id": str(acct), "mapping": json.dumps(mapping)},
        files={"file": ("s.csv", io.BytesIO(CSV.encode()), "text/csv")},
    )
    return acct


def test_list_transactions_with_filters(client: TestClient):
    acct = _seed(client)

    body = client.get(f"/api/transactions?account_id={acct}").json()
    assert body["total"] == 3
    assert len(body["items"]) == 3
    # newest first
    assert body["items"][0]["description"] == "PAYROLL"
    assert body["items"][0]["amount"] == 1500.0  # dollars for display

    # search filter
    body = client.get(f"/api/transactions?account_id={acct}&search=shell").json()
    assert body["total"] == 1
    assert body["items"][0]["description"] == "SHELL GAS"

    # date range filter
    body = client.get(
        f"/api/transactions?account_id={acct}&start=2026-01-05&end=2026-01-20"
    ).json()
    assert body["total"] == 2
```

- [ ] **Step 2: Run (red)** — `pytest -q tests/test_imports_api.py tests/test_transactions.py` → FAIL.

- [ ] **Step 3: Write `backend/app/api/imports.py`**:
```python
import json

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import ValidationError
from sqlmodel import Session, select

from app.db import get_session
from app.models import Account, ImportBatch
from app.schemas import ColumnMapping, DetectedColumns, ImportPreview, ImportResult
from app.services.csv_import import detect_columns
from app.services.imports import commit_import, delete_batch, preview_import

router = APIRouter()


async def _read_text(file: UploadFile) -> str:
    raw = await file.read()
    try:
        return raw.decode("utf-8-sig")  # tolerate BOM
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=400, detail="file must be UTF-8 text") from exc


def _parse_mapping(mapping: str) -> ColumnMapping:
    try:
        return ColumnMapping.model_validate(json.loads(mapping))
    except (json.JSONDecodeError, ValidationError) as exc:
        raise HTTPException(status_code=422, detail=f"invalid mapping: {exc}") from exc


def _require_account(session: Session, account_id: int) -> Account:
    account = session.get(Account, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="account not found")
    return account


@router.post("/imports/analyze", response_model=DetectedColumns)
async def analyze(file: UploadFile = File(...)) -> DetectedColumns:
    text = await _read_text(file)
    return detect_columns(text)


@router.post("/imports/commit")
async def commit(
    dry_run: bool = False,
    account_id: int = Form(...),
    mapping: str = Form(...),
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
):
    _require_account(session, account_id)
    text = await _read_text(file)
    parsed_mapping = _parse_mapping(mapping)
    try:
        if dry_run:
            return preview_import(session, account_id, text, parsed_mapping)
        result = commit_import(session, account_id, file.filename or "upload.csv", text, parsed_mapping)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    from fastapi.responses import JSONResponse

    return JSONResponse(status_code=status.HTTP_201_CREATED, content=result.model_dump())


@router.get("/imports", response_model=list[ImportBatch])
def list_batches(account_id: int, session: Session = Depends(get_session)) -> list[ImportBatch]:
    return list(
        session.exec(
            select(ImportBatch)
            .where(ImportBatch.account_id == account_id)
            .order_by(ImportBatch.imported_at.desc())
        )
    )


@router.delete("/imports/{batch_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_batch(batch_id: int, session: Session = Depends(get_session)) -> None:
    if session.get(ImportBatch, batch_id) is None:
        raise HTTPException(status_code=404, detail="batch not found")
    delete_batch(session, batch_id)
```
> The `dry_run` preview returns an `ImportPreview` (200); the real commit returns an `ImportResult` (201). Response model is intentionally unannotated on `commit` because the shape differs by `dry_run`.

- [ ] **Step 4: Write `backend/app/api/transactions.py`**:
```python
from datetime import date

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlmodel import Session, func, select

from app.db import get_session
from app.models import Transaction
from app.money import cents_to_dollars

router = APIRouter()


class TransactionOut(BaseModel):
    id: int
    account_id: int
    date: date
    description: str
    merchant: str | None
    amount: float
    direction: str
    import_batch_id: int | None


class TransactionPage(BaseModel):
    items: list[TransactionOut]
    total: int


@router.get("/transactions", response_model=TransactionPage)
def list_transactions(
    account_id: int | None = None,
    search: str | None = None,
    start: date | None = None,
    end: date | None = None,
    limit: int = 100,
    offset: int = 0,
    session: Session = Depends(get_session),
) -> TransactionPage:
    filters = []
    if account_id is not None:
        filters.append(Transaction.account_id == account_id)
    if search:
        filters.append(Transaction.description.ilike(f"%{search}%"))
    if start is not None:
        filters.append(Transaction.date >= start)
    if end is not None:
        filters.append(Transaction.date <= end)

    base = select(Transaction)
    for f in filters:
        base = base.where(f)

    count_query = select(func.count()).select_from(Transaction)
    for f in filters:
        count_query = count_query.where(f)
    total = session.exec(count_query).one()

    rows = session.exec(
        base.order_by(Transaction.date.desc(), Transaction.id.desc()).limit(limit).offset(offset)
    ).all()

    items = [
        TransactionOut(
            id=t.id,
            account_id=t.account_id,
            date=t.date,
            description=t.description,
            merchant=t.merchant,
            amount=cents_to_dollars(t.amount_cents),
            direction=t.direction,
            import_batch_id=t.import_batch_id,
        )
        for t in rows
    ]
    return TransactionPage(items=items, total=total)
```

- [ ] **Step 5: Run (green)** — `pytest -q tests/test_imports_api.py tests/test_transactions.py` → PASS.

- [ ] **Step 6: Run the FULL suite** — `pytest -q` → all green.

- [ ] **Step 7: Commit**:
```bash
git add backend/app/api/imports.py backend/app/api/transactions.py backend/tests/test_imports_api.py backend/tests/test_transactions.py
git commit -m "feat(api): imports (analyze/commit/list/delete) + transactions list with filters (TDD)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Full verification + deploy

- [ ] **Step 1: Full backend suite** — `cd backend && . .venv/bin/activate && pytest -q` → all pass.
- [ ] **Step 2: Secrets audit** — `git ls-files | grep -iE '\.env$|\.sqlite3$|\.csv$|\.pdf$' || echo CLEAN` → CLEAN (the only `.csv` allowed is under a `fixtures/` path; this task added none).
- [ ] **Step 3: Compose still valid** — `docker compose -f docker-compose.yml -f docker-compose.minipc.yml config >/dev/null && echo OK`.
- [ ] **Step 4: Deploy** — `./scripts/deploy.sh` (push main → minipc pull + rebuild). The api container now creates the SQLite schema on startup (lifespan `init_db`).
- [ ] **Step 5: Verify live** — `ssh minipc "curl -fs http://localhost:8090/api/health"` → `{"status":"ok"}`, and `ssh minipc "curl -fs http://localhost:8090/api/accounts"` → `[]` (empty list, confirms DB + new router are live).
- [ ] **Step 6: Report** Phase 2a complete; API live; ready for Phase 2b (frontend).

---

## Self-Review (against spec + Phase-2 decisions)

- **Data model (spec §5):** Account, Transaction (dedupe_hash, integer cents, no category_id yet — deferred to Phase 3 per spec/YAGNI), ImportBatch with counts. ✓
- **CSV-first ingestion (spec §6) + decision "always preview+confirm":** analyze (detect) → commit?dry_run=true (preview w/ added/duplicate) → commit (save). ✓
- **Dedupe (spec §5):** sha256(account_id|date|cents|normalized desc); skips within-file and cross-file dupes; counts reported. ✓
- **Delete-by-batch decision:** `DELETE /api/imports/{id}` removes the batch + only its transactions. ✓
- **Accounts (spec §5):** CRUD + soft archive + validation. ✓
- **Transactions list:** filter by account/search/date-range, paginated, newest-first, amount in dollars for display. ✓
- **Money correctness:** integer cents internally; dollars only at the API boundary. ✓
- **Placeholder scan:** none — every step has complete code. ✓
- **Name/type consistency:** `ColumnMapping`, `ParsedRow`, `ImportPreview`/`ImportResult`, `amount_cents`, `dedupe_hash` used consistently across services, API, and tests. ✓
- **Out of scope (deferred):** categories/rules (Phase 3), budgets (Phase 5), PDF + Ollama (Phase 3), all UI (Phase 2b). ✓

## Roadmap note
**Phase 2b (frontend):** react-router-dom; sidebar NavLink wiring; Accounts view (list/create/archive); Import view (upload → confirm mapping → preview rows + dupe counts → Save; recent-imports list with delete-batch); Transactions view (filterable table). Consumes this API. Detailed plan written after 2a deploys.
