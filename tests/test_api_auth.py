import uuid
import pytest
from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture(scope="module")
def client():
    """One shared client (and event loop) for every test in this file -
    a fresh TestClient per test would open a new event loop each time,
    while the SQLAlchemy engine's pooled connections stay alive between
    tests, causing an asyncpg cross-event-loop error on the second use."""
    with TestClient(app) as c:
        yield c


def _unique_email() -> str:
    return f"pytest-{uuid.uuid4().hex[:8]}@example.com"


def test_health_check(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_register_and_login_flow(client):
    email = _unique_email()
    register_response = client.post(
        "/register", json={"email": email, "password": "testpass123"}
    )
    assert register_response.status_code == 201
    assert register_response.json()["email"] == email

    login_response = client.post(
        "/login", json={"email": email, "password": "testpass123"}
    )
    assert login_response.status_code == 200
    assert "access_token" in login_response.json()


def test_login_wrong_password_rejected(client):
    email = _unique_email()
    client.post("/register", json={"email": email, "password": "correct-password"})
    response = client.post(
        "/login", json={"email": email, "password": "wrong-password"}
    )
    assert response.status_code == 401


def test_me_requires_auth(client):
    response = client.get("/me")
    assert response.status_code in (401, 403)


def test_analyze_requires_auth(client):
    """Confirms /analyze is protected without actually running the pipeline -
    deliberately not running a real analysis here, since that depends on
    live Yahoo Finance data on every test run."""
    response = client.post("/analyze", json={"symbol": "AAPL"})
    assert response.status_code in (401, 403)


def test_email_is_case_insensitive(client):
    email = _unique_email()
    client.post("/register", json={"email": email.upper(), "password": "testpass123"})
    duplicate = client.post("/register", json={"email": email, "password": "testpass123"})
    assert duplicate.status_code == 400
    login = client.post("/login", json={"email": email.title(), "password": "testpass123"})
    assert login.status_code == 200


def test_weak_and_overlong_passwords_are_rejected(client):
    assert client.post("/register", json={"email": _unique_email(), "password": "short"}).status_code == 422
    too_long = "x" * 73
    assert client.post("/register", json={"email": _unique_email(), "password": too_long}).status_code == 422


def test_invalid_symbol_is_rejected_before_the_pipeline_runs(client):
    email = _unique_email()
    client.post("/register", json={"email": email, "password": "testpass123"})
    token = client.post("/login", json={"email": email, "password": "testpass123"}).json()["access_token"]
    response = client.post(
        "/analyze",
        json={"symbol": "AAPL; DROP TABLE users"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 422


def test_garbage_token_is_rejected(client):
    response = client.get("/me", headers={"Authorization": "Bearer not-a-jwt"})
    assert response.status_code == 401
