# Spend Analyzer — Phase 4: Data Dashboard (Overview + Trends) — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Checkbox (`- [ ]`) steps.

**Goal:** The "vibrant, data-driven" dashboard: a dashboard summary API (spend/income totals, spend-by-category, month-over-month) and two chart pages — Overview (KPI cards + category donut + monthly trend) and Trends (monthly spend/income + category-over-time) — using Recharts, with account + date-range filters.

**Architecture:** A backend `dashboard` aggregation (fetch filtered transactions + category join, aggregate in Python — personal-scale data) returns dollars at the boundary. Frontend uses **Recharts** (chosen over Tremor for Tailwind v4 compatibility — Recharts has no Tailwind coupling). KPI values + a textual category legend are rendered as real DOM text (testable); charts render SVG (not asserted in jsdom).

**Tech Stack:** FastAPI/SQLModel; React + Recharts (new dep). Money: cents internally, dollars in the API response.

**Conventions:** TDD. Backend: seed transactions, assert aggregates. Frontend: mock the dashboard API, assert KPI numbers + category legend text (NOT chart SVG internals — Recharts + jsdom can't measure). One commit per task. Deploy is the final task. Spend = sum of debits (money out); income = sum of credits.

---

## Task 1: Dashboard summary API (TDD)

**Files:** create `backend/app/services/dashboard.py`, `backend/app/api/dashboard.py`, `backend/tests/test_dashboard.py`; register router in `main.py`.

- [ ] **Step 1: Write `backend/app/services/dashboard.py`:**
```python
from collections import defaultdict
from datetime import date

from sqlmodel import Session, select

from app.models import Category, Transaction
from app.money import cents_to_dollars


def _filtered(session: Session, account_id, start, end):
    query = select(Transaction, Category).join(
        Category, Transaction.category_id == Category.id, isouter=True
    )
    if account_id is not None:
        query = query.where(Transaction.account_id == account_id)
    if start is not None:
        query = query.where(Transaction.date >= start)
    if end is not None:
        query = query.where(Transaction.date <= end)
    return session.exec(query).all()


def dashboard_summary(
    session: Session,
    account_id: int | None = None,
    start: date | None = None,
    end: date | None = None,
) -> dict:
    rows = _filtered(session, account_id, start, end)

    spend_cents = 0
    income_cents = 0
    count = 0
    cat_spend: dict = defaultdict(int)          # (id, name, color) -> spend cents
    month_spend: dict = defaultdict(int)        # "YYYY-MM" -> cents
    month_income: dict = defaultdict(int)

    for txn, category in rows:
        count += 1
        month = txn.date.strftime("%Y-%m")
        if txn.direction == "debit":
            amt = abs(txn.amount_cents)
            spend_cents += amt
            month_spend[month] += amt
            key = (
                category.id if category else None,
                category.name if category else "Uncategorized",
                category.color if category else None,
            )
            cat_spend[key] += amt
        else:
            income_cents += txn.amount_cents
            month_income[month] += txn.amount_cents

    by_category = sorted(
        (
            {
                "category_id": cid,
                "category_name": name,
                "color": color,
                "spend": cents_to_dollars(cents),
            }
            for (cid, name, color), cents in cat_spend.items()
        ),
        key=lambda d: d["spend"],
        reverse=True,
    )

    months = sorted(set(month_spend) | set(month_income))
    by_month = [
        {
            "month": m,
            "spend": cents_to_dollars(month_spend.get(m, 0)),
            "income": cents_to_dollars(month_income.get(m, 0)),
        }
        for m in months
    ]

    return {
        "totals": {
            "spend": cents_to_dollars(spend_cents),
            "income": cents_to_dollars(income_cents),
            "net": cents_to_dollars(income_cents - spend_cents),
            "count": count,
        },
        "by_category": by_category,
        "by_month": by_month,
    }
```

- [ ] **Step 2: Write failing test** — `backend/tests/test_dashboard.py`:
```python
import io
import json

from fastapi.testclient import TestClient

CSV = (
    "Date,Description,Amount\n"
    "2026-01-05,WHOLEFDS,-40.00\n"
    "2026-01-20,SHELL,-10.00\n"
    "2026-02-10,PAYROLL,3000.00\n"
    "2026-02-12,WHOLEFDS,-60.00\n"
)


def _seed(client: TestClient) -> int:
    cat = client.post("/api/categories", json={"name": "Groceries", "color": "#22c55e"}).json()["id"]
    client.post("/api/rules", json={"match_type": "merchant_contains", "pattern": "WHOLEFDS", "category_id": cat})
    acct = client.post("/api/accounts", json={"name": "Card", "type": "credit"}).json()["id"]
    client.post(
        "/api/imports/commit",
        data={"account_id": str(acct), "mapping": json.dumps(
            {"date": "Date", "description": "Description", "amount": "Amount"})},
        files={"file": ("s.csv", io.BytesIO(CSV.encode()), "text/csv")},
    )
    return acct


def test_dashboard_totals_categories_months(client: TestClient):
    acct = _seed(client)
    d = client.get(f"/api/dashboard?account_id={acct}").json()

    assert d["totals"]["spend"] == 110.0       # 40 + 10 + 60
    assert d["totals"]["income"] == 3000.0
    assert d["totals"]["net"] == 2890.0
    assert d["totals"]["count"] == 4

    cats = {c["category_name"]: c for c in d["by_category"]}
    assert cats["Groceries"]["spend"] == 100.0  # 40 + 60 (rule-matched)
    assert cats["Uncategorized"]["spend"] == 10.0  # SHELL
    # sorted desc by spend
    assert d["by_category"][0]["category_name"] == "Groceries"

    months = {m["month"]: m for m in d["by_month"]}
    assert months["2026-01"]["spend"] == 50.0
    assert months["2026-02"]["spend"] == 60.0
    assert months["2026-02"]["income"] == 3000.0


def test_dashboard_date_filter(client: TestClient):
    acct = _seed(client)
    d = client.get(f"/api/dashboard?account_id={acct}&start=2026-02-01&end=2026-02-28").json()
    assert d["totals"]["spend"] == 60.0
    assert d["totals"]["income"] == 3000.0
```

- [ ] **Step 3: Run RED** — `cd backend && . .venv/bin/activate && pytest -q tests/test_dashboard.py` → FAIL.

- [ ] **Step 4: Write `backend/app/api/dashboard.py`:**
```python
from datetime import date

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.db import get_session
from app.services.dashboard import dashboard_summary

router = APIRouter()


@router.get("/dashboard")
def get_dashboard(
    account_id: int | None = None,
    start: date | None = None,
    end: date | None = None,
    session: Session = Depends(get_session),
) -> dict:
    return dashboard_summary(session, account_id, start, end)
```

- [ ] **Step 5: Register router in `backend/app/main.py`** — `from app.api.dashboard import router as dashboard_router` + `app.include_router(dashboard_router, prefix="/api")`.

- [ ] **Step 6: Run GREEN** — `pytest -q tests/test_dashboard.py` then full `pytest -q -W error::DeprecationWarning` → all green. Report.

- [ ] **Step 7: Commit:**
```bash
git add backend/app/services/dashboard.py backend/app/api/dashboard.py backend/app/main.py backend/tests/test_dashboard.py
git commit -m "feat(api): dashboard summary aggregation (totals, by-category, by-month) (TDD)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Recharts + Overview dashboard (TDD)

**Files:** modify `frontend/package.json` (recharts); create `frontend/src/api/dashboard.ts`, `frontend/src/pages/Overview.tsx` (replace the health card), `frontend/src/pages/Overview.test.tsx`.

- [ ] **Step 1: Add recharts** — in `frontend/package.json` dependencies add `"recharts": "^2.13.3"`, then `cd frontend && npm install`.

- [ ] **Step 2: `frontend/src/api/dashboard.ts`:**
```typescript
import { api } from "./client";

export interface DashboardTotals {
  spend: number;
  income: number;
  net: number;
  count: number;
}
export interface CategorySpend {
  category_id: number | null;
  category_name: string;
  color: string | null;
  spend: number;
}
export interface MonthPoint {
  month: string;
  spend: number;
  income: number;
}
export interface Dashboard {
  totals: DashboardTotals;
  by_category: CategorySpend[];
  by_month: MonthPoint[];
}
export interface DashboardFilters {
  account_id?: number;
  start?: string;
  end?: string;
}

export const getDashboard = (f: DashboardFilters = {}) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== "") p.append(k, String(v));
  const qs = p.toString();
  return api<Dashboard>(`/dashboard${qs ? `?${qs}` : ""}`);
};
```

- [ ] **Step 3: Write failing test** — `frontend/src/pages/Overview.test.tsx`:
```typescript
import { render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import * as accountsApi from "../api/accounts";
import * as dashboardApi from "../api/dashboard";
import Overview from "./Overview";

vi.mock("../api/accounts");
vi.mock("../api/dashboard");

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(accountsApi.listAccounts).mockResolvedValue([]);
  vi.mocked(dashboardApi.getDashboard).mockResolvedValue({
    totals: { spend: 110, income: 3000, net: 2890, count: 4 },
    by_category: [
      { category_id: 1, category_name: "Groceries", color: "#22c55e", spend: 100 },
      { category_id: null, category_name: "Uncategorized", color: null, spend: 10 },
    ],
    by_month: [
      { month: "2026-01", spend: 50, income: 0 },
      { month: "2026-02", spend: 60, income: 3000 },
    ],
  });
});

