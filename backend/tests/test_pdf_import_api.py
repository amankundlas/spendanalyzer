import io

from fastapi.testclient import TestClient

import app.api.imports as imports_api
import app.services.jobs as jobs_mod
from app.main import app
from app.services.ollama import ExtractionError, get_extractor


class _FakeExtractor:
    def extract(self, text):
        return [
            {"date": "2026-01-02", "description": "WHOLEFDS MARKET", "amount": -45.99},
            {"date": "2026-01-03", "description": "PAYROLL", "amount": 1500},
        ]


class _FailingExtractor:
    def extract(self, text):
        raise ExtractionError("model timed out")


def _run_inline(monkeypatch):
    """Make jobs.submit execute the work synchronously, so the job is done after POST."""
    monkeypatch.setattr(jobs_mod, "submit", lambda fn, *a: fn(*a))


def test_pdf_extract_job_then_commit(client: TestClient, monkeypatch):
    cat = client.post("/api/categories", json={"name": "Groceries"}).json()["id"]
    acct = client.post("/api/accounts", json={"name": "Card", "type": "credit"}).json()["id"]
    client.post(
        "/api/rules",
        json={"match_type": "merchant_contains", "pattern": "WHOLEFDS", "category_id": cat},
    )

    monkeypatch.setattr(imports_api, "extract_text", lambda data: "irrelevant text")
    _run_inline(monkeypatch)
    app.dependency_overrides[get_extractor] = lambda: _FakeExtractor()
    try:
        start = client.post(
            "/api/imports/pdf/extract",
            files={"file": ("s.pdf", io.BytesIO(b"%PDF-fake"), "application/pdf")},
        )
        assert start.status_code == 202
        job_id = start.json()["job_id"]

        job = client.get(f"/api/imports/pdf/jobs/{job_id}")
        assert job.status_code == 200
        body = job.json()
        assert body["status"] == "done"
        rows = body["rows"]
        assert len(rows) == 2

        commit = client.post(
            "/api/imports/pdf/commit",
            json={"account_id": acct, "filename": "s.pdf", "rows": rows},
        )
        assert commit.status_code == 201
        assert commit.json()["added_count"] == 2
    finally:
        app.dependency_overrides.pop(get_extractor, None)

    items = client.get(f"/api/transactions?account_id={acct}").json()["items"]
    by_desc = {t["description"]: t for t in items}
    assert by_desc["WHOLEFDS MARKET"]["category_name"] == "Groceries"
    assert by_desc["WHOLEFDS MARKET"]["amount"] == -45.99


def test_pdf_job_reports_extraction_failure(client: TestClient, monkeypatch):
    """A model failure surfaces as an error job (with a helpful message), not empty rows."""
    monkeypatch.setattr(imports_api, "extract_text", lambda data: "irrelevant text")
    _run_inline(monkeypatch)
    app.dependency_overrides[get_extractor] = lambda: _FailingExtractor()
    try:
        start = client.post(
            "/api/imports/pdf/extract",
            files={"file": ("s.pdf", io.BytesIO(b"%PDF-fake"), "application/pdf")},
        )
        assert start.status_code == 202
        job = client.get(f"/api/imports/pdf/jobs/{start.json()['job_id']}").json()
    finally:
        app.dependency_overrides.pop(get_extractor, None)
    assert job["status"] == "error"
    assert job["rows"] is None
    assert "AI" in job["detail"] or "CSV" in job["detail"]


def test_pdf_job_unknown_returns_404(client: TestClient):
    assert client.get("/api/imports/pdf/jobs/does-not-exist").status_code == 404
