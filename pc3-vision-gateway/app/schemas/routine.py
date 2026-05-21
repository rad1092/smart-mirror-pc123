from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field


DifficultyLevel = Literal["easy", "normal", "challenge"]
ExerciseExperience = Literal["beginner", "casual", "consistent"]
ExerciseGoal = Literal[
    "build_stamina",
    "posture_correction",
    "lower_body_strength",
    "build_habit",
    "weight_management",
]
ExerciseLimitation = Literal["knee", "back", "shoulder", "ankle"]
ExerciseType = Literal["squat", "jumping_jack", "knee_raise", "lunge", "pushup"]
RoutineSource = Literal["ai"]
WeeklyExerciseFrequency = Literal["once_twice", "three_four", "five_plus"]


class RecommendationProfile(BaseModel):
    name: str | None = None
    weight_kg: float | None = Field(default=None, gt=0)
    height_cm: float | None = Field(default=None, gt=0)
    goal: ExerciseGoal | None = None
    experience_level: ExerciseExperience | None = None
    weekly_frequency: WeeklyExerciseFrequency | None = None
    limitations: list[ExerciseLimitation] = Field(default_factory=list)


class RecommendationBaseline(BaseModel):
    ready: bool = False
    completed_slots: list[str] = Field(default_factory=list)


class RecommendationRequest(BaseModel):
    user_id: str = Field(min_length=1)
    profile: RecommendationProfile
    baseline: RecommendationBaseline = Field(default_factory=RecommendationBaseline)
    start_date: date | None = None
    purpose: str | None = None
    pc2_user_goal: str | None = None
    pc2_exercise_experience: str | None = None
    pc2_available_days_per_week: int | None = Field(default=None, ge=1, le=7)
    pc2_restricted_body_parts: list[str] = Field(default_factory=list)


class RoutineItemPayload(BaseModel):
    exercise_type: ExerciseType
    title: str
    reps: int = Field(ge=1)
    rest_sec: int = Field(ge=0)
    focus: str
    summary: str | None = None
    sets: int | None = Field(default=None, ge=1)
    duration_sec: int | None = Field(default=None, ge=0)
    reason: str | None = None
    how_to: str | None = None
    tips: str | None = None


class WeeklyRoutineExercisePayload(BaseModel):
    exercise: ExerciseType
    sets: int | None = Field(default=None, ge=1)
    reps: int | None = Field(default=None, ge=1)
    duration_sec: int | None = Field(default=None, ge=0)
    rest_sec: int | None = Field(default=None, ge=0)
    focus: str
    reason: str = ""
    how_to: str = ""
    tips: str = ""


class WeeklyRoutineDayPayload(BaseModel):
    day_index: int = Field(ge=1, le=7)
    day_label: str
    focus: str
    exercises: list[WeeklyRoutineExercisePayload] = Field(default_factory=list)


class RecommendationResponse(BaseModel):
    source: RoutineSource
    difficulty: DifficultyLevel
    title: str
    description: str
    reason_lines: list[str] = Field(default_factory=list)
    estimated_minutes: int = Field(ge=1)
    start_exercise_type: ExerciseType
    items: list[RoutineItemPayload] = Field(default_factory=list)
    routine_id: str | None = None
    start_date: str | None = None
    scheduled_dates: list[str] = Field(default_factory=list)
    weekly_routine: list[WeeklyRoutineDayPayload] = Field(default_factory=list)
    pc3_payload: dict = Field(default_factory=dict)


class RoutineDayResponse(BaseModel):
    routine_day_id: int | None = None
    routine_id: str
    user_id: str
    scheduled_date: str
    day_index: int = Field(ge=1, le=7)
    day_label: str
    focus: str
    exercises: list[WeeklyRoutineExercisePayload] = Field(default_factory=list)
    summary: str
    weekly_focus: str
    message: str
    created_at: str | None = None
