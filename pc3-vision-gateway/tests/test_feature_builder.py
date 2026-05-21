from __future__ import annotations

from datetime import datetime, timezone

from app.baseline.baseline_service import BaselineService
from app.baseline.baseline_store import BaselineStore
from app.features.feature_builder import FeatureBuilder
from app.schemas.feature import ExerciseFeature, FeatureSet
from app.schemas.sensor import EnvironmentFeature
from app.schemas.session import Session, SessionMode, SessionStatus
from app.sensors.sensor_service import SensorService
from app.storage.memory_store import MemoryStore


def test_feature_builder_builds_exercise_payload(baseline_path):
    store = MemoryStore()
    sensor_service = SensorService(store)
    sensor_service.update_environment(
        EnvironmentFeature(temperature=24.5, humidity=48, illuminance=360)
    )
    baseline_service = BaselineService(BaselineStore(baseline_path))
    builder = FeatureBuilder(sensor_service, baseline_service)
    now = datetime.now(timezone.utc)
    session = Session(
        session_id="sess_test",
        user_id="default",
        mode=SessionMode.exercise,
        goal="squat",
        routine_id="routine_test",
        routine_day_id=3,
        status=SessionStatus.running,
        created_at=now,
        updated_at=now,
    )
    features = FeatureSet(exercise=ExerciseFeature(count=12, state="up", stability_score=0.74))

    payload = builder.build_payload(session, "session_completed", features)

    assert payload.mode == "exercise"
    assert payload.routine_id == "routine_test"
    assert payload.routine_day_id == 3
    assert payload.features.exercise is not None
    assert payload.baseline_diff["exercise"]["count_change"] == -3
    assert payload.environment is not None
    assert payload.environment.temperature == 24.5
