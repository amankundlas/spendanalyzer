from fastapi.testclient import TestClient


def _cat(client: TestClient, name="Groceries") -> int:
    return client.post("/api/categories", json={"name": name}).json()["id"]


def test_budget_upsert_list_delete(client: TestClient):
    cat = _cat(client)
    r = client.put("/api/budgets", json={"category_id": cat, "limit": 400})
    assert r.status_code == 200
    b = r.json()
    assert b["limit"] == 400.0
    assert b["month"] == "recurring"

    r = client.put("/api/budgets", json={"category_id": cat, "limit": 450})
    assert r.json()["limit"] == 450.0
    assert len(client.get("/api/budgets").json()) == 1

    client.put("/api/budgets", json={"category_id": cat, "month": "2026-02", "limit": 500})
    assert len(client.get("/api/budgets").json()) == 2

    bid = b["id"]
    assert client.delete(f"/api/budgets/{bid}").status_code == 204


def test_budget_validation(client: TestClient):
    cat = _cat(client)
    assert client.put("/api/budgets", json={"category_id": cat, "limit": -5}).status_code == 422
