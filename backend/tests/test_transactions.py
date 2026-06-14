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


def test_limit_is_capped(client: TestClient):
    acct = _seed(client)
    assert client.get(f"/api/transactions?account_id={acct}&limit=99999").status_code == 422
    assert client.get(f"/api/transactions?account_id={acct}&offset=-1").status_code == 422


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
