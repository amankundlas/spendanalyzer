# Spend Analyzer — Phase 3a: Categories + Rules-based Categorization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add expense categories, an editable merchant/keyword rules engine that auto-categorizes transactions on import, a safe DB migration for the new `category_id` column, and the transactions-API surface for category display / re-categorization. NO LLM yet (Phase 3b) — this stage is pure, deterministic, fully Mac-testable rules.

**Architecture:** New `category` + `category_rule` SQLModel tables (created by `create_all`). `transaction.category_id` is added to the EXISTING deployed table by an idempotent startup migration (PRAGMA-guarded `ALTER TABLE`). A pure `match_category` function applies rules (priority-ordered, first match wins). Import commit categorizes each row via rules. Default categories are seeded on first start. The transactions API returns category info and supports re-categorization + filtering.

**Tech Stack:** FastAPI + SQLModel + SQLite (existing). Python 3.12 venv.

**Conventions:**
- TDD; tests on Mac: `cd backend && . .venv/bin/activate && pytest -q -W error::DeprecationWarning`.
- The migration MUST be idempotent and safe on the already-deployed minipc DB (which has real data and a `transaction` table WITHOUT `category_id`). Never drop/recreate tables.
- One commit per task. Deploy is the final task.
- Out of scope (later): LLM categorization of unknowns + learn-as-rule (3b), PDF import (3c), all category UI (3b/3c frontend).

---

## File Structure
```
backend/app/
  models.py            # + Category, CategoryRule; Transaction gains category_id
  migrations.py        # NEW: run_migrations(engine) — idempotent ALTERs
  seed.py              # NEW: seed_categories(session) — default category set
  db.py                # init_db() also runs migrations + seeds
  services/
    categorize.py      # NEW: match_category(rules, merchant, description)
    imports.py         # commit_import categorizes rows via rules
  api/
    categories.py      # NEW: category CRUD
    rules.py           # NEW: category_rule CRUD + "apply to uncategorized"
    transactions.py    # TransactionOut gains category; + filter + recategorize
backend/tests/
    test_migrations.py, test_categorize.py, test_categories_api.py,
    test_rules_api.py, test_transactions.py (extended)
```

---

## Task 1: Models + idempotent migration (TDD)

**Files:** modify `app/models.py`; create `app/migrations.py`, `tests/test_migrations.py`; modify `app/db.py`.

- [ ] **Step 1: Add models to `app/models.py`** (append the two new tables; modify Transaction):
```python
class Category(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(unique=True, index=True)
    parent_id: int | None = Field(default=None, foreign_key="category.id")
    color: str = "#64748b"
    icon: str | None = None


class CategoryRule(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    match_type: str  # "merchant_contains" | "regex"
    pattern: str
    category_id: int = Field(foreign_key="category.id", index=True)
    priority: int = 100  # lower number = higher precedence
```
And add to `Transaction` (after `import_batch_id`):
```python
    category_id: int | None = Field(default=None, foreign_key="category.id", index=True)
```

- [ ] **Step 2: Write failing test** — `tests/test_migrations.py`:
```python
from sqlalchemy import text
from sqlmodel import SQLModel, Session, create_engine
from sqlmodel.pool import StaticPool

from app.migrations import run_migrations


def _column_names(engine, table: str) -> set[str]:
    with engine.connect() as conn:
        rows = conn.execute(text(f"PRAGMA table_info({table})")).all()
    return {r[1] for r in rows}


def test_migration_adds_category_id_to_legacy_transaction_table():
    # Simulate a legacy DB: a `transaction` table with NO category_id column.
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    with engine.begin() as conn:
        conn.execute(
            text(
                "CREATE TABLE \"transaction\" ("
                "id INTEGER PRIMARY KEY, account_id INTEGER, date DATE, "
                "description TEXT, merchant TEXT, amount_cents INTEGER, "
                "direction TEXT, source TEXT, import_batch_id INTEGER, dedupe_hash TEXT)"
            )
        )
    assert "category_id" not in _column_names(engine, "transaction")

    run_migrations(engine)
    assert "category_id" in _column_names(engine, "transaction")

    # Idempotent: running again does not error.
    run_migrations(engine)
    assert "category_id" in _column_names(engine, "transaction")


def test_migration_noop_on_fresh_schema():
    # A fresh create_all DB already has category_id; migration must be a clean no-op.
    from app import models  # noqa: F401

    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SQLModel.metadata.create_all(engine)
    run_migrations(engine)
    assert "category_id" in _column_names(engine, "transaction")
```

