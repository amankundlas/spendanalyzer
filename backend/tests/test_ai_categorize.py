import io
import json

from fastapi.testclient import TestClient
from sqlmodel import Session

import app.api.categorize as categorize_api
import app.services.jobs as jobs_mod
from app.main import app
from app.services.llm_categorize import ai_categorize_uncategorized
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


def test_ai_categorize_service_over_imported_txns(client: TestClient, session: Session):
    """The categorization logic assigns known categories to matching uncategorized txns."""
    cat_id = client.post("/api/categories", json={"name": "Dining"}).json()["id"]
    acct = client.post("/api/accounts", json={"name": "Card", "type": "credit"}).json()["id"]
    client.post(
        "/api/imports/commit",
        data={"account_id": str(acct), "mapping": json.dumps(
            {"date": "Date", "description": "Description", "amount": "Amount"})},
        files={"file": ("s.csv", io.BytesIO(CSV.encode()), "text/csv")},
    )

    # The client fixture routes the request session to this same `session`, so the
    # service runs against the just-imported transactions.
    updated = ai_categorize_uncategorized(session, _FakeCategorizer({"MYSTERY DINER": "Dining"}))
    assert updated == 1

    items = client.get(f"/api/transactions?account_id={acct}").json()["items"]
    by_desc = {t["description"]: t for t in items}
    assert by_desc["MYSTERY DINER"]["category_name"] == "Dining"
    assert by_desc["MYSTERY DINER"]["category_id"] == cat_id
    assert by_desc["ODD SHOP"]["category_id"] is None


def test_ai_categorize_job_starts_and_completes(client: TestClient, monkeypatch):
    """POST returns a job id immediately; the job reports the updated count when done."""
    monkeypatch.setattr(jobs_mod, "submit", lambda fn, *a: fn(*a))  # run inline
    monkeypatch.setattr(categorize_api, "ai_categorize_uncategorized", lambda session, categorizer: 4)
    app.dependency_overrides[get_categorizer] = lambda: object()
    try:
        start = client.post("/api/categorize/ai")
        assert start.status_code == 202
        job = client.get(f"/api/categorize/ai/jobs/{start.json()['job_id']}").json()
    finally:
        app.dependency_overrides.pop(get_categorizer, None)
    assert job["status"] == "done"
    assert job["updated"] == 4


def test_ai_categorize_job_reports_error(client: TestClient, monkeypatch):
    def boom(session, categorizer):
        raise RuntimeError("model down")

    monkeypatch.setattr(jobs_mod, "submit", lambda fn, *a: fn(*a))
    monkeypatch.setattr(categorize_api, "ai_categorize_uncategorized", boom)
    app.dependency_overrides[get_categorizer] = lambda: object()
    try:
        start = client.post("/api/categorize/ai")
        assert start.status_code == 202
        job = client.get(f"/api/categorize/ai/jobs/{start.json()['job_id']}").json()
    finally:
        app.dependency_overrides.pop(get_categorizer, None)
    assert job["status"] == "error"
    assert job["updated"] is None
    assert job["detail"]


def test_ai_categorize_job_unknown_returns_404(client: TestClient):
    assert client.get("/api/categorize/ai/jobs/nope").status_code == 404
