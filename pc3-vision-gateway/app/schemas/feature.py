from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

from app.schemas.sensor import EnvironmentFeature


ExerciseState = Literal["up", "down", "idle"]
SessionModeLiteral = Literal["exercise"]


class ExerciseFeature(BaseModel):
    type: str = "squat"
    count: int = 0
    state: ExerciseState = "idle"
    stability_score: float = Field(default=0.0, ge=0.0, le=1.0)
    posture_errors: list[str] = Field(default_factory=list)
    person_count: int | None = None
    target_status: str | None = None
    target_confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    detected_type: str | None = None
    exercise_confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    goal_mismatch: bool | None = None
    measurement_quality: str | None = None
    measurement_confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    count_left: int | None = None
    count_right: int | None = None
    squat_depth: float | None = None
    knee_angle: float | None = None
    back_angle: float | str | None = None
    duration_sec: float | None = None
    tempo: str | None = None
    rep_phase: str | None = None
    active_side: str | None = None
    target_signature: dict[str, float] | None = Field(default=None, exclude=True)
    classifier_window: list[str] = Field(default_factory=list, exclude=True)
    target_lost_frames: int = Field(default=0, exclude=True)
    model_disagreement_frames: int = Field(default=0, exclude=True)


class FeatureSet(BaseModel):
    exercise: ExerciseFeature | None = None


class FeaturePayload(BaseModel):
    user_id: str
    session_id: str
    routine_id: str | None = None
    routine_day_id: str | int | None = None
    mode: SessionModeLiteral
    event: str
    features: FeatureSet
    baseline_diff: dict[str, Any] = Field(default_factory=dict)
    environment: EnvironmentFeature | None = None
    purpose: str | None = None


class ExerciseAnalyzeResponse(BaseModel):
    session_id: str
    type: Literal["exercise_update"] = "exercise_update"
    exercise: ExerciseFeature
    feedback: str
