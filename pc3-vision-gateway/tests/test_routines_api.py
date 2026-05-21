from __future__ import annotations

import httpx

from app.config import Settings
from app.dependencies import get_coach_client
from app.llm_client.coach_client import CoachClient
from app.main import app


def _save_complete_baseline(client, user_id: str = "routine_user") -> None:
    response = client.post(
        f"/api/baselines/users/{user_id}",
        json={
            "face": {"face_front": {"captured": True}},
            "body": {
                "body_front_full": {"captured": True},
            },
        },
    )
    assert response.status_code == 200


def _routine_request(user_id: str = "routine_user", include_start_date: bool = True) -> dict:
    payload = {
        "user_id": user_id,
        "profile": {
            "name": "Mirror User",
            "weight_kg": 70,
            "height_cm": 172,
            "goal": "lower_body_strength",
            "experience_level": "beginner",
            "weekly_frequency": "three_four",
            "limitations": ["knee"],
        },
        "baseline": {
            "ready": True,
            "completed_slots": [
                "face_front",
                "body_front_full",
            ],
        },
        "purpose": "pre_exercise_routine",
    }
    if include_start_date:
        payload["start_date"] = "2026-05-13"
    return payload


def _flat_routine_request(user_id: str = "routine_user") -> dict:
    return {
        "user_id": user_id,
        "profile_name": "Flat User",
        "weight_kg": 65,
        "user_goal": "운동 습관 만들기",
        "exercise_experience": "꾸준한 운동",
        "available_days_per_week": 5,
        "restricted_body_parts": ["무릎", "어깨"],
        "start_date": "2026-05-14",
        "purpose": "profile weekly routine",
    }


def _pc2_routine_response() -> dict:
    return {
        "summary": "Weekly lower-body routine generated.",
        "weekly_focus": "Build stable squat mechanics.",
        "weekly_routine": [
            {
                "day_index": 1,
                "day_label": "Day 1",
                "focus": "Lower body",
                "exercises": [
                    {
                        "exercise": "squat",
                        "sets": 3,
                        "reps": 10,
                        "duration_sec": None,
                        "rest_sec": 75,
                        "focus": "knee alignment",
                        "reason": "Start with a controlled squat.",
                        "how_to": "Stand tall, sit the hips back, then press through the feet.",
                        "tips": "Keep knees tracking over toes.",
                    },
                    {
                        "exercise": "knee_raise",
                        "sets": 2,
                        "reps": 12,
                        "duration_sec": None,
                        "rest_sec": 45,
                        "focus": "left right balance",
                        "reason": "Improve balance before intensity.",
                        "how_to": "Raise each knee to hip height with a tall torso.",
                        "tips": "Move evenly on both sides.",
                    },
                ],
            },
            {
                "day_index": 2,
                "day_label": "Day 2",
                "focus": "Support",
                "exercises": [
                    {
                        "exercise": "push-up",
                        "sets": 2,
                        "reps": 8,
                        "duration_sec": None,
                        "rest_sec": 60,
                        "focus": "upper support",
                        "reason": "Add support work.",
                        "how_to": "Keep the body straight while lowering and pressing up.",
                        "tips": "Brace the core.",
                    }
                ],
            },
        ],
        "cautions": ["Stop if knee pain appears."],
        "pc3_payload": {
            "routine_id": "routine_abc",
            "start_date": "2026-05-13",
            "scheduled_dates": ["2026-05-13", "2026-05-14"],
        },
    }


