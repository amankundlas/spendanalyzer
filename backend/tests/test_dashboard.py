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

    assert d["totals"]["spend"] == 110.0
    assert d["totals"]["income"] == 3000.0
    assert d["totals"]["net"] == 2890.0
    assert d["totals"]["count"] == 4

    cats = {c["category_name"]: c for c in d["by_category"]}
    assert cats["Groceries"]["spend"] == 100.0
    assert cats["Uncategorized"]["spend"] == 10.0
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
