import io
import json

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
    form = {"account_id": str(acct), "mapping": json.dumps(mapping)}

    # dry run (preview)
    resp = client.post("/api/imports/commit?dry_run=true", data=form, files=_upload(CSV))
    assert resp.status_code == 200
    assert resp.json()["added_count"] == 2

    # real commit
    resp = client.post("/api/imports/commit", data=form, files=_upload(CSV))
    assert resp.status_code == 201
    batch_id = resp.json()["batch_id"]

    # list batches (out-shape carries the import counts + filename)
    resp = client.get(f"/api/imports?account_id={acct}")
    assert resp.status_code == 200
    batches = resp.json()
    assert len(batches) == 1
    assert batches[0]["added_count"] == 2
    assert batches[0]["duplicate_count"] == 0
    assert batches[0]["filename"] == "stmt.csv"

    # delete batch
    assert client.delete(f"/api/imports/{batch_id}").status_code == 204
    assert client.get(f"/api/imports?account_id={acct}").json() == []
    assert client.get(f"/api/transactions?account_id={acct}").json()["items"] == []
