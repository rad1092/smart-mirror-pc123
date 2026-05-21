from __future__ import annotations

from typing import Any

from app.baseline.baseline_store import BaselineStore
from app.schemas.feature import ExerciseFeature, FeatureSet


class BaselineService:
    def __init__(self, baseline_store: BaselineStore) -> None:
        self._baseline_store = baseline_store

    def get_baseline(self, user_id: str) -> dict[str, Any]:
        return self._baseline_store.get_baseline(user_id)

    def get_baseline_source(self, user_id: str) -> str:
        return self._baseline_store.get_source(user_id)

    def upsert_baseline(self, user_id: str, baseline_updates: dict[str, Any]) -> dict[str, Any]:
        return self._baseline_store.upsert_baseline(user_id, baseline_updates)

    def delete_baseline(self, user_id: str) -> None:
        self._baseline_store.delete_baseline(user_id)

    def calculate_exercise_diff(
        self, user_id: str, exercise: ExerciseFeature
    ) -> dict[str, float | int]:
        baseline = self.get_baseline(user_id).get("exercise", {})
        squat_baseline = baseline.get("squat", {})
        avg_count = squat_baseline.get("avg_count", baseline.get("squat_avg_count", 0))
        avg_stability = squat_baseline.get(
            "avg_stability_score",
            baseline.get("avg_stability_score", 0.0),
        )
        return {
            "count_change": exercise.count - int(avg_count),
            "stability_change": round(
                exercise.stability_score - float(avg_stability),
                3,
            ),
        }

    def calculate_diff(self, user_id: str, features: FeatureSet) -> dict[str, Any]:
        diff: dict[str, Any] = {}
        if features.exercise is not None:
            diff["exercise"] = self.calculate_exercise_diff(user_id, features.exercise)
        return diff
