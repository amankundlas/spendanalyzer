import io

from fastapi.testclient import TestClient

import app.api.imports as imports_api
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


def test_pdf_extract_then_commit(client: TestClient, monkeypatch):
    cat = client.post("/api/categories", json={"name": "Groceries"}).json()["id"]
    acct = client.post("/api/accounts", json={"name": "Card", "type": "credit"}).json()["id"]
    client.post(
        "/api/rules",
        json={"match_type": "merchant_contains", "pattern": "WHOLEFDS", "category_id": cat},
    )

    monkeypatch.setattr(imports_api, "extract_text", lambda data: "irrelevant text")
    app.dependency_overrides[get_extractor] = lambda: _FakeExtractor()
    try:
        ext = client.post(
            "/api/imports/pdf/extract",
            files={"file": ("s.pdf", io.BytesIO(b"%PDF-fake"), "application/pdf")},
        )
        assert ext.status_code == 200
        rows = ext.json()["rows"]
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


def test_pdf_extract_surfaces_extraction_failure(client: TestClient, monkeypatch):
    """If the local model fails/times out, the endpoint returns a clear 503 — not an empty success."""
    monkeypatch.setattr(imports_api, "extract_text", lambda data: "irrelevant text")
    app.dependency_overrides[get_extractor] = lambda: _FailingExtractor()
    try:
        resp = client.post(
            "/api/imports/pdf/extract",
            files={"file": ("s.pdf", io.BytesIO(b"%PDF-fake"), "application/pdf")},
        )
    finally:
        app.dependency_overrides.pop(get_extractor, None)
    assert resp.status_code == 503
    assert "AI" in resp.json()["detail"] or "model" in resp.json()["detail"].lower()
