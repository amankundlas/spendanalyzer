from fastapi.testclient import TestClient


def test_seeded_categories_listed_and_crud(client: TestClient):
    resp = client.post("/api/categories", json={"name": "Pets", "color": "#000000"})
    assert resp.status_code == 201
    cat = resp.json()
    assert cat["name"] == "Pets"

    assert any(c["name"] == "Pets" for c in client.get("/api/categories").json())

    resp = client.patch(f"/api/categories/{cat['id']}", json={"color": "#ffffff"})
    assert resp.status_code == 200
    assert resp.json()["color"] == "#ffffff"

    assert client.delete(f"/api/categories/{cat['id']}").status_code == 204
    assert all(c["name"] != "Pets" for c in client.get("/api/categories").json())


def test_duplicate_category_name_rejected(client: TestClient):
    client.post("/api/categories", json={"name": "Pets"})
    assert client.post("/api/categories", json={"name": "Pets"}).status_code == 409