- [ ] **Step 3: Run RED** — `pytest -q tests/test_migrations.py` → FAIL (no `app.migrations`).

- [ ] **Step 4: Write `app/migrations.py`:**
```python
from sqlalchemy import text
from sqlalchemy.engine import Engine


def _columns(conn, table: str) -> set[str]:
    rows = conn.execute(text(f'PRAGMA table_info("{table}")')).all()
    return {row[1] for row in rows}


def run_migrations(engine: Engine) -> None:
    """Apply idempotent schema migrations to an existing SQLite DB.

    create_all() creates missing tables but never ALTERs existing ones, so a
    deployed `transaction` table won't gain new columns automatically. Each step
    here is guarded by a column-existence check, so it is safe to run on every
    startup and on a fresh DB alike.
    """
    with engine.begin() as conn:
        cols = _columns(conn, "transaction")
        if "transaction" and "category_id" not in cols:
            # SQLite does not enforce this FK, but the reference documents intent.
            conn.execute(
                text(
                    'ALTER TABLE "transaction" '
                    "ADD COLUMN category_id INTEGER REFERENCES category(id)"
                )
            )
```
> NOTE: the migration references `category(id)`; ensure `create_all` (which creates the `category` table) runs BEFORE `run_migrations` in `init_db` (next step). On a legacy DB without a `category` table, `create_all` will have created it first.

- [ ] **Step 5: Wire into `app/db.py`** — update `init_db`:
```python
def init_db() -> None:
    from app import models  # noqa: F401
    from app.migrations import run_migrations
    from app.seed import seed_categories

    engine = get_engine()
    SQLModel.metadata.create_all(engine)
    run_migrations(engine)
    with Session(engine) as session:
        seed_categories(session)
```
> `seed_categories` is created in Task 2; until then this import fails. Create a temporary stub `app/seed.py` now containing:
> ```python
> def seed_categories(session) -> None:
>     pass
> ```
> Task 2 replaces it.

- [ ] **Step 6: Run GREEN** — `pytest -q tests/test_migrations.py` → PASS. Full suite `pytest -q -W error::DeprecationWarning` → all green (existing tests unaffected; the in-memory test DB now also runs migrations harmlessly).

- [ ] **Step 7: Commit:**
```bash
git add backend/app/models.py backend/app/migrations.py backend/app/seed.py backend/app/db.py backend/tests/test_migrations.py
git commit -m "feat(api): category/category_rule models + idempotent category_id migration (TDD)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Default-category seeding + Categories CRUD API (TDD)

**Files:** replace `app/seed.py`; create `app/api/categories.py`, `tests/test_categories_api.py`; register router in `main.py`.

- [ ] **Step 1: Replace `app/seed.py`:**
```python
from sqlmodel import Session, select

from app.models import Category

# (name, color) — a sensible editable default set.
DEFAULT_CATEGORIES: list[tuple[str, str]] = [
    ("Groceries", "#22c55e"),
    ("Dining", "#f97316"),
    ("Transport", "#3b82f6"),
    ("Utilities", "#eab308"),
    ("Housing", "#8b5cf6"),
    ("Shopping", "#ec4899"),
    ("Health", "#14b8a6"),
    ("Entertainment", "#a855f7"),
    ("Subscriptions", "#6366f1"),
    ("Income", "#10b981"),
    ("Transfers", "#64748b"),
    ("Uncategorized", "#94a3b8"),
]


def seed_categories(session: Session) -> None:
    """Insert the default categories once (only when the table is empty)."""
    if session.exec(select(Category)).first() is not None:
        return
    for name, color in DEFAULT_CATEGORIES:
        session.add(Category(name=name, color=color))
    session.commit()
```

- [ ] **Step 2: Write failing test** — `tests/test_categories_api.py`:
```python
from fastapi.testclient import TestClient


def test_seeded_categories_listed_and_crud(client: TestClient):
    # The lifespan seeds defaults; but the in-memory test session is separate,
    # so seed explicitly through the API surface instead: create, list, update, delete.
    resp = client.post("/api/categories", json={"name": "Pets", "color": "#000000"})
    assert resp.status_code == 201
    cat = resp.json()
    assert cat["name"] == "Pets"

    assert any(c["name"] == "Pets" for c in client.get("/api/categories").json())

    resp = client.patch(f"/api/categories/{cat['id']}", json={"color": "#ffffff"})
    assert resp.status_code == 200
    assert resp.json()["color"] == "#ffffff"

    assert client.delete(f"/api/categories/{cat['id']}").status_code == 204
    assert all(c["name"] != "Pets" for c in client.get("/api/categories").json())


