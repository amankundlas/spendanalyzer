from fastapi.testclient import TestClient


def test_create_list_update_archive_account(client: TestClient):
    # create
    resp = client.post("/api/accounts", json={"name": "Amex Gold", "type": "credit", "institution": "Amex"})
    assert resp.status_code == 201
    acct = resp.json()
    assert acct["id"] > 0
    assert acct["name"] == "Amex Gold"
    assert acct["currency"] == "USD"
    assert acct["archived"] is False

    # list (excludes archived by default)
    resp = client.get("/api/accounts")
    assert resp.status_code == 200
    assert len(resp.json()) == 1

    # update
    resp = client.patch(f"/api/accounts/{acct['id']}", json={"name": "Amex Platinum"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "Amex Platinum"

    # archive (soft delete)
    resp = client.delete(f"/api/accounts/{acct['id']}")
    assert resp.status_code == 204
    assert client.get("/api/accounts").json() == []
    # still listable with include_archived
    assert len(client.get("/api/accounts?include_archived=true").json()) == 1


def test_create_account_validation(client: TestClient):
    # empty name
    assert client.post("/api/accounts", json={"name": "", "type": "credit"}).status_code == 422
    # bad type
    assert client.post("/api/accounts", json={"name": "X", "type": "crypto"}).status_code == 422
    # empty currency
    assert (
        client.post(
            "/api/accounts", json={"name": "X", "type": "credit", "currency": ""}
        ).status_code
        == 422
    )


def test_patch_and_delete_missing_account_return_404(client: TestClient):
    assert client.patch("/api/accounts/999", json={"name": "Nope"}).status_code == 404
    assert client.delete("/api/accounts/999").status_code == 404
