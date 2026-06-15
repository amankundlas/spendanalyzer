# Spend Analyzer — Phase 5: Budgets — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Checkbox (`- [ ]`) steps.

**Goal:** Monthly per-category budgets: set a limit per category (recurring, with optional per-month override), and see actual-vs-budget for a chosen month — progress bars (green/amber/red) with over/under badges.

**Architecture:** A new `Budget` table (`category_id`, `month` = "recurring" or "YYYY-MM", `limit_cents`), created by `create_all` (new table → no migration needed). A budget-status service resolves the effective limit per category (per-month override beats recurring) and computes that month's actual spend per category. Endpoints: upsert/list/delete budgets + a status endpoint. The Budgets page lets you set limits and shows the bars for a selected month.

**Tech Stack:** FastAPI/SQLModel; React + Recharts (existing). Money: cents internally, dollars at the API boundary.

**Conventions:** TDD. One commit per task. Deploy is the final task. Spend = debits (money out). Out of scope: budget rollover, alerts, budget health on the Overview dashboard (note as a later nicety).

---

## Task 1: Budget model + CRUD API (TDD)

**Files:** add `Budget` to `backend/app/models.py`; create `backend/app/api/budgets.py`, `backend/tests/test_budgets_api.py`; register router in `main.py`.

- [ ] **Step 1: Add `Budget` to `backend/app/models.py`** (append; it already imports `UniqueConstraint` from sqlalchemy — if not, add it):
```python
class Budget(SQLModel, table=True):
    # one budget row per (category, month); month="recurring" is the default monthly limit
    __table_args__ = (UniqueConstraint("category_id", "month"),)

    id: int | None = Field(default=None, primary_key=True)
    category_id: int = Field(foreign_key="category.id", index=True)
    month: str = "recurring"  # "recurring" or "YYYY-MM"
    limit_cents: int
```
> If `UniqueConstraint` isn't already imported in models.py, add `from sqlalchemy import UniqueConstraint` (the Transaction model already uses it, so it should be present).

- [ ] **Step 2: Write failing test** — `backend/tests/test_budgets_api.py`:
```python
from fastapi.testclient import TestClient


def _cat(client: TestClient, name="Groceries") -> int:
    return client.post("/api/categories", json={"name": name}).json()["id"]


def test_budget_upsert_list_delete(client: TestClient):
    cat = _cat(client)
    # create via upsert (PUT)
    r = client.put("/api/budgets", json={"category_id": cat, "limit": 400})
    assert r.status_code == 200
    b = r.json()
    assert b["limit"] == 400.0
    assert b["month"] == "recurring"

    # upsert again updates in place (no duplicate)
    r = client.put("/api/budgets", json={"category_id": cat, "limit": 450})
    assert r.json()["limit"] == 450.0
    assert len(client.get("/api/budgets").json()) == 1

    # per-month override is a separate row
    client.put("/api/budgets", json={"category_id": cat, "month": "2026-02", "limit": 500})
    assert len(client.get("/api/budgets").json()) == 2

    bid = b["id"]
    assert client.delete(f"/api/budgets/{bid}").status_code == 204


def test_budget_validation(client: TestClient):
    cat = _cat(client)
    assert client.put("/api/budgets", json={"category_id": cat, "limit": -5}).status_code == 422
```

- [ ] **Step 3: Run RED** — `cd backend && . .venv/bin/activate && pytest -q tests/test_budgets_api.py` → FAIL. Confirm.

