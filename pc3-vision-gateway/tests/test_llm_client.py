from __future__ import annotations

import asyncio
from datetime import date

import httpx

from app.config import Settings
from app.llm_client.coach_client import CoachClient
from app.schemas.coaching import CoachingResponse
from app.schemas.feature import ExerciseFeature, FeaturePayload, FeatureSet
from app.schemas.sensor import EnvironmentFeature


def _exercise_payload() -> FeaturePayload:
    return FeaturePayload(
        user_id="default",
        session_id="sess_test",
        routine_id="routine_test",
        routine_day_id=7,
        mode="exercise",
        event="session_completed",
        features=FeatureSet(
            exercise=ExerciseFeature(
                type="pushup",
                count=5,
                count_left=3,
                count_right=2,
                state="up",
                stability_score=0.72,
                posture_errors=[],
                person_count=2,
                target_status="multi_person_detected",
                target_confidence=0.9,
                detected_type="pushup",
                exercise_confidence=0.86,
                goal_mismatch=False,
                measurement_quality="dual_verified",
                measurement_confidence=0.82,
                knee_angle=92.5,
                back_angle=8.0,
                rep_phase="down",
                active_side="LEFT",
                target_signature={"center_x": 0.5, "center_y": 0.5},
                classifier_window=["pushup"],
            )
        ),
        baseline_diff={
            "exercise": {
                "count_change": -2,
                "stability_change": -0.1,
                "knee_angle_change": 4.5,
                "count_left_change": 1,
            }
        },
        environment=EnvironmentFeature(temperature=24.5),
        purpose=None,
    )


def test_pc2_request_json_contains_only_exercise_contract_fields():
    client = CoachClient(Settings(_env_file=None))

    request_json = client.build_pc2_request_json(_exercise_payload())

    assert request_json["routine_id"] == "routine_test"
    assert request_json["routine_day_id"] == 7
    assert request_json["mode"] == "exercise"
    assert request_json["event"] == "session_completed"
    assert set(request_json["features"]) == {"exercise"}
    exercise_json = request_json["features"]["exercise"]
    assert exercise_json["type"] == "pushup"
    assert exercise_json["knee_angle"] == 92.5
    assert exercise_json["back_angle"] == 8.0
    assert "count_left" not in exercise_json
    assert "count_right" not in exercise_json
    assert "rep_phase" not in exercise_json
    assert "active_side" not in exercise_json
    assert "person_count" not in exercise_json
    assert "target_status" not in exercise_json
    assert "target_confidence" not in exercise_json
    assert "detected_type" not in exercise_json
    assert "exercise_confidence" not in exercise_json
    assert "goal_mismatch" not in exercise_json
    assert exercise_json["measurement_quality"] == "dual_verified"
    assert exercise_json["measurement_confidence"] == 0.82
    assert "target_signature" not in exercise_json
    assert "classifier_window" not in exercise_json
    assert set(request_json["baseline_diff"]) == {"exercise"}
    assert request_json["baseline_diff"]["exercise"] == {
        "count_change": -2,
        "stability_change": -0.1,
        "knee_angle_change": 4.5,
    }
    assert request_json["environment"] == {"temperature": 24.5}
    assert "purpose" not in request_json
    assert _contains_none(request_json) is False


def test_pc2_response_fields_are_preserved(monkeypatch):
    captured: dict = {}

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
                json={
                    "summary": "Plan generated.",
                    "priority": "posture stability",
                    "exercise_plan": [
                        {
                            "exercise": "pushup",
                            "sets": 3,
                            "reps": 6,
                            "duration_sec": None,
                            "rest_sec": 60,
                            "focus": "slow tempo",
                            "reason": "Keep form stable.",
                        }
                    ],
                    "mirror_message": "Slow down and keep posture stable.",
                    "warnings": [],
                    "pc2_payload": {
                        "message": "Slow pushups first.",
                        "display_lines": ["slow tempo", "stable posture"],
                    },
                },
                request=httpx.Request("POST", url),
            )

    monkeypatch.setattr(httpx, "AsyncClient", DummyAsyncClient)
    client = CoachClient(
        Settings(
            _env_file=None,
            pc2_coach_api_url="http://pc2.local:7000/api/coach/generate",
        )
    )

    response = asyncio.run(client.generate(_exercise_payload()))

    assert captured["url"] == "http://pc2.local:7000/api/coach/generate"
    assert captured["json"]["features"]["exercise"]["type"] == "pushup"
    assert response.exercise_plan[0].exercise == "pushup"
    assert response.pc2_payload is not None
    assert response.pc2_payload.display_lines == ["slow tempo", "stable posture"]


def test_pc2_proxy_methods_call_configured_urls(monkeypatch):
    captured: list[dict] = []

    class DummyAsyncClient:
        def __init__(self, timeout: float) -> None:
            self.timeout = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb) -> None:
            return None

        async def get(self, url: str, params: dict | None = None):
            captured.append({"method": "GET", "url": url, "params": params})
            return httpx.Response(200, json={"ok": True}, request=httpx.Request("GET", url))

        async def post(self, url: str, json: dict):
            captured.append({"method": "POST", "url": url, "json": json})
            return httpx.Response(200, json={"ok": True}, request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx, "AsyncClient", DummyAsyncClient)
    client = CoachClient(
        Settings(
            _env_file=None,
            pc2_routine_calendar_api_url="http://pc2.local:7000/api/routine/profile/{user_id}/calendar",
            pc2_body_metrics_api_url="http://pc2.local:7000/api/users/{user_id}/body-metrics",
            pc2_progress_api_url="http://pc2.local:7000/api/users/{user_id}/progress",
            pc2_coach_logs_api_url="http://pc2.local:7000/api/coach/logs/{user_id}",
        )
    )

    asyncio.run(client.get_routine_calendar("user A", date(2026, 5, 19), date(2026, 5, 25)))
    asyncio.run(client.save_body_metric("user A", {"weight_kg": 72.5}))
    asyncio.run(client.get_user_progress("user A", 30))
    asyncio.run(client.get_coach_logs("user A", 10))

    assert captured == [
        {
            "method": "GET",
            "url": "http://pc2.local:7000/api/routine/profile/user%20A/calendar",
            "params": {"from_date": "2026-05-19", "to_date": "2026-05-25"},
        },
        {
            "method": "POST",
            "url": "http://pc2.local:7000/api/users/user%20A/body-metrics",
            "json": {"weight_kg": 72.5},
        },
        {
            "method": "GET",
            "url": "http://pc2.local:7000/api/users/user%20A/progress",
            "params": {"days": 30},
        },
        {
            "method": "GET",
            "url": "http://pc2.local:7000/api/coach/logs/user%20A",
            "params": {"limit": 10},
        },
    ]


def _contains_none(value) -> bool:
    if value is None:
        return True
    if isinstance(value, dict):
        return any(_contains_none(item) for item in value.values())
    if isinstance(value, list):
        return any(_contains_none(item) for item in value)
    return False