def test_profile_routine_calls_pc2_with_sanitized_payload_and_preserves_schedule(client, monkeypatch):
    captured: dict = {}
    _save_complete_baseline(client)

    class DummyAsyncClient:
        def __init__(self, timeout: float) -> None:
            self.timeout = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb) -> None:
            return None

        async def post(self, url: str, json: dict):
            captured["url"] = url
            captured["json"] = json
            return httpx.Response(
                200,
                json=_pc2_routine_response(),
                request=httpx.Request("POST", url),
            )

    monkeypatch.setattr(httpx, "AsyncClient", DummyAsyncClient)
    app.dependency_overrides[get_coach_client] = lambda: CoachClient(
        Settings(
            _env_file=None,
            pc2_routine_api_url="http://pc2.local:7000/api/routine/profile",
        )
    )
    try:
        response = client.post("/api/routines/profile", json=_routine_request())
    finally:
        app.dependency_overrides.pop(get_coach_client, None)

    assert response.status_code == 200
    assert captured["url"] == "http://pc2.local:7000/api/routine/profile"
    expected_payload = {
        "user_id": "routine_user",
        "user_goal": "lower_body_strength",
        "exercise_experience": "beginner",
        "available_days_per_week": 4,
        "restricted_body_parts": ["knee"],
        "purpose": "pre_exercise_routine",
        "profile_name": "Mirror User",
        "weight_kg": 70.0,
        "start_date": "2026-05-13",
    }
    assert {key: captured["json"].get(key) for key in expected_payload} == expected_payload
    assert "user_history" in captured["json"]
    body = response.json()
    assert body["source"] == "ai"
    assert body["difficulty"] == "easy"
    assert body["routine_id"] == "routine_abc"
    assert body["start_date"] == "2026-05-13"
    assert body["scheduled_dates"] == ["2026-05-13", "2026-05-14"]
    assert body["start_exercise_type"] == "squat"
    assert [item["exercise_type"] for item in body["items"]] == ["squat", "knee_raise", "pushup"]
    assert body["items"][0]["how_to"].startswith("Stand tall")
    assert body["weekly_routine"][0]["exercises"][0]["tips"] == "Keep knees tracking over toes."
    assert "Build stable squat mechanics." in body["reason_lines"]
    assert "target_status" not in captured["json"]
    assert "measurement_quality" not in captured["json"]
    assert all(value is not None for value in captured["json"].values())


def test_profile_routine_flat_payload_is_normalized_for_pc2(client, monkeypatch):
    captured: dict = {}
    _save_complete_baseline(client)

    class DummyAsyncClient:
        def __init__(self, timeout: float) -> None:
            self.timeout = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb) -> None:
            return None

        async def post(self, url: str, json: dict):
            captured["json"] = json
            return httpx.Response(200, json=_pc2_routine_response(), request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx, "AsyncClient", DummyAsyncClient)
    app.dependency_overrides[get_coach_client] = lambda: CoachClient(Settings(_env_file=None))
    try:
        response = client.post("/api/routines/profile", json=_flat_routine_request())
    finally:
        app.dependency_overrides.pop(get_coach_client, None)

    assert response.status_code == 200
    expected_payload = {
        "user_id": "routine_user",
        "user_goal": "운동 습관 만들기",
        "exercise_experience": "꾸준한 운동",
        "available_days_per_week": 5,
        "restricted_body_parts": ["무릎", "어깨"],
        "purpose": "profile weekly routine",
        "profile_name": "Flat User",
        "weight_kg": 65.0,
        "start_date": "2026-05-14",
    }
    assert {key: captured["json"].get(key) for key in expected_payload} == expected_payload
    assert "user_history" in captured["json"]
    assert response.json()["difficulty"] == "challenge"


def test_profile_routine_omits_start_date_when_not_provided(client, monkeypatch):
    captured: dict = {}
    _save_complete_baseline(client)

    class DummyAsyncClient:
        def __init__(self, timeout: float) -> None:
            self.timeout = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb) -> None:
            return None

        async def post(self, url: str, json: dict):
            captured["json"] = json
            return httpx.Response(200, json=_pc2_routine_response(), request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx, "AsyncClient", DummyAsyncClient)
    app.dependency_overrides[get_coach_client] = lambda: CoachClient(Settings(_env_file=None))
    try:
        response = client.post("/api/routines/profile", json=_routine_request(include_start_date=False))
    finally:
        app.dependency_overrides.pop(get_coach_client, None)

    assert response.status_code == 200
    assert "start_date" not in captured["json"]


def test_profile_routine_rejects_missing_profile_fields_before_pc2(client):
    _save_complete_baseline(client)
    payload = _routine_request()
    payload["profile"]["goal"] = None

    response = client.post("/api/routines/profile", json=payload)

    assert response.status_code == 422
    assert response.json()["detail"]["reason"] == "missing_profile_fields"
    assert "profile.goal" in response.json()["detail"]["fields"]


def test_profile_routine_rejects_incomplete_saved_baseline(client):
    response = client.post("/api/routines/profile", json=_routine_request("missing_baseline_user"))

    assert response.status_code == 409
    assert response.json()["detail"]["reason"] == "baseline_incomplete"
    assert "face_front" in response.json()["detail"]["missing_slots"]


def test_profile_routine_rejects_invalid_limitation(client):
    _save_complete_baseline(client)
    payload = _routine_request()
    payload["profile"]["limitations"] = ["neck"]

    response = client.post("/api/routines/profile", json=payload)

    assert response.status_code == 422


