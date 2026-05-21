from __future__ import annotations


SUPPORTED_EXERCISE_TYPES = {"squat", "jumping_jack", "knee_raise", "lunge", "pushup"}
DEFAULT_EXERCISE_TYPE = "squat"


def normalize_exercise_type(value: str | None) -> str:
    if value is None:
        return DEFAULT_EXERCISE_TYPE
    normalized = value.strip().lower().replace("-", "_").replace(" ", "_")
    return normalized if normalized in SUPPORTED_EXERCISE_TYPES else DEFAULT_EXERCISE_TYPE