- [ ] **Step 4: Write `backend/app/api/budgets.py`:**
```python
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.db import get_session
from app.models import Budget
from app.money import cents_to_dollars

router = APIRouter()


class BudgetUpsert(BaseModel):
    category_id: int
    month: str = "recurring"
    limit: float = Field(ge=0)


class BudgetOut(BaseModel):
    id: int
    category_id: int
    month: str
    limit: float


def _out(b: Budget) -> BudgetOut:
    return BudgetOut(
        id=b.id, category_id=b.category_id, month=b.month, limit=cents_to_dollars(b.limit_cents)
    )


@router.get("/budgets", response_model=list[BudgetOut])
def list_budgets(session: Session = Depends(get_session)) -> list[BudgetOut]:
    return [_out(b) for b in session.exec(select(Budget))]


@router.put("/budgets", response_model=BudgetOut)
def upsert_budget(body: BudgetUpsert, session: Session = Depends(get_session)) -> BudgetOut:
    limit_cents = round(body.limit * 100)
    existing = session.exec(
        select(Budget).where(
            Budget.category_id == body.category_id, Budget.month == body.month
        )
    ).first()
    if existing is not None:
        existing.limit_cents = limit_cents
        session.commit()
        session.refresh(existing)
        return _out(existing)
    budget = Budget(category_id=body.category_id, month=body.month, limit_cents=limit_cents)
    session.add(budget)
    session.commit()
    session.refresh(budget)
    return _out(budget)


@router.delete("/budgets/{budget_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_budget(budget_id: int, session: Session = Depends(get_session)) -> None:
    budget = session.get(Budget, budget_id)
    if budget is None:
        raise HTTPException(status_code=404, detail="budget not found")
    session.delete(budget)
    session.commit()
```

- [ ] **Step 5: Register router in `backend/app/main.py`** — `from app.api.budgets import router as budgets_router` + `app.include_router(budgets_router, prefix="/api")`.

- [ ] **Step 6: Run GREEN** — `pytest -q tests/test_budgets_api.py` then full `pytest -q -W error::DeprecationWarning` → all green. Report.

- [ ] **Step 7: Commit:**
```bash
git add backend/app/models.py backend/app/api/budgets.py backend/app/main.py backend/tests/test_budgets_api.py
git commit -m "feat(api): Budget model + upsert/list/delete CRUD (TDD)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Budget status (actual-vs-budget) endpoint (TDD)

**Files:** create `backend/app/services/budgets.py`, `backend/tests/test_budget_status.py`; add a status route to `backend/app/api/budgets.py`.

- [ ] **Step 1: Write `backend/app/services/budgets.py`:**
```python
from collections import defaultdict

from sqlmodel import Session, select

from app.models import Budget, Category, Transaction
from app.money import cents_to_dollars


def budget_status(session: Session, month: str) -> list[dict]:
    """For `month` (YYYY-MM), return actual-vs-budget per budgeted category.

    Effective limit = a per-month override (Budget.month == month) if present,
    else the recurring budget (Budget.month == "recurring").
    """
    budgets = list(session.exec(select(Budget)))
    recurring: dict[int, int] = {}
    override: dict[int, int] = {}
    for b in budgets:
        if b.month == "recurring":
            recurring[b.category_id] = b.limit_cents
        elif b.month == month:
            override[b.category_id] = b.limit_cents
    effective = {**recurring, **override}
    if not effective:
        return []

    # actual spend per category for the month (debits only)
    spent: dict[int, int] = defaultdict(int)
    txns = session.exec(select(Transaction).where(Transaction.direction == "debit")).all()
    for t in txns:
        if t.category_id is not None and t.date.strftime("%Y-%m") == month:
            spent[t.category_id] += abs(t.amount_cents)

    categories = {c.id: c for c in session.exec(select(Category))}
    out = []
    for cid, limit_cents in effective.items():
        cat = categories.get(cid)
        spent_cents = spent.get(cid, 0)
        pct = (spent_cents / limit_cents) if limit_cents > 0 else 0.0
        if spent_cents > limit_cents:
            state = "over"
        elif pct >= 0.8:
            state = "near"
        else:
            state = "under"
        out.append(
            {
                "category_id": cid,
                "category_name": cat.name if cat else "?",
                "color": cat.color if cat else None,
                "month": month,
                "limit": cents_to_dollars(limit_cents),
                "spent": cents_to_dollars(spent_cents),
                "remaining": cents_to_dollars(limit_cents - spent_cents),
                "pct": round(pct, 4),
                "status": state,
            }
        )
    out.sort(key=lambda d: d["pct"], reverse=True)
    return out
```

- [ ] **Step 2: Add the status route to `backend/app/api/budgets.py`** (append; add the import `from app.services.budgets import budget_status`):
```python
@router.get("/budgets/status")
def get_budget_status(month: str, session: Session = Depends(get_session)) -> list[dict]:
    return budget_status(session, month)
