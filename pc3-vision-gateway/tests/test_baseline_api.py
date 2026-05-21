from __future__ import annotations

import cv2
import numpy as np

from app.api import baselines as baselines_api
from app.dependencies import get_pose_analyzer


def test_get_unknown_user_baseline_returns_default(client):
    response = client.get("/api/baselines/users/unknown_user")

    assert response.status_code == 200
    body = response.json()
    assert body["user_id"] == "unknown_user"
    assert body["source"] == "default"
    assert "exercise" in body["baseline"]
    assert "body" in body["baseline"]


def test_upsert_and_get_user_baseline(client):
    payload = {
        "exercise": {
            "squat": {
                "avg_count": 7,
                "avg_stability_score": 0.67,
            }
        },
        "body": {"body_front_full": {"captured": True}},
        "face": {"face_front": {"captured": True}},
    }

    save_response = client.post("/api/baselines/users/api_user_1", json=payload)
    get_response = client.get("/api/baselines/users/api_user_1")

    assert save_response.status_code == 200
    assert get_response.status_code == 200
    saved = save_response.json()
    loaded = get_response.json()
    assert saved["status"] == "saved"
    assert saved["source"] == "user"
    assert loaded["source"] == "user"
    assert loaded["baseline"]["exercise"]["squat"]["avg_count"] == 7
    assert loaded["baseline"]["body"]["body_front_full"]["captured"] is True
    assert loaded["baseline"]["face"]["face_front"]["captured"] is True


def test_capture_baseline_slot_saves_body_checkpoint(client, image_bytes):
    class FallbackPoseAnalyzer:
        use_mediapipe = False

    client.app.dependency_overrides[get_pose_analyzer] = lambda: FallbackPoseAnalyzer()
    try:
        response = client.post(
            "/api/baselines/users/capture_user/capture",
            data={"slot_type": "body_front_full"},
            files={"file": ("body.jpg", image_bytes, "image/jpeg")},
        )
    finally:
        client.app.dependency_overrides.pop(get_pose_analyzer, None)

    assert response.status_code == 200
    body = response.json()
    assert body["valid"] is True
    assert body["slot_type"] == "body_front_full"

    baseline = client.get("/api/baselines/users/capture_user").json()
    assert baseline["source"] == "user"
    assert baseline["baseline"]["body"]["body_front_full"]["captured"] is True


def test_capture_baseline_body_uses_pose_visibility_validation(client, image_bytes):
    class ValidatingPoseAnalyzer:
        use_mediapipe = True

        def validate_body_baseline(self, frame):
            return {
                "valid": True,
                "reason": None,
                "errors": [],
                "proportions": {
                    "shoulder_width": 0.21,
                    "hip_width": 0.18,
                    "body_height": 0.72,
                },
            }

    client.app.dependency_overrides[get_pose_analyzer] = lambda: ValidatingPoseAnalyzer()
    try:
        response = client.post(
            "/api/baselines/users/validated_user/capture",
            data={"slot_type": "body_front_full"},
            files={"file": ("body.jpg", image_bytes, "image/jpeg")},
        )
    finally:
        client.app.dependency_overrides.pop(get_pose_analyzer, None)

    assert response.status_code == 200
    assert response.json()["valid"] is True
    baseline = client.get("/api/baselines/users/validated_user").json()
    saved = baseline["baseline"]["body"]["body_front_full"]
    assert saved["captured"] is True
    assert saved["body_height"] == 0.72


def test_capture_baseline_body_rejects_low_quality_pose_without_saving(client, image_bytes):
    class InvalidPoseAnalyzer:
        use_mediapipe = True

        def validate_body_baseline(self, frame):
            return {
                "valid": False,
                "reason": "포즈 확인 결과가 서로 달라요.",
                "errors": ["model_disagreement"],
                "proportions": None,
            }

    client.app.dependency_overrides[get_pose_analyzer] = lambda: InvalidPoseAnalyzer()
    try:
        response = client.post(
            "/api/baselines/users/rejected_user/capture",
            data={"slot_type": "body_front_full"},
            files={"file": ("body.jpg", image_bytes, "image/jpeg")},
        )
    finally:
        client.app.dependency_overrides.pop(get_pose_analyzer, None)

    assert response.status_code == 200
    assert response.json() == {
        "valid": False,
        "slot_type": "body_front_full",
        "reason": "포즈 확인 결과가 서로 달라요.",
    }
    baseline = client.get("/api/baselines/users/rejected_user").json()
    assert baseline["source"] == "default"


def test_capture_face_front_requires_detected_profile_face(client, monkeypatch):
    monkeypatch.setattr(baselines_api, "_detect_profile_faces", lambda frame: [(10, 10, 40, 40)])
    image = np.full((80, 80, 3), 20, dtype=np.uint8)
    success, buffer = cv2.imencode(".jpg", image)
    assert success

    response = client.post(
        "/api/baselines/users/profile_face_user/capture",
        data={"slot_type": "face_front"},
        files={"file": ("face.jpg", buffer.tobytes(), "image/jpeg")},
    )

    assert response.status_code == 200
    assert response.json() == {
        "valid": True,
        "slot_type": "face_front",
        "reason": None,
    }
    baseline = client.get("/api/baselines/users/profile_face_user").json()
    assert baseline["source"] == "user"
    assert baseline["baseline"]["face"]["face_front"]["captured"] is True
    assert baseline["baseline"]["face"]["face_front"]["face_detected"] is True
    assert baseline["baseline"]["face"]["face_front"]["face_count"] == 1


def test_capture_face_front_rejects_when_no_face_detected(client, image_bytes, monkeypatch):
    monkeypatch.setattr(baselines_api, "_detect_profile_faces", lambda frame: [])

    response = client.post(
        "/api/baselines/users/no_face_user/capture",
        data={"slot_type": "face_front"},
        files={"file": ("face.jpg", image_bytes, "image/jpeg")},
    )

    assert response.status_code == 200
    assert response.json()["valid"] is False
    assert response.json()["slot_type"] == "face_front"
    assert "얼굴이 보이지 않아요" in response.json()["reason"]
    baseline = client.get("/api/baselines/users/no_face_user").json()
    assert baseline["source"] == "default"


def test_capture_baseline_rejects_unknown_slot(client, image_bytes):
    response = client.post(
        "/api/baselines/users/capture_user/capture",
        data={"slot_type": "sideways"},
        files={"file": ("body.jpg", image_bytes, "image/jpeg")},
    )

    assert response.status_code == 400


def test_capture_baseline_rejects_invalid_image(client):
    response = client.post(
        "/api/baselines/users/capture_user/capture",
        data={"slot_type": "face_front"},
        files={"file": ("broken.jpg", b"not an image", "image/jpeg")},
    )

    assert response.status_code == 400
