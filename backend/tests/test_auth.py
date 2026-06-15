from fastapi.testclient import TestClient


def test_status_setup_login_logout_guard(client: TestClient):
    s = client.get("/api/auth/status").json()
    assert s["configured"] is True
    assert s["authenticated"] is True

    assert client.get("/api/accounts").status_code == 200

    assert client.post("/api/auth/logout").status_code == 200
    assert client.get("/api/accounts").status_code == 401
    assert client.get("/api/health").status_code == 200

    assert client.post("/api/auth/login", json={"password": "nope"}).status_code == 401
    assert client.post("/api/auth/login", json={"password": "testpass"}).status_code == 200
    assert client.get("/api/accounts").status_code == 200


def test_change_password(client: TestClient):
    assert client.post(
        "/api/auth/change-password",
        json={"current_password": "testpass", "new_password": "newpass"},
    ).status_code == 200
    client.post("/api/auth/logout")
    assert client.post("/api/auth/login", json={"password": "testpass"}).status_code == 401
    assert client.post("/api/auth/login", json={"password": "newpass"}).status_code == 200


def test_setup_blocked_once_configured(client: TestClient):
    assert client.post("/api/auth/setup", json={"password": "x"}).status_code == 400
