from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field

from app.schemas.coaching import CoachingResponse
from app.schemas.feature import FeatureSet
from app.schemas.sensor import EnvironmentFeature


class SessionMode(str, Enum):
    exercise = "exercise"


class SessionStatus(str, Enum):
    running = "running"
    stopped = "stopped"
    completed = "completed"
    skipped = "skipped"


class SessionStartRequest(BaseModel):
    user_id: str = "default"
    mode: SessionMode
    goal: str | None = None
    routine_id: str | None = None
    routine_day_id: str | int | None = None


class Session(BaseModel):
    session_id: str
    user_id: str
    mode: SessionMode
    goal: str | None = None
    routine_id: str | None = None
    routine_day_id: str | int | None = None
    status: SessionStatus
    created_at: datetime
    updated_at: datetime


class SessionStartResponse(Session):
    ws_url: str


class SessionResultResponse(BaseModel):
    session_id: str
    status: SessionStatus
    features: FeatureSet = Field(default_factory=FeatureSet)
    baseline_diff: dict[str, Any] = Field(default_factory=dict)
    environment: EnvironmentFeature | None = None
    coaching: CoachingResponse | None = None


class SessionStopResponse(SessionResultResponse):
    pass


class SessionSkipRequest(BaseModel):
    reason: str | None = None


class SessionSkipResponse(SessionResultResponse):
    skip_reason: str | None = None