def test_duplicate_category_name_rejected(client: TestClient):
    client.post("/api/categories", json={"name": "Pets"})
    assert client.post("/api/categories", json={"name": "Pets"}).status_code == 409
```

- [ ] **Step 3: Run RED** — `pytest -q tests/test_categories_api.py` → FAIL.

- [ ] **Step 4: Write `app/api/categories.py`:**
```python
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.db import get_session
from app.models import Category

router = APIRouter()


class CategoryCreate(BaseModel):
    name: str = Field(min_length=1)
    color: str = "#64748b"
    icon: str | None = None
    parent_id: int | None = None


class CategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    color: str | None = None
    icon: str | None = None
    parent_id: int | None = None


@router.post("/categories", response_model=Category, status_code=status.HTTP_201_CREATED)
def create_category(body: CategoryCreate, session: Session = Depends(get_session)) -> Category:
    category = Category(**body.model_dump())
    session.add(category)
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(status_code=409, detail="category name already exists") from exc
    session.refresh(category)
    return category


@router.get("/categories", response_model=list[Category])
def list_categories(session: Session = Depends(get_session)) -> list[Category]:
    return list(session.exec(select(Category).order_by(Category.name)))


@router.patch("/categories/{category_id}", response_model=Category)
def update_category(
    category_id: int, body: CategoryUpdate, session: Session = Depends(get_session)
) -> Category:
    category = session.get(Category, category_id)
    if category is None:
        raise HTTPException(status_code=404, detail="category not found")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(category, key, value)
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(status_code=409, detail="category name already exists") from exc
    session.refresh(category)
    return category