def test_profile_routine_returns_503_when_pc2_fails(client, monkeypatch):
    _save_complete_baseline(client)

    class FailingAsyncClient:
        def __init__(self, timeout: float) -> None:
            self.timeout = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb) -> None:
            return None

        async def post(self, url: str, json: dict):
            raise httpx.ConnectError("pc2 down", request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx, "AsyncClient", FailingAsyncClient)
    app.dependency_overrides[get_coach_client] = lambda: CoachClient(
        Settings(_env_file=None)
    )
    try:
        response = client.post("/api/routines/profile", json=_routine_request())
    finally:
        app.dependency_overrides.pop(get_coach_client, None)

    assert response.status_code == 503
    assert response.json()["detail"]["reason"] == "pc2_routine_unavailable"

def _generate_stored_routine(client, monkeypatch, user_id: str = "routine_store_user") -> dict:
    _save_complete_baseline(client, user_id=user_id)

    class DummyAsyncClient:
        def __init__(self, timeout: float) -> None:
            self.timeout = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb) -> None:
            return None

        async def post(self, url: str, json: dict):
            response_json = _pc2_routine_response()
            response_json["pc3_payload"]["routine_id"] = f"routine_{user_id}"
            return httpx.Response(200, json=response_json, request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx, "AsyncClient", DummyAsyncClient)
    app.dependency_overrides[get_coach_client] = lambda: CoachClient(Settings(_env_file=None))
    try:
        response = client.post("/api/routines/profile", json=_routine_request(user_id=user_id))
    finally:
        app.dependency_overrides.pop(get_coach_client, None)
    assert response.status_code == 200
    return response.json()


def test_profile_routine_day_reads_pc3_app_store(client, monkeypatch):
    user_id = "routine_day_store_user"
    generated = _generate_stored_routine(client, monkeypatch, user_id=user_id)

    response = client.get(f"/api/routines/profile/{user_id}/day?target_date=2026-05-14")

    assert response.status_code == 200
    body = response.json()
    assert body["routine_id"] == generated["routine_id"]
    assert body["user_id"] == user_id
    assert body["scheduled_date"] == "2026-05-14"
    assert body["day_index"] == 2
    assert body["exercises"][0]["exercise"] == "pushup"


def test_profile_routine_day_returns_404_when_pc3_has_no_day(client):
    response = client.get("/api/routines/profile/missing_store_user/day?target_date=2026-05-14")

    assert response.status_code == 404
    assert response.json()["detail"]["reason"] == "routine_day_not_found"


def test_profile_routine_calendar_reads_pc3_app_store(client, monkeypatch):
    user_id = "routine_calendar_store_user"
    generated = _generate_stored_routine(client, monkeypatch, user_id=user_id)

    response = client.get(
        f"/api/routines/profile/{user_id}/calendar?from_date=2026-05-13&to_date=2026-05-15"
    )

    assert response.status_code == 200
    body = response.json()
    assert body["user_id"] == user_id
    assert len(body["days"]) == 3
    assert body["days"][0]["routine_id"] == generated["routine_id"]
    assert body["days"][1]["routine_id"] == generated["routine_id"]
    assert body["days"][2]["routine_id"] is None


def test_profile_routine_calendar_empty_range_still_returns_pc3_days(client):
    response = client.get(
        "/api/routines/profile/missing_calendar_user/calendar?from_date=2026-05-19&to_date=2026-05-21"
    )

    assert response.status_code == 200
    body = response.json()
    assert body["user_id"] == "missing_calendar_user"
    assert [day["date"] for day in body["days"]] == ["2026-05-19", "2026-05-20", "2026-05-21"]
    assert all(day["routine_id"] is None for day in body["days"])


def test_user_data_routes_use_pc3_app_store(client):
    user_id = "pc3_store_user"

    metric = client.post(
        f"/api/users/{user_id}/body-metrics",
        json={"measured_date": "2026-05-19", "weight_kg": 72.5},
    )
    progress = client.get(f"/api/users/{user_id}/progress?days=14")
    logs = client.get(f"/api/coach/logs/{user_id}?limit=5")

    assert metric.status_code == 200
    assert progress.status_code == 200
    assert logs.status_code == 200
    assert metric.json()["user_id"] == user_id
    assert progress.json()["user_id"] == user_id
    assert progress.json()["body_metrics"][-1]["weight_kg"] == 72.5
    assert logs.json()["user_id"] == user_id
