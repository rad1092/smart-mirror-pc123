from __future__ import annotations

from pathlib import Path

from app.main import settings


def test_health_returns_ok(client):
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "pc3-vision-gateway"}


def test_session_start_returns_session_id_and_ws_url(client):
    response = client.post(
        "/api/sessions/start",
        json={"user_id": "default", "mode": "exercise", "goal": "squat"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["session_id"].startswith("sess_")
    assert body["ws_url"].startswith(f"ws://{settings.ws_host}:{settings.port}/")
    assert body["ws_url"].endswith(f"/ws/sessions/{body['session_id']}")


def test_pc2_prompt_contract_exists():
    assert Path("docs/pc2_prompt_contract.md").exists()


def test_pc1_development_origin_cors_preflight_is_allowed(client):
    response = client.options(
        "/health",
        headers={
            "Origin": "http://localhost:1420",
            "Access-Control-Request-Method": "GET",
        },
    )

    assert response.status_code in {200, 204}
    assert response.headers["access-control-allow-origin"] == "http://localhost:1420"
    assert response.headers["access-control-allow-credentials"] == "true"
