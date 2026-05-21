from __future__ import annotations

from pydantic import BaseModel, Field


class RoutineItem(BaseModel):
    title: str
    description: str


class ExercisePlanItem(BaseModel):
    exercise: str
    sets: int
    reps: int | None = None
    duration_sec: int | None = None
    rest_sec: int | None = None
    focus: str
    reason: str


class PC2Payload(BaseModel):
    message: str
    display_lines: list[str] = Field(default_factory=list)
    evidence: list[dict] = Field(default_factory=list)


class CoachingResponse(BaseModel):
    summary: str
    priority: str
    routine: list[RoutineItem] = Field(default_factory=list)
    exercise_plan: list[ExercisePlanItem] = Field(default_factory=list)
    mirror_message: str
    warnings: list[str] = Field(default_factory=list)
    pc2_payload: PC2Payload | None = None