```

- [ ] **Step 3: Write failing test** — `backend/tests/test_budget_status.py`:
```python
import io
import json

from fastapi.testclient import TestClient

CSV = (
    "Date,Description,Amount\n"
    "2026-02-05,WHOLEFDS,-300.00\n"
    "2026-02-20,WHOLEFDS,-150.00\n"
)


def _seed(client: TestClient):
    cat = client.post("/api/categories", json={"name": "Groceries"}).json()["id"]
    client.post("/api/rules", json={"match_type": "merchant_contains", "pattern": "WHOLEFDS", "category_id": cat})
    acct = client.post("/api/accounts", json={"name": "Card", "type": "credit"}).json()["id"]
    client.post(
        "/api/imports/commit",
        data={"account_id": str(acct), "mapping": json.dumps(
            {"date": "Date", "description": "Description", "amount": "Amount"})},
        files={"file": ("s.csv", io.BytesIO(CSV.encode()), "text/csv")},
    )
    return cat


def test_budget_status_over(client: TestClient):
    cat = _seed(client)  # spends 450 in 2026-02
    client.put("/api/budgets", json={"category_id": cat, "limit": 400})  # recurring 400

    status = client.get("/api/budgets/status?month=2026-02").json()
    assert len(status) == 1
    s = status[0]
    assert s["category_name"] == "Groceries"
    assert s["spent"] == 450.0
    assert s["limit"] == 400.0
    assert s["remaining"] == -50.0
    assert s["status"] == "over"


def test_budget_status_month_override_and_under(client: TestClient):
    cat = _seed(client)
    client.put("/api/budgets", json={"category_id": cat, "limit": 400})
    client.put("/api/budgets", json={"category_id": cat, "month": "2026-02", "limit": 1000})  # override

    s = client.get("/api/budgets/status?month=2026-02").json()[0]
    assert s["limit"] == 1000.0      # override beats recurring
    assert s["status"] == "under"    # 450 / 1000 < 0.8
```

- [ ] **Step 4: Run RED then GREEN** — `pytest -q tests/test_budget_status.py` then full `pytest -q -W error::DeprecationWarning` → all green. Report.

- [ ] **Step 5: Commit:**
```bash
git add backend/app/services/budgets.py backend/app/api/budgets.py backend/tests/test_budget_status.py
git commit -m "feat(api): budget status (actual vs budget, override resolution) (TDD)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Budgets page (TDD)

**Files:** create `frontend/src/api/budgets.ts`, `frontend/src/pages/Budgets.tsx`, `frontend/src/pages/Budgets.test.tsx`; wire `/budgets` route in `frontend/src/App.tsx`.

- [ ] **Step 1: `frontend/src/api/budgets.ts`:**
```typescript
import { api } from "./client";

export interface Budget {
  id: number;
  category_id: number;
  month: string;
  limit: number;
}
export interface BudgetStatus {
  category_id: number;
  category_name: string;
  color: string | null;
  month: string;
  limit: number;
  spent: number;
  remaining: number;
  pct: number;
  status: "under" | "near" | "over";
}

export const listBudgets = () => api<Budget[]>("/budgets");
export const upsertBudget = (category_id: number, limit: number, month = "recurring") =>
  api<Budget>("/budgets", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ category_id, month, limit }),
  });
export const deleteBudget = (id: number) => api<void>(`/budgets/${id}`, { method: "DELETE" });
export const budgetStatus = (month: string) =>
  api<BudgetStatus[]>(`/budgets/status?month=${month}`);
```

