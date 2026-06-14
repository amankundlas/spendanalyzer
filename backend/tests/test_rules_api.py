from fastapi.testclient import TestClient


def _category(client: TestClient, name="Groceries") -> int:
    return client.post("/api/categories", json={"name": name}).json()["id"]


def test_rule_crud(client: TestClient):
    cat = _category(client)
    resp = client.post(
        "/api/rules",
        json={"match_type": "merchant_contains", "pattern": "WHOLEFDS", "category_id": cat},
    )
    assert resp.status_code == 201
    rule = resp.json()
    assert rule["pattern"] == "WHOLEFDS"

    assert len(client.get("/api/rules").json()) == 1

    assert client.patch(f"/api/rules/{rule['id']}", json={"priority": 5}).json()["priority"] == 5
    assert client.delete(f"/api/rules/{rule['id']}").status_code == 204
    assert client.get("/api/rules").json() == []


def test_rule_rejects_bad_match_type(client: TestClient):
    cat = _category(client)
    resp = client.post(
        "/api/rules", json={"match_type": "nonsense", "pattern": "x", "category_id": cat}
    )
    assert resp.status_code == 422
