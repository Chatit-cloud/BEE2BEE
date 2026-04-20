import pytest
import os
from fastapi.testclient import TestClient
from bee2bee.api import app

@pytest.fixture
def client(monkeypatch):
    # Mock API key for testing
    monkeypatch.setenv("BEE2BEE_API_KEY", "test-secret-key")
    with TestClient(app) as c:
        yield c

def test_home(client):
    response = client.get("/")
    assert response.status_code == 200
    assert "node_id" in response.json()

def test_get_peers_unauthorized(client):
    # No header
    response = client.get("/peers")
    assert response.status_code == 401

def test_get_peers_invalid_key(client):
    # Wrong key
    response = client.get("/peers", headers={"X-API-KEY": "wrong-key"})
    assert response.status_code == 401

def test_get_peers_authorized(client):
    # Correct key
    response = client.get("/peers", headers={"X-API-KEY": "test-secret-key"})
    assert response.status_code == 200
    assert isinstance(response.json(), list)

def test_get_providers_authorized(client):
    response = client.get("/providers", headers={"X-API-KEY": "test-secret-key"})
    assert response.status_code == 200
    assert isinstance(response.json(), list)

def test_chat_unauthorized(client):
    response = client.post("/chat", json={"provider_id": "p1", "prompt": "hi"})
    assert response.status_code == 401