- [ ] **Step 2: Write failing test** — `frontend/src/pages/Budgets.test.tsx`:
```typescript
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import * as budgetsApi from "../api/budgets";
import * as categoriesApi from "../api/categories";
import Budgets from "./Budgets";

vi.mock("../api/budgets");
vi.mock("../api/categories");

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(categoriesApi.listCategories).mockResolvedValue([
    { id: 1, name: "Groceries", parent_id: null, color: "#22c55e", icon: null },
  ]);
  vi.mocked(budgetsApi.listBudgets).mockResolvedValue([
    { id: 5, category_id: 1, month: "recurring", limit: 400 },
  ]);
  vi.mocked(budgetsApi.upsertBudget).mockResolvedValue({ id: 5, category_id: 1, month: "recurring", limit: 500 });
  vi.mocked(budgetsApi.budgetStatus).mockResolvedValue([
    { category_id: 1, category_name: "Groceries", color: "#22c55e", month: "2026-02",
      limit: 400, spent: 450, remaining: -50, pct: 1.125, status: "over" },
  ]);
});

test("shows budget status and sets a limit", async () => {
  render(<Budgets />);
  expect(await screen.findByText("Groceries")).toBeInTheDocument();
  expect(screen.getByText(/over/i)).toBeInTheDocument();

  const input = screen.getByLabelText(/budget for Groceries/i);
  await userEvent.clear(input);
  await userEvent.type(input, "500");
  await userEvent.click(screen.getByRole("button", { name: /save Groceries budget/i }));
  await waitFor(() =>
    expect(vi.mocked(budgetsApi.upsertBudget)).toHaveBeenCalledWith(1, 500, "recurring"),
  );
});
```

- [ ] **Step 3: Run RED** — `cd frontend && npm run test -- Budgets` → FAIL.

- [ ] **Step 4: Write `frontend/src/pages/Budgets.tsx`** — a month selector (default to the current calendar month, `new Date().toISOString().slice(0,7)`), a per-category row with: the category name, an editable recurring-limit input (`aria-label={`Budget for ${name}`}`) + a Save button (`aria-label={`Save ${name} budget`}`) calling `upsertBudget(catId, value, "recurring")`, and — for categories in `budgetStatus(month)` — a progress bar colored by status (under=emerald, near=amber, over=rose) showing `spent of limit` + a remaining/over badge. Load `listCategories`, `listBudgets`, and `budgetStatus(month)` on mount and after a save; refetch status when the month changes. Use `formatMoney`. Keep the slate theme. Render the status word (e.g. "over") as text so it's testable.

- [ ] **Step 5: Wire the route** — in `frontend/src/App.tsx`, import `Budgets` and change `/budgets` from `<ComingSoon title="Budgets" />` to `<Budgets />`.

- [ ] **Step 6: Run GREEN** — `npm run test -- Budgets` then full `npm run test && npm run typecheck && npm run build` → all pass.

- [ ] **Step 7: Commit:**
```bash
git add frontend/src/api/budgets.ts frontend/src/pages/Budgets.tsx frontend/src/pages/Budgets.test.tsx frontend/src/App.tsx
git commit -m "feat(web): Budgets page — set limits + actual-vs-budget bars (TDD)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Verify + deploy

- [ ] **Step 1:** Full backend + frontend tests green; typecheck + build.
- [ ] **Step 2:** Secrets audit + compose validate.
- [ ] **Step 3:** Merge to `main`, then `./scripts/deploy.sh`. The new `budget` table is created by `create_all` on api startup (no migration needed).
- [ ] **Step 4: Verify live** — `ssh minipc "curl -fs http://localhost:8090/api/budgets"` → `[]`; `ssh minipc "curl -fs 'http://localhost:8090/api/budgets/status?month=2026-02'"` → `[]` (no budgets yet, valid). Open `/budgets` → loads. Optionally a quick round-trip: PUT a budget for a seeded category, GET status, then DELETE — then leave prod clean.
- [ ] **Step 5: Report** — Phase 5 budgets live. Stop at the Phase 5→6 boundary (auth + polish next).

---

## Self-Review
- **Budget model:** per (category, month) unique; recurring + override; new table via create_all (no migration). ✓
- **Status:** override beats recurring; spent = month debits per category; under/near(>=80%)/over; dollars at boundary. TDD-verified. ✓
- **CRUD:** upsert (PUT, no dup rows), list, delete; non-negative limit (422). ✓
- **Frontend:** set limits + colored progress bars + over/under badges, month selector. ✓
- **Deferred:** budget health on Overview, rollover, alerts. ✓
```
