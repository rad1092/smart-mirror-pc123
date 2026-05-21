from __future__ import annotations

from app.baseline.baseline_service import BaselineService
from app.baseline.baseline_store import BaselineStore
from app.schemas.feature import ExerciseFeature


def test_baseline_service_calculates_exercise_diff(baseline_path):
    service = BaselineService(BaselineStore(baseline_path))
    feature = ExerciseFeature(count=12, state="up", stability_score=0.74)

    diff = service.calculate_exercise_diff("default", feature)

    assert diff["count_change"] == -3
    assert diff["stability_change"] == -0.08


def test_baseline_service_supports_new_squat_baseline_structure(baseline_path):
    service = BaselineService(BaselineStore(baseline_path))
    feature = ExerciseFeature(count=18, state="up", stability_score=0.9)

    diff = service.calculate_exercise_diff("default", feature)

    assert diff["count_change"] == 3
    assert diff["stability_change"] == 0.08


def test_baseline_service_uses_user_specific_sqlite_baseline(tmp_path, baseline_path):
    service = BaselineService(BaselineStore(baseline_path, tmp_path / "baselines.sqlite3"))
    service.upsert_baseline(
        "user_1",
        {
            "exercise": {
                "squat": {
                    "avg_count": 3,
                    "avg_stability_score": 0.5,
                }
            },
            "body": {"body_front_full": {"captured": True}},
        },
    )

    exercise_diff = service.calculate_exercise_diff(
        "user_1",
        ExerciseFeature(count=5, stability_score=0.7),
    )
    assert service.get_baseline_source("user_1") == "user"
    assert service.get_baseline_source("unknown_user") == "default"
    assert exercise_diff == {"count_change": 2, "stability_change": 0.2}
    assert service.get_baseline("user_1")["body"]["body_front_full"]["captured"] is True