@router.delete("/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(category_id: int, session: Session = Depends(get_session)) -> None:
    category = session.get(Category, category_id)
    if category is None:
        raise HTTPException(status_code=404, detail="category not found")
    session.delete(category)
    session.commit()
```

- [ ] **Step 5: Register router in `app/main.py`** — add import `from app.api.categories import router as categories_router` and `app.include_router(categories_router, prefix="/api")`.

- [ ] **Step 6: Run GREEN** — `pytest -q tests/test_categories_api.py` then full `pytest -q -W error::DeprecationWarning` → all green.

- [ ] **Step 7: Commit:**
```bash
git add backend/app/seed.py backend/app/api/categories.py backend/app/main.py backend/tests/test_categories_api.py
git commit -m "feat(api): default-category seeding + categories CRUD (TDD)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Rules engine + Rules CRUD API (TDD)

**Files:** create `app/services/categorize.py`, `app/api/rules.py`, `tests/test_categorize.py`, `tests/test_rules_api.py`; register router in `main.py`.

- [ ] **Step 1: Write failing test** — `tests/test_categorize.py`:
```python
from app.models import CategoryRule
from app.services.categorize import match_category


def _rule(match_type, pattern, category_id, priority=100):
    return CategoryRule(
        match_type=match_type, pattern=pattern, category_id=category_id, priority=priority
    )


def test_merchant_contains_matches_case_insensitively():
    rules = [_rule("merchant_contains", "whole foods", 5)]
    assert match_category(rules, "WHOLE FOODS #123", "WHOLE FOODS MARKET") == 5


def test_regex_match():
    rules = [_rule("regex", r"^SHELL", 7)]
    assert match_category(rules, "SHELL OIL", "SHELL OIL 4455") == 7


def test_priority_lower_number_wins():
    rules = [
        _rule("merchant_contains", "amazon", 1, priority=200),
        _rule("merchant_contains", "amazon", 2, priority=10),
    ]
    assert match_category(rules, "AMAZON MKTP", "AMAZON") == 2


def test_no_match_returns_none():
    rules = [_rule("merchant_contains", "costco", 3)]
    assert match_category(rules, "TARGET", "TARGET STORE") is None
```

- [ ] **Step 2: Run RED** — `pytest -q tests/test_categorize.py` → FAIL.

- [ ] **Step 3: Write `app/services/categorize.py`:**
```python
import re

from app.models import CategoryRule


def match_category(
    rules: list[CategoryRule], merchant: str | None, description: str | None
) -> int | None:
    """Return the category_id of the first matching rule, or None.

    Rules are evaluated in ascending `priority` (lower = higher precedence).
    Matching is case-insensitive against the merchant + description text.
    """
    haystack = f"{merchant or ''} {description or ''}".upper()
    for rule in sorted(rules, key=lambda r: r.priority):
        if rule.match_type == "merchant_contains":
            if rule.pattern.upper() in haystack:
                return rule.category_id
        elif rule.match_type == "regex":
            try:
                if re.search(rule.pattern, haystack, re.IGNORECASE):
                    return rule.category_id
            except re.error:
                continue  # a malformed stored regex never crashes categorization
    return None
```

- [ ] **Step 4: Write failing test** — `tests/test_rules_api.py`:
```python
from fastapi.testclient import TestClient


def _category(client: TestClient, name="Groceries") -> int:
    return client.post("/api/categories", json={"name": name}).json()["id"]


def test_rule_crud(client: TestClient):
    cat = _category(client)
    resp = client.post(
        "/api/rules",
        json={"match_type": "merchant_contains", "pattern": "WHOLEFDS", "category_id": cat},
    )
    assert resp.status_code == 201
    rule = resp.json()
    assert rule["pattern"] == "WHOLEFDS"

    assert len(client.get("/api/rules").json()) == 1

    assert client.patch(f"/api/rules/{rule['id']}", json={"priority": 5}).json()["priority"] == 5
    assert client.delete(f"/api/rules/{rule['id']}").status_code == 204
    assert client.get("/api/rules").json() == []


def test_rule_rejects_bad_match_type(client: TestClient):
    cat = _category(client)
    resp = client.post(
        "/api/rules", json={"match_type": "nonsense", "pattern": "x", "category_id": cat}
    )
    assert resp.status_code == 422
```

- [ ] **Step 5: Run RED** — `pytest -q tests/test_rules_api.py` → FAIL.

- [ ] **Step 6: Write `app/api/rules.py`:**
```python
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.db import get_session
from app.models import CategoryRule

router = APIRouter()

_MATCH = "^(merchant_contains|regex)$"


class RuleCreate(BaseModel):
    match_type: str = Field(pattern=_MATCH)
    pattern: str = Field(min_length=1)
    category_id: int
    priority: int = 100


class RuleUpdate(BaseModel):
    match_type: str | None = Field(default=None, pattern=_MATCH)
    pattern: str | None = Field(default=None, min_length=1)
    category_id: int | None = None
    priority: int | None = None


@router.post("/rules", response_model=CategoryRule, status_code=status.HTTP_201_CREATED)
def create_rule(body: RuleCreate, session: Session = Depends(get_session)) -> CategoryRule:
    rule = CategoryRule(**body.model_dump())
    session.add(rule)
    session.commit()
    session.refresh(rule)
    return rule


@router.get("/rules", response_model=list[CategoryRule])
def list_rules(session: Session = Depends(get_session)) -> list[CategoryRule]:
    return list(session.exec(select(CategoryRule).order_by(CategoryRule.priority)))


@router.patch("/rules/{rule_id}", response_model=CategoryRule)
def update_rule(
    rule_id: int, body: RuleUpdate, session: Session = Depends(get_session)
) -> CategoryRule:
    rule = session.get(CategoryRule, rule_id)
    if rule is None:
        raise HTTPException(status_code=404, detail="rule not found")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(rule, key, value)
    session.commit()
    session.refresh(rule)
    return rule


@router.delete("/rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_rule(rule_id: int, session: Session = Depends(get_session)) -> None:
    rule = session.get(CategoryRule, rule_id)
    if rule is None:
        raise HTTPException(status_code=404, detail="rule not found")
    session.delete(rule)
    session.commit()
```

- [ ] **Step 7: Register router in `app/main.py`** (`from app.api.rules import router as rules_router`; include with prefix `/api`).

- [ ] **Step 8: Run GREEN** — `pytest -q tests/test_categorize.py tests/test_rules_api.py` then full suite → all green.

- [ ] **Step 9: Commit:**
```bash
git add backend/app/services/categorize.py backend/app/api/rules.py backend/app/main.py backend/tests/test_categorize.py backend/tests/test_rules_api.py
git commit -m "feat(api): rules engine + category-rule CRUD (TDD)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Categorize-on-import + transactions category surface (TDD)

**Files:** modify `app/services/imports.py`; create `app/api/transactions.py` additions; create `tests/test_categorize_import.py`; extend `tests/test_transactions.py`.

- [ ] **Step 1: Categorize during import** — in `app/services/imports.py`, modify `commit_import` to load all rules once and set `category_id` per row. Add near the top of the function, after `parsed = parse_rows(...)`:
```python
    from app.models import CategoryRule
    from app.services.categorize import match_category

    rules = list(session.exec(select(CategoryRule)))
```
And when constructing each `Transaction(...)`, add:
```python
                category_id=match_category(rules, normalized, row.description),
```
(`normalized` is the normalized merchant already computed in the loop.)

- [ ] **Step 2: Write failing test** — `tests/test_categorize_import.py`:
```python
import io
import json

from fastapi.testclient import TestClient

CSV = "Date,Description,Amount\n2026-01-02,WHOLEFDS MARKET,-45.99\n2026-01-03,UNKNOWN CO,-9.99\n"


def test_import_applies_matching_rule(client: TestClient):
    cat = client.post("/api/categories", json={"name": "Groceries"}).json()["id"]
    acct = client.post("/api/accounts", json={"name": "Card", "type": "credit"}).json()["id"]
    client.post(
        "/api/rules",
        json={"match_type": "merchant_contains", "pattern": "WHOLEFDS", "category_id": cat},
    )
    client.post(
        "/api/imports/commit",
        data={"account_id": str(acct), "mapping": json.dumps(
            {"date": "Date", "description": "Description", "amount": "Amount"})},
        files={"file": ("s.csv", io.BytesIO(CSV.encode()), "text/csv")},
    )

    items = client.get(f"/api/transactions?account_id={acct}").json()["items"]
    by_desc = {t["description"]: t for t in items}
    assert by_desc["WHOLEFDS MARKET"]["category_id"] == cat
    assert by_desc["WHOLEFDS MARKET"]["category_name"] == "Groceries"
    assert by_desc["UNKNOWN CO"]["category_id"] is None
```

- [ ] **Step 2b: Run RED** — `pytest -q tests/test_categorize_import.py` → FAIL (TransactionOut lacks category fields).

- [ ] **Step 3: Update `app/api/transactions.py`** — add category to the output, a `category_id` filter, and a recategorize endpoint. Replace the file's `TransactionOut`, the query (to join category name), and add the PATCH:
```python
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlmodel import Session, func, select

from app.db import get_session
from app.models import Category, Transaction
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
    category_id: int | None
    category_name: str | None


class TransactionPage(BaseModel):
    items: list[TransactionOut]
    total: int


class RecategorizeBody(BaseModel):
    category_id: int | None


@router.get("/transactions", response_model=TransactionPage)
def list_transactions(
    account_id: int | None = None,
    search: str | None = None,
    start: date | None = None,
    end: date | None = None,
    category_id: int | None = None,
    uncategorized: bool = False,
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
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
    if category_id is not None:
        filters.append(Transaction.category_id == category_id)
    if uncategorized:
        filters.append(Transaction.category_id.is_(None))

    count_query = select(func.count()).select_from(Transaction)
    for f in filters:
        count_query = count_query.where(f)
    total = session.exec(count_query).one()

    query = select(Transaction, Category.name).join(
        Category, Transaction.category_id == Category.id, isouter=True
    )
    for f in filters:
        query = query.where(f)
    rows = session.exec(
        query.order_by(Transaction.date.desc(), Transaction.id.desc()).limit(limit).offset(offset)
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
            category_id=t.category_id,
            category_name=category_name,
        )
        for (t, category_name) in rows
    ]
    return TransactionPage(items=items, total=total)


@router.patch("/transactions/{transaction_id}", response_model=TransactionOut)
def recategorize(
    transaction_id: int, body: RecategorizeBody, session: Session = Depends(get_session)
) -> TransactionOut:
    txn = session.get(Transaction, transaction_id)
    if txn is None:
        raise HTTPException(status_code=404, detail="transaction not found")
    if body.category_id is not None and session.get(Category, body.category_id) is None:
        raise HTTPException(status_code=400, detail="category not found")
    txn.category_id = body.category_id
    session.commit()
    session.refresh(txn)
    name = None
    if txn.category_id is not None:
        cat = session.get(Category, txn.category_id)
        name = cat.name if cat else None
    return TransactionOut(
        id=txn.id, account_id=txn.account_id, date=txn.date, description=txn.description,
        merchant=txn.merchant, amount=cents_to_dollars(txn.amount_cents),
        direction=txn.direction, import_batch_id=txn.import_batch_id,
        category_id=txn.category_id, category_name=name,
    )
```

- [ ] **Step 4: Add an "apply rules to uncategorized" endpoint** in `app/api/rules.py` (re-run rules over already-imported uncategorized transactions):
```python
from app.models import Transaction
from app.services.categorize import match_category
from pydantic import BaseModel as _BaseModel


class ApplyResult(_BaseModel):
    updated: int


@router.post("/rules/apply", response_model=ApplyResult)
def apply_rules(session: Session = Depends(get_session)) -> ApplyResult:
    rules = list(session.exec(select(CategoryRule)))
    txns = list(session.exec(select(Transaction).where(Transaction.category_id.is_(None))))
    updated = 0
    for txn in txns:
        cid = match_category(rules, txn.merchant, txn.description)
        if cid is not None:
            txn.category_id = cid
            updated += 1
    session.commit()
    return ApplyResult(updated=updated)
```
> Add the needed imports (`Transaction`, `match_category`) at the top of `rules.py`.

- [ ] **Step 5: Extend `tests/test_transactions.py`** — add a recategorize + filter test:
```python
def test_recategorize_and_filter(client: TestClient):
    acct = _seed(client)
    cat = client.post("/api/categories", json={"name": "Dining"}).json()["id"]
    txn_id = client.get(f"/api/transactions?account_id={acct}").json()["items"][0]["id"]

    resp = client.patch(f"/api/transactions/{txn_id}", json={"category_id": cat})
    assert resp.status_code == 200
    assert resp.json()["category_name"] == "Dining"

    body = client.get(f"/api/transactions?account_id={acct}&category_id={cat}").json()
    assert body["total"] == 1
    body = client.get(f"/api/transactions?account_id={acct}&uncategorized=true").json()
    assert body["total"] == 2  # the other two seeded rows remain uncategorized
```

- [ ] **Step 6: Run GREEN** — `pytest -q tests/test_categorize_import.py tests/test_transactions.py` then FULL `pytest -q -W error::DeprecationWarning` → all green.

- [ ] **Step 7: Commit:**
```bash
git add backend/app/services/imports.py backend/app/api/transactions.py backend/app/api/rules.py backend/tests/test_categorize_import.py backend/tests/test_transactions.py
git commit -m "feat(api): categorize-on-import, category in transactions, recategorize + apply-rules (TDD)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Full verification + deploy

- [ ] **Step 1: Full backend suite** — `cd backend && . .venv/bin/activate && pytest -q -W error::DeprecationWarning` → all pass.
- [ ] **Step 2: Secrets audit** — `git ls-files | grep -iE '\.env$|\.sqlite3$|\.csv$|\.pdf$' || echo CLEAN`.
- [ ] **Step 3: Compose validate** — `docker compose -f docker-compose.yml -f docker-compose.minipc.yml config >/dev/null && echo OK`.
- [ ] **Step 4: Merge to main + deploy** — merge the phase branch, then `./scripts/deploy.sh`. On the minipc, the api container restart runs `init_db` → `create_all` (new category/category_rule tables) → `run_migrations` (adds `category_id` to the EXISTING transaction table, preserving data) → `seed_categories` (inserts defaults once).
- [ ] **Step 5: Verify live (migration preserved data + new surface works):**
  - `ssh minipc "curl -fs http://localhost:8090/api/categories"` → JSON array of the 12 seeded categories.
  - `ssh minipc "curl -fs http://localhost:8090/api/transactions"` → still returns existing transactions (now each with `category_id`/`category_name` fields; pre-existing rows are null until rules/AI run). Confirms the migration did NOT drop data.
  - `ssh minipc "curl -fs http://localhost:8090/api/rules"` → `[]`.
- [ ] **Step 6: Report** Phase 3a complete; categories + rules live; data preserved through migration. Proceed to Phase 3b (LLM).

---

## Self-Review (against spec + decisions)
- **Migration safety (2a review item):** idempotent PRAGMA-guarded ALTER adds `category_id` to the deployed `transaction` table without dropping data; no-op on fresh DBs and on re-run. Verified by `test_migrations.py` (legacy + fresh paths) and the live step-5 data-preservation check. ✓
- **Categories (spec §7):** editable default set seeded once; CRUD; unique-name 409. ✓
- **Rules engine (spec §7):** merchant_contains + regex, priority-ordered first-match, case-insensitive, malformed-regex-safe; CRUD; apply-to-uncategorized. ✓
- **Categorize-on-import:** rules applied during commit (free, deterministic). LLM for unknowns is Phase 3b. ✓
- **Transactions surface:** category_id + category_name in output, filter by category / uncategorized, recategorize PATCH. ✓
- **Out of scope (deferred):** LLM (3b), PDF (3c), learn-as-rule (3b), all UI. ✓
```
