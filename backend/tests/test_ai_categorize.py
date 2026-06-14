import io
import json

from fastapi.testclient import TestClient

from app.main import app
from app.services.ollama import get_categorizer

CSV = "Date,Description,Amount\n2026-01-02,MYSTERY DINER,-22.00\n2026-01-03,ODD SHOP,-9.99\n"


class _FakeCategorizer:
    def __init__(self, mapping):
        self.mapping = mapping  # description substring -> category name

    def categorize_one(self, merchant, description, names):
        for needle, cat in self.mapping.items():
            if needle in (description or ""):
                return cat if cat in names else None
        return None


def test_ai_categorize_endpoint(client: TestClient):
    cat = client.post("/api/categories", json={"name": "Dining"}).json()["id"]
    acct = client.post("/api/accounts", json={"name": "Card", "type": "credit"}).json()["id"]
    client.post(
        "/api/imports/commit",
        data={"account_id": str(acct), "mapping": json.dumps(
            {"date": "Date", "description": "Description", "amount": "Amount"})},
        files={"file": ("s.csv", io.BytesIO(CSV.encode()), "text/csv")},
    )

    app.dependency_overrides[get_categorizer] = lambda: _FakeCategorizer({"MYSTERY DINER": "Dining"})
    try:
        resp = client.post("/api/categorize/ai")
        assert resp.status_code == 200
        assert resp.json()["updated"] == 1
    finally:
        app.dependency_overrides.pop(get_categorizer, None)

    items = client.get(f"/api/transactions?account_id={acct}").json()["items"]
    by_desc = {t["description"]: t for t in items}
    assert by_desc["MYSTERY DINER"]["category_name"] == "Dining"
    assert by_desc["ODD SHOP"]["category_id"] is None
