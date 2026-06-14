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
