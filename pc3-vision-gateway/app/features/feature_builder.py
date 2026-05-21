from __future__ import annotations

from typing import Any

from app.baseline.baseline_service import BaselineService
from app.schemas.feature import FeaturePayload, FeatureSet
from app.schemas.session import Session
from app.sensors.sensor_service import SensorService


class FeatureBuilder:
    def __init__(
        self,
        sensor_service: SensorService,
        baseline_service: BaselineService,
    ) -> None:
        self._sensor_service = sensor_service
        self._baseline_service = baseline_service

    def build_payload(
        self,
        session: Session,
        event: str,
        features: FeatureSet,
        purpose: str | None = None,
        baseline_diff: dict[str, Any] | None = None,
    ) -> FeaturePayload:
        diff = baseline_diff
        if diff is None:
            diff = self._baseline_service.calculate_diff(session.user_id, features)
        return FeaturePayload(
            user_id=session.user_id,
            session_id=session.session_id,
            routine_id=session.routine_id,
            routine_day_id=session.routine_day_id,
            mode=session.mode.value,
            event=event,
            purpose=purpose,
            features=features,
            baseline_diff=diff,
            environment=self._sensor_service.get_environment(),
        )