test("shows KPI totals and category legend", async () => {
  render(<Overview />);
  // KPIs
  expect(await screen.findByText("$110.00")).toBeInTheDocument();   // spend
  expect(screen.getByText("$3,000.00")).toBeInTheDocument();        // income
  expect(screen.getByText("$2,890.00")).toBeInTheDocument();        // net
  // category legend (text, not the SVG)
  expect(screen.getByText("Groceries")).toBeInTheDocument();
  expect(screen.getByText("Uncategorized")).toBeInTheDocument();
});
```

- [ ] **Step 4: Replace `frontend/src/pages/Overview.tsx`** (KPI cards + category donut + monthly trend; KPIs + legend are real text, charts are Recharts SVG). Use a shared `formatMoney` from `../components/Money`:
```typescript
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Account, listAccounts } from "../api/accounts";
import { Dashboard, getDashboard } from "../api/dashboard";
import { formatMoney } from "../components/Money";

const FALLBACK = "#94a3b8";

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export default function Overview() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<number | undefined>(undefined);
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listAccounts(true).then(setAccounts).catch(() => undefined);
  }, []);

  useEffect(() => {
    getDashboard({ account_id: accountId })
      .then(setData)
      .catch((e) => setError((e as Error).message));
  }, [accountId]);

  const pieData = useMemo(
    () => (data?.by_category ?? []).map((c) => ({ name: c.category_name, value: c.spend, color: c.color ?? FALLBACK })),
    [data],
  );

  return (
    <main className="flex-1 p-8">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Overview</h2>
        <select
          aria-label="Account filter"
          className="rounded border border-slate-300 px-2 py-1 text-sm"
          value={accountId ?? ""}
          onChange={(e) => setAccountId(e.target.value ? Number(e.target.value) : undefined)}
        >
          <option value="">All accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>

      {error && <p className="mb-4 text-sm text-rose-600">{error}</p>}

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Kpi label="Spend" value={formatMoney(data?.totals.spend ?? 0)} />
        <Kpi label="Income" value={formatMoney(data?.totals.income ?? 0)} />
        <Kpi label="Net" value={formatMoney(data?.totals.net ?? 0)} />
        <Kpi label="Transactions" value={String(data?.totals.count ?? 0)} />
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <section className="rounded-lg border border-slate-200 p-5">
          <h3 className="mb-4 font-medium">Spending by category</h3>
          <div style={{ width: "100%", height: 280 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100}>
                  {pieData.map((d, i) => (
                    <Cell key={i} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => formatMoney(v)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-2 space-y-1 text-sm">
            {(data?.by_category ?? []).map((c) => (
              <li key={`${c.category_id}-${c.category_name}`} className="flex justify-between">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.color ?? FALLBACK }} />
                  {c.category_name}
                </span>
                <span className="tabular-nums">{formatMoney(c.spend)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-lg border border-slate-200 p-5">
          <h3 className="mb-4 font-medium">Monthly spend vs income</h3>
          <div style={{ width: "100%", height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={data?.by_month ?? []}>
                <XAxis dataKey="month" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip formatter={(v: number) => formatMoney(v)} />
                <Legend />
                <Bar dataKey="spend" fill="#f43f5e" name="Spend" />
                <Bar dataKey="income" fill="#10b981" name="Income" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Run GREEN** — `npm run test -- Overview` then full `npm run test && npm run typecheck && npm run build` → all pass. (Recharts logs jsdom size warnings — harmless; the test asserts KPI text + legend, not SVG.) Report.

- [ ] **Step 6: Commit:**
```bash
git add frontend/src/api/dashboard.ts frontend/src/pages/Overview.tsx frontend/src/pages/Overview.test.tsx frontend/package.json frontend/package-lock.json
git commit -m "feat(web): Overview dashboard — KPI cards, category donut, monthly trend (Recharts, TDD)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Trends page (TDD)

**Files:** create `frontend/src/pages/Trends.tsx`, `frontend/src/pages/Trends.test.tsx`; wire `/trends` route in `frontend/src/App.tsx`.

- [ ] **Step 1: Write failing test** — `frontend/src/pages/Trends.test.tsx`:
```typescript
import { render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import * as accountsApi from "../api/accounts";
import * as dashboardApi from "../api/dashboard";
import Trends from "./Trends";

vi.mock("../api/accounts");
vi.mock("../api/dashboard");

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(accountsApi.listAccounts).mockResolvedValue([]);
  vi.mocked(dashboardApi.getDashboard).mockResolvedValue({
    totals: { spend: 110, income: 3000, net: 2890, count: 4 },
    by_category: [{ category_id: 1, category_name: "Groceries", color: "#22c55e", spend: 100 }],
    by_month: [
      { month: "2026-01", spend: 50, income: 0 },
      { month: "2026-02", spend: 60, income: 3000 },
    ],
  });
});

test("renders the monthly trend with a net summary", async () => {
  render(<Trends />);
  expect(await screen.findByText(/monthly/i)).toBeInTheDocument();
  // a textual month row exists
  expect(screen.getByText("2026-02")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run RED** — `npm run test -- Trends` → FAIL.

- [ ] **Step 3: Write `frontend/src/pages/Trends.tsx`** — account filter + a line/area chart of monthly spend & income (Recharts `AreaChart` or `LineChart`), plus a small text table of months (testable). Reuse `getDashboard`/`listAccounts`/`formatMoney`. Render a heading containing "Monthly", the Recharts chart in a fixed-height container, and a `<table>` listing each `by_month` row (month, spend, income, net=income-spend) so there is testable DOM text (e.g. the month "2026-02").
> Keep it consistent with Overview's styling; the chart is best-effort in jsdom, the table is the asserted content.

- [ ] **Step 4: Wire the route** — in `frontend/src/App.tsx`, import `Trends` and change the `/trends` route element from `<ComingSoon title="Trends" />` to `<Trends />`.

- [ ] **Step 5: Run GREEN** — `npm run test -- Trends` then full `npm run test && npm run typecheck && npm run build` → all pass.

- [ ] **Step 6: Commit:**
```bash
git add frontend/src/pages/Trends.tsx frontend/src/pages/Trends.test.tsx frontend/src/App.tsx
git commit -m "feat(web): Trends page — monthly spend/income chart + table (TDD)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Verify + deploy

- [ ] **Step 1:** Full backend `pytest -q -W error::DeprecationWarning` + frontend `npm run test && npm run typecheck && npm run build` → green.
- [ ] **Step 2:** Secrets audit + compose validate.
- [ ] **Step 3:** Merge to `main`, then `./scripts/deploy.sh`.
- [ ] **Step 4: Verify live** — `ssh minipc "curl -fs http://localhost:8090/api/dashboard"` → JSON with totals/by_category/by_month (empty-but-valid on the clean prod DB: `{"totals":{"spend":0.0,...},"by_category":[],"by_month":[]}`). Open `http://192.168.0.100:8090/` (Overview) and `/trends` — both load. (Charts populate once real data is imported.)
- [ ] **Step 5: Report** — Phase 4 dashboard live. Stop at the Phase 4→5 boundary (Budgets next).

---

## Self-Review
- **Aggregation correctness:** spend=debits, income=credits, by-category over debits (incl. Uncategorized), by-month spend+income; date/account filters. TDD-verified. ✓
- **Money:** cents internally, dollars in the response; UI never re-derives. ✓
- **Charts:** Recharts (Tailwind-v4 safe); KPIs + legend/table are real text (testable), SVG not asserted in jsdom. ✓
- **Vibrant + data-driven:** KPI cards, category donut (category colors), monthly spend/income bars, trends. ✓
- **Deferred:** budgets overlay (Phase 5), drill-in from chart (later). ✓
```
