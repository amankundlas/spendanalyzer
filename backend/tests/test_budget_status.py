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
    cat = _seed(client)
    client.put("/api/budgets", json={"category_id": cat, "limit": 400})

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
    client.put("/api/budgets", json={"category_id": cat, "month": "2026-02", "limit": 1000})

    s = client.get("/api/budgets/status?month=2026-02").json()[0]
    assert s["limit"] == 1000.0
    assert s["status"] == "under"
